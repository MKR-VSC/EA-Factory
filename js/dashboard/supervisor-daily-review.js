/* ======================================================
   supervisor-daily-review.js - GO LIVE v1.0
   ใช้ daily_waste_reports + daily_waste_report_items เท่านั้น
====================================================== */

const REPORT_TABLE = "daily_waste_reports";
const ITEM_TABLE = "daily_waste_report_items";
const STATUS_PENDING = "pending_supervisor";
const STATUS_PENDING_OLD = "pending";
const STATUS_SENT = "sent_accounting";
const STATUS_ACCOUNTING = "accounting_checked";
const PENDING_STATUS_SET = new Set([
  STATUS_PENDING,
  STATUS_PENDING_OLD,
  "submitted",
  "draft",
]);

let state = {
  supabase: null,
  profile: null,
  reports: [],
  standards: {},
  allowedDepts: [],
};

document.addEventListener("DOMContentLoaded", async () => {
  state.supabase = window.supabaseClient || window.supabase;
  if (!state.supabase) return showToast("ไม่พบ Supabase Client", "error");
  state.profile = getLocalProfile();
  if (!state.profile?.role) return (location.href = "/login.html");
  setValue("filterDate", todayString());
  await loadDepartmentStandards();
  await loadAllowedDepartments();
  renderUserInfo();
  bindEvents();
  await loadPageData();
});

function bindEvents() {
  document
    .getElementById("filterDate")
    ?.addEventListener("change", loadPageData);
  document
    .getElementById("filterStatus")
    ?.addEventListener("change", loadPageData);
}

async function loadDepartmentStandards() {
  const { data, error } = await state.supabase
    .from("master_departments")
    .select("department_code,department_name,max_waste_percent,warning_percent")
    .eq("is_active", true);
  if (error) console.warn(error);
  state.standards = {};
  (data || []).forEach((d) => {
    const c = normalizeDept(d.department_code);
    state.standards[c] = {
      name: d.department_name,
      max: Number(d.max_waste_percent || 3),
      warning: Number(d.warning_percent || 0),
    };
  });
}

async function loadAllowedDepartments() {
  if (canSeeAllDepartments()) {
    state.allowedDepts = [];
    return;
  }
  const base = normalizeDept(
    state.profile.department_code || state.profile.department_name || "",
  );
  const list = base ? [base] : [];
  if (state.profile.id) {
    const { data, error } = await state.supabase
      .from("user_departments")
      .select("department_code")
      .eq("user_id", state.profile.id);
    if (!error)
      (data || []).forEach((r) => list.push(normalizeDept(r.department_code)));
  }
  state.allowedDepts = [...new Set(list.filter(Boolean))];
}

function renderUserInfo() {
  const name = state.profile.display_name || state.profile.username || "-";
  const dept = canSeeAllDepartments()
    ? "รับผิดชอบ: ทุกแผนก"
    : `รับผิดชอบ: ${state.allowedDepts.map(getDeptName).join(", ") || "-"}`;
  setText("userName", name);
  setText("userDept", dept);
  setText("userInfo", `${name} | ${dept}`);
}

async function loadPageData() {
  const tbody = document.getElementById("reportBody");
  if (tbody)
    tbody.innerHTML = `<tr><td colspan="9" class="empty-cell">กำลังโหลดข้อมูล...</td></tr>`;
  const date = getValue("filterDate");
  const status = getValue("filterStatus") || "all";
  try {
    let q = state.supabase
      .from(REPORT_TABLE)
      .select("*")
      .eq("report_date", date)
      .order("created_at", { ascending: false });
    const { data, error } = await q;
    if (error) throw error;
    let rows = Array.isArray(data) ? data : [];
    rows = filterByDept(rows);
    rows = filterByStatus(rows, status);
    rows = await attachProblemItemsToReports(rows);
    state.reports = rows;

    const pendingRows = rows.filter((r) =>
      PENDING_STATUS_SET.has(normalizeText(r.status || STATUS_PENDING)),
    );

    const sentRows = rows.filter((r) => {
      const st = normalizeText(r.status || "");
      return st === STATUS_SENT || st === STATUS_ACCOUNTING;
    });

    renderSummary(rows);
    renderTable(pendingRows);
    renderSentTable(sentRows);


  } catch (err) {
    console.error(err);
    if (tbody)
      tbody.innerHTML = `<tr><td colspan="9" class="empty-cell">โหลดข้อมูลไม่สำเร็จ: ${safeText(err.message || err)}</td></tr>`;
  }
}

function filterByDept(rows) {
  if (canSeeAllDepartments() || !state.allowedDepts.length) return rows;
  return rows.filter((r) =>
    state.allowedDepts.includes(
      normalizeDept(r.department_code || r.department),
    ),
  );
}
function filterByStatus(rows, status) {
  if (status === "all") return rows;
  const target = normalizeText(status);
  return rows.filter((r) => {
    const rowStatus = normalizeText(r.status || STATUS_PENDING);
    if (target === STATUS_PENDING) return PENDING_STATUS_SET.has(rowStatus);
    if (target === "resolved")
      return rowStatus === STATUS_SENT || rowStatus === "resolved";
    return rowStatus === target;
  });
}

async function attachProblemItemsToReports(rows) {
  if (!rows.length) return [];
  const reportIds = rows.map((r) => r.id).filter(Boolean);
  const { data, error } = await state.supabase
    .from(ITEM_TABLE)
    .select(
      "id, report_id, item_no, problem_type, waste_weight_kg, detail, created_at",
    )
    .in("report_id", reportIds)
    .order("item_no", { ascending: true });
  if (error) {
    console.warn(error);
    return rows.map((r) => ({ ...r, problem_items: getFallbackItems(r) }));
  }
  const map = new Map();
  (data || []).forEach((item) => {
    const key = String(item.report_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({
      id: item.id,
      item_no: item.item_no,
      problem_type: item.problem_type,
      waste_weight_kg: Number(item.waste_weight_kg || 0),
      detail: item.detail || "",
    });
  });
  return rows.map((r) => ({
    ...r,
    problem_items: map.get(String(r.id)) || getFallbackItems(r),
  }));
}
function getFallbackItems(r) {
  return [
    {
      id: `${r.id}-fallback`,
      item_no: 1,
      problem_type: r.problem_type || r.reason_detail || "ไม่ระบุปัญหา",
      waste_weight_kg: Number(r.waste_weight_kg || r.waste_qty || 0),
      detail: r.detail || r.note || "",
    },
  ];
}
function totalWaste(r) {
  return (
    (r.problem_items || getFallbackItems(r)).reduce(
      (s, i) => s + Number(i.waste_weight_kg || 0),
      0,
    ) || Number(r.waste_weight_kg || r.waste_qty || 0)
  );
}

function renderSummary(rows) {
  const pending = rows.filter((r) =>
    PENDING_STATUS_SET.has(normalizeText(r.status || STATUS_PENDING)),
  ).length;
  const waste = rows.reduce((s, r) => s + totalWaste(r), 0);
  const m = {};
  rows.forEach((r) => {
    const k = r.machine_no || "-";
    m[k] = (m[k] || 0) + totalWaste(r);
  });
  const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
  setText("countPending", pending.toLocaleString("th-TH"));
  setText("todayWaste", `${formatNumber(waste)} kg`);
  if (top) {
    setText("topMachineToday", top[0]);
    setText("topMachineTodaySub", `${formatNumber(top[1])} kg`);
  } else {
    setText("topMachineToday", "-");
    setText("topMachineTodaySub", "-");
  }
  setText("sumPending", pending.toLocaleString("th-TH"));
  setText("sumWaste", `${formatNumber(waste)} kg`);
  setText(
    "sumTopMachine",
    top ? `${top[0]} (${formatNumber(top[1])} kg)` : "-",
  );
  setText("rowCount", `แสดง ${rows.length.toLocaleString("th-TH")} รายการ`);
}

function renderTable(rows) {
  const tbody = document.getElementById("reportBody");
  if (!tbody) return;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-cell">ไม่พบข้อมูลตามตัวกรอง</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((r, i) => renderRow(r, i)).join("");
}

function renderSentTable(rows) {
  const tbody = document.getElementById("sentReportBody");
  if (!tbody) return;

  setText("sentRowCount", `แสดง ${rows.length.toLocaleString("th-TH")} รายการ`);

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-cell">ยังไม่มีรายการที่ส่งบัญชีแล้ว</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((r, i) => renderSentRow(r, i)).join("");
}

function renderSentRow(r, i) {
  const detailId = `sent-detail-${i}`;
  const st = normalizeText(r.status || STATUS_SENT);

  const pill =
    st === STATUS_ACCOUNTING
      ? `<span class="status-pill status-done">บัญชีตรวจแล้ว</span>`
      : `<span class="status-pill status-sent">ส่งบัญชีแล้ว</span>`;

  return `<tr>
    <td><button class="expand-btn" onclick="toggleSentDetail(${i})">▼</button></td>
    <td>${safeText(formatDateTime(r.incident_datetime || r.created_at || r.report_date))}</td>
    <td><strong>${safeText(getDeptCode(r))}</strong><br><small>${safeText(getDeptName(getDeptCode(r)))}</small></td>
    <td><strong>${safeText(r.machine_no || "-")}</strong></td>
    <td>${safeText(r.reported_by || r.created_by_name || "-")}</td>
    <td class="text-right"><strong>${formatNumber(totalWaste(r))}</strong></td>
    <td>${renderProblemInline(r)}</td>
    <td>${pill}</td>
    <td>
      <div class="row-actions">
        <button class="btn secondary" onclick="toggleSentDetail(${i})">ดู</button>
      </div>
    </td>
  </tr>
  <tr id="${detailId}" class="detail-row hidden">
    <td colspan="9">${renderDetailReadOnly(r)}</td>
  </tr>`;
}

function renderDetailReadOnly(r) {
  const items = r.problem_items || [];

  return `
    <table class="problem-table">
      <thead>
        <tr>
          <th>ปัญหา</th>
          <th class="text-right">น้ำหนัก kg</th>
          <th>รายละเอียด</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (x) => `
              <tr>
                <td><strong>${safeText(x.problem_type)}</strong></td>
                <td class="text-right">${formatNumber(x.waste_weight_kg)}</td>
                <td>${safeText(x.detail || "-")}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
      <tfoot>
        <tr>
          <td>รวมของเสีย</td>
          <td class="text-right">${formatNumber(totalWaste(r))}</td>
          <td>kg</td>
        </tr>
      </tfoot>
    </table>

    <div class="form-group" style="margin-top:12px">
      <label>หมายเหตุหัวหน้า</label>
      <textarea rows="2" disabled>${safeText(r.supervisor_note || "")}</textarea>
    </div>
  `;
}

function toggleSentDetail(i) {
  document.getElementById(`sent-detail-${i}`)?.classList.toggle("hidden");
}



function renderRow(r, i) {
  const st = normalizeText(r.status || STATUS_PENDING);
  const pill =
    st === STATUS_SENT
      ? `<span class="status-pill status-sent">ส่งบัญชีแล้ว</span>`
      : st === STATUS_ACCOUNTING
        ? `<span class="status-pill status-done">บัญชีตรวจแล้ว</span>`
        : `<span class="status-pill status-pending">รอตรวจสอบ</span>`;
  const canApprove = PENDING_STATUS_SET.has(st);
  return `<tr>
    <td><button class="expand-btn" onclick="toggleDetail(${i})">▼</button></td>
    <td>${safeText(formatDateTime(r.incident_datetime || r.created_at || r.report_date))}</td>
    <td><strong>${safeText(getDeptCode(r))}</strong><br><small>${safeText(getDeptName(getDeptCode(r)))}</small></td>
    <td><strong>${safeText(r.machine_no || "-")}</strong></td>
    <td>${safeText(r.reported_by || r.created_by_name || "-")}</td>
    <td class="text-right"><strong>${formatNumber(totalWaste(r))}</strong></td>
    <td>${renderProblemInline(r)}</td>
    <td>${pill}</td>
    <td>
  <div class="row-actions">
    <button class="btn secondary" onclick="toggleDetail(${i})">ดู</button>
    ${
      canApprove
        ? `<button class="btn primary" onclick="editReport('${safeAttr(r.id)}')">แก้ไข</button>
           <button class="btn success" onclick="approveReport('${safeAttr(r.id)}')">ส่งบัญชี</button>`
        : ""
    }
    <button class="btn danger" onclick="deleteReport('${safeAttr(r.id)}')">ลบ</button>
  </div>
</td>
  </tr><tr id="detail-${i}" class="detail-row hidden"><td colspan="9">${renderDetail(r)}</td></tr>`;
}
function renderProblemInline(r) {
  const items = r.problem_items || [];
  return `<div class="problem-inline">${items
    .slice(0, 3)
    .map(
      (x) =>
        `${safeText(x.problem_type)} <strong>${formatNumber(x.waste_weight_kg)} kg</strong>`,
    )
    .join(
      "<br>",
    )}${items.length > 3 ? `<br><small>+${items.length - 3} รายการ</small>` : ""}</div>`;
}
function renderDetail(r) {
  const items = r.problem_items || [];
  return `<table class="problem-table"><thead><tr><th>ปัญหา</th><th class="text-right">น้ำหนัก kg</th><th>รายละเอียด</th></tr></thead><tbody>${items.map((x) => `<tr><td><strong>${safeText(x.problem_type)}</strong></td><td class="text-right">${formatNumber(x.waste_weight_kg)}</td><td>${safeText(x.detail || "-")}</td></tr>`).join("")}</tbody><tfoot><tr><td>รวมของเสีย</td><td class="text-right">${formatNumber(totalWaste(r))}</td><td>kg</td></tr></tfoot></table><div class="form-group" style="margin-top:12px"><label>หมายเหตุหัวหน้า</label><textarea id="note-${safeAttr(r.id)}" rows="2" placeholder="ใส่หมายเหตุถ้ามี" ${!PENDING_STATUS_SET.has(normalizeText(r.status || STATUS_PENDING)) ? "disabled" : ""}>${safeText(r.supervisor_note || "")}</textarea></div>`;
}
function toggleDetail(i) {
  document.getElementById(`detail-${i}`)?.classList.toggle("hidden");
}

async function approveReport(id) {
  const ok = await askConfirm(
    "ยืนยันส่งบัญชี",
    "ตรวจสอบแล้ว และส่งรายการนี้ให้บัญชีใช่ไหม?",
  );
  if (!ok) return;
  const note =
    document.getElementById(`note-${CSS.escape(String(id))}`)?.value || "";
  const { error } = await state.supabase
    .from(REPORT_TABLE)
    .update({
      status: STATUS_SENT,
      supervisor_note: note,
      checked_by: state.profile.id || null,
      checked_by_name:
        state.profile.display_name || state.profile.username || "",
      checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return showToast(`ส่งบัญชีไม่สำเร็จ: ${error.message}`, "error");
  showToast("ส่งข้อมูลให้บัญชีเรียบร้อยแล้ว", "success");
  await loadPageData();
}


async function deleteReport(id) {
  const report = state.reports.find((r) => String(r.id) === String(id));
  if (!report) return showToast("ไม่พบรายการนี้", "error");

  const st = normalizeText(report.status || "");
  if (st === STATUS_SENT || st === STATUS_ACCOUNTING) {
    return showToast("รายการที่ส่งแล้วดูได้อย่างเดียว ไม่สามารถลบได้", "error");
  }

  const ok = await askConfirm(
    "ยืนยันลบรายการ",
    "ต้องการลบรายการนี้ใช่ไหม? ระบบจะลบรายการปัญหาย่อยออกด้วย",
  );
  if (!ok) return;

  const { error: itemError } = await state.supabase
    .from(ITEM_TABLE)
    .delete()
    .eq("report_id", id);

  if (itemError) {
    return showToast(`ลบรายการย่อยไม่สำเร็จ: ${itemError.message}`, "error");
  }

  const { error } = await state.supabase
    .from(REPORT_TABLE)
    .delete()
    .eq("id", id);

  if (error) return showToast(`ลบไม่สำเร็จ: ${error.message}`, "error");

  showToast("ลบรายการเรียบร้อยแล้ว", "success");
  await loadPageData();
}



function editReport(id) {
  const report = state.reports.find((r) => String(r.id) === String(id));
  if (!report) return showToast("ไม่พบข้อมูลที่ต้องการแก้ไข", "error");

  const st = normalizeText(report.status || "");
  if (st === STATUS_SENT || st === STATUS_ACCOUNTING) {
    return showToast("รายการที่ส่งแล้วดูได้อย่างเดียว ไม่สามารถแก้ไขได้", "error");
  }

  const items = report.problem_items || [];

  // โค้ดเดิมต่อจากนี้เหมือนเดิม

  setText("modalTitle", "แก้ไขรายการของเสีย");
  setText("modalSubTitle", "แก้ไขน้ำหนัก / รายละเอียดปัญหาก่อนส่งบัญชี");

  document.getElementById("modalBody").innerHTML = `
    <div class="edit-report-form">
      <div class="form-group">
        <label>เครื่องจักร</label>
        <input id="editMachineNo" value="${safeAttr(report.machine_no || "")}" />
      </div>

      <div class="form-group">
        <label>ผู้บันทึก</label>
        <input id="editReportedBy" value="${safeAttr(report.reported_by || "")}" />
      </div>

      <div class="form-group">
        <label>หมายเหตุหัวหน้า</label>
        <textarea id="editSupervisorNote" rows="2">${safeText(report.supervisor_note || "")}</textarea>
      </div>

      <div class="edit-items-title">รายการปัญหา</div>

      ${items
        .map(
          (item, index) => `
            <div class="edit-item-box">
              <input type="hidden" class="editItemId" value="${safeAttr(item.id)}" />

              <div class="form-group">
                <label>ปัญหาที่ ${index + 1}</label>
                <input class="editProblemType" value="${safeAttr(item.problem_type || "")}" />
              </div>

              <div class="form-group">
                <label>น้ำหนักของเสีย kg</label>
                <input class="editWasteWeight" type="number" step="0.01" min="0" value="${Number(item.waste_weight_kg || 0)}" />
              </div>

              <div class="form-group">
                <label>รายละเอียด</label>
                <textarea class="editDetail" rows="2">${safeText(item.detail || "")}</textarea>
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;

  document.getElementById("modalActions").innerHTML = `
    <button class="btn secondary" type="button" onclick="closeModal()">ยกเลิก</button>
    <button class="btn primary" type="button" onclick="saveEditReport('${safeAttr(id)}')">บันทึกแก้ไข</button>
  `;

  openModal();
}

async function saveEditReport(id) {
  const machineNo = getValue("editMachineNo");
  const reportedBy = getValue("editReportedBy");
  const supervisorNote =
    document.getElementById("editSupervisorNote")?.value || "";

  const itemIds = [...document.querySelectorAll(".editItemId")];
  const problemTypes = [...document.querySelectorAll(".editProblemType")];
  const wasteWeights = [...document.querySelectorAll(".editWasteWeight")];
  const details = [...document.querySelectorAll(".editDetail")];

  const updates = itemIds.map((el, index) => ({
    id: el.value,
    problem_type: problemTypes[index]?.value?.trim() || "ไม่ระบุปัญหา",
    waste_weight_kg: Number(wasteWeights[index]?.value || 0),
    detail: details[index]?.value?.trim() || "",
  }));

  const total = updates.reduce(
    (sum, item) => sum + Number(item.waste_weight_kg || 0),
    0,
  );

  const { error: reportError } = await state.supabase
    .from(REPORT_TABLE)
    .update({
      machine_no: machineNo,
      reported_by: reportedBy,
      supervisor_note: supervisorNote,
      waste_weight_kg: total,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (reportError) {
    return showToast(
      `บันทึกหัวรายงานไม่สำเร็จ: ${reportError.message}`,
      "error",
    );
  }

  for (const item of updates) {
    if (String(item.id).includes("fallback")) continue;

    const { error } = await state.supabase
      .from(ITEM_TABLE)
      .update({
        problem_type: item.problem_type,
        waste_weight_kg: item.waste_weight_kg,
        detail: item.detail,
      })
      .eq("id", item.id);

    if (error) {
      return showToast(`บันทึกรายการย่อยไม่สำเร็จ: ${error.message}`, "error");
    }
  }

  closeModal();
  showToast("แก้ไขข้อมูลเรียบร้อยแล้ว", "success");
  await loadPageData();
}

function getLocalProfile() {
  const p = safeJsonParse(localStorage.getItem("ea_profile")) || {};
  return {
    id: localStorage.getItem("activeUserId") || p.id || p.user_id || "",
    username: localStorage.getItem("activeUser") || p.username || p.email || "",
    display_name:
      localStorage.getItem("activeName") ||
      p.display_name ||
      p.full_name ||
      p.username ||
      "",
    department_code:
      localStorage.getItem("activeDept") ||
      p.department_code ||
      p.department ||
      "",
    department_name:
      localStorage.getItem("activeDeptName") ||
      p.department_name ||
      p.department ||
      "",
    role: normalizeText(
      localStorage.getItem("activeRole") || p.role || p.user_role || "",
    ),
  };
}
function canSeeAllDepartments() {
  return ["admin", "management", "executive"].includes(
    normalizeText(state.profile?.role),
  );
}
function getDeptCode(r) {
  return normalizeDept(r.department_code || r.department || "");
}
function getDeptName(code) {
  return state.standards[normalizeDept(code)]?.name || code || "-";
}
function normalizeDept(v) {
  return window.EA_COMMON?.normalizeDepartmentCode
    ? window.EA_COMMON.normalizeDepartmentCode(v)
    : String(v || "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
}
function normalizeText(v) {
  return window.EA_COMMON?.normalizeText
    ? window.EA_COMMON.normalizeText(v)
    : String(v || "")
        .trim()
        .toLowerCase();
}
function todayString() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function formatDateTime(v) {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleString("th-TH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}
function formatNumber(v) {
  return window.EA_COMMON?.formatNumber
    ? window.EA_COMMON.formatNumber(v, 2, 2)
    : Number(v || 0).toLocaleString("th-TH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}
function getValue(id) {
  return document.getElementById(id)?.value?.trim() || "";
}
function setValue(id, v) {
  const e = document.getElementById(id);
  if (e) e.value = v;
}
function setText(id, v) {
  const e = document.getElementById(id);
  if (e) e.textContent = v;
}
function safeJsonParse(v) {
  try {
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
function safeText(v) {
  return window.EA_COMMON?.safeText
    ? window.EA_COMMON.safeText(v)
    : String(v ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
function safeAttr(v) {
  return window.EA_COMMON?.safeAttr
    ? window.EA_COMMON.safeAttr(v)
    : safeText(v).replaceAll("`", "&#096;");
}

function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 2600);
}

function openModal() {
  const modal = document.getElementById("appModal");
  if (!modal) return;
  modal.hidden = false;
  modal.classList.remove("hidden");
}

function closeModal() {
  const modal = document.getElementById("appModal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.hidden = true;
}

function askConfirm(title, msg) {
  return new Promise((resolve) => {
    setText("modalTitle", title);
    document.getElementById("modalBody").innerHTML = `<p>${safeText(msg)}</p>`;
    document.getElementById("modalActions").innerHTML =
      `<button class="btn secondary" id="cancelAsk">ยกเลิก</button><button class="btn primary" id="okAsk">ยืนยัน</button>`;
    openModal();
    document.getElementById("cancelAsk").onclick = () => {
      closeModal();
      resolve(false);
    };
    document.getElementById("okAsk").onclick = () => {
      closeModal();
      resolve(true);
    };
  });
}
function logoutNow() {
  [
    "loginType",
    "activeUserId",
    "activeUser",
    "activeName",
    "activeDept",
    "activeDeptName",
    "activeRole",
  ].forEach((k) => localStorage.removeItem(k));
  location.href = "/login.html";
}
window.loadPageData = loadPageData;
window.loadRecords = loadPageData;
window.toggleDetail = toggleDetail;
window.approveReport = approveReport;
window.deleteReport = deleteReport;
window.closeModal = closeModal;
window.logoutNow = logoutNow;
window.editReport = editReport;
window.saveEditReport = saveEditReport;
window.openModal = openModal;
window.renderSentTable = renderSentTable;
window.toggleSentDetail = toggleSentDetail;