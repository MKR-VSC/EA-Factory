/* ======================================================
   ACCOUNTING PANEL JS
   ------------------------------------------------------
   หน้านี้ใช้สำหรับแผนกบัญชี:
   1) โหลดข้อมูลของเสียจาก daily_waste_reports
   2) กรองตามแผนก / เดือน / Week / สถานะ
   3) บัญชีเติมน้ำหนักผลิต + ต้นทุน/กก. + หมายเหตุ
   4) คำนวณ % Waste และมูลค่าความเสียหาย
   5) Export CSV เปิดด้วย Excel ได้

   ตารางหลักที่ใช้:
   - daily_waste_reports

   หมายเหตุ:
   โค้ดนี้พยายามรองรับชื่อคอลัมน์หลายแบบ
   เพราะฐานข้อมูลอาจยังไม่ตรงกัน 100%
====================================================== */

const REPORT_TABLE = "daily_waste_reports";

/*
  รายชื่อ role ที่เข้าใช้งานหน้าบัญชีได้
  ถ้าบริษัทอยากให้เฉพาะ accounting ให้เหลือ ["accounting", "admin"] ได้ค่ะ
*/
const ALLOW_ROLES = ["admin", "accounting", "management", "supervisor"];

/*
  state คือที่เก็บข้อมูลกลางของหน้านี้
  - reports = ข้อมูลทั้งหมดจาก Supabase
  - filteredReports = ข้อมูลหลังผ่านตัวกรอง
*/
const state = {
  supabase: null,
  reports: [],
  filteredReports: [],
};

/* ======================================================
   START
====================================================== */

document.addEventListener("DOMContentLoaded", () => {
  if (!protectAccountingPage()) return;

  initAccountingPanel();
});

/* ======================================================
   AUTH / PROTECT PAGE
====================================================== */

function protectAccountingPage() {
  const activeUser = localStorage.getItem("activeUser");
  const activeRole = String(localStorage.getItem("activeRole") || "").toLowerCase();

  if (!activeUser || !ALLOW_ROLES.includes(activeRole)) {
    alert("สิทธิ์การเข้าถึงล้มเหลว: เฉพาะบัญชี / หัวหน้า / ผู้บริหาร / แอดมินเท่านั้น");
    window.location.href = "/login.html";
    return false;
  }

  return true;
}

/* ======================================================
   INIT
====================================================== */

async function initAccountingPanel() {
  bindEvents();
  setDefaultMonth();

  // รองรับทั้ง window.supabaseClient และ window.supabase
  // แล้วแต่ไฟล์ supabaseClient.js ของโปรเจกต์ตั้งชื่อไว้แบบไหน
  state.supabase = window.supabaseClient || window.supabase || null;

  if (!state.supabase) {
    renderEmpty("ไม่พบ Supabase Client กรุณาตรวจสอบ path /core/supabaseClient.js");
    showAlert("ไม่พบ Supabase Client กรุณาตรวจสอบไฟล์ supabaseClient.js");
    return;
  }

  await loadAccountingData();
}

function bindEvents() {
  document.getElementById("btn-refresh")?.addEventListener("click", loadAccountingData);

  document.getElementById("filter-dept")?.addEventListener("change", applyFilters);
  document.getElementById("filter-month")?.addEventListener("change", applyFilters);
  document.getElementById("filter-week")?.addEventListener("change", applyFilters);
  document.getElementById("filter-status")?.addEventListener("change", applyFilters);
  document.getElementById("search-input")?.addEventListener("input", applyFilters);

  document.getElementById("btn-export-raw")?.addEventListener("click", exportRawCsv);
  document.getElementById("btn-export-summary")?.addEventListener("click", exportSummaryCsv);
}

function setDefaultMonth() {
  const input = document.getElementById("filter-month");
  if (!input) return;

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");

  input.value = `${yyyy}-${mm}`;
}

/* ======================================================
   LOAD DATA
====================================================== */

async function loadAccountingData() {
  hideAlert();

  const btn = document.getElementById("btn-refresh");
  if (btn) btn.disabled = true;

  try {
    /*
      ดึงข้อมูล 1000 รายการล่าสุด
      ถ้าข้อมูลเยอะมาก ภายหลังค่อยทำ pagination ได้ค่ะ
    */
    const { data, error } = await state.supabase
      .from(REPORT_TABLE)
      .select("*")
      .order("incident_datetime", { ascending: false })
      .limit(1000);

    if (error) {
      throw new Error(`โหลดข้อมูลไม่สำเร็จ: ${error.message}`);
    }

    state.reports = Array.isArray(data) ? data : [];

    setText("last-update", `อัปเดตล่าสุด: ${new Date().toLocaleString("th-TH")}`);

    applyFilters();
  } catch (err) {
    console.error(err);
    showAlert(err.message || String(err));
    renderEmpty("โหลดข้อมูลไม่สำเร็จ");
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ======================================================
   FILTER / RENDER
====================================================== */

function applyFilters() {
  const dept = getValue("filter-dept");
  const month = getValue("filter-month");
  const week = getValue("filter-week");
  const status = getValue("filter-status");
  const keyword = getValue("search-input").toLowerCase();

  const rows = state.reports.filter((row) => {
    const rowDept = normalizeDept(getDepartment(row));
    const rowDate = getIncidentDate(row);
    const rowMonth = toMonthInputValue(rowDate);
    const rowWeek = getWeekOfMonth(rowDate);
    const rowStatus = getAccountingStatus(row);

    const text = [
      getDepartment(row),
      getMachine(row),
      getShift(row),
      getProblem(row),
      getProblemDetail(row),
      getReporter(row),
      getAccountingNote(row),
      row.note,
      row.reason_detail,
      row.corrective_action,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchDept = dept === "all" || rowDept === normalizeDept(dept);
    const matchMonth = !month || rowMonth === month;
    const matchWeek = week === "all" || String(rowWeek) === String(week);
    const matchStatus = status === "all" || rowStatus === status;
    const matchKeyword = !keyword || text.includes(keyword);

    return matchDept && matchMonth && matchWeek && matchStatus && matchKeyword;
  });

  state.filteredReports = rows;

  renderTable(rows);
  renderSummary(rows);
}

function renderTable(rows) {
  const tbody = document.getElementById("accounting-table-body");
  if (!tbody) return;

  if (!rows.length) {
    renderEmpty("ไม่พบข้อมูลตามตัวกรอง");
    return;
  }

  tbody.innerHTML = rows
    .map((row) => {
      const id = row.id;
      const date = getIncidentDate(row);
      const waste = getWasteWeight(row);
      const production = getProductionWeight(row);
      const unitCost = getUnitCost(row);
      const wastePercent = calcWastePercent(waste, production);
      const damageCost = waste * unitCost;
      const status = getAccountingStatus(row);

      return `
        <tr data-row-id="${escapeAttr(id)}">
          <td>${escapeHtml(formatDate(date))}</td>
          <td>${escapeHtml(formatMonthText(date))}</td>
          <td>Week ${escapeHtml(getWeekOfMonth(date))}</td>
          <td>${escapeHtml(getDepartment(row) || "-")}</td>
          <td>${escapeHtml(getShift(row) || "-")}</td>
          <td>${escapeHtml(getMachine(row) || "-")}</td>
          <td>${escapeHtml(getProblem(row) || "-")}</td>

          <td class="text-right">${formatNumber(waste)}</td>

          <td class="text-right">
            <input
              class="cell-input text-right"
              type="number"
              step="0.01"
              min="0"
              value="${escapeAttr(production || "")}"
              data-field="production"
              data-id="${escapeAttr(id)}"
            />
          </td>

          <td class="text-right">
            <input
              class="cell-input text-right"
              type="number"
              step="0.01"
              min="0"
              value="${escapeAttr(unitCost || "")}"
              data-field="unit_cost"
              data-id="${escapeAttr(id)}"
            />
          </td>

          <td class="text-right">${formatPercent(wastePercent)}</td>
          <td class="text-right">${formatMoney(damageCost)}</td>

          <td>${escapeHtml(getReporter(row) || "-")}</td>

          <td>
            <input
              class="cell-input cell-note"
              type="text"
              value="${escapeAttr(getAccountingNote(row) || "")}"
              placeholder="หมายเหตุบัญชี"
              data-field="accounting_note"
              data-id="${escapeAttr(id)}"
            />
          </td>

          <td>
            <span class="status-pill status-${status}">
              ${status === "checked" ? "บัญชีตรวจแล้ว" : "รอบัญชีตรวจ"}
            </span>
          </td>

          <td>
            <div class="row-actions">
              <button class="btn btn-green" type="button" onclick="saveAccountingRow('${escapeAttr(id)}')">
                บันทึก
              </button>

              <button class="btn btn-gray" type="button" onclick="markPending('${escapeAttr(id)}')">
                ย้อนสถานะ
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderSummary(rows) {
  const count = rows.length;

  const totalWaste = rows.reduce((sum, row) => sum + getWasteWeight(row), 0);
  const totalProduction = rows.reduce((sum, row) => sum + getProductionWeight(row), 0);
  const totalCost = rows.reduce((sum, row) => {
    return sum + getWasteWeight(row) * getUnitCost(row);
  }, 0);

  const percent = calcWastePercent(totalWaste, totalProduction);

  setText("sum-count", count.toLocaleString("th-TH"));
  setText("sum-waste", formatNumber(totalWaste));
  setText("sum-production", formatNumber(totalProduction));
  setText("sum-waste-percent", formatPercent(percent));
  setText("sum-cost", formatMoney(totalCost));
}

function renderEmpty(message) {
  const tbody = document.getElementById("accounting-table-body");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="16" class="tb-empty">${escapeHtml(message)}</td>
    </tr>
  `;

  renderSummary([]);
}

/* ======================================================
   SAVE ACCOUNTING DATA
====================================================== */

async function saveAccountingRow(id) {
  if (!id) return;

  const rowEl = document.querySelector(`tr[data-row-id="${cssEscape(id)}"]`);
  if (!rowEl) return;

  const production = getInputNumber(rowEl, "production");
  const unitCost = getInputNumber(rowEl, "unit_cost");
  const accountingNote = getInputValue(rowEl, "accounting_note");

  /*
    บันทึกลง daily_waste_reports โดยใช้คอลัมน์ที่มีโอกาสมีอยู่แล้ว:
    - total_qty = น้ำหนักผลิต
    - unit_cost = ต้นทุน/กก.
    - note = หมายเหตุบัญชี
    - status = checked
    - checked_by, checked_at = ผู้ตรวจและเวลา

    ถ้าฐานข้อมูลไม่มีคอลัมน์ใด ให้ลบ field นั้นออกจาก payload ได้ค่ะ
  */
  const payload = {
    total_qty: production,
    unit_cost: unitCost,
    note: accountingNote,
    status: "checked",
    checked_by:
      localStorage.getItem("activeName") ||
      localStorage.getItem("activeUser") ||
      "accounting",
    checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await updateReport(id, payload, "บันทึกข้อมูลบัญชีเรียบร้อยแล้ว");
}

async function markPending(id) {
  if (!id) return;

  const ok = confirm("ต้องการย้อนสถานะรายการนี้กลับเป็นรอบัญชีตรวจใช่ไหม?");
  if (!ok) return;

  const payload = {
    status: "pending",
    checked_by: null,
    checked_at: null,
    updated_at: new Date().toISOString(),
  };

  await updateReport(id, payload, "ย้อนสถานะเรียบร้อยแล้ว");
}

async function updateReport(id, payload, successMessage) {
  hideAlert();

  try {
    const { error } = await state.supabase
      .from(REPORT_TABLE)
      .update(payload)
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    showAlert(successMessage, "success");
    await loadAccountingData();
  } catch (err) {
    console.error(err);
    showAlert(`บันทึกไม่สำเร็จ: ${err.message || err}`);
  }
}

/* ======================================================
   EXPORT CSV
   ------------------------------------------------------
   ใช้ CSV เพราะเปิดด้วย Excel ได้ทันที
   และไม่ต้องเพิ่ม library ภายนอก
====================================================== */

function exportRawCsv() {
  const rows = state.filteredReports;

  const header = [
    "วันที่",
    "เดือน",
    "Week",
    "แผนก",
    "กะ",
    "เครื่อง",
    "อาการ",
    "รายละเอียด",
    "น้ำหนักสูญเสีย kg",
    "น้ำหนักผลิต kg",
    "ต้นทุนต่อกก.",
    "% Waste",
    "มูลค่าความเสียหาย",
    "ผู้แจ้ง",
    "หมายเหตุบัญชี",
    "สถานะ",
  ];

  const body = rows.map((row) => {
    const date = getIncidentDate(row);
    const waste = getWasteWeight(row);
    const production = getProductionWeight(row);
    const unitCost = getUnitCost(row);

    return [
      formatDate(date),
      formatMonthText(date),
      `Week ${getWeekOfMonth(date)}`,
      getDepartment(row),
      getShift(row),
      getMachine(row),
      getProblem(row),
      getProblemDetail(row),
      waste,
      production,
      unitCost,
      calcWastePercent(waste, production),
      waste * unitCost,
      getReporter(row),
      getAccountingNote(row),
      getAccountingStatus(row) === "checked" ? "บัญชีตรวจแล้ว" : "รอบัญชีตรวจ",
    ];
  });

  downloadCsv("accounting-waste-raw.csv", [header, ...body]);
}

function exportSummaryCsv() {
  /*
    สรุปตาม แผนก + เครื่อง + อาการ
  */
  const map = new Map();

  state.filteredReports.forEach((row) => {
    const key = [
      getDepartment(row) || "-",
      getMachine(row) || "-",
      getProblem(row) || "-",
    ].join("||");

    const waste = getWasteWeight(row);
    const production = getProductionWeight(row);
    const cost = waste * getUnitCost(row);

    if (!map.has(key)) {
      map.set(key, {
        department: getDepartment(row) || "-",
        machine: getMachine(row) || "-",
        problem: getProblem(row) || "-",
        count: 0,
        waste: 0,
        production: 0,
        cost: 0,
      });
    }

    const item = map.get(key);
    item.count += 1;
    item.waste += waste;
    item.production += production;
    item.cost += cost;
  });

  const header = [
    "แผนก",
    "เครื่อง",
    "อาการ",
    "จำนวนครั้ง",
    "น้ำหนักสูญเสีย kg",
    "น้ำหนักผลิต kg",
    "% Waste",
    "มูลค่าความเสียหาย",
  ];

  const body = Array.from(map.values()).map((item) => [
    item.department,
    item.machine,
    item.problem,
    item.count,
    item.waste,
    item.production,
    calcWastePercent(item.waste, item.production),
    item.cost,
  ]);

  downloadCsv("accounting-waste-summary.csv", [header, ...body]);
}

function downloadCsv(filename, rows) {
  /*
    ใส่ BOM \ufeff เพื่อให้ Excel อ่านภาษาไทยไม่เพี้ยน
  */
  const csv = rows.map((row) => {
    return row.map(csvCell).join(",");
  }).join("\n");

  const blob = new Blob(["\ufeff" + csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

/* ======================================================
   DATA MAPPING HELPERS
   ------------------------------------------------------
   ช่วยให้โค้ดอ่านข้อมูลได้ แม้ชื่อคอลัมน์ในฐานข้อมูลไม่ตรงกัน
====================================================== */

function getIncidentDate(row) {
  return (
    row.incident_datetime ||
    row.report_date ||
    row.date_time ||
    row.created_at ||
    row.date ||
    null
  );
}

function getDepartment(row) {
  return row.department || row.department_code || row.dept || "";
}

function getShift(row) {
  return row.work_shift || row.shift || "";
}

function getMachine(row) {
  return row.machine_no || row.machine || row.machine_name || "";
}

function getProblem(row) {
  return row.problem_type || row.problem_name || row.reason_detail || "";
}

function getProblemDetail(row) {
  return row.detail || row.problem_detail || row.reason_detail || row.note || "";
}

function getWasteWeight(row) {
  return toNumber(row.waste_weight_kg || row.waste_qty || 0);
}

function getProductionWeight(row) {
  return toNumber(
    row.production_weight_kg ||
      row.total_qty ||
      row.produced_weight_kg ||
      row.production_qty ||
      0
  );
}

function getUnitCost(row) {
  return toNumber(row.unit_cost || row.cost_per_kg || 0);
}

function getReporter(row) {
  return row.reported_by || row.reporter_name || row.created_by || "";
}

function getAccountingNote(row) {
  return row.accounting_note || row.account_note || row.note || "";
}

function getAccountingStatus(row) {
  const status = String(row.status || "").toLowerCase();

  if (["checked", "approved", "done", "completed", "ตรวจสอบแล้ว"].includes(status)) {
    return "checked";
  }

  return "pending";
}

/* ======================================================
   DATE / CALC HELPERS
====================================================== */

function getWeekOfMonth(value) {
  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return "-";

  // แบ่งแบบบัญชีใช้งานง่าย:
  // วันที่ 1-7 = Week 1
  // วันที่ 8-14 = Week 2
  // วันที่ 15-21 = Week 3
  // วันที่ 22-28 = Week 4
  // วันที่ 29-31 = Week 5
  return Math.ceil(d.getDate() / 7);
}

function toMonthInputValue(value) {
  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return "";

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");

  return `${yyyy}-${mm}`;
}

function formatMonthText(value) {
  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
  });
}

function formatDate(value) {
  const d = new Date(value);

  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function calcWastePercent(waste, production) {
  if (!production) return 0;
  return (waste / production) * 100;
}

/* ======================================================
   SMALL HELPERS
====================================================== */

function getValue(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function getInputValue(parent, field) {
  return parent.querySelector(`[data-field="${field}"]`)?.value?.trim() || "";
}

function getInputNumber(parent, field) {
  return toNumber(getInputValue(parent, field));
}

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(value) {
  return toNumber(value).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatMoney(value) {
  return toNumber(value).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value) {
  return `${toNumber(value).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function normalizeDept(value) {
  return String(value || "").trim().toUpperCase();
}

function showAlert(message, type = "error") {
  const box = document.getElementById("alert-box");
  if (!box) return;

  box.textContent = message;
  box.className = type === "success" ? "alert-box success" : "alert-box";
  box.hidden = false;
}

function hideAlert() {
  const box = document.getElementById("alert-box");
  if (box) box.hidden = true;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(value);
  return String(value).replaceAll('"', '\\"');
}

/* ======================================================
   GLOBAL FUNCTIONS
   ให้ปุ่ม onclick ใน HTML เรียกใช้ได้
====================================================== */

window.loadAccountingData = loadAccountingData;
window.saveAccountingRow = saveAccountingRow;
window.markPending = markPending;
