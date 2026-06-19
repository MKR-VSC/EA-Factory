// =========================================================
// index.js
// Dashboard / Accounting Controller
// ใช้ Supabase Client กลางจากไฟล์ supabaseClient.js เท่านั้น
// ห้ามสร้าง supabase.createClient ซ้ำในไฟล์นี้
// =========================================================

// =========================================================
// GLOBAL CONFIG
// =========================================================

const LOGIN_PAGE = "login.html";
const FORM_PAGE = "pages/form-department.html";

const ALLOWED_ROLES = [
  "admin",
  "accounting",
  "supervisor",
  "management",
  "manager",
  "executive",
  "MAN",
  "man",
];

const DEPARTMENT_LABELS = {
  print: "ม้วนพิมพ์",
  pipe: "ท่อ",
  sheet: "แผ่นหล่อ/ตัดผืน",
  tape: "เทปพัน/เทปน้ำพุ่ง",
  blow: "เป่าถุง",
  drill: "ตัดเจาะ",
  garbage: "ถุงขยะ",
  accounting: "บัญชี",
  management: "ผู้บริหาร",
  "it-support": "IT Support",
};

let dashboardDataCache = [];
let filteredDataCache = [];
let currentFetchedData = [];

let chartDeptDonut = null;
let chartWeeklyWaste = null;
let chartMonthlyCount = null;
let chartMonthlyWeight = null;

// =========================================================
// SUPABASE CLIENT
// =========================================================

function getSupabaseClient() {
  const client = window.supabaseClient;

  if (!client || typeof client.from !== "function") {
    console.error(
      "ไม่พบ window.supabaseClient กรุณาตรวจสอบว่าโหลด supabaseClient.js ก่อน index.js"
    );
    return null;
  }

  return client;
}

// =========================================================
// BASIC HELPERS
// =========================================================

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDept(value) {
  return normalizeText(value);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function getDeptLabel(code) {
  return DEPARTMENT_LABELS[normalizeDept(code)] || code || "-";
}

function getWasteWeight(row) {
  return parseFloat(row?.waste_qty || row?.waste_weight_kg || 0) || 0;
}

function getRowDate(row) {
  return row?.incident_datetime || row?.report_date || row?.created_at || null;
}

function getStatusText(status) {
  if (status === "progress") return "กำลังซ่อม";
  if (status === "resolved") return "ปิดงานสำเร็จ";
  return "รอดำเนินการ";
}

function getStatusBadge(status) {
  if (status === "progress") {
    return `<span class="badge-status status-progress">กำลังซ่อม</span>`;
  }

  if (status === "resolved") {
    return `<span class="badge-status status-resolved">ปิดงานสำเร็จ</span>`;
  }

  return `<span class="badge-status status-pending">รอดำเนินการ</span>`;
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

// =========================================================
// ERROR LOGGER
// =========================================================

window.addEventListener("error", (event) => {
  console.error(
    `[Runtime_Error] ไฟล์: ${event.filename}\nบรรทัด: ${event.lineno}\nข้อความ: ${event.message}`
  );
});

window.addEventListener("unhandledrejection", (event) => {
  console.error(
    "[Async_Rejection_Error]",
    event.reason?.message || event.reason
  );
});

// =========================================================
// AUTH / PAGE PROTECT
// =========================================================

function protectExecutivePage() {
  const user = localStorage.getItem("activeUser");
  const role = localStorage.getItem("activeRole");

  if (!user || !ALLOWED_ROLES.includes(role)) {
    alert("🔒 คุณไม่มีสิทธิ์เข้าใช้งานหน้าแดชบอร์ดสรุปผลนี้");
    window.location.href = LOGIN_PAGE;
    return false;
  }

  return true;
}

function setActiveUserLabel() {
  const label = document.getElementById("lbl-active-user");
  if (!label) return;

  label.textContent =
    localStorage.getItem("activeName") ||
    localStorage.getItem("activeUser") ||
    "ผู้จัดการระบบ";
}

async function handleDashboardLogout() {
  const client = getSupabaseClient();

  try {
    if (client?.auth) {
      await client.auth.signOut();
    }
  } catch (error) {
    console.warn("Supabase signOut ไม่สำเร็จ:", error);
  }

  localStorage.clear();
  alert("🔒 ออกจากระบบเรียบร้อยแล้ว");
  window.location.href = LOGIN_PAGE;
}

// =========================================================
// SWITCH DEPARTMENT
// =========================================================

function switchDepartment(deptName) {
  const cleanDept = normalizeDept(deptName);

  if (!cleanDept) {
    alert("ไม่พบรหัสแผนก");
    return;
  }

  localStorage.setItem("activeDept", cleanDept);

  const finalUrl =
    "../html/form-department.html?dept=" + encodeURIComponent(cleanDept);

  console.log("เปิดหน้าฟอร์มแผนก:", finalUrl);
  window.location.href = finalUrl;
}

// =========================================================
// LOAD DASHBOARD DATA
// =========================================================

async function loadAndProcessDashboardData() {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    console.log("กำลังโหลดข้อมูลจาก daily_waste_reports...");

    const { data, error } = await client
      .from("daily_waste_reports")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    dashboardDataCache = data || [];
    filteredDataCache = dashboardDataCache;
    window.pvtDashboardRawCache = dashboardDataCache;
    window.pvtExecutiveFilteredCache = filteredDataCache;

    console.log(`โหลดข้อมูลสำเร็จ: ${dashboardDataCache.length} รายการ`);

    renderAllDashboard(dashboardDataCache);
  } catch (error) {
    console.error("[database_error]", error);
    alert("โหลดข้อมูลไม่สำเร็จ: " + (error.message || error));
  }
}

function renderAllDashboard(records) {
  updateMetricCards(records);
  renderReportTable(records);
  renderPivotSummaryTable(records);
  renderDepartmentDonutChart(getDepartmentCounters(records));
  renderMonthlyCharts(records);
  renderWeeklyChart(records);
  generateExecutiveInsight(records);
  generateExecutiveSummary(records);
}

// =========================================================
// METRIC CARDS
// =========================================================

function updateMetricCards(records) {
  if (!Array.isArray(records)) return;

  setText("cnt-total", records.length);

  setText(
    "cnt-pending",
    records.filter((r) => !r.status || r.status === "pending").length
  );

  setText(
    "cnt-progress",
    records.filter((r) => r.status === "progress").length
  );

  setText(
    "cnt-resolved",
    records.filter((r) => r.status === "resolved").length
  );
}

// =========================================================
// TABLE
// =========================================================

function renderReportTable(records) {
  const tbody = document.getElementById("dom-table-body");
  if (!tbody) return;

  const filter = document.getElementById("sel-dept-filter")?.value || "all";

  const displayRecords =
    filter === "all"
      ? records
      : records.filter((r) => normalizeDept(r.department_code) === filter);

  filteredDataCache = displayRecords;
  window.pvtExecutiveFilteredCache = displayRecords;

  if (displayRecords.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell">
          📭 ไม่พบบันทึกรายงานตามเงื่อนไขที่เลือก
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = "";

  displayRecords.forEach((row) => {
    const tr = document.createElement("tr");

    const deptCode = normalizeDept(row.department_code || row.department);
    const deptLabel = getDeptLabel(deptCode);

    const dateValue = getRowDate(row);
    const renderedDate = dateValue
      ? new Date(dateValue).toLocaleString("th-TH")
      : "-";

    tr.innerHTML = `
      <td class="nowrap strong">${escapeHTML(renderedDate)}</td>

      <td>
        <span class="btn-dept d-${escapeHTML(deptCode)} dept-pill">
          ${escapeHTML(deptLabel)}
        </span>
      </td>

      <td class="machine-cell">${escapeHTML(row.machine_no || "-")}</td>

      <td class="strong">
        ${escapeHTML(row.problem_type || row.reason_detail || "-")}
      </td>

      <td>
        <div class="cell-detail">
          ${escapeHTML(row.detail || row.note || "-")}
        </div>
      </td>

      <td>
        <span class="reporter-code">
          ${escapeHTML(row.reported_by || "พนักงาน")}
        </span>
      </td>

      <td>
        <div class="status-space">${getStatusBadge(row.status)}</div>

        <select
          class="select-inline-status"
          onchange="window.executeModifyCaseStatus('${escapeHTML(row.id)}', this.value)"
        >
          <option value="pending" ${
            row.status === "pending" || !row.status ? "selected" : ""
          }>ตั้งรับเรื่อง</option>

          <option value="progress" ${
            row.status === "progress" ? "selected" : ""
          }>กำลังซ่อม</option>

          <option value="resolved" ${
            row.status === "resolved" ? "selected" : ""
          }>ปิดงาน</option>
        </select>
      </td>

      <td>
        <input
          type="text"
          class="input-inline-note"
          placeholder="พิมพ์ข้อสั่งการ/วิธีแก้ไข..."
          value="${escapeHTML(row.resolution || "")}"
          onchange="window.executeModifyCaseResolution('${escapeHTML(row.id)}', this.value)"
        />
      </td>
    `;

    tbody.appendChild(tr);
  });
}

// =========================================================
// SUMMARY TABLE
// =========================================================

function getDepartmentCounters(records) {
  const counters = {};

  records.forEach((row) => {
    const dept = normalizeDept(row.department_code || row.department) || "unknown";
    counters[dept] = (counters[dept] || 0) + 1;
  });

  return counters;
}

function renderPivotSummaryTable(records) {
  const tbody = document.getElementById("pivot-summary-body");
  if (!tbody) return;

  const summary = {};

  records.forEach((row) => {
    const dept = normalizeDept(row.department_code || row.department) || "unknown";
    const problem = row.problem_type || row.reason_detail || "อื่นๆ";
    const key = `${dept}||${problem}`;

    if (!summary[key]) {
      summary[key] = {
        dept,
        problem,
        count: 0,
        weight: 0,
      };
    }

    summary[key].count += 1;
    summary[key].weight += getWasteWeight(row);
  });

  const rows = Object.values(summary).sort((a, b) => b.weight - a.weight);

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-cell">ไม่มีข้อมูลสรุป</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows
    .map(
      (item) => `
        <tr>
          <td>${escapeHTML(getDeptLabel(item.dept))}</td>
          <td>${escapeHTML(item.problem)}</td>
          <td>${item.count.toLocaleString()}</td>
          <td>${item.weight.toLocaleString()} kg</td>
        </tr>
      `
    )
    .join("");
}

// =========================================================
// CHARTS
// =========================================================

function renderDepartmentDonutChart(counters) {
  const canvas = document.getElementById("chart-dept-donut");
  if (!canvas || typeof Chart === "undefined") return;

  if (chartDeptDonut) {
    chartDeptDonut.destroy();
    chartDeptDonut = null;
  }

  const labels = Object.keys(counters).map(getDeptLabel);
  const dataValues = Object.values(counters);

  chartDeptDonut = new Chart(canvas.getContext("2d"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: dataValues,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
        },
      },
    },
  });
}

function renderMonthlyCharts(records) {
  const monthLabels = [
    "ม.ค.",
    "ก.พ.",
    "มี.ค.",
    "เม.ย.",
    "พ.ค.",
    "มิ.ย.",
    "ก.ค.",
    "ส.ค.",
    "ก.ย.",
    "ต.ค.",
    "พ.ย.",
    "ธ.ค.",
  ];

  const monthlyCounts = Array(12).fill(0);
  const monthlyWeights = Array(12).fill(0);

  records.forEach((row) => {
    const dateValue = getRowDate(row);
    if (!dateValue) return;

    const dateObj = new Date(dateValue);
    if (Number.isNaN(dateObj.getTime())) return;

    const monthIndex = dateObj.getMonth();
    monthlyCounts[monthIndex] += 1;
    monthlyWeights[monthIndex] += getWasteWeight(row);
  });

  const countCanvas = document.getElementById("chart-problem-count-bar");
  if (countCanvas && typeof Chart !== "undefined") {
    if (chartMonthlyCount) chartMonthlyCount.destroy();

    chartMonthlyCount = new Chart(countCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: monthLabels,
        datasets: [
          {
            label: "จำนวนครั้งที่เกิดปัญหา",
            data: monthlyCounts,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  }

  const weightCanvas = document.getElementById("chart-waste-weight-bar");
  if (weightCanvas && typeof Chart !== "undefined") {
    if (chartMonthlyWeight) chartMonthlyWeight.destroy();

    chartMonthlyWeight = new Chart(weightCanvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: monthLabels,
        datasets: [
          {
            label: "น้ำหนักของเสียรวมรายเดือน (kg)",
            data: monthlyWeights,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
      },
    });
  }
}

function renderWeeklyChart(records) {
  const canvas = document.getElementById("chart-waste-weekly-line");
  if (!canvas || typeof Chart === "undefined") return;

  const weeklyWeights = {};

  records.forEach((row) => {
    const dateValue = getRowDate(row);
    if (!dateValue) return;

    const dateObj = new Date(dateValue);
    if (Number.isNaN(dateObj.getTime())) return;

    const week = getWeekNumber(dateObj);
    const label = `สัปดาห์ที่ ${week}`;

    weeklyWeights[label] = (weeklyWeights[label] || 0) + getWasteWeight(row);
  });

  const labels = Object.keys(weeklyWeights).sort((a, b) => {
    return (
      parseInt(a.replace("สัปดาห์ที่ ", ""), 10) -
      parseInt(b.replace("สัปดาห์ที่ ", ""), 10)
    );
  });

  const values = labels.map((label) => weeklyWeights[label]);

  if (chartWeeklyWaste) {
    chartWeeklyWaste.destroy();
    chartWeeklyWaste = null;
  }

  chartWeeklyWaste = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: {
      labels: labels.length ? labels : ["ไม่มีข้อมูล"],
      datasets: [
        {
          label: "ปริมาณของเสียรายสัปดาห์ (kg)",
          data: values.length ? values : [0],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
        },
      },
    },
  });
}

function getWeekNumber(date) {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date - start + (start.getDay() + 1) * 86400000;
  return Math.ceil(diff / 604800000);
}

// =========================================================
// UPDATE STATUS / RESOLUTION
// =========================================================

async function executeModifyCaseStatus(caseId, targetStatus) {
  const client = getSupabaseClient();
  if (!client) {
    alert("ไม่พบการเชื่อมต่อ Supabase");
    return;
  }

  const actingManager = localStorage.getItem("activeUser") || "MAN";

  try {
    const { error } = await client
      .from("daily_waste_reports")
      .update({
        status: targetStatus,
        resolver: actingManager,
        updated_at: new Date().toISOString(),
      })
      .eq("id", caseId);

    if (error) throw error;

    await loadAndProcessDashboardData();
  } catch (error) {
    console.error("แก้สถานะไม่สำเร็จ:", error);
    alert("แก้สถานะไม่สำเร็จ: " + (error.message || error));
  }
}

async function executeModifyCaseResolution(caseId, updatedText) {
  const client = getSupabaseClient();
  if (!client) {
    alert("ไม่พบการเชื่อมต่อ Supabase");
    return;
  }

  const actingManager = localStorage.getItem("activeUser") || "MAN";

  try {
    const { error } = await client
      .from("daily_waste_reports")
      .update({
        resolution: updatedText,
        resolver: actingManager,
        updated_at: new Date().toISOString(),
      })
      .eq("id", caseId);

    if (error) throw error;
  } catch (error) {
    console.error("บันทึกข้อสั่งการไม่สำเร็จ:", error);
    alert("บันทึกข้อสั่งการไม่สำเร็จ: " + (error.message || error));
  }
}

// =========================================================
// DATE FILTER
// =========================================================

function executeDateRangeFilter() {
  const startInput = document.getElementById("inp-start-date")?.value;
  const endInput = document.getElementById("inp-end-date")?.value;

  if (!startInput || !endInput) {
    alert("กรุณาเลือกวันที่เริ่มต้นและสิ้นสุดให้ครบถ้วน");
    return;
  }

  const start = new Date(startInput + "T00:00:00");
  const end = new Date(endInput + "T23:59:59");

  const filtered = dashboardDataCache.filter((row) => {
    const dateValue = getRowDate(row);
    if (!dateValue) return false;

    const targetDate = new Date(dateValue);
    return targetDate >= start && targetDate <= end;
  });

  filteredDataCache = filtered;
  window.pvtExecutiveFilteredCache = filtered;

  renderAllDashboard(filtered);
}

function clearDateFilter() {
  const startEl = document.getElementById("inp-start-date");
  const endEl = document.getElementById("inp-end-date");

  if (startEl) startEl.value = "";
  if (endEl) endEl.value = "";

  filteredDataCache = dashboardDataCache;
  window.pvtExecutiveFilteredCache = filteredDataCache;

  renderAllDashboard(dashboardDataCache);
}

// =========================================================
// INSIGHT / SUMMARY
// =========================================================

function generateExecutiveInsight(records) {
  const box =
    document.getElementById("executive-summary-box") ||
    document.getElementById("insight-container") ||
    document.getElementById("exec-insight-box");

  if (!box) return;

  if (!records || records.length === 0) {
    box.textContent = "ไม่พบข้อมูลรายงานของเสียในระบบ";
    return;
  }

  const totalWaste = records.reduce((sum, row) => sum + getWasteWeight(row), 0);

  box.innerHTML = `
    ⚙️ <strong>วิเคราะห์ภาพรวมสำเร็จ:</strong>
    มีรายงานทั้งหมด <strong>${records.length.toLocaleString()} รายการ</strong>
    พบยอดของเสียสะสมรวม
    <span style="color:#e74a3b;font-weight:bold;">
      ${totalWaste.toLocaleString()} kg
    </span>
  `;
}

function generateExecutiveSummary(records) {
  const box = document.getElementById("ai-summary-box");
  if (!box) return;

  if (!records || records.length === 0) {
    box.textContent = "ไม่พบข้อมูลปัญหาในขณะนี้";
    return;
  }

  const machineCounter = {};

  records.forEach((row) => {
    const machine = row.machine_no || "ไม่ระบุ";
    const problem = row.problem_type || row.reason_detail || "อื่นๆ";

    if (!machineCounter[machine]) {
      machineCounter[machine] = {
        total: 0,
        problems: {},
      };
    }

    machineCounter[machine].total += 1;
    machineCounter[machine].problems[problem] =
      (machineCounter[machine].problems[problem] || 0) + 1;
  });

  let topMachine = "";
  let maxCount = 0;

  Object.entries(machineCounter).forEach(([machine, info]) => {
    if (info.total > maxCount) {
      topMachine = machine;
      maxCount = info.total;
    }
  });

  const topProblems = Object.entries(machineCounter[topMachine].problems)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const listItems = topProblems
    .map(
      ([problem, count]) =>
        `<li>❌ <strong>${escapeHTML(problem)}</strong> (${count} ครั้ง)</li>`
    )
    .join("");

  box.innerHTML = `
    <div style="padding:10px;background:#fff;border-radius:8px;">
      <h3 style="color:#e74a3b;margin-top:0;">
        🚨 เครื่อง ${escapeHTML(topMachine)} มีปัญหามากที่สุด
      </h3>
      <p>ตรวจพบทั้งหมด <strong>${maxCount}</strong> ครั้ง</p>
      <ul style="padding-left:20px;">${listItems}</ul>
    </div>
  `;
}

// =========================================================
// EXPORT CSV
// =========================================================

function exportTableToExcel() {
  const records = filteredDataCache.length ? filteredDataCache : dashboardDataCache;

  if (!records.length) {
    alert("ไม่มีข้อมูลสำหรับดาวน์โหลด");
    return;
  }

  let csvContent = "\uFEFF";
  csvContent +=
    "วัน-เวลาที่เกิดเหตุ,แผนก,หมายเลขเครื่องจักร,ปัญหาที่พบ,รายละเอียด,น้ำหนักของเสีย,สถานะ,แนวทางแก้ไข\n";

  records.forEach((row) => {
    const dateValue = getRowDate(row);
    const dateText = dateValue ? new Date(dateValue).toLocaleString("th-TH") : "-";
    const deptText = getDeptLabel(row.department_code || row.department);
    const statusText = getStatusText(row.status);

    csvContent +=
      [
        dateText,
        deptText,
        row.machine_no || "-",
        row.problem_type || row.reason_detail || "-",
        row.detail || row.note || "-",
        getWasteWeight(row),
        statusText,
        row.resolution || row.corrective_action || "-",
      ]
        .map(csvCell)
        .join(",") + "\n";
  });

  const blob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `รายงานปัญหาของเสีย_${new Date()
    .toLocaleDateString("th-TH")
    .replaceAll("/", "-")}.csv`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportToDataExcelCSV() {
  exportTableToExcel();
}

// =========================================================
// ACCOUNTING TABLE
// =========================================================

async function loadAccountingData() {
  const tbody = document.getElementById("accounting-table-body");
  if (!tbody) return;

  const client = getSupabaseClient();
  if (!client) {
    setTimeout(loadAccountingData, 300);
    return;
  }

  try {
    const dept = document.getElementById("filter-dept")?.value || "all";

    let query = client
      .from("daily_waste_reports")
      .select("*")
      .order("incident_datetime", { ascending: false });

    if (dept !== "all") {
      query = query.eq("department_code", dept);
    }

    const { data, error } = await query;
    if (error) throw error;

    currentFetchedData = data || [];
    tbody.innerHTML = "";

    if (currentFetchedData.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align:center;padding:20px;color:#94a3b8;">
            📭 ไม่พบประวัติรายงานปัญหาในหมวดนี้
          </td>
        </tr>
      `;
      return;
    }

    currentFetchedData.forEach((item) => {
      const tr = document.createElement("tr");

      const dateValue = getRowDate(item);
      const dateText = dateValue
        ? new Date(dateValue).toLocaleString("th-TH")
        : "-";

      tr.innerHTML = `
        <td>${escapeHTML(dateText)}</td>
        <td>${escapeHTML(getDeptLabel(item.department_code || item.department))}</td>
        <td>${escapeHTML(item.machine_no || "-")}</td>
        <td>${escapeHTML(item.problem_type || item.reason_detail || "-")}</td>
        <td>${escapeHTML(item.detail || item.note || "-")}</td>
        <td>${getWasteWeight(item).toLocaleString()} kg</td>
        <td>${getStatusBadge(item.status)}</td>
        <td>${escapeHTML(item.resolution || "-")}</td>
        <td>${escapeHTML(item.reported_by || "-")}</td>
      `;

      tbody.appendChild(tr);
    });
  } catch (error) {
    console.error("loadAccountingData error:", error);
    alert("โหลดข้อมูลบัญชีไม่สำเร็จ: " + (error.message || error));
  }
}

// =========================================================
// REALTIME
// =========================================================

function listenToWasteReportsRealtime() {
  const client = getSupabaseClient();
  if (!client || typeof client.channel !== "function") return;

  console.log("เริ่ม Realtime daily_waste_reports");

  client
    .channel("daily-waste-realtime")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "daily_waste_reports",
      },
      async () => {
        await loadAndProcessDashboardData();
        await loadAccountingData();
      }
    )
    .subscribe();
}

// =========================================================
// INIT
// =========================================================

window.addEventListener("DOMContentLoaded", async () => {
  const allowed = protectExecutivePage();
  if (!allowed) return;

  setActiveUserLabel();

  await loadAndProcessDashboardData();
  await loadAccountingData();

  listenToWasteReportsRealtime();
});

// =========================================================
// EXPORT GLOBAL FUNCTIONS
// =========================================================

window.getSupabaseClient = getSupabaseClient;

window.protectExecutivePage = protectExecutivePage;
window.setActiveUserLabel = setActiveUserLabel;
window.handleDashboardLogout = handleDashboardLogout;

window.switchDepartment = switchDepartment;

window.loadAndProcessDashboardData = loadAndProcessDashboardData;
window.loadAccountingData = loadAccountingData;

window.renderReportTable = renderReportTable;
window.updateMetricCards = updateMetricCards;
window.renderPivotSummaryTable = renderPivotSummaryTable;
window.renderDepartmentDonutChart = renderDepartmentDonutChart;

window.getDepartmentCounters = getDepartmentCounters;

window.executeModifyCaseStatus = executeModifyCaseStatus;
window.executeModifyCaseResolution = executeModifyCaseResolution;

window.executeDateRangeFilter = executeDateRangeFilter;
window.clearDateFilter = clearDateFilter;

window.generateExecutiveInsight = generateExecutiveInsight;
window.generateExecutiveSummary = generateExecutiveSummary;

window.exportTableToExcel = exportTableToExcel;
window.exportToDataExcelCSV = exportToDataExcelCSV;

window.normalizeDept = normalizeDept;
window.escapeHTML = escapeHTML;

