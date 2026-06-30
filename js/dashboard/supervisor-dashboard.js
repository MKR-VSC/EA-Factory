// ======================================================
// supervisor-dashboard.js
// Dashboard สถิติของเสียสำหรับหัวหน้างาน
// ------------------------------------------------------
// Version: EA Factory Waste Management v1.0 - Go Live
// หน้าที่หลัก:
// 1) โหลดข้อมูลของเสียจาก daily_waste_reports
// 2) จำกัดสิทธิ์การมองเห็นข้อมูลตาม Role / user_departments
// 3) โหลด Master แผนกจาก master_departments
// 4) แสดง KPI, Chart, Priority และ Top List
// 5) คำนวณ % Waste จากน้ำหนักของเสีย / น้ำหนักผลิตที่บัญชีกรอก
// ======================================================

/* ======================================================
   CONFIG
   ค่าคงที่ของหน้านี้
====================================================== */

const REPORT_TABLE = "daily_waste_reports";
const MASTER_DEPARTMENT_TABLE = "master_departments";
const USER_DEPARTMENT_TABLE = "user_departments";

// Role ที่เข้า Dashboard ได้
const ALLOW_ROLES = ["admin", "management", "executive", "supervisor", "manager"];

// Role ที่เห็นข้อมูลทุกแผนก
const SEE_ALL_ROLES = ["admin", "management", "executive"];

// Mapping ชื่อสถานะให้แสดงเป็นภาษาไทย
const STATUS_LABELS = {
  pending: "รอตรวจสอบ",
  draft: "แบบร่าง",
  submitted: "ส่งแล้ว",
  progress: "กำลังตรวจสอบ",
  checking: "กำลังตรวจสอบ",
  resolved: "ส่งบัญชีแล้ว",
  checked: "บัญชีตรวจแล้ว",
  approved: "ตรวจสอบแล้ว",
  rejected: "ไม่ผ่าน",
};

/* ======================================================
   GLOBAL STATE
   ตัวแปรกลางของหน้านี้
====================================================== */

let currentProfile = null;
let responsibleDepartments = [];
let departmentStandards = {};

let dailyTrendChart = null;
let machineChart = null;
let problemChart = null;
let statusChart = null;

/* ======================================================
   INITIALIZE
   เริ่มทำงานเมื่อเปิดหน้า Dashboard
====================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  try {
    initDateRange();

    currentProfile = getLocalProfile();

    if (!currentProfile) {
      alert("ไม่พบข้อมูลผู้ใช้งาน กรุณา Login ใหม่");
      window.location.href = "/login.html";
      return;
    }

    if (!ALLOW_ROLES.includes(normalizeText(currentProfile.role))) {
      alert("สิทธิ์การเข้าถึงล้มเหลว");
      window.location.href = "/login.html";
      return;
    }

    await loadDepartmentStandards();
    await loadResponsibleDepartments();

    renderUserInfo();

    if (!canSeeAllDepartments() && !getAllowedDepartmentCodes().length) {
      alert("User นี้ยังไม่ได้กำหนดแผนก กรุณาติดต่อ Admin หรือเพิ่มข้อมูลในตาราง user_departments");
      return;
    }

    await loadDashboard();
  } catch (error) {
    console.error("[Dashboard Init Error]", error);
    alert("เปิด Dashboard ไม่สำเร็จ: " + (error.message || error));
  }
});

/* ======================================================
   DATE INITIALIZE
   ตั้งค่าช่วงวันที่เริ่มต้นย้อนหลัง 30 วัน
====================================================== */

function initDateRange() {
  const today = new Date();

  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  setValue("startDate", toDateInputValue(firstDay));
  setValue("endDate", toDateInputValue(lastDay));
}

/* ======================================================
   MASTER DATA: DEPARTMENTS
   โหลดแผนกจาก master_departments เพื่อใช้ชื่อไทยและเกณฑ์ % Waste
====================================================== */

async function loadDepartmentStandards() {
  const { data, error } = await supabaseClient
    .from(MASTER_DEPARTMENT_TABLE)
    .select("department_code, department_name, max_waste_percent, warning_percent")
    .eq("is_active", true);

  if (error) throw error;

  departmentStandards = {};

  (data || []).forEach((dept) => {
    const code = normalizeDepartmentCode(dept.department_code);

    departmentStandards[code] = {
      code,
      name: dept.department_name,
      maxWastePercent: toNumber(dept.max_waste_percent || 3),
      warningPercent: toNumber(dept.warning_percent || 0),
    };
  });
}

/* ======================================================
   USER / ROLE / PROFILE
   อ่านข้อมูลผู้ใช้จาก localStorage และกำหนดสิทธิ์การเห็นข้อมูล
====================================================== */

function getLocalProfile() {
  const savedProfile = safeJsonParse(localStorage.getItem("ea_profile"));

  const role =
    localStorage.getItem("activeRole") ||
    savedProfile?.role ||
    savedProfile?.user_role ||
    "";

  if (!role) return null;

  return {
    id:
      localStorage.getItem("activeUserId") ||
      savedProfile?.id ||
      savedProfile?.user_id ||
      "",
    username:
      localStorage.getItem("activeUser") ||
      savedProfile?.username ||
      savedProfile?.email ||
      "",
    display_name:
      localStorage.getItem("activeName") ||
      savedProfile?.display_name ||
      savedProfile?.full_name ||
      savedProfile?.username ||
      "",
    department_code:
      localStorage.getItem("activeDept") ||
      savedProfile?.department_code ||
      savedProfile?.department ||
      "",
    department_name:
      localStorage.getItem("activeDeptName") ||
      savedProfile?.department_name ||
      savedProfile?.department ||
      "",
    role: normalizeText(role),
  };
}

function canSeeAllDepartments() {
  return SEE_ALL_ROLES.includes(normalizeText(currentProfile?.role));
}

async function loadResponsibleDepartments() {
  responsibleDepartments = [];

  if (canSeeAllDepartments()) return;

  // fallback จาก localStorage/profile เดิม เพื่อไม่ให้ข้อมูลหายถ้า user_departments ยังไม่พร้อม
  const fallbackDept = normalizeDepartmentCode(
    currentProfile?.department_code || currentProfile?.department_name || ""
  );

  if (fallbackDept) responsibleDepartments.push(fallbackDept);

  if (!currentProfile?.id) {
    responsibleDepartments = uniqueArray(responsibleDepartments);
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from(USER_DEPARTMENT_TABLE)
      .select("department_code")
      .eq("user_id", currentProfile.id);

    if (error) {
      console.warn("อ่าน user_departments ไม่ได้ ใช้ activeDept เดิมแทน:", error);
      responsibleDepartments = uniqueArray(responsibleDepartments);
      return;
    }

    const mapped = (Array.isArray(data) ? data : [])
      .map((row) => normalizeDepartmentCode(row.department_code))
      .filter(Boolean);

    responsibleDepartments = uniqueArray([...responsibleDepartments, ...mapped]);
  } catch (error) {
    console.warn("โหลดแผนกที่รับผิดชอบไม่สำเร็จ ใช้ activeDept เดิมแทน:", error);
    responsibleDepartments = uniqueArray(responsibleDepartments);
  }
}

function getAllowedDepartmentCodes() {
  if (canSeeAllDepartments()) return [];

  const depts = responsibleDepartments.length
    ? responsibleDepartments
    : [currentProfile?.department_code || currentProfile?.department_name];

  return uniqueArray(depts.map(normalizeDepartmentCode).filter(Boolean));
}

function renderUserInfo() {
  setText("userName", currentProfile.display_name || currentProfile.username || "-");

  const deptText = canSeeAllDepartments()
    ? "รับผิดชอบ: ทุกแผนก"
    : getAllowedDepartmentCodes().length
      ? `รับผิดชอบ: ${getAllowedDepartmentCodes().map(getDepartmentLabelTH).join(", ")}`
      : `รับผิดชอบ: ${getDepartmentLabelTH(currentProfile.department_name || currentProfile.department_code)}`;

  setText("userDept", deptText);
}

/* ======================================================
   DEPARTMENT HELPERS
   จัดการ department_code ให้เป็นมาตรฐานเดียวกับ master_departments
====================================================== */

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
    "ตัดเจาะ": "CUT_PUNCH",

    garbage_bag_cut: "GARBAGE_BAG_CUT",
    "ตัดถุงขยะ": "GARBAGE_BAG_CUT",

    rain_tape: "RAIN_TAPE",
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

function getDepartmentLabelTH(code) {
  const normalized = normalizeDepartmentCode(code);
  return departmentStandards[normalized]?.name || code || "-";
}

function getDepartmentInfo(row) {
  const code = normalizeDepartmentCode(row.department_code || row.department || "");
  const master = departmentStandards[code];

  return {
    code,
    name: master?.name || row.department || row.department_code || "-",
    maxWastePercent: master?.maxWastePercent ?? null,
    warningPercent: master?.warningPercent ?? null,
  };
}

function filterRowsForCurrentUser(rows) {
  if (!Array.isArray(rows)) return [];
  if (canSeeAllDepartments()) return rows;

  const allowedDepartments = getAllowedDepartmentCodes();
  if (!allowedDepartments.length) return rows;

  return rows.filter((row) => {
    const rowDept = normalizeDepartmentCode(row.department_code || row.department || "");
    return allowedDepartments.includes(rowDept);
  });
}

/* ======================================================
   LOAD DASHBOARD
   โหลดข้อมูลของเสียจาก Supabase ตามช่วงวันที่ แล้วกรองตามสิทธิ์ผู้ใช้
====================================================== */

async function loadDashboard() {
  const startDate = getValue("startDate");
  const endDate = getValue("endDate");

  if (!startDate || !endDate) {
    alert("กรุณาเลือกช่วงวันที่");
    return;
  }

  if (startDate > endDate) {
    alert("วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด");
    return;
  }

  try {
    showLoadingText();

    const { data, error } = await supabaseClient
      .from(REPORT_TABLE)
      .select("*")
      .gte("report_date", startDate)
      .lte("report_date", endDate)
      .order("report_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;

    const rawRows = Array.isArray(data) ? data : [];
    const rows = filterRowsForCurrentUser(rawRows).filter(isAccountingChecked);

    renderDashboard(rows, { rawCount: rawRows.length, startDate, endDate });
  } catch (error) {
    console.error("โหลด Dashboard ไม่สำเร็จ:", error);
    alert("โหลด Dashboard ไม่สำเร็จ: " + (error.message || error));
    renderDashboard([], { rawCount: 0, startDate, endDate });
  }
}

function showLoadingText() {
  setText("totalRecords", "...");
  setText("totalWaste", "...");
  setText("totalProduction", "...");
  setText("wastePercent", "...");
  setText("topProblem", "...");
  setText("topMachine", "...");
  setText("topProblemSub", "กำลังโหลด");
  setText("topMachineSub", "กำลังโหลด");

  const priorityArea = document.getElementById("priorityArea");
  if (priorityArea) priorityArea.textContent = "กำลังวิเคราะห์ข้อมูล...";

  const topList = document.getElementById("topList");
  if (topList) topList.textContent = "กำลังโหลดข้อมูล...";
}

/* ======================================================
   RENDER DASHBOARD
   คำนวณ KPI และส่งข้อมูลไปแสดงผลบนหน้า Dashboard
====================================================== */

function renderDashboard(rows, meta = {}) {
  const totalRecords = rows.length;
  const totalWaste = sumWaste(rows);
  const totalProduction = sumProduction(rows);
  const wastePercent = calcWastePercent(totalWaste, totalProduction);

  const problemCountMap = groupCount(rows, "problem_type");
  const statusMap = groupCount(rows, "status");
  const dailyWasteMap = fillDateRangeMap(groupWasteByDate(rows), meta.startDate, meta.endDate);
  const machineWasteMap = groupWaste(rows, "machine_no");

  const topProblemEntry = getTopEntry(problemCountMap);
  const topMachineEntry = getTopEntry(machineWasteMap);

  setText("totalRecords", totalRecords.toLocaleString("th-TH"));
  setText("totalWaste", `${formatNumber(totalWaste)} kg`);
  setText("totalProduction", `${formatNumber(totalProduction)} kg`);
  setText("wastePercent", `${formatNumber(wastePercent)}%`);
  setText("topProblem", topProblemEntry?.[0] || "-");
  setText("topProblemSub", topProblemEntry ? `${formatNumber(topProblemEntry[1])} ครั้ง` : "-");
  setText("topMachine", topMachineEntry?.[0] || "-");
  setText("topMachineSub", topMachineEntry ? `${formatNumber(topMachineEntry[1])} kg` : "-");

  renderDailyTrendChart(dailyWasteMap);
  renderMachineChart(machineWasteMap);
  renderProblemChart(problemCountMap);
  renderStatusChart(statusMap);
  renderTopList(rows);
  renderPriorityArea(rows, meta);
}

/* ======================================================
   CALCULATE HELPERS
   ฟังก์ชันคำนวณค่าน้ำหนักและ % Waste
====================================================== */

function getWasteValue(row) {
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

function sumWaste(rows) {
  return rows.reduce((sum, row) => sum + getWasteValue(row), 0);
}

function sumProduction(rows) {
  return rows.reduce((sum, row) => sum + getProductionWeight(row), 0);
}

function calcWastePercent(waste, production) {
  if (!production) return 0;
  return (toNumber(waste) / toNumber(production)) * 100;
}

/* ======================================================
   GROUP HELPERS
   รวมข้อมูลเพื่อใช้ทำ KPI และ Chart
====================================================== */

function groupCount(rows, key) {
  return rows.reduce((map, row) => {
    const name = row[key] || "ไม่ระบุ";
    map[name] = (map[name] || 0) + 1;
    return map;
  }, {});
}

function groupWaste(rows, key) {
  return rows.reduce((map, row) => {
    const name = row[key] || "ไม่ระบุ";
    map[name] = (map[name] || 0) + getWasteValue(row);
    return map;
  }, {});
}

function groupWasteByDate(rows) {
  return rows.reduce((map, row) => {
    const date = row.report_date || "ไม่ระบุ";
    map[date] = (map[date] || 0) + getWasteValue(row);
    return map;
  }, {});
}

function fillDateRangeMap(map, startDate, endDate) {
  if (!startDate || !endDate) return map;

  const result = {};
  const current = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  while (current <= end) {
    const key = toDateInputValue(current);
    result[key] = map[key] || 0;
    current.setDate(current.getDate() + 1);
  }

  return result;
}

function getTopEntry(map) {
  return Object.entries(map).sort((a, b) => b[1] - a[1])[0] || null;
}

function sortTop(map, limit = 10) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

/* ======================================================
   CHARTS
   แสดงกราฟด้วย Chart.js
====================================================== */

function renderDailyTrendChart(map) {
  dailyTrendChart = replaceChart(dailyTrendChart, "dailyTrendChart", {
    type: "line",
    data: {
      labels: Object.keys(map).map(formatDisplayDateShort),
      datasets: [
        {
          label: "น้ำหนักของเสีย (kg)",
          data: Object.values(map),
          tension: 0.35,
          fill: true,
        },
      ],
    },
  });
}

function renderMachineChart(map) {
  const sorted = sortTop(map, 10);

  machineChart = replaceChart(machineChart, "machineChart", {
    type: "bar",
    data: {
      labels: sorted.map((x) => x[0]),
      datasets: [
        {
          label: "น้ำหนักของเสีย (kg)",
          data: sorted.map((x) => x[1]),
        },
      ],
    },
  });
}

function renderProblemChart(map) {
  const sorted = sortTop(map, 10);

  problemChart = replaceChart(problemChart, "problemChart", {
    type: "bar",
    data: {
      labels: sorted.map((x) => x[0]),
      datasets: [
        {
          label: "จำนวนครั้ง",
          data: sorted.map((x) => x[1]),
        },
      ],
    },
  });
}

function renderStatusChart(map) {
  statusChart = replaceChart(statusChart, "statusChart", {
    type: "doughnut",
    data: {
      labels: Object.keys(map).map(getStatusLabel),
      datasets: [
        {
          label: "สถานะ",
          data: Object.values(map),
        },
      ],
    },
  });
}

function replaceChart(oldChart, canvasId, config) {
  if (oldChart) oldChart.destroy();

  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;

  if (typeof Chart === "undefined") {
    console.warn("Chart.js ยังไม่พร้อมใช้งาน");
    return null;
  }

  return new Chart(canvas, {
    ...config,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 200,
      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            label(context) {
              const label = context.dataset.label || "";
              const value = context.raw || 0;
              return `${label}: ${formatNumber(value)}`;
            },
          },
        },
      },
      scales:
        config.type === "doughnut"
          ? {}
          : {
              y: {
                beginAtZero: true,
                ticks: {
                  callback(value) {
                    return formatNumber(value);
                  },
                },
              },
            },
    },
  });
}

/* ======================================================
   TOP LIST
   แสดง Top 5 จุดที่ควรแก้ก่อน
====================================================== */

function renderTopList(rows) {
  const topList = document.getElementById("topList");
  if (!topList) return;

  const map = {};

  rows.forEach((row) => {
    const dept = getDepartmentInfo(row);
    const machine = row.machine_no || "ไม่ระบุเครื่อง";
    const problem = row.problem_type || row.reason_detail || "ไม่ระบุปัญหา";
    const key = `${dept.code}|${machine}`;

    if (!map[key]) {
      map[key] = {
        machine,
        department: dept.name,
        count: 0,
        waste: 0,
        production: 0,
        problems: {},
      };
    }

    map[key].count += 1;
    map[key].waste += getWasteValue(row);
    map[key].production += getProductionWeight(row);
    map[key].problems[problem] =
      (map[key].problems[problem] || 0) + getWasteValue(row);
  });

  const list = Object.values(map).sort((a, b) => {
    const deptCompare = a.department.localeCompare(b.department, "th");
    if (deptCompare !== 0) return deptCompare;

    return a.machine.localeCompare(b.machine, "th", {
      numeric: true,
      sensitivity: "base",
    });
  });

  if (!list.length) {
    topList.innerHTML = `<div class="empty-state">ไม่พบข้อมูลในช่วงวันที่เลือก</div>`;
    return;
  }

  const groupedByDept = {};

list.forEach((item) => {
  const dept = item.department || "ไม่ระบุแผนก";

  if (!groupedByDept[dept]) groupedByDept[dept] = [];

  groupedByDept[dept].push(item);
});

topList.innerHTML = Object.entries(groupedByDept)
  .map(([deptName, machines]) => {
    const machineHtml = machines
      .map((item) => {
        const percent = calcWastePercent(item.waste, item.production);
        const topProblem = Object.entries(item.problems).sort((a, b) => b[1] - a[1])[0];

        const rowClass =
          percent >= 1
            ? "machine-danger"
            : percent >= 0.7
              ? "machine-warning"
              : "machine-normal";

        return `
          <div class="top-item ${rowClass}">
            <div>
              <strong>เครื่อง ${safeText(item.machine)}</strong>
              <small>
                ปัญหาหลัก: ${safeText(topProblem?.[0] || "-")}
                ${topProblem ? `(${formatNumber(topProblem[1])} kg)` : ""}
              </small>
            </div>

            <div class="top-value">
              <strong>${formatNumber(percent)}%</strong>
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
        <div class="dept-machine-title">${safeText(deptName)}</div>
        ${machineHtml}
      </div>
    `;
  })
  .join("");
}

/* ======================================================
   PRIORITY AREA
   วิเคราะห์จุดที่ควรแก้ไขเร่งด่วนจากของเสียสูงสุด
====================================================== */

function renderPriorityArea(rows, meta = {}) {
  const area = document.getElementById("priorityArea");
  if (!area) return;

  if (!rows.length) {
    const rawText =
      meta.rawCount && !canSeeAllDepartments()
        ? `<br><small>มีข้อมูลทั้งหมด ${formatNumber(meta.rawCount)} รายการในช่วงนี้ แต่ไม่ตรงกับแผนกที่ user นี้รับผิดชอบ</small>`
        : "";

    area.innerHTML = `
      <div class="empty-state">
        ไม่พบข้อมูลในช่วงวันที่เลือก
        ${rawText}
      </div>
    `;
    return;
  }

  const summary = {};

  rows.forEach((row) => {
    const dept = getDepartmentInfo(row);
    const machine = row.machine_no || "-";
    const problem = row.problem_type || row.reason_detail || "-";
    const key = `${dept.code}|${machine}|${problem}`;

    if (!summary[key]) {
      summary[key] = {
        department: dept.name,
        machine,
        problem,
        count: 0,
        waste: 0,
        production: 0,
      };
    }

    summary[key].count += 1;
    summary[key].waste += getWasteValue(row);
    summary[key].production += getProductionWeight(row);
  });

  const top = Object.values(summary).sort(
    (a, b) => b.waste - a.waste || b.count - a.count
  )[0];

  const percent = calcWastePercent(top.waste, top.production);

  area.innerHTML = `
    <div class="priority-result">
      <div class="priority-icon">🔥</div>
      <div>
        <strong>เครื่อง ${safeText(top.machine)}</strong>
        <p>
          แผนก: <b>${safeText(top.department)}</b><br />
          ปัญหา: <b>${safeText(top.problem)}</b><br />
          เกิด ${formatNumber(top.count)} ครั้ง / ของเสียรวม ${formatNumber(top.waste)} kg<br />
          น้ำหนักผลิต ${formatNumber(top.production)} kg / Waste ${formatNumber(percent)}%
        </p>
      </div>
    </div>
  `;
}

/* ======================================================
   LABEL HELPERS
   แปลง label ต่าง ๆ ให้เป็นภาษาไทย
====================================================== */

function getStatusLabel(status) {
  const key = normalizeText(status);
  return STATUS_LABELS[key] || status || "-";
}

function isAccountingChecked(row) {
  const status = normalizeText(row.status);
  return ["checked", "approved", "done", "completed", "ตรวจสอบแล้ว"].includes(status);
}

/* ======================================================
   FORMAT / SMALL HELPERS
   ฟังก์ชันย่อยทั่วไป
====================================================== */

function toDateInputValue(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}sort((a, b) => b.waste - a.waste)

function safeJsonParse(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch (_) {
    return null;
  }
}

function uniqueArray(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function getValue(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(value) {
  return toNumber(value).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatDisplayDateShort(value) {
  if (!value) return "-";

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "2-digit",
  });
}

function safeText(value) {
  if (value === null || value === undefined) return "";

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ======================================================
   DEBUG
   ใช้สำหรับตรวจสอบข้อมูลผ่าน DevTools Console
====================================================== */

async function debugSupervisorDashboard() {
  const startDate = getValue("startDate");
  const endDate = getValue("endDate");

  console.log("currentProfile:", currentProfile);
  console.log("responsibleDepartments:", responsibleDepartments);
  console.log("allowedDepartments:", getAllowedDepartmentCodes());
  console.log("departmentStandards:", departmentStandards);

  if (currentProfile?.id) {
    const userDeptResult = await supabaseClient
      .from(USER_DEPARTMENT_TABLE)
      .select("department_code")
      .eq("user_id", currentProfile.id);

    console.log("user_departments result:", userDeptResult);
    console.table(userDeptResult.data || []);
  }

  const reportsResult = await supabaseClient
    .from(REPORT_TABLE)
    .select("id, report_date, status, department_code, department, machine_no, problem_type, waste_weight_kg, waste_qty, total_qty, production_weight_kg, reported_by, created_at")
    .gte("report_date", startDate)
    .lte("report_date", endDate)
    .order("report_date", { ascending: true });

  console.log("daily_waste_reports result:", reportsResult);
  console.table(reportsResult.data || []);

  return reportsResult;
}

/* ======================================================
   LOGOUT
   ออกจากระบบและล้างข้อมูล Session ใน localStorage
====================================================== */

function logout() {
  const confirmLogout = confirm("ต้องการออกจากระบบใช่ไหม?");
  if (!confirmLogout) return;

  localStorage.removeItem("loginType");
  localStorage.removeItem("activeUserId");
  localStorage.removeItem("activeUser");
  localStorage.removeItem("activeName");
  localStorage.removeItem("activeDept");
  localStorage.removeItem("activeDeptName");
  localStorage.removeItem("activeRole");
  localStorage.removeItem("ea_profile");
  localStorage.removeItem("qrDept");
  localStorage.removeItem("qrDeptName");
  localStorage.removeItem("qrToken");

  window.location.href = "/login.html";
}

/* ======================================================
   GLOBAL EXPORT
   เปิดฟังก์ชันให้ HTML onclick เรียกใช้งานได้
====================================================== */

window.loadDashboard = loadDashboard;
window.logout = logout;
window.debugSupervisorDashboard = debugSupervisorDashboard;
