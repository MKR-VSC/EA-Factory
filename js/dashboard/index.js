// =========================================================
// index.js
// EA Factory Waste Management - Executive Dashboard v1.0
// ---------------------------------------------------------
// หน้าที่หลัก:
// 1) โหลดข้อมูลของเสียจาก daily_waste_reports
// 2) โหลด master_departments เพื่อแสดงชื่อไทยและเกณฑ์
// 3) สรุปภาพรวมรายเดือนทั้งโรงงาน
// 4) สรุป % Waste รายแผนก / รายเครื่อง / รายปัญหา
// 5) Export CSV สำหรับผู้บริหาร
// =========================================================

/* =========================================================
   CONFIG
========================================================= */

const LOGIN_PAGE = "/login.html";
const REPORT_TABLE = "daily_waste_reports";
const MASTER_DEPARTMENT_TABLE = "master_departments";
const ITEM_TABLE = "daily_waste_report_items";
const MACHINE_LIMIT_PERCENT = 1;
const MACHINE_WARNING_PERCENT = 0.7;
const FACTORY_LIMIT_PERCENT = 1;
const FACTORY_WARNING_PERCENT = 0.7;

const ALLOWED_ROLES = ["admin", "management", "manager", "executive"];
const ACCOUNTING_CHECKED_STATUS = [
  "accounting_checked",
  "checked",
  "approved",
  "done",
  "completed",
  "ตรวจสอบแล้ว",
];

const CANCELLED_STATUS = [
  "cancelled",
  "canceled",
  "cancel",
  "void",
  "ยกเลิก",
  "ยกเลิกแล้ว",
];


/* =========================================================
   CHART THEME / COLORS
   กำหนดสีกราฟให้ชัด และแยกสีตามประเภทของเสีย
========================================================= */

const CHART_COLORS = {
  green: "#16a34a",
  greenSoft: "rgba(22, 163, 74, 0.16)",
  blue: "#1E3A8A",
  blueSoft: "rgba(37, 99, 235, 0.18)",
  cyan: "#06b6d4",
  amber: "#f59e0b",
  orange: "#f97316",
  red: "#dc2626",
  purple: "#7c3aed",
  pink: "#e11d48",
  slate: "#64748b",
  gray: "#94a3b8",
};

const DEPARTMENT_COLORS = [
  "#EA580C",
  "#1E3A8A",
  "#f59e0b",
  "#dc2626",
  "#7c3aed",
  "#06b6d4",
  "#e11d48",
  "#14b8a6",
  "#84cc16",
  "#f97316",
  "#475569",
];

// สีประจำแผนก ใช้กับกราฟภาพรวม/เครื่องจักร เพื่อให้ผู้บริหารจำสีได้ง่าย
const DEPARTMENT_COLOR_MAP = {
  BLOW: "#EA580C",
  PIPE: "#1E3A8A",
  MONO: "#7c3aed",
  BLOWN_FILM: "#06b6d4",
  SHEET_CUTTING: "#f59e0b",
  CUT_PUNCH: "#dc2626",
  GARBAGE_BAG_CUT: "#f97316",
  RAIN_TAPE: "#14b8a6",
  RAIN_TAPE_CUT_PUNCH: "#e11d48",
  SHADE_NET: "#84cc16",
  UNKNOWN: "#94a3b8",
};

const PROBLEM_COLOR_PALETTE = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#1E3A8A",
  "#06b6d4",
  "#7c3aed",
  "#e11d48",
  "#14b8a6",
  "#84cc16",
  "#64748b",
  "#EA580C",
  "#9333ea",
];

const PROBLEM_COLOR_MAP = {
  "เศษเจาะ": "#ef4444",
  "เศษตัด": "#dc2626",
  "เศษขอบ": "#f97316",
  "รอยต่อม้วน": "#f97316",
  "เม็ดดำ": "#0ea5e9",
  "จุดดำ": "#0ea5e9",
  "รอยย่น": "#8b5cf6",
  "รูเข็ม": "#e11d48",
  "ฟิล์มบาง": "#06b6d4",
  "ฟิล์มหนา": "#1E3A8A",
  "สีผิด": "#84cc16",
  "สีเพี้ยน": "#84cc16",
  "ขาด": "#dc2626",
  "ขาดง่าย": "#dc2626",
  "ตัน": "#7c3aed",
  "อื่นๆ": "#94a3b8",
  "ไม่ระบุปัญหา": "#94a3b8",
  "ไม่ระบุ": "#94a3b8",
};

const EXCLUDE_DEPARTMENT_CODES = [
  "IT_SUPPORT",
  "IT_SUPORT",
  "ACCOUNTING",
  "MANAGEMENT",
  "ADMIN",
 
];

/* =========================================================
   GLOBAL STATE
========================================================= */

let dashboardDataCache = [];
let filteredDataCache = [];
let departmentMasters = {};
let departmentOptions = [];

let chartDailyWastePercent = null;
let chartMachineRisk = null;
let chartProblem = null;
let chartDeptDonut = null;

/* =========================================================
   INIT
========================================================= */

window.addEventListener("DOMContentLoaded", async () => {
  if (!protectExecutivePage()) return;

  setActiveUserLabel();
  initMonthFilter();

  await loadDepartmentMasters();
  renderDepartmentFilter();
  await loadAndProcessDashboardData();
});

/* =========================================================
   AUTH
========================================================= */

function protectExecutivePage() {
  const activeUser = localStorage.getItem("activeUser");
  const role = normalizeText(localStorage.getItem("activeRole"));

  if (!activeUser || !ALLOWED_ROLES.includes(role)) {
    alert("คุณไม่มีสิทธิ์เข้าใช้งานหน้า Executive Dashboard");
    window.location.href = LOGIN_PAGE;
    return false;
  }

  return true;
}

function setActiveUserLabel() {
  setText(
    "lbl-active-user",
    localStorage.getItem("activeName") || localStorage.getItem("activeUser") || "-"
  );
}

async function handleDashboardLogout() {
  const client = getSupabaseClient();

  try {
    if (client?.auth) await client.auth.signOut();
  } catch (error) {
    console.warn("Supabase signOut ไม่สำเร็จ:", error);
  }

  localStorage.clear();
  window.location.href = LOGIN_PAGE;
}

/* =========================================================
   SUPABASE
========================================================= */

function getSupabaseClient() {
  const client = window.supabaseClient;

  if (!client || typeof client.from !== "function") {
    console.error("ไม่พบ window.supabaseClient กรุณาตรวจสอบ /core/supabaseClient.js");
    return null;
  }

  return client;
}

/* =========================================================
   MASTER DATA
========================================================= */

async function loadDepartmentMasters() {
  const client = getSupabaseClient();
  if (!client) return;

  const { data, error } = await client
    .from(MASTER_DEPARTMENT_TABLE)
    .select("department_code, department_name, max_waste_percent, warning_percent, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.warn("โหลด master_departments ไม่สำเร็จ:", error);
    return;
  }

  departmentMasters = {};
  departmentOptions = [];

  (data || []).forEach((dept) => {
    const code = normalizeDepartmentCode(dept.department_code);
    if (!code || EXCLUDE_DEPARTMENT_CODES.includes(code)) return;

    const item = {
      code,
      name: dept.department_name || code,
      maxWastePercent: toNumber(dept.max_waste_percent || FACTORY_LIMIT_PERCENT),
      warningPercent: toNumber(dept.warning_percent || FACTORY_WARNING_PERCENT),
      sortOrder: toNumber(dept.sort_order || 0),
    };

    departmentMasters[code] = item;
    departmentOptions.push(item);
  });
}

function renderDepartmentFilter() {
  const select = document.getElementById("sel-dept-filter");
  if (!select) return;

  select.innerHTML = `
    <option value="all">ทุกแผนกผลิต</option>
    ${departmentOptions
      .map((dept) => `<option value="${escapeAttr(dept.code)}">${escapeHTML(dept.name)} (${escapeHTML(dept.code)})</option>`)
      .join("")}
  `;
}

/* =========================================================
   DATE / FILTER
========================================================= */

function initMonthFilter() {
  const input = document.getElementById("filter-month");
  if (!input) return;

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");

  input.value = `${yyyy}-${mm}`;
}

function getSelectedDateRange() {
  const month = document.getElementById("filter-month")?.value;

  if (!month) {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
      start: toDateInputValue(firstDay),
      end: toDateInputValue(lastDay),
    };
  }

  const [yyyy, mm] = month.split("-").map(Number);
  const firstDay = new Date(yyyy, mm - 1, 1);
  const lastDay = new Date(yyyy, mm, 0);

  return {
    start: toDateInputValue(firstDay),
    end: toDateInputValue(lastDay),
  };
}

/* =========================================================
   LOAD DATA
========================================================= */

async function loadAndProcessDashboardData() {
  const client = getSupabaseClient();
  if (!client) return;

  const range = getSelectedDateRange();
  const selectedDept = document.getElementById("sel-dept-filter")?.value || "all";

  showLoading();

  try {
    const { data, error } = await client
      .from(REPORT_TABLE)
      .select("*")
      .gte("report_date", range.start)
      .lte("report_date", range.end)
      .order("report_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;

    const checkedRows = (data || [])
      .filter(isAccountingChecked)
      .filter((row) => !isCancelledRow(row));

    const rowsWithItems = await attachProblemItemsToReports(checkedRows);

    dashboardDataCache = rowsWithItems;
    filteredDataCache =
      selectedDept === "all"
        ? rowsWithItems
        : rowsWithItems.filter((row) => getDepartmentInfo(row).code === selectedDept);

    window.pvtDashboardRawCache = dashboardDataCache;
    window.pvtExecutiveFilteredCache = filteredDataCache;

    renderAllDashboard(filteredDataCache, range);
  } catch (error) {
    console.error("โหลดข้อมูลไม่สำเร็จ:", error);
    alert("โหลดข้อมูลไม่สำเร็จ: " + (error.message || error));
    renderAllDashboard([], range);
  }
}

function showLoading() {
  setText("cnt-today", "...");
  setText("cnt-waste-percent", "...");
  setText("cnt-waste-percent-sub", "กำลังโหลด");
  setText("cnt-machine-risk", "...");
  setText("cnt-top-machine", "...");
  setText("cnt-top-machine-sub", "กำลังโหลด");

  const insight = document.getElementById("exec-insight-box");
  if (insight) insight.textContent = "กำลังวิเคราะห์ข้อมูล...";

  const machineList = document.getElementById("machine-summary-list");
  if (machineList) machineList.textContent = "กำลังโหลดข้อมูล...";
}

/* =========================================================
   RENDER ALL
========================================================= */

function renderAllDashboard(records, range) {
  const deptSummary = summarizeByDepartment(records);
  const machineSummary = summarizeByMachine(records);
  const problemSummary = summarizeByProblem(records);
  const dailySummary = summarizeByDate(records, range);

  updateMetricCards(records, machineSummary, deptSummary, range);
  renderExecutiveInsight(records, machineSummary);
  renderDepartmentSummaryTable(deptSummary);
  renderMachineSummaryList(machineSummary);

  renderDailyWastePercentChart(dailySummary);
  renderMachineRiskChart(machineSummary);
  renderProblemChart(problemSummary);
  renderDepartmentDonutChart(deptSummary);
}

/* =========================================================
   KPI CARDS
========================================================= */

function updateMetricCards(records, machineSummary, deptSummary, range) {
  const totalWaste = sumWaste(records);
  const totalProduction = sumProductionUnique(records);
  const wastePercent = calcWastePercent(totalWaste, totalProduction);

  // KPI ช่องที่ 4: แผนกที่มี "น้ำหนักของเสียรวม" สูงสุดในเดือนที่เลือก
  // ใช้ตามชื่อการ์ดใหม่: แผนกที่มีของเสียสูงสุด
  const topDepartment = [...(deptSummary || [])].sort(
    (a, b) => b.waste - a.waste || b.percent - a.percent || b.production - a.production
  )[0];

  // id เดิมใน HTML ยังใช้ชื่อ cnt-today / cnt-machine-risk อยู่
  // แต่ค่าที่แสดงถูกเปลี่ยนให้ตรงกับ KPI ใหม่แล้ว
  setText("cnt-today", `${formatNumber(totalProduction)}`);
  setText("cnt-machine-risk", `${formatNumber(totalWaste)}`);
  setText("cnt-waste-percent", `${formatNumber(wastePercent)}%`);
  setText("cnt-waste-percent-sub", `ผลิต ${formatNumber(totalProduction)} kg / เสีย ${formatNumber(totalWaste)} kg`);

  setText("cnt-top-machine", topDepartment ? topDepartment.department : "-");
  setText(
    "cnt-top-machine-sub",
    topDepartment
      ? `เสีย ${formatNumber(topDepartment.waste)} kg | ผลิต ${formatNumber(topDepartment.production)} kg | ${formatNumber(topDepartment.percent)}%`
      : "-"
  );

  const pill = document.getElementById("overall-result-pill");
  if (pill) {
    const result = getResultByPercent(wastePercent, FACTORY_WARNING_PERCENT, FACTORY_LIMIT_PERCENT);
    pill.textContent = result.label;
    pill.className = `result-pill ${result.className}`;
  }
}

/* =========================================================
   EXECUTIVE INSIGHT
========================================================= */

function renderExecutiveInsight(records, machineSummary) {
  const box = document.getElementById("exec-insight-box");
  if (!box) return;

  if (!records.length) {
    box.textContent = "ไม่พบข้อมูลที่บัญชีตรวจแล้วในช่วงเดือนที่เลือก";
    return;
  }

  const totalWaste = sumWaste(records);
  const totalProduction = sumProductionUnique(records);
  const wastePercent = calcWastePercent(totalWaste, totalProduction);
  const overLimit = machineSummary.filter((item) => item.percent >= MACHINE_LIMIT_PERCENT);
  const warning = machineSummary.filter(
    (item) => item.percent >= MACHINE_WARNING_PERCENT && item.percent < MACHINE_LIMIT_PERCENT
  );

  box.innerHTML = `
    <strong>ภาพรวมเดือนนี้:</strong>
    ผลิตรวม <b>${formatNumber(totalProduction)} kg</b>,
    ของเสียรวม <b>${formatNumber(totalWaste)} kg</b>,
    Waste <b>${formatNumber(wastePercent)}%</b><br />
    พบเครื่องเกินเกณฑ์ <b>${formatNumber(overLimit.length)}</b> เครื่อง
    และเครื่องใกล้เกินเกณฑ์ <b>${formatNumber(warning.length)}</b> เครื่อง
  `;
}

/* =========================================================
   SUMMARY: DEPARTMENT / MACHINE / PROBLEM / DATE
========================================================= */

function summarizeByDepartment(records) {
  const map = {};

  records.forEach((row) => {
    const dept = getDepartmentInfo(row);
    const key = dept.code || "UNKNOWN";

    if (!map[key]) {
      map[key] = {
        code: key,
        department: dept.name,
        waste: 0,
        production: 0,
        productionKeys: new Set(),
      };
    }

    map[key].waste += getWasteWeight(row);
    addProductionOnce(map[key], row);
  });

  return Object.values(map).map((item) => ({
    ...item,
    percent: calcWastePercent(item.waste, item.production),
  }));
}

function summarizeByMachine(records) {
  const map = {};

  records.forEach((row) => {
    const dept = getDepartmentInfo(row);
    const machine = row.machine_no || "ไม่ระบุเครื่อง";
    const key = `${dept.code}|${machine}`;

    if (!map[key]) {
      map[key] = {
        departmentCode: dept.code,
        department: dept.name,
        machine,
        waste: 0,
        production: 0,
        productionKeys: new Set(),
        count: 0,
        problems: {},
      };
    }

    map[key].count += 1;
    map[key].waste += getWasteWeight(row);
    addProductionOnce(map[key], row);

    getProblemItems(row).forEach((item) => {
      const problem = item.problem_type || "ไม่ระบุปัญหา";
      map[key].problems[problem] = (map[key].problems[problem] || 0) + toNumber(item.waste_weight_kg);
    });
  });

  return Object.values(map)
    .map((item) => {
      const topProblem = Object.entries(item.problems).sort((a, b) => b[1] - a[1])[0];

      return {
        ...item,
        percent: calcWastePercent(item.waste, item.production),
        topProblemName: topProblem?.[0] || "-",
        topProblemWaste: topProblem?.[1] || 0,
      };
    })
    .sort(sortByDepartmentAndMachine);
}

function summarizeByProblem(records) {
  const map = {};

  records.forEach((row) => {
    getProblemItems(row).forEach((item) => {
      const problem = item.problem_type || "ไม่ระบุปัญหา";

      if (!map[problem]) {
        map[problem] = {
          problem,
          count: 0,
          waste: 0,
        };
      }

      map[problem].count += 1;
      map[problem].waste += toNumber(item.waste_weight_kg);
    });
  });

  return Object.values(map).sort((a, b) => b.waste - a.waste).slice(0, 10);
}

function summarizeByDate(records, range) {
  const map = {};

  const current = new Date(`${range.start}T00:00:00`);
  const end = new Date(`${range.end}T00:00:00`);

  while (current <= end) {
    const key = toDateInputValue(current);
    map[key] = {
      date: key,
      waste: 0,
      production: 0,
      productionKeys: new Set(),
    };
    current.setDate(current.getDate() + 1);
  }

  records.forEach((row) => {
    const date = row.report_date || toDateInputValue(new Date(getRowDate(row)));
    if (!map[date]) return;

    map[date].waste += getWasteWeight(row);
    addProductionOnce(map[date], row);
  });

  return Object.values(map).map((item) => ({
    ...item,
    percent: calcWastePercent(item.waste, item.production),
  }));
}

function addProductionOnce(target, row) {
  const key = getProductionUniqueKey(row);

  if (target.productionKeys.has(key)) return;

  target.production += getProductionWeight(row);
  target.productionKeys.add(key);
}

function getProductionUniqueKey(row) {
  const dept = getDepartmentInfo(row);
  const date = row.report_date || toDateInputValue(new Date(getRowDate(row)));
  const shift = row.work_shift || row.shift || "-";
  const machine = row.machine_no || "-";

  return `${date}|${dept.code}|${shift}|${machine}`;
}

/* =========================================================
   TABLES / LISTS
========================================================= */

function renderDepartmentSummaryTable(rows) {
  const tbody = document.getElementById("department-summary-body");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">ไม่พบข้อมูลแผนกในช่วงเดือนที่เลือก</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .sort((a, b) => a.department.localeCompare(b.department, "th"))
    .map((item) => {
      const result = getResultByPercent(item.percent, FACTORY_WARNING_PERCENT, FACTORY_LIMIT_PERCENT);

      return `
        <tr>
          <td>
            <span style="display:inline-flex;align-items:center;gap:8px;">
              <span style="width:12px;height:12px;border-radius:999px;background:${getDepartmentColor(item.code)};display:inline-block;box-shadow:0 0 0 3px rgba(15,23,42,.06);"></span>
              <strong>${escapeHTML(item.department)}</strong>
            </span>
          </td>
          <td class="text-right">${formatNumber(item.production)}</td>
          <td class="text-right">${formatNumber(item.waste)}</td>
          <td class="text-right"><strong>${formatNumber(item.percent)}%</strong></td>
          <td><span class="result-pill ${result.className}">${escapeHTML(result.label)}</span></td>
        </tr>
      `;
    })
    .join("");
}

function renderMachineSummaryList(rows) {
  const box = document.getElementById("machine-summary-list");
  if (!box) return;

  if (!rows.length) {
    box.innerHTML = `<div class="empty-cell">ไม่พบข้อมูลเครื่องจักรในช่วงเดือนที่เลือก</div>`;
    return;
  }

  const groupedByDept = {};

  rows.forEach((item) => {
    const dept = item.department || "ไม่ระบุแผนก";
    if (!groupedByDept[dept]) groupedByDept[dept] = [];
    groupedByDept[dept].push(item);
  });

  box.innerHTML = Object.entries(groupedByDept)
    .map(([deptName, machines]) => {
      const machineHtml = machines
        .map((item) => {
          const rowClass = getMachineRowClass(item.percent);

          return `
            <div class="machine-item ${rowClass}" style="border-left: 8px solid ${getDepartmentColor(item.departmentCode)};">
              <div>
                <strong>เครื่อง ${escapeHTML(item.machine)}</strong>
                <small>
                  ปัญหาหลัก: ${escapeHTML(item.topProblemName)}
                  ${item.topProblemWaste ? `(${formatNumber(item.topProblemWaste)} kg)` : ""}
                </small>
              </div>

              <div class="machine-value">
                <strong>${formatNumber(item.percent)}%</strong>
                <small>
                  เสีย ${formatNumber(item.waste)} kg |
                  ผลิต ${formatNumber(item.production)} kg |
                  ${formatNumber(item.count)} รายการ
                </small>
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <div class="dept-machine-group">
          <div class="dept-machine-title">${escapeHTML(deptName)}</div>
          ${machineHtml}
        </div>
      `;
    })
    .join("");
}

/* =========================================================
   CHARTS
========================================================= */

function renderDailyWastePercentChart(rows) {
  chartDailyWastePercent = replaceChart(chartDailyWastePercent, "chart-daily-waste-percent", {
    type: "line",
    data: {
      labels: rows.map((item) => formatDateShort(item.date)),
      datasets: [
        {
          label: "% Waste รายวัน",
          data: rows.map((item) => item.percent),
          borderColor: CHART_COLORS.blue,
          backgroundColor: CHART_COLORS.blueSoft,
          pointBackgroundColor: rows.map((item) => getRiskColor(item.percent)),
          pointBorderColor: "#ffffff",
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 3,
          tension: 0.35,
          fill: true,
        },
      ],
    },
  });
}

function renderMachineRiskChart(rows) {
  const top = [...rows].sort((a, b) => b.percent - a.percent || b.waste - a.waste).slice(0, 10);
  const labels = top.map((item) => `${item.departmentCode || ""} ${item.machine}`.trim());
  const deptCodes = uniqueArray(top.map((item) => item.departmentCode || "UNKNOWN"));

  // แยก dataset ตามแผนก เพื่อให้ Legend แสดงสีประจำแผนกได้จริง
  const datasets = deptCodes.map((deptCode, deptIndex) => ({
    label: getDepartmentDisplayName(deptCode),
    data: top.map((item) => (item.departmentCode === deptCode ? item.percent : null)),
    backgroundColor: getDepartmentColor(deptCode, deptIndex),
    borderColor: getDepartmentColor(deptCode, deptIndex),
    borderWidth: 1,
    borderRadius: 10,
    borderSkipped: false,
  }));

  chartMachineRisk = replaceChart(chartMachineRisk, "chart-machine-risk", {
    type: "bar",
    data: {
      labels,
      datasets,
    },
  });
}

function renderProblemChart(rows) {
  chartProblem = replaceChart(chartProblem, "chart-problem-count-bar", {
    type: "bar",
    data: {
      labels: rows.map((item) => item.problem),
      datasets: [
        {
          label: "น้ำหนักของเสีย (kg)",
          data: rows.map((item) => item.waste),
          backgroundColor: rows.map((item, index) => getProblemColor(item.problem, index)),
          borderColor: rows.map((item, index) => getProblemColor(item.problem, index)),
          borderWidth: 1,
          borderRadius: 10,
          borderSkipped: false,
        },
      ],
    },
  });
}

function renderDepartmentDonutChart(rows) {
  chartDeptDonut = replaceChart(chartDeptDonut, "chart-dept-donut", {
    type: "doughnut",
    data: {
      labels: rows.map((item) => item.department),
      datasets: [
        {
          label: "ของเสีย kg",
          data: rows.map((item) => item.waste),
          backgroundColor: rows.map((item, index) => getDepartmentColor(item.code, index)),
          borderColor: "#ffffff",
          borderWidth: 3,
          hoverOffset: 10,
        },
      ],
    },
  });
}

function replaceChart(oldChart, canvasId, config) {
  if (oldChart) oldChart.destroy();

  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return null;

  return new Chart(canvas, {
    ...config,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 850,
        easing: "easeOutQuart",
      },
      interaction: {
        intersect: false,
        mode: "index",
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            padding: 18,
            color: "#334155",
            font: {
              family: "Kanit, Noto Sans Thai, sans-serif",
              size: 12,
              weight: "700",
            },
          },
        },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.92)",
          titleColor: "#ffffff",
          bodyColor: "#e2e8f0",
          borderColor: "rgba(255, 255, 255, 0.16)",
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          callbacks: {
            label(context) {
              const label = context.dataset.label || "";
              const value = context.raw || 0;
              const suffix = label.includes("%") ? "%" : label.includes("kg") ? " kg" : "";
              return `${label}: ${formatNumber(value)}${suffix}`;
            },
          },
        },
      },
      scales:
        config.type === "doughnut"
          ? {}
          : {
              x: {
                grid: {
                  display: false,
                },
                ticks: {
                  color: "#475569",
                  font: {
                    family: "Kanit, Noto Sans Thai, sans-serif",
                    size: 11,
                    weight: "700",
                  },
                },
              },
              y: {
                beginAtZero: true,
                grid: {
                  color: "rgba(148, 163, 184, 0.22)",
                },
                ticks: {
                  color: "#64748b",
                  font: {
                    family: "Kanit, Noto Sans Thai, sans-serif",
                    size: 11,
                    weight: "700",
                  },
                  callback(value) {
                    return formatNumber(value);
                  },
                },
              },
            },
    },
  });
}

function getRiskColor(percent) {
  const value = toNumber(percent);
  if (value >= MACHINE_LIMIT_PERCENT) return CHART_COLORS.red;
  if (value >= MACHINE_WARNING_PERCENT) return CHART_COLORS.amber;
  return CHART_COLORS.green;
}

function getRiskBorderColor(percent) {
  const value = toNumber(percent);
  if (value >= MACHINE_LIMIT_PERCENT) return "#991b1b";
  if (value >= MACHINE_WARNING_PERCENT) return "#92400e";
  return "#166534";
}

function getProblemColor(problem, index = 0) {
  const key = String(problem || "").trim();
  return PROBLEM_COLOR_MAP[key] || PROBLEM_COLOR_PALETTE[index % PROBLEM_COLOR_PALETTE.length];
}

function getDepartmentColor(code, index = 0) {
  const normalized = normalizeDepartmentCode(code || "UNKNOWN");
  return DEPARTMENT_COLOR_MAP[normalized] || DEPARTMENT_COLORS[index % DEPARTMENT_COLORS.length];
}

function getDepartmentDisplayName(code) {
  const normalized = normalizeDepartmentCode(code || "UNKNOWN");
  return departmentMasters[normalized]?.name || normalized || "ไม่ระบุแผนก";
}

/* =========================================================
   EXPORT CSV
========================================================= */

function exportToDataExcelCSV() {
  const machineSummary = summarizeByMachine(filteredDataCache);

  if (!machineSummary.length) {
    alert("ไม่มีข้อมูลสำหรับ Export");
    return;
  }

  const header = [
    "แผนก",
    "เครื่อง",
    "ผลิต kg",
    "ของเสีย kg",
    "% Waste",
    "ปัญหาหลัก",
    "น้ำหนักปัญหาหลัก kg",
    "จำนวนรายการ",
  ];

  const body = machineSummary.map((item) => [
    item.department,
    item.machine,
    item.production,
    item.waste,
    item.percent,
    item.topProblemName,
    item.topProblemWaste,
    item.count,
  ]);

  downloadCsv(`executive-waste-summary-${getSelectedMonthText()}.csv`, [header, ...body]);
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}


/* =========================================================
   DETAIL ITEMS
   ดึงรายการปัญหาย่อย เพื่อคำนวณของเสีย/สาเหตุจาก daily_waste_report_items
========================================================= */

async function attachProblemItemsToReports(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];

  const ids = rows.map((row) => row.id).filter(Boolean);
  if (!ids.length) return rows.map(normalizeReportItemsFallback);

  const client = getSupabaseClient();
  if (!client) return rows.map(normalizeReportItemsFallback);

  try {
    const { data, error } = await client
      .from(ITEM_TABLE)
      .select("id, report_id, item_no, problem_type, waste_weight_kg, detail, created_at")
      .in("report_id", ids)
      .order("item_no", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("โหลด daily_waste_report_items ไม่สำเร็จ ใช้ข้อมูลหัวรายงานแทน:", error);
      return rows.map(normalizeReportItemsFallback);
    }

    const itemMap = new Map();

    (data || []).forEach((item) => {
      const key = String(item.report_id);
      if (!itemMap.has(key)) itemMap.set(key, []);

      itemMap.get(key).push({
        id: item.id,
        item_no: item.item_no,
        problem_type: item.problem_type || "ไม่ระบุปัญหา",
        waste_weight_kg: toNumber(item.waste_weight_kg),
        detail: item.detail || "",
      });
    });

    return rows.map((row) => ({
      ...row,
      problem_items: itemMap.get(String(row.id)) || getFallbackProblemItems(row),
    }));
  } catch (error) {
    console.warn("โหลดรายการปัญหาย่อยไม่สำเร็จ ใช้ข้อมูลหัวรายงานแทน:", error);
    return rows.map(normalizeReportItemsFallback);
  }
}

function normalizeReportItemsFallback(row) {
  return {
    ...row,
    problem_items: getFallbackProblemItems(row),
  };
}

function getFallbackProblemItems(row) {
  return [
    {
      id: `${row.id || "report"}-fallback`,
      item_no: 1,
      problem_type: getProblemFromHeader(row),
      waste_weight_kg: toNumber(row.waste_weight_kg || row.waste_qty || row.total_waste_kg || 0),
      detail: row.detail || row.note || "",
    },
  ];
}

function getProblemItems(row) {
  return Array.isArray(row.problem_items) && row.problem_items.length
    ? row.problem_items
    : getFallbackProblemItems(row);
}

/* =========================================================
   DATA HELPERS
========================================================= */

function getDepartmentInfo(row) {
  const code = normalizeDepartmentCode(row.department_code || row.department || "");
  const master = departmentMasters[code];

  return {
    code,
    name: master?.name || row.department || row.department_code || "-",
    maxWastePercent: master?.maxWastePercent ?? FACTORY_LIMIT_PERCENT,
    warningPercent: master?.warningPercent ?? FACTORY_WARNING_PERCENT,
  };
}

function normalizeDepartmentCode(value) {
  const text = String(value || "").trim();
  const key = text.toLowerCase();

  const aliases = {
    blow: "BLOW",
    bag_blow: "BLOW",
    "เป่าถุง": "BLOW",
    pipe: "PIPE",
    "ท่อ": "PIPE",
    mono: "MONO",
    "โมโน": "MONO",
    blown_film: "BLOWN_FILM",
    "เป่าฟิล์ม": "BLOWN_FILM",
    sheet: "SHEET_CUTTING",
    sheet_cutting: "SHEET_CUTTING",
    "ตัดผืน": "SHEET_CUTTING",
    cut_punch: "CUT_PUNCH",
    cutting: "CUT_PUNCH",
    drill: "CUT_PUNCH",
    "ตัดเจาะ": "CUT_PUNCH",
    garbage: "GARBAGE_BAG_CUT",
    garbage_bag_cut: "GARBAGE_BAG_CUT",
    "ตัดถุงขยะ": "GARBAGE_BAG_CUT",
    rain_tape: "RAIN_TAPE",
    tape: "RAIN_TAPE",
    "เทปน้ำพุ่ง": "RAIN_TAPE",
    "เทปสายฝน": "RAIN_TAPE",
    "เป่าเทปน้ำพุ่ง": "RAIN_TAPE",
    rain_tape_cut_punch: "RAIN_TAPE_CUT_PUNCH",
    "ตัดเทปน้ำพุ่ง": "RAIN_TAPE_CUT_PUNCH",
    "ตัดเทปน้ำพุง": "RAIN_TAPE_CUT_PUNCH",
    shade_net: "SHADE_NET",
    "สแลน": "SHADE_NET",
    "ตาข่ายกรองแสง": "SHADE_NET",
  };

  return aliases[key] || text.toUpperCase().replace(/[\s-]+/g, "_");
}

function isAccountingChecked(row) {
  const accountingStatus = normalizeText(row.accounting_status);
  const status = normalizeText(row.status);

  return ACCOUNTING_CHECKED_STATUS.includes(accountingStatus) || ACCOUNTING_CHECKED_STATUS.includes(status);
}

function isCancelledRow(row) {
  const accountingStatus = normalizeText(row.accounting_status);
  const status = normalizeText(row.status);

  return CANCELLED_STATUS.includes(accountingStatus) || CANCELLED_STATUS.includes(status);
}

function getWasteWeight(row) {
  const itemWaste = getProblemItems(row).reduce((sum, item) => sum + toNumber(item.waste_weight_kg), 0);
  return itemWaste || toNumber(row.waste_weight_kg || row.waste_qty || row.total_waste_kg || 0);
}

function getProductionWeight(row) {
  return toNumber(
    row.production_kg ||
      row.production_weight_kg ||
      row.total_qty ||
      row.produced_weight_kg ||
      row.production_qty ||
      0
  );
}

function getProblemFromHeader(row) {
  return row.problem_type || row.reason_detail || row.detail || "ไม่ระบุปัญหา";
}

function getProblem(row) {
  const items = getProblemItems(row);
  const topItem = [...items].sort((a, b) => toNumber(b.waste_weight_kg) - toNumber(a.waste_weight_kg))[0];
  return topItem?.problem_type || getProblemFromHeader(row);
}

function getRowDate(row) {
  return row.incident_datetime || row.report_date || row.created_at || null;
}

function sumWaste(records) {
  return records.reduce((sum, row) => sum + getWasteWeight(row), 0);
}

function sumProductionUnique(records) {
  const box = {
    production: 0,
    productionKeys: new Set(),
  };

  records.forEach((row) => addProductionOnce(box, row));
  return box.production;
}

function calcWastePercent(waste, production) {
  if (!production) return 0;
  return (toNumber(waste) / toNumber(production)) * 100;
}

function getResultByPercent(percent, warning, max) {
  if (!percent && percent !== 0) return { label: "รอข้อมูล", className: "result-none" };

  if (percent >= max) return { label: "เกินเกณฑ์", className: "result-danger" };
  if (percent >= warning) return { label: "เริ่มสูง", className: "result-warning" };
  return { label: "อยู่ในเกณฑ์", className: "result-success" };
}

function getMachineRowClass(percent) {
  if (percent >= MACHINE_LIMIT_PERCENT) return "machine-danger";
  if (percent >= MACHINE_WARNING_PERCENT) return "machine-warning";
  return "machine-normal";
}

function sortByDepartmentAndMachine(a, b) {
  const deptCompare = String(a.department || "").localeCompare(String(b.department || ""), "th");
  if (deptCompare !== 0) return deptCompare;

  return String(a.machine || "").localeCompare(String(b.machine || ""), "th", {
    numeric: true,
    sensitivity: "base",
  });
}

/* =========================================================
   FORMAT / SMALL HELPERS
========================================================= */

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function uniqueArray(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function toDateInputValue(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function formatNumber(value) {
  return toNumber(value).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatDateShort(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value || "-";

  return date.toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "2-digit",
  });
}

function getSelectedMonthText() {
  return document.getElementById("filter-month")?.value || toDateInputValue(new Date()).slice(0, 7);
}

function safeJsonParse(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch (_) {
    return null;
  }
}

function escapeHTML(value) {
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

/* =========================================================
   GLOBAL EXPORT
========================================================= */

window.loadAndProcessDashboardData = loadAndProcessDashboardData;
window.handleDashboardLogout = handleDashboardLogout;
window.exportToDataExcelCSV = exportToDataExcelCSV;
window.getSupabaseClient = getSupabaseClient;
