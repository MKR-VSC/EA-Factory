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

// สถานะการเดินเครื่องประจำวัน (หัวหน้างานเป็นผู้ยืนยัน)
const MACHINE_TABLE = "master_machines";
const MACHINE_STATUS_TABLE = "daily_machine_status";
const MACHINE_STATUS_HAS_WASTE = "has_waste";
const MACHINE_STATUS_NO_WASTE = "no_waste";
const MACHINE_STATUS_NOT_RUNNING = "not_running";

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
  machines: [],
  machineStatuses: [],
  dailyCheckRows: [],
};

document.addEventListener("DOMContentLoaded", async () => {
  state.supabase = window.supabaseClient || window.supabase;
  if (!state.supabase) return showToast("ไม่พบ Supabase Client", "error");

  // ใช้ระบบ Auth กลางแทนการอ่าน localStorage ตรง ๆ
  // หน้า Supervisor อนุญาตให้ supervisor / admin / management เข้าได้
  if (window.AUTH_GUARD?.requireLogin) {
    state.profile = await AUTH_GUARD.requireLogin([
      "supervisor",
      "admin",
      "management",
    ]);
  } else {
    // fallback เผื่อยังไม่ได้โหลด authGuard.js ในบางหน้า
    state.profile = getLocalProfile();
  }

  if (!state.profile?.role) return (location.href = "/login.html");

  setValue("filterDate", todayString());
  ensureMachineCheckUI();
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

  const sentBody = document.getElementById("sentReportBody");
  if (sentBody)
    sentBody.innerHTML = `<tr><td colspan="9" class="empty-cell">กำลังโหลดข้อมูล...</td></tr>`;

  const date = getValue("filterDate");
  const status = getValue("filterStatus") || "all";

  try {
    const { data, error } = await state.supabase
      .from(REPORT_TABLE)
      .select("*")
      .eq("report_date", date)
      .order("created_at", { ascending: false });

    if (error) throw error;

    // สำคัญ: เก็บข้อมูลทั้งวันไว้ก่อน เพื่อใช้ตรวจความครบถ้วนของเครื่องจักร
    let dateRows = Array.isArray(data) ? data : [];
    dateRows = filterByDept(dateRows);
    dateRows = await attachProblemItemsToReports(dateRows);
    state.reports = dateRows;

    // ตัวกรองสถานะใช้เฉพาะกับตารางด้านล่าง ไม่ให้กระทบรายการตรวจเครื่อง
    const visibleRows = filterByStatus(dateRows, status);

    const pendingRows = visibleRows.filter((r) =>
      PENDING_STATUS_SET.has(normalizeText(r.status || STATUS_PENDING)),
    );

    const sentRows = visibleRows.filter((r) => {
      const st = normalizeText(r.status || "");
      return st === STATUS_SENT || st === STATUS_ACCOUNTING;
    });

    renderSummary(dateRows);
    renderTable(pendingRows);
    renderSentTable(sentRows);

    // โหลดรายการเครื่องทั้งหมดของแผนก + สถานะที่หัวหน้ายืนยัน
    await loadMachineDailyCheck(dateRows, date);
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
      ? `<span class="status-pill status-sent">บันทึกลงระบบแล้ว</span>`
      : st === STATUS_ACCOUNTING
        ? `<span class="status-pill status-done">ผ่านการตรวจสอบแล้ว</span>`
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
        ? `<button class="btn primary" onclick="editReport('${safeAttr(r.id)}')">แก้ไข</button>`
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

/* ======================================================
   DAILY MACHINE CHECK
   หัวหน้าตรวจว่าเครื่องไหน:
   - มีรายงานของเสีย (ระบบรู้เอง)
   - เดินเครื่อง / ไม่มีของเสีย
   - ไม่ได้เดินเครื่อง
   แล้วส่งข้อมูลประจำวันให้บัญชีครั้งเดียว
====================================================== */

function ensureMachineCheckUI() {
  if (document.getElementById("machineDailyCheckCard")) return;

  const firstTable = document.querySelector(".supervisor-table-card");
  if (!firstTable) return;

  const section = document.createElement("section");
  section.id = "machineDailyCheckCard";
  section.className = "table-card supervisor-table-card machine-check-card";
  section.innerHTML = `
    <div class="table-header machine-check-header">
      <div>
        <h2>ตรวจความครบถ้วนเครื่องจักรประจำวัน</h2>
        <p class="muted">
          เครื่องที่มีรายงานของเสีย ระบบจะตรวจให้อัตโนมัติ
          ส่วนเครื่องที่ไม่มีรายการ ให้หัวหน้ายืนยันว่า “ไม่มีของเสีย” หรือ “ไม่ได้เดินเครื่อง”
        </p>
      </div>
      <div class="machine-check-summary">
        <span class="machine-mini-pill machine-ok">ครบ <strong id="machineDoneCount">0</strong></span>
        <span class="machine-mini-pill machine-wait">รอ <strong id="machinePendingCount">0</strong></span>
      </div>
    </div>

    <div class="machine-bulk-actions">
      <span class="muted">ตั้งค่ารวดเร็วสำหรับเครื่องที่ยังรอยืนยัน:</span>
      <button class="btn secondary" type="button" onclick="setAllPendingMachineStatus('no_waste')">
        ไม่มีของเสียทั้งหมด
      </button>
      <button class="btn secondary" type="button" onclick="setAllPendingMachineStatus('not_running')">
        ไม่ได้เดินเครื่องทั้งหมด
      </button>
    </div>

    <div id="machineCheckBody" class="machine-check-body">
      <div class="empty-cell">กำลังโหลดรายการเครื่องจักร...</div>
    </div>

    <div class="machine-send-footer">
      <div>
        <strong id="dailySendTitle">ยังตรวจเครื่องไม่ครบ</strong>
        <div id="dailySendSub" class="muted">กรุณายืนยันสถานะเครื่องที่ยังไม่มีรายงานก่อนส่งบัญชี</div>
      </div>
      <button id="sendDailyBtn" class="btn success" type="button" onclick="sendDailyToAccounting()" disabled>
        ส่งข้อมูลประจำวันให้บัญชี
      </button>
    </div>
  `;

  firstTable.parentNode.insertBefore(section, firstTable);

  // CSS เสริมไว้ใน JS เพื่อไม่ต้องแก้ไฟล์ CSS เดิม
  if (!document.getElementById("machineDailyCheckStyle")) {
    const style = document.createElement("style");
    style.id = "machineDailyCheckStyle";
    style.textContent = `
      .machine-check-card{margin-bottom:18px}
      .machine-check-header{gap:16px;align-items:flex-start}
      .machine-check-summary{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .machine-mini-pill{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:999px;font-size:12px;font-weight:700}
      .machine-mini-pill.machine-ok{background:#dcfce7;color:#166534}
      .machine-mini-pill.machine-wait{background:#fef3c7;color:#92400e}

      /* ปุ่มตั้งค่ารวดเร็วให้เล็กลง */
      .machine-bulk-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:9px 0;border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb}
      .machine-bulk-actions .btn{padding:6px 10px;min-height:auto;font-size:12px;border-radius:8px}

      /* รายการเครื่องแบบ Compact */
      .machine-check-body{display:grid;grid-template-columns:repeat(auto-fit,minmax(350px,1fr));gap:8px;padding:10px 0}
      .machine-check-item{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #e5e7eb;border-radius:10px;padding:9px 10px;background:#fff;min-height:58px}
      .machine-check-item.is-pending{border-color:#fbbf24;background:#fffbeb}
      .machine-check-item.is-waste{border-color:#fecaca;background:#fff7f7}
      .machine-check-item.is-no-waste{border-color:#bbf7d0;background:#f0fdf4}
      .machine-check-item.is-off{border-color:#d1d5db;background:#f8fafc}

      .machine-identity{min-width:96px;flex:1 1 auto}
      .machine-name{font-weight:800;font-size:14px;line-height:1.25}
      .machine-dept{font-size:11px;color:#64748b;margin-top:2px}

      .machine-check-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap;margin:0}

      /* ช่องติ๊กสถานะ */
      .machine-tick{position:relative;display:inline-flex;align-items:center;gap:6px;padding:5px 7px;border:1px solid #dbe3ec;border-radius:8px;background:#fff;color:#334155;font-size:12px;font-weight:700;line-height:1.2;cursor:pointer;user-select:none;white-space:nowrap}
      .machine-tick input{position:absolute;opacity:0;pointer-events:none}
      .machine-tick .tick-box{width:17px;height:17px;display:grid;place-items:center;flex:0 0 17px;border:2px solid #cbd5e1;border-radius:4px;background:#fff;color:transparent;font-size:11px;font-weight:900}
      .machine-tick.no-waste input:checked + .tick-box{background:#16a34a;border-color:#16a34a;color:#fff}
      .machine-tick.off input:checked + .tick-box{background:#64748b;border-color:#64748b;color:#fff}
      .machine-tick.no-waste:has(input:checked){border-color:#86efac;background:#dcfce7;color:#166534}
      .machine-tick.off:has(input:checked){border-color:#cbd5e1;background:#e2e8f0;color:#334155}

      .machine-auto-status{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:8px;background:#fee2e2;color:#b91c1c;font-size:12px;font-weight:800;white-space:nowrap}
      .machine-pending-label{font-size:11px;font-weight:700;color:#92400e;white-space:nowrap}

      .machine-send-footer{display:flex;align-items:center;justify-content:space-between;gap:14px;padding-top:12px;border-top:1px solid #e5e7eb}
      .machine-send-footer .btn{min-width:210px}

      @media(max-width:720px){
        .machine-check-body{grid-template-columns:1fr}
        .machine-check-item{align-items:flex-start;flex-direction:column;gap:7px}
        .machine-check-actions{justify-content:flex-start;width:100%}
        .machine-send-footer{align-items:stretch;flex-direction:column}
        .machine-send-footer .btn{width:100%}
      }
    `;
    document.head.appendChild(style);
  }
}

async function loadMachineDailyCheck(reportRows, date) {
  ensureMachineCheckUI();

  const body = document.getElementById("machineCheckBody");
  if (body) body.innerHTML = `<div class="empty-cell">กำลังโหลดรายการเครื่องจักร...</div>`;

  try {
    // ใช้ select("*") เพื่อรองรับชื่อคอลัมน์ master_machines ของระบบเดิม
    const { data: machineData, error: machineError } = await state.supabase
      .from(MACHINE_TABLE)
      .select("*")
      .eq("is_active", true);

    if (machineError) throw machineError;

    let machines = Array.isArray(machineData) ? machineData : [];

    // Supervisor เห็นเฉพาะแผนกที่รับผิดชอบ
    if (!canSeeAllDepartments() && state.allowedDepts.length) {
      machines = machines.filter((m) =>
        state.allowedDepts.includes(
          normalizeDept(m.department_code || m.department || m.dept_code || ""),
        ),
      );
    }

    // โหลดสถานะที่หัวหน้ายืนยันไว้แล้วของวันที่เลือก
    const { data: statusData, error: statusError } = await state.supabase
      .from(MACHINE_STATUS_TABLE)
      .select("*")
      .eq("work_date", date);

    if (statusError) {
      // ถ้ายังไม่ได้สร้าง table ให้ fallback เป็น [] เพื่อไม่ให้แอปพัง
      const msg = String(statusError.message || "");
      if (statusError.code === "PGRST205" || msg.toLowerCase().includes("daily_machine_status")) {
        console.warn("Table daily_machine_status not found, fallback to empty.");
        statusData = [];
      } else {
        throw statusError;
      }
    }

    let statuses = Array.isArray(statusData) ? statusData : [];
    if (!canSeeAllDepartments() && state.allowedDepts.length) {
      statuses = statuses.filter((s) =>
        state.allowedDepts.includes(normalizeDept(s.department_code || "")),
      );
    }

    state.machines = machines;
    state.machineStatuses = statuses;

    const statusMap = new Map(
      statuses.map((s) => [
        machineDailyKey(s.department_code, s.machine_no),
        normalizeText(s.operation_status || ""),
      ]),
    );

    const reportMap = new Map();
    (reportRows || []).forEach((r) => {
      const dept = getDeptCode(r);
      const machineNo = String(r.machine_no || "").trim();
      if (!machineNo) return;
      const key = machineDailyKey(dept, machineNo);
      if (!reportMap.has(key)) reportMap.set(key, []);
      reportMap.get(key).push(r);
    });

    // ใช้ master_machines เป็นหลัก และเติมเครื่องที่มีรายงานแต่ไม่พบใน master เผื่อข้อมูลเก่า
    const rows = [];
    const seen = new Set();

    machines.forEach((m) => {
      const dept = normalizeDept(m.department_code || m.department || m.dept_code || "");
      const machineNo = String(
        m.machine_no || m.machine_code || m.machine_name || m.name || "",
      ).trim();
      if (!dept || !machineNo) return;

      const key = machineDailyKey(dept, machineNo);
      seen.add(key);
      const related = reportMap.get(key) || [];
      const hasReport = related.length > 0;

      rows.push({
        key,
        dept,
        machineNo,
        machineName: m.machine_name || m.name || machineNo,
        hasReport,
        waste: related.reduce((sum, r) => sum + totalWaste(r), 0),
        operationStatus: hasReport
          ? MACHINE_STATUS_HAS_WASTE
          : statusMap.get(key) || "",
      });
    });

    reportMap.forEach((related, key) => {
      if (seen.has(key)) return;
      const first = related[0];
      rows.push({
        key,
        dept: getDeptCode(first),
        machineNo: String(first.machine_no || "-"),
        machineName: String(first.machine_no || "-"),
        hasReport: true,
        waste: related.reduce((sum, r) => sum + totalWaste(r), 0),
        operationStatus: MACHINE_STATUS_HAS_WASTE,
      });
    });

    rows.sort((a, b) =>
      `${a.dept}|${a.machineNo}`.localeCompare(`${b.dept}|${b.machineNo}`, "th"),
    );

    state.dailyCheckRows = rows;
    renderMachineDailyCheck(rows);
  } catch (err) {
    console.error("loadMachineDailyCheck:", err);
    if (body) {
      body.innerHTML = `<div class="empty-cell">โหลดรายการเครื่องจักรไม่สำเร็จ: ${safeText(err.message || err)}</div>`;
    }
    updateMachineCheckSummary([]);
  }
}

function renderMachineDailyCheck(rows) {
  const body = document.getElementById("machineCheckBody");
  if (!body) return;

  if (!rows.length) {
    body.innerHTML = `<div class="empty-cell">ไม่พบเครื่องจักรในแผนกที่รับผิดชอบ</div>`;
    updateMachineCheckSummary(rows);
    return;
  }

  body.innerHTML = rows
    .map((m, index) => {
      const st = normalizeText(m.operationStatus || "");
      const isWaste = st === MACHINE_STATUS_HAS_WASTE;
      const isNoWaste = st === MACHINE_STATUS_NO_WASTE;
      const isOff = st === MACHINE_STATUS_NOT_RUNNING;

      const itemClass = isWaste
        ? "is-waste"
        : isNoWaste
          ? "is-no-waste"
          : isOff
            ? "is-off"
            : "is-pending";

      const actions = isWaste
        ? `<div class="machine-check-actions">
             <span class="machine-auto-status">✓ มีของเสีย ${formatNumber(m.waste)} kg</span>
           </div>`
        : `
          <div class="machine-check-actions">
            <label class="machine-tick no-waste">
              <input
                type="radio"
                name="machine-status-${index}"
                ${isNoWaste ? "checked" : ""}
                onchange="setMachineDailyStatus('${safeAttr(m.dept)}','${safeAttr(m.machineNo)}','no_waste')"
              />
              <span class="tick-box">✓</span>
              <span>เดินเครื่อง / ไม่มีของเสีย</span>
            </label>

            <label class="machine-tick off">
              <input
                type="radio"
                name="machine-status-${index}"
                ${isOff ? "checked" : ""}
                onchange="setMachineDailyStatus('${safeAttr(m.dept)}','${safeAttr(m.machineNo)}','not_running')"
              />
              <span class="tick-box">✓</span>
              <span>ไม่ได้เดินเครื่อง</span>
            </label>
          </div>`;

      return `
        <div class="machine-check-item ${itemClass}">
          <div class="machine-identity">
            <div class="machine-name">${safeText(m.machineName)}</div>
            <div class="machine-dept">${safeText(m.dept)} · ${safeText(getDeptName(m.dept))}</div>
          </div>
          ${actions}
        </div>`;
    })
    .join("");

  updateMachineCheckSummary(rows);
}

function updateMachineCheckSummary(rows) {
  const total = rows.length;
  const pending = rows.filter((m) => {
    const st = normalizeText(m.operationStatus || "");
    return ![
      MACHINE_STATUS_HAS_WASTE,
      MACHINE_STATUS_NO_WASTE,
      MACHINE_STATUS_NOT_RUNNING,
    ].includes(st);
  }).length;

  const done = Math.max(0, total - pending);
  setText("machineDoneCount", done.toLocaleString("th-TH"));
  setText("machinePendingCount", pending.toLocaleString("th-TH"));

  const btn = document.getElementById("sendDailyBtn");
  const title = document.getElementById("dailySendTitle");
  const sub = document.getElementById("dailySendSub");

  if (!total) {
    if (btn) btn.disabled = true;
    if (title) title.textContent = "ไม่พบรายการเครื่องจักร";
    if (sub) sub.textContent = "ตรวจสอบข้อมูล master_machines ก่อน";
    return;
  }

  if (pending > 0) {
    if (btn) btn.disabled = true;
    if (title) title.textContent = `ยังตรวจไม่ครบ ${pending.toLocaleString("th-TH")} เครื่อง`;
    if (sub) sub.textContent = "ยืนยันสถานะเครื่องที่ยังรอก่อนส่งข้อมูลประจำวัน";
  } else {
    if (btn) btn.disabled = false;
    if (title) title.textContent = "ตรวจครบทุกเครื่องแล้ว";
    if (sub) sub.textContent = "พร้อมส่งรายการของเสียประจำวันให้บัญชีครั้งเดียว";
  }
}

async function setMachineDailyStatus(dept, machineNo, operationStatus) {
  const date = getValue("filterDate");
  if (!date) return showToast("กรุณาเลือกวันที่", "error");

  const allowed = [MACHINE_STATUS_NO_WASTE, MACHINE_STATUS_NOT_RUNNING];
  if (!allowed.includes(operationStatus)) return;

  const payload = {
    work_date: date,
    department_code: normalizeDept(dept),
    machine_no: String(machineNo || "").trim(),
    operation_status: operationStatus,
    supervisor_id: state.profile?.id || null,
    supervisor_name:
      state.profile?.display_name || state.profile?.username || "",
    confirmed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await state.supabase
    .from(MACHINE_STATUS_TABLE)
    .upsert(payload, {
      onConflict: "work_date,department_code,machine_no",
    });

  if (error) {
    return showToast(`บันทึกสถานะเครื่องไม่สำเร็จ: ${error.message}`, "error");
  }

  const row = state.dailyCheckRows.find(
    (m) =>
      normalizeDept(m.dept) === normalizeDept(dept) &&
      String(m.machineNo) === String(machineNo),
  );
  if (row) row.operationStatus = operationStatus;

  renderMachineDailyCheck(state.dailyCheckRows);
}

async function setAllPendingMachineStatus(operationStatus) {
  const pendingRows = state.dailyCheckRows.filter((m) => {
    const st = normalizeText(m.operationStatus || "");
    return ![
      MACHINE_STATUS_HAS_WASTE,
      MACHINE_STATUS_NO_WASTE,
      MACHINE_STATUS_NOT_RUNNING,
    ].includes(st);
  });

  if (!pendingRows.length) {
    return showToast("ไม่มีเครื่องที่รอยืนยันแล้ว", "success");
  }

  const label =
    operationStatus === MACHINE_STATUS_NO_WASTE
      ? "เดินเครื่อง / ไม่มีของเสีย"
      : "ไม่ได้เดินเครื่อง";

  const ok = await askConfirm(
    "ตั้งค่าสถานะหลายเครื่อง",
    `ยืนยันตั้งค่าเครื่องที่ยังรอ ${pendingRows.length} เครื่องเป็น “${label}” ใช่ไหม?`,
  );
  if (!ok) return;

  const date = getValue("filterDate");
  const now = new Date().toISOString();

  const payloads = pendingRows.map((m) => ({
    work_date: date,
    department_code: normalizeDept(m.dept),
    machine_no: String(m.machineNo),
    operation_status: operationStatus,
    supervisor_id: state.profile?.id || null,
    supervisor_name:
      state.profile?.display_name || state.profile?.username || "",
    confirmed_at: now,
    updated_at: now,
  }));

  const { error } = await state.supabase
    .from(MACHINE_STATUS_TABLE)
    .upsert(payloads, {
      onConflict: "work_date,department_code,machine_no",
    });

  if (error) {
    return showToast(`บันทึกสถานะหลายเครื่องไม่สำเร็จ: ${error.message}`, "error");
  }

  pendingRows.forEach((m) => {
    m.operationStatus = operationStatus;
  });

  renderMachineDailyCheck(state.dailyCheckRows);
  showToast(`ตั้งค่า ${pendingRows.length} เครื่องเรียบร้อยแล้ว`, "success");
}

async function sendDailyToAccounting() {
  const date = getValue("filterDate");
  if (!date) return showToast("กรุณาเลือกวันที่", "error");

  const pending = state.dailyCheckRows.filter((m) => {
    const st = normalizeText(m.operationStatus || "");
    return ![
      MACHINE_STATUS_HAS_WASTE,
      MACHINE_STATUS_NO_WASTE,
      MACHINE_STATUS_NOT_RUNNING,
    ].includes(st);
  });

  if (pending.length) {
    document.getElementById("machineDailyCheckCard")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    return showToast(
      `ยังมี ${pending.length} เครื่องที่ยังไม่ได้ยืนยันสถานะ`,
      "error",
    );
  }

  const pendingReports = state.reports.filter((r) =>
    PENDING_STATUS_SET.has(normalizeText(r.status || STATUS_PENDING)),
  );

  const noWasteCount = state.dailyCheckRows.filter(
    (m) => normalizeText(m.operationStatus) === MACHINE_STATUS_NO_WASTE,
  ).length;
  const offCount = state.dailyCheckRows.filter(
    (m) => normalizeText(m.operationStatus) === MACHINE_STATUS_NOT_RUNNING,
  ).length;
  const wasteMachineCount = state.dailyCheckRows.filter(
    (m) => normalizeText(m.operationStatus) === MACHINE_STATUS_HAS_WASTE,
  ).length;

  const ok = await askConfirm(
    "ยืนยันส่งข้อมูลประจำวัน",
    `ตรวจครบ ${state.dailyCheckRows.length} เครื่องแล้ว: มีของเสีย ${wasteMachineCount} เครื่อง, ไม่มีของเสีย ${noWasteCount} เครื่อง, ไม่ได้เดินเครื่อง ${offCount} เครื่อง และมีรายงานของเสียรอส่งบัญชี ${pendingReports.length} รายการ ต้องการส่งข้อมูลประจำวันใช่ไหม?`,
  );
  if (!ok) return;

  const now = new Date().toISOString();
  const checkedBy = state.profile?.id || null;
  const checkedByName =
    state.profile?.display_name || state.profile?.username || "";

  // 1) ส่งรายงานของเสียทั้งหมดของวันนั้นให้บัญชีครั้งเดียว
  if (pendingReports.length) {
    const reportIds = pendingReports.map((r) => r.id).filter(Boolean);

    const { error: reportError } = await state.supabase
      .from(REPORT_TABLE)
      .update({
        status: STATUS_SENT,
        checked_by: checkedBy,
        checked_by_name: checkedByName,
        checked_at: now,
        updated_at: now,
      })
      .in("id", reportIds);

    if (reportError) {
      return showToast(`ส่งรายการของเสียไม่สำเร็จ: ${reportError.message}`, "error");
    }
  }

  // 2) บันทึก snapshot สถานะเครื่องทั้งวัน
  const machinePayloads = state.dailyCheckRows.map((m) => ({
    work_date: date,
    department_code: normalizeDept(m.dept),
    machine_no: String(m.machineNo),
    operation_status: normalizeText(m.operationStatus),
    supervisor_id: checkedBy,
    supervisor_name: checkedByName,
    confirmed_at: now,
    sent_accounting: true,
    sent_at: now,
    updated_at: now,
  }));

  if (machinePayloads.length) {
    const { error: machineError } = await state.supabase
      .from(MACHINE_STATUS_TABLE)
      .upsert(machinePayloads, {
        onConflict: "work_date,department_code,machine_no",
      });

    if (machineError) {
      return showToast(
        `บันทึกสถานะเครื่องประจำวันไม่สำเร็จ: ${machineError.message}`,
        "error",
      );
    }
  }

  showToast("ส่งข้อมูลประจำวันให้บัญชีเรียบร้อยแล้ว", "success");
  await loadPageData();
}

function machineDailyKey(dept, machineNo) {
  return `${normalizeDept(dept)}|${String(machineNo || "").trim().toUpperCase()}`;
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
  if (window.setTextAnimated) {
    window.setTextAnimated(id, v);
  } else {
    const e = document.getElementById(id);
    if (e) e.textContent = v;
  }
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
async function logoutNow() {
  if (window.AUTH_GUARD?.logoutAndRedirect) {
    await AUTH_GUARD.logoutAndRedirect();
    return;
  }

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
window.setMachineDailyStatus = setMachineDailyStatus;
window.setAllPendingMachineStatus = setAllPendingMachineStatus;
window.sendDailyToAccounting = sendDailyToAccounting;