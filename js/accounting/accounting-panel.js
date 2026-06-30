/* ======================================================
   accounting-panel.js - GO LIVE v1.0
====================================================== */
const REPORT_TABLE = "daily_waste_reports";
const ITEM_TABLE = "daily_waste_report_items";
const STATUS_SENT = "sent_accounting";
const STATUS_DONE = "accounting_checked";
let state = { supabase: null, reports: [], groups: [], standards: {} };
document.addEventListener("DOMContentLoaded", async () => {
  state.supabase = window.supabaseClient || window.supabase;
  if (!state.supabase) return showToast("ไม่พบ Supabase Client", "error");
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
      .in("status", [STATUS_SENT, STATUS_DONE])
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
    map
      .get(k)
      .push({
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
      (status === "all" || normalizeText(r.status) === status) &&
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
    const key = [
      r.report_date || dateKey(r.created_at),
      normalizeDept(r.department_code || r.department),
      r.shift || r.work_shift || "",
      r.machine_no || "",
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
        status: STATUS_DONE,
      });
    const g = m.get(key);
    g.ids.push(r.id);
    g.rows.push(r);
    g.status =
      g.status === STATUS_DONE && normalizeText(r.status) === STATUS_DONE
        ? STATUS_DONE
        : STATUS_SENT;
    g.reporter.add(r.reported_by || r.created_by_name || "-");
    (r.problem_items || []).forEach((i) => {
      g.items.push(i);
      g.waste += Number(i.waste_weight_kg || 0);
    });
    if (!g.production) g.production = getProduction(r);
  });
  return [...m.values()];
}
function renderSummary(groups) {
  const waste = groups.reduce((s, g) => s + g.waste, 0),
    prod = groups.reduce((s, g) => s + (g.production || 0), 0);
  setText("sumCount", groups.length.toLocaleString("th-TH"));
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
  const percent = g.production ? (g.waste / g.production) * 100 : 0;
  const result = getResult(g.dept, percent, !!g.production);
  const status =
    normalizeText(g.status) === STATUS_DONE
      ? `<span class="status-pill status-done">บัญชีตรวจแล้ว</span>`
      : `<span class="status-pill status-sent">รอบัญชีตรวจ</span>`;
  return `<tr><td><button class="expand-btn" onclick="toggleDetail(${i})">▼</button></td><td>${safeText(formatDate(g.date))}</td><td><strong>${safeText(g.dept)}</strong><br><small>${safeText(getDeptName(g.dept))}</small></td><td>${safeText(g.shift)}</td><td><strong>${safeText(g.machine)}</strong></td><td>${safeText([...g.reporter].join(", "))}</td><td class="text-right"><strong>${formatNumber(g.waste)}</strong></td><td>${renderProblemInline(g.items)}</td><td class="text-right"><input class="cell-input text-right" type="number" step="0.01" min="0" value="${safeAttr(g.production || "")}" data-prod="${safeAttr(g.key)}" placeholder="kg"></td><td class="text-right">${g.production ? formatPercent(percent) : "-"}</td><td><span class="result-pill ${result.className}">${safeText(result.label)}</span></td><td>${status}</td><td><button class="btn success" onclick="saveGroup('${safeAttr(g.key)}')">บันทึก</button></td></tr><tr id="detail-${i}" class="detail-row hidden"><td colspan="13">${renderProblemTable(g.items, g.waste)}</td></tr>`;
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
      total_qty: prod,
      production_weight_kg: prod,
      status: STATUS_DONE,
      accounting_checked_by: uid,
      accounting_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in("id", g.ids);
  if (error) return showToast(`บันทึกไม่สำเร็จ: ${error.message}`, "error");
  showToast("บันทึกบัญชีเรียบร้อยแล้ว", "success");
  await loadAccountingData();
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
  return (
    Number(
      r.production_weight_kg ||
        r.total_qty ||
        r.produced_weight_kg ||
        r.production_qty ||
        0,
    ) || 0
  );
}
function getDeptName(c) {
  return state.standards[normalizeDept(c)]?.name || c || "-";
}
function normalizeDept(v) {
  return String(v || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}
function normalizeText(v) {
  return String(v || "")
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
  return Number(v || 0).toLocaleString("th-TH", {
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
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function safeAttr(v) {
  return safeText(v).replaceAll("`", "&#096;");
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
window.loadAccountingData = loadAccountingData;
window.applyFilters = applyFilters;
window.toggleDetail = toggleDetail;
window.saveGroup = saveGroup;
window.closeModal = closeModal;
