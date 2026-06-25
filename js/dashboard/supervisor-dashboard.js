// ======================================================
// supervisor-dashboard.js
// Dashboard สถิติของเสียสำหรับหัวหน้างาน
// ------------------------------------------------------
// ปรับรอบนี้:
// - รองรับหัวหน้าที่รับผิดชอบหลายแผนกจากตาราง user_departments
// - Admin / Management / Executive เห็นทุกแผนก
// - Supervisor / Manager เห็นเฉพาะแผนกที่รับผิดชอบ
// - ถ้าอ่าน user_departments ไม่ได้ จะ fallback ใช้ activeDept เดิม
// - ไม่กรอง department_code ใน Supabase query เพื่อกันข้อมูลหาย
// - กรองใน JS หลังโหลดข้อมูลแทน
// ======================================================

let currentProfile = null;
let responsibleDepartments = [];

let dailyTrendChart = null;
let machineChart = null;
let problemChart = null;
let statusChart = null;

const DEPARTMENT_ALIASES = {
  blow: ["blow", "เป่าถุง"],
  blown_film: ["blown_film", "เป่าฟิล์ม"],
  bag_blow: ["bag_blow", "เป่าถุง"],
  pipe: ["pipe", "ท่อ"],
  sheet: ["sheet", "sheet_cutting", "ตัดผืน"],
  garbage_bag_cut: ["garbage_bag_cut", "ตัดถุงขยะ"],
  rain_tape: ["rain_tape", "เทปน้ำพุ่ง", "เทปสายฝน"],
  shade_net: ["shade_net", "สแลน", "ตาข่ายกรองแสง"],
  cut_punch: ["cut_punch", "ตัดเจาะ"],
  print: ["print", "ม้วนพิมพ์"],
  accounting: ["accounting", "บัญชี"],
  management: ["management", "ผู้บริหาร"],
};

document.addEventListener("DOMContentLoaded", async () => {
  try {
    initDateRange();

    currentProfile = getLocalProfile();

    if (!currentProfile) {
      alert("ไม่พบข้อมูลผู้ใช้งาน กรุณา Login ใหม่");
      window.location.href = "/login.html";
      return;
    }

    const allowedRoles = [
      "admin",
      "management",
      "executive",
      "supervisor",
      "manager",
    ];

    if (!allowedRoles.includes(normalizeText(currentProfile.role))) {
      alert("สิทธิ์การเข้าถึงล้มเหลว");
      window.location.href = "/login.html";
      return;
    }

    await loadResponsibleDepartments();

    renderUserInfo();

    if (!canSeeAllDepartments() && !getAllowedDepartmentCodes().length) {
      alert(
        "User นี้ยังไม่ได้กำหนดแผนก กรุณาติดต่อ Admin หรือเพิ่มข้อมูลในตาราง user_departments"
      );
      return;
    }

    await loadDashboard();
  } catch (error) {
    console.error("[Dashboard Init Error]", error);
    alert("เปิด Dashboard ไม่สำเร็จ: " + (error.message || error));
  }
});

// ======================================================
// INIT / PROFILE
// ======================================================

function initDateRange() {
  const today = new Date();
  const endDate = toDateInputValue(today);

  const start = new Date(today);
  start.setDate(start.getDate() - 29);

  setValue("startDate", toDateInputValue(start));
  setValue("endDate", endDate);
}

function toDateInputValue(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

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

function renderUserInfo() {
  setText(
    "userName",
    currentProfile.display_name || currentProfile.username || "-"
  );

  const deptText = canSeeAllDepartments()
    ? "เห็นข้อมูลทุกแผนก"
    : getAllowedDepartmentCodes().length
      ? `รับผิดชอบ: ${getAllowedDepartmentCodes().join(", ")}`
      : currentProfile.department_name ||
        currentProfile.department_code?.toUpperCase() ||
        "-";

  setText("userDept", deptText);
}

function canSeeAllDepartments() {
  return ["admin", "management", "executive"].includes(
    normalizeText(currentProfile?.role)
  );
}

async function loadResponsibleDepartments() {
  responsibleDepartments = [];

  if (canSeeAllDepartments()) return;

  // fallback จาก localStorage/profile เดิม เพื่อไม่ให้ระบบเดิมพัง
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
      .from("user_departments")
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

function normalizeDepartmentCode(value) {
  const text = normalizeText(value);
  if (!text) return "";

  for (const [code, aliases] of Object.entries(DEPARTMENT_ALIASES)) {
    if (aliases.map(normalizeText).includes(text)) return code;
  }

  return text.replace(/[\s-]+/g, "_");
}

function filterRowsForCurrentUser(rows) {
  if (!Array.isArray(rows)) return [];
  if (canSeeAllDepartments()) return rows;

  const allowedDepartments = getAllowedDepartmentCodes();

  if (!allowedDepartments.length) return rows;

  return rows.filter((row) => {
    const rowDept = normalizeDepartmentCode(
      row.department_code || row.department || ""
    );

    return allowedDepartments.includes(rowDept);
  });
}

// ======================================================
// LOAD DASHBOARD
// ======================================================

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

    // สำคัญ:
    // ไม่กรอง department_code ใน query ตรงนี้
    // เพราะถ้า user_departments / activeDept ยังไม่ตรง จะทำให้ข้อมูลหายทั้งหน้า
    const { data, error } = await supabaseClient
      .from("daily_waste_reports")
      .select("*")
      .gte("report_date", startDate)
      .lte("report_date", endDate)
      .order("report_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) throw error;

    const rawRows = Array.isArray(data) ? data : [];
    const rows = filterRowsForCurrentUser(rawRows);

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
  setText("topProblem", "...");
  setText("topMachine", "...");
  setText("topProblemSub", "กำลังโหลด");
  setText("topMachineSub", "กำลังโหลด");

  const priorityArea = document.getElementById("priorityArea");
  if (priorityArea) priorityArea.textContent = "กำลังวิเคราะห์ข้อมูล...";

  const topList = document.getElementById("topList");
  if (topList) topList.textContent = "กำลังโหลดข้อมูล...";
}

// ======================================================
// RENDER DASHBOARD
// ======================================================

function renderDashboard(rows, meta = {}) {
  const totalRecords = rows.length;
  const totalWaste = sumWaste(rows);

  const problemCountMap = groupCount(rows, "problem_type");
  const statusMap = groupCount(rows, "status");
  const dailyWasteMap = fillDateRangeMap(
    groupWasteByDate(rows),
    meta.startDate,
    meta.endDate
  );
  const machineWasteMap = groupWaste(rows, "machine_no");

  const topProblemEntry = getTopEntry(problemCountMap);
  const topMachineEntry = getTopEntry(machineWasteMap);

  setText("totalRecords", totalRecords.toLocaleString("th-TH"));
  setText("totalWaste", `${formatNumber(totalWaste)} kg`);
  setText("topProblem", topProblemEntry?.[0] || "-");
  setText(
    "topProblemSub",
    topProblemEntry ? `${formatNumber(topProblemEntry[1])} ครั้ง` : "-"
  );
  setText("topMachine", topMachineEntry?.[0] || "-");
  setText(
    "topMachineSub",
    topMachineEntry ? `${formatNumber(topMachineEntry[1])} kg` : "-"
  );

  renderDailyTrendChart(dailyWasteMap);
  renderMachineChart(machineWasteMap);
  renderProblemChart(problemCountMap);
  renderStatusChart(statusMap);
  renderTopList(rows);
  renderPriorityArea(rows, meta);
}

function sumWaste(rows) {
  return rows.reduce((sum, row) => sum + getWasteValue(row), 0);
}

function getWasteValue(row) {
  return Number(row.waste_weight_kg || row.waste_qty || 0) || 0;
}

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

// ======================================================
// CHARTS
// ======================================================

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

// ======================================================
// TOP / PRIORITY
// ======================================================

function renderTopList(rows) {
  const topList = document.getElementById("topList");
  if (!topList) return;

  const map = {};

  rows.forEach((row) => {
    const machine = row.machine_no || "ไม่ระบุเครื่อง";
    const problem = row.problem_type || row.reason_detail || "ไม่ระบุปัญหา";
    const key = `${machine} | ${problem}`;

    if (!map[key]) {
      map[key] = {
        machine,
        problem,
        department: row.department_code || row.department || "-",
        count: 0,
        waste: 0,
      };
    }

    map[key].count += 1;
    map[key].waste += getWasteValue(row);
  });

  const top = Object.values(map)
    .sort((a, b) => b.waste - a.waste || b.count - a.count)
    .slice(0, 5);

  if (!top.length) {
    topList.innerHTML = `<div class="empty-state">ไม่พบข้อมูลในช่วงวันที่เลือก</div>`;
    return;
  }

  topList.innerHTML = top
    .map(
      (item, index) => `
      <div class="top-item">
        <div>
          <strong>${index + 1}. เครื่อง ${safeText(item.machine)}</strong>
          <small>
            แผนก: ${safeText(item.department)}
            <br />
            ปัญหา: ${safeText(item.problem)}
          </small>
        </div>
        <div class="top-value">
          <strong>${formatNumber(item.waste)} kg</strong>
          <small>${formatNumber(item.count)} ครั้ง</small>
        </div>
      </div>
    `
    )
    .join("");
}

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
    const machine = row.machine_no || "-";
    const problem = row.problem_type || row.reason_detail || "-";
    const department = row.department_code || row.department || "-";
    const key = `${department}|${machine}|${problem}`;

    if (!summary[key]) {
      summary[key] = {
        department,
        machine,
        problem,
        count: 0,
        waste: 0,
      };
    }

    summary[key].count += 1;
    summary[key].waste += getWasteValue(row);
  });

  const top = Object.values(summary).sort(
    (a, b) => b.waste - a.waste || b.count - a.count
  )[0];

  area.innerHTML = `
    <div class="priority-result">
      <div class="priority-icon">🔥</div>
      <div>
        <strong>เครื่อง ${safeText(top.machine)}</strong>
        <p>
          แผนก: <b>${safeText(top.department)}</b><br />
          ปัญหา: <b>${safeText(top.problem)}</b><br />
          เกิด ${formatNumber(top.count)} ครั้ง /
          ของเสียรวม ${formatNumber(top.waste)} kg
        </p>
      </div>
    </div>
  `;
}

// ======================================================
// LABELS / HELPERS
// ======================================================

function getStatusLabel(status) {
  const key = normalizeText(status);

  const labels = {
    pending: "รอตรวจสอบ",
    draft: "แบบร่าง",
    submitted: "ส่งแล้ว",
    progress: "กำลังตรวจสอบ",
    checking: "กำลังตรวจสอบ",
    resolved: "ส่งบัญชีแล้ว",
    approved: "ตรวจสอบแล้ว",
    rejected: "ไม่ผ่าน",
  };

  return labels[key] || status || "-";
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

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

function formatNumber(value) {
  return Number(value || 0).toLocaleString("th-TH", {
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

// ======================================================
// DEBUG
// เปิด DevTools Console แล้วพิมพ์:
// debugSupervisorDashboard()
// ======================================================

async function debugSupervisorDashboard() {
  const startDate = getValue("startDate");
  const endDate = getValue("endDate");

  console.log("currentProfile:", currentProfile);
  console.log("responsibleDepartments:", responsibleDepartments);
  console.log("allowedDepartments:", getAllowedDepartmentCodes());

  if (currentProfile?.id) {
    const userDeptResult = await supabaseClient
      .from("user_departments")
      .select("department_code")
      .eq("user_id", currentProfile.id);

    console.log("user_departments result:", userDeptResult);
    console.table(userDeptResult.data || []);
  }

  const reportsResult = await supabaseClient
    .from("daily_waste_reports")
    .select("id, report_date, status, department_code, department, machine_no, problem_type, waste_weight_kg, waste_qty, reported_by, created_at")
    .gte("report_date", startDate)
    .lte("report_date", endDate)
    .order("report_date", { ascending: true });

  console.log("daily_waste_reports result:", reportsResult);
  console.table(reportsResult.data || []);

  return reportsResult;
}

// ======================================================
// LOGOUT / GLOBAL EXPORT
// ======================================================

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

window.loadDashboard = loadDashboard;
window.logout = logout;
window.debugSupervisorDashboard = debugSupervisorDashboard;
