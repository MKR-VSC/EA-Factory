/* ======================================================
   accounting-panel.js - GO LIVE v1.0
====================================================== */
const REPORT_TABLE = "daily_waste_reports";
const ITEM_TABLE = "daily_waste_report_items";
const STATUS_SENT = "sent_accounting";
const STATUS_DONE = "accounting_checked";
const STATUS_CANCELLED = "accounting_cancelled";
let state = {
  supabase: null,
  currentUser: null,
  reports: [],
  groups: [],
  standards: {},
};


document.addEventListener("DOMContentLoaded", async () => {
  const profile = await AUTH_GUARD.requireLogin([
    "accounting",
    "admin",
    "management"
  ]);

  if (!profile) return;

  state.currentUser = profile;
  state.supabase = window.supabaseClient || window.supabase;

  if (!state.supabase) {
    return showToast("ไม่พบ Supabase Client", "error");
  }

  setDefaultMonth();
  bindEvents();
  await loadStandards();
  await loadAccountingData();
});


function bindEvents() {
  ["filterMonth", "filterDept", "filterStatus", "searchInput"].forEach((id) =>
    document
      .getElementById(id)
      ?.addEventListener(
        id === "searchInput" ? "input" : "change",
        applyFilters,
      ),
  );
}
function setDefaultMonth() {
  const d = new Date();
  setValue(
    "filterMonth",
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
  );
}
async function loadStandards() {
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
  renderDeptFilter();
}
function renderDeptFilter() {
  const s = document.getElementById("filterDept");
  if (!s) return;
  s.innerHTML =
    `<option value="all">ทุกแผนก</option>` +
    Object.entries(state.standards)
      .map(
        ([c, d]) =>
          `<option value="${safeAttr(c)}">${safeText(d.name)} (${safeText(c)})</option>`,
      )
      .join("");
}
async function loadAccountingData() {
  const body = document.getElementById("accountingBody");
  if (body)
    body.innerHTML = `<tr><td colspan="13" class="empty">กำลังโหลดข้อมูล...</td></tr>`;
  try {
    const { data, error } = await state.supabase
      .from(REPORT_TABLE)
      .select("*")
      .in("status", [STATUS_SENT, STATUS_DONE, STATUS_CANCELLED])
      .order("report_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    state.reports = await attachProblemItems(Array.isArray(data) ? data : []);
    setText("lastUpdate", `อัปเดตล่าสุด ${new Date().toLocaleString("th-TH")}`);
    applyFilters();
  } catch (e) {
    console.error(e);
    if (body)
      body.innerHTML = `<tr><td colspan="13" class="empty">โหลดข้อมูลไม่สำเร็จ: ${safeText(e.message || e)}</td></tr>`;
  }
}
async function attachProblemItems(rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id).filter(Boolean);
  const { data, error } = await state.supabase
    .from(ITEM_TABLE)
    .select(
      "id, report_id, item_no, problem_type, waste_weight_kg, detail, created_at",
    )
    .in("report_id", ids)
    .order("item_no", { ascending: true });
  if (error) {
    console.warn(error);
    return rows.map((r) => ({ ...r, problem_items: fallbackItems(r) }));
  }
  const map = new Map();
  (data || []).forEach((i) => {
    const k = String(i.report_id);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push({
      id: i.id,
      item_no: i.item_no,
      problem_type: i.problem_type,
      waste_weight_kg: Number(i.waste_weight_kg || 0),
      detail: i.detail || "",
    });
  });
  return rows.map((r) => ({
    ...r,
    problem_items: map.get(String(r.id)) || fallbackItems(r),
  }));
}
function fallbackItems(r) {
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
function applyFilters() {
  const month = getValue("filterMonth"),
    dept = getValue("filterDept"),
    status = getValue("filterStatus"),
    kw = getValue("searchInput").toLowerCase();
  let rows = state.reports.filter((r) => {
    const m = toMonth(r.report_date || r.incident_datetime || r.created_at);
    const d = normalizeDept(r.department_code || r.department);
    const text = [
      d,
      getDeptName(d),
      r.machine_no,
      r.reported_by,
      r.shift,
      r.work_shift,
      ...(r.problem_items || []).map((i) => `${i.problem_type} ${i.detail}`),
    ]
      .join(" ")
      .toLowerCase();
    return (
      (!month || m === month) &&
      (dept === "all" || d === dept) &&
      (status === "all" || getAccountingStatus(r) === status) &&
      (!kw || text.includes(kw))
    );
  });
  state.groups = buildGroups(rows);
  renderSummary(state.groups);
  renderTable(state.groups);
}
function buildGroups(rows) {
  const m = new Map();
  rows.forEach((r) => {
    const rowStatus = getAccountingStatus(r);
    const key = [
      r.report_date || dateKey(r.created_at),
      normalizeDept(r.department_code || r.department),
      r.shift || r.work_shift || "",
      r.machine_no || "",
      rowStatus || STATUS_SENT,
    ].join("|");
    if (!m.has(key))
      m.set(key, {
        key,
        ids: [],
        rows: [],
        date: r.report_date || dateKey(r.created_at),
        dept: normalizeDept(r.department_code || r.department),
        shift: r.shift || r.work_shift || "-",
        machine: r.machine_no || "-",
        reporter: new Set(),
        items: [],
        waste: 0,
        production: getProduction(r),
        status: rowStatus || STATUS_SENT,
      });
    const g = m.get(key);
    g.ids.push(r.id);
    g.rows.push(r);
    const currentStatus = getAccountingStatus(r);
    if (g.status !== STATUS_CANCELLED) {
      if (currentStatus === STATUS_CANCELLED) {
        g.status = STATUS_CANCELLED;
      } else {
        g.status =
          g.status === STATUS_DONE && currentStatus === STATUS_DONE
            ? STATUS_DONE
            : STATUS_SENT;
      }
    }
    g.reporter.add(r.reported_by || r.created_by_name || "-");
    (r.problem_items || []).forEach((i) => {
      g.items.push(i);
      g.waste += Number(i.waste_weight_kg || 0);
    });
    if (g.production == null || g.production === 0) {
      g.production = getProduction(r);
    }
  });
  return [...m.values()];
}
function renderSummary(groups) {
  // ไม่นับรายการที่ยกเลิกในยอดสรุป เพื่อไม่ให้ตัวเลขบัญชีเพี้ยน
  const activeGroups = groups.filter((g) => normalizeText(g.status) !== STATUS_CANCELLED);
  const waste = activeGroups.reduce((s, g) => s + g.waste, 0),
    prod = activeGroups.reduce((s, g) => s + (g.production || 0), 0);
  setText("sumCount", activeGroups.length.toLocaleString("th-TH"));
  setText("sumWaste", formatNumber(waste));
  setText("sumProduction", formatNumber(prod));
}
function renderTable(groups) {
  const body = document.getElementById("accountingBody");
  if (!body) return;
  if (!groups.length) {
    body.innerHTML = `<tr><td colspan="13" class="empty">ไม่พบข้อมูลตามตัวกรอง</td></tr>`;
    return;
  }
  body.innerHTML = groups.map((g, i) => renderGroup(g, i)).join("");
}
function renderGroup(g, i) {
  const isCancelled = normalizeText(g.status) === STATUS_CANCELLED;
  const isDone = normalizeText(g.status) === STATUS_DONE;
  const percent = !isCancelled && g.production ? (g.waste / g.production) * 100 : 0;
  const result = isCancelled
    ? { label: "ยกเลิก", className: "result-none" }
    : getResult(g.dept, percent, !!g.production);

  const status = isCancelled
    ? `<span class="status-pill status-cancelled">ยกเลิกรายการ</span>`
    : isDone
      ? `<span class="status-pill status-done">บัญชีตรวจแล้ว</span>`
      : `<span class="status-pill status-sent">รอบัญชีตรวจ</span>`;

  const disabledAttr = isCancelled ? "disabled" : "";
  const rowClass = isCancelled ? ` class="row-cancelled"` : "";

  return `<tr${rowClass}><td><button class="expand-btn" onclick="toggleDetail(${i})">▼</button></td>
  <td>${safeText(formatDate(g.date))}</td>
  <td><strong>${safeText(g.dept)}</strong><br><small>${safeText(getDeptName(g.dept))}</small></td>
  <td>${safeText(g.shift)}</td><td><strong>${safeText(g.machine)}</strong></td>
  <td>${safeText([...g.reporter].join(", "))}</td>
  <td class="text-right"><strong>${formatNumber(g.waste)}</strong></td>
  <td>${renderProblemInline(g.items)}</td>
  <td class="text-right"><input class="cell-input text-right" type="number" step="0.01" min="0" value="${safeAttr(g.production || "")}" data-prod="${safeAttr(g.key)}" placeholder="kg" ${disabledAttr}></td>
  <td class="text-right">${isCancelled ? "-" : g.production ? formatPercent(percent) : "-"}</td>
  <td><span class="result-pill ${result.className}">${safeText(result.label)}</span></td>
  <td>${status}</td>
  <td>
    <div class="action-stack">
      <button class="btn warning" onclick="editGroup('${safeAttr(g.key)}')" ${disabledAttr}>แก้ไข</button>
      <button class="btn danger" onclick="cancelGroup('${safeAttr(g.key)}')" ${disabledAttr}>ยกเลิก</button>
      <button class="btn success" onclick="saveGroup('${safeAttr(g.key)}')" ${disabledAttr}>บันทึก</button>
    </div>
  </td>
  </tr>
  <tr id="detail-${i}" class="detail-row hidden${isCancelled ? " row-cancelled" : ""}"><td colspan="13">${renderProblemTable(g.items, g.waste)}</td></tr>`;
}

function editGroup(key) {
  const input = document.querySelector(`[data-prod="${cssEscape(key)}"]`);
  if (!input) return;

  input.focus();
  input.select();

  showToast("แก้ไขน้ำหนักผลิต แล้วกดบันทึกอีกครั้ง", "success");
}


function renderProblemInline(items) {
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
function renderProblemTable(items, total) {
  return `<table class="problem-table"><thead><tr><th>ปัญหา</th><th class="text-right">น้ำหนัก kg</th><th>รายละเอียด</th></tr></thead><tbody>${items.map((x) => `<tr><td><strong>${safeText(x.problem_type)}</strong></td><td class="text-right">${formatNumber(x.waste_weight_kg)}</td><td>${safeText(x.detail || "-")}</td></tr>`).join("")}</tbody><tfoot><tr><td>รวมของเสีย</td><td class="text-right">${formatNumber(total)}</td><td>kg</td></tr></tfoot></table>`;
}
function toggleDetail(i) {
  document.getElementById(`detail-${i}`)?.classList.toggle("hidden");
}
async function saveGroup(key) {
  const g = state.groups.find((x) => x.key === key);
  if (!g) return;
  const prod = Number(
    document.querySelector(`[data-prod="${cssEscape(key)}"]`)?.value || 0,
  );
  if (!prod || prod <= 0)
    return showToast("กรุณากรอกน้ำหนักผลิตให้ถูกต้อง", "error");
  const uid = localStorage.getItem("activeUserId") || null;
  const { error } = await state.supabase
    .from(REPORT_TABLE)

    .update({
      production_kg: prod,
      status: STATUS_DONE,
      accounting_status: STATUS_DONE,
      accounting_checked_by: uid,
      accounting_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    // .update({
    //   total_qty: prod,
    //   production_weight_kg: prod,
    //   status: STATUS_DONE,
    //   accounting_checked_by: uid,
    //   accounting_checked_at: new Date().toISOString(),
    //   updated_at: new Date().toISOString(),
    // })
    .in("id", g.ids);
  if (error) return showToast(`บันทึกไม่สำเร็จ: ${error.message}`, "error");
  showToast("บันทึกเรียบร้อยแล้ว", "success");
  await loadAccountingData();
}
async function cancelGroup(key) {
  const g = state.groups.find((x) => x.key === key);
  if (!g) return;

  const ok = await askCancelConfirm(g);
  if (!ok) return;

  const { error } = await state.supabase
    .from(REPORT_TABLE)
    .update({
      status: STATUS_CANCELLED,
      accounting_status: STATUS_CANCELLED,
      updated_at: new Date().toISOString(),
    })
    .in("id", g.ids);

  if (error) return showToast(`ยกเลิกไม่สำเร็จ: ${error.message}`, "error");
  showToast("ยกเลิกรายการแล้ว รายการเดิมจะแสดงเป็นสีเทา", "success");
  await loadAccountingData();
}

function askCancelConfirm(g) {
  return new Promise((resolve) => {
    const modal = document.getElementById("appModal");
    const title = document.getElementById("modalTitle");
    const body = document.getElementById("modalBody");
    const actions = document.getElementById("modalActions");

    if (!modal || !title || !body || !actions) {
      resolve(confirm("ยืนยันยกเลิกรายการนี้ใช่ไหม?"));
      return;
    }

    title.textContent = "ยืนยันยกเลิกรายการ";
    body.innerHTML = `
      <p>ต้องการยกเลิกรายการนี้ใช่ไหม?</p>
      <p class="muted">ระบบจะไม่ลบข้อมูลออก แต่จะเปลี่ยนรายการเป็นสีเทา เพื่อให้รู้ว่าเป็นรายการที่ยกเลิกแล้ว</p>
      <p><strong>${safeText(formatDate(g.date))}</strong> / ${safeText(g.dept)} / ${safeText(g.shift)} / ${safeText(g.machine)}</p>
    `;
    actions.innerHTML = `
      <button class="btn light" id="cancelNoBtn">ไม่ยกเลิก</button>
      <button class="btn danger" id="cancelYesBtn">ยืนยันยกเลิก</button>
    `;

    modal.classList.remove("hidden");

    document.getElementById("cancelNoBtn")?.addEventListener("click", () => {
      modal.classList.add("hidden");
      resolve(false);
    }, { once: true });

    document.getElementById("cancelYesBtn")?.addEventListener("click", () => {
      modal.classList.add("hidden");
      resolve(true);
    }, { once: true });
  });
}

function getResult(dept, percent, hasProd) {
  if (!hasProd) return { label: "รอน้ำหนักผลิต", className: "result-none" };
  const s = state.standards[dept];
  if (!s) return { label: "ไม่พบเกณฑ์", className: "result-none" };
  if (percent > s.max)
    return {
      label: `เกิน ${formatPercent(percent - s.max)}`,
      className: "result-danger",
    };
  if (s.warning > 0 && percent >= s.warning)
    return { label: "เริ่มสูง", className: "result-warning" };
  return { label: "ผ่าน", className: "result-success" };
}

function getProduction(r) {
  return Number(r.production_kg ?? r.total_qty ?? 0) || 0;
}

function getAccountingStatus(r) {
  return normalizeText(r.accounting_status || r.status || "");
}

function getDeptName(c) {
  return state.standards[normalizeDept(c)]?.name || c || "-";
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
function toMonth(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? ""
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function dateKey(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "-" : d.toISOString().slice(0, 10);
}
function formatDate(v) {
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("th-TH");
}
function formatNumber(v) {
  return window.EA_COMMON?.formatNumber
    ? window.EA_COMMON.formatNumber(v, 2, 2)
    : Number(v || 0).toLocaleString("th-TH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}
function formatPercent(v) {
  return `${formatNumber(v)}%`;
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
function cssEscape(v) {
  return window.CSS?.escape ? CSS.escape(v) : String(v).replaceAll('"', '\\"');
}
function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 2600);
}
function closeModal() {
  document.getElementById("appModal")?.classList.add("hidden");
}

async function logoutAccounting() {
  try {
    const client = state.supabase || window.supabaseClient || window.supabase;
    if (client?.auth?.signOut) {
      await client.auth.signOut();
    }
  } catch (e) {
    console.warn("ออกจากระบบไม่สมบูรณ์:", e);
  } finally {
    localStorage.removeItem("activeUserId");
    window.location.href = "/login.html";
  }
}

window.loadAccountingData = loadAccountingData;
window.applyFilters = applyFilters;
window.toggleDetail = toggleDetail;
window.saveGroup = saveGroup;
window.closeModal = closeModal;
window.editGroup = editGroup;
window.cancelGroup = cancelGroup;
window.logoutAccounting = logoutAccounting;
