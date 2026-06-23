// ======================================================
// supervisor-dashboard.js
// Dashboard สถิติของเสียสำหรับหัวหน้างาน
// ------------------------------------------------------
// หน้าที่หลัก:
// 1) ตรวจสิทธิ์ผู้ใช้งาน
// 2) โหลดข้อมูล daily_waste_reports ตามช่วงวันที่
// 3) กรองข้อมูลตามแผนกของหัวหน้า
// 4) สรุป KPI / Top 5 / กราฟ
// ======================================================

let currentProfile = null;
let dailyTrendChart = null;
let machineChart = null;
let problemChart = null;
let statusChart = null;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    initDateRange();
    currentProfile = getLocalProfile();

    // สำคัญ: ต้องเช็ก currentProfile ก่อนนำไปใช้งาน
    if (!currentProfile) {
      alert("ไม่พบข้อมูลผู้ใช้งาน กรุณา Login ใหม่");
      window.location.href = "/login.html";
      return;
    }

    renderUserInfo();

    const allowedRoles = ["admin", "management", "supervisor", "manager"];
    if (!allowedRoles.includes(currentProfile.role)) {
      alert("สิทธิ์การเข้าถึงล้มเหลว");
      window.location.href = "/login.html";
      return;
    }

    if (!canSeeAllDepartments() && !currentProfile.department_code) {
      alert("User นี้ยังไม่ได้กำหนดแผนก กรุณาติดต่อ Admin");
      return;
    }

    await loadDashboard();
  } catch (error) {
    console.error("[Dashboard Init Error]", error);
    alert("เปิด Dashboard ไม่สำเร็จ: " + (error.message || error));
  }
});

function initDateRange() {
  const today = new Date();
  const endDate = toDateInputValue(today);
  const start = new Date(today);
  start.setDate(start.getDate() - 29);
  const startDate = toDateInputValue(start);
  setValue("startDate", startDate);
  setValue("endDate", endDate);
}

function toDateInputValue(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function getLocalProfile() {
  const role = localStorage.getItem("activeRole");
  if (!role) return null;

  return {
    id: localStorage.getItem("activeUserId") || "",
    username: localStorage.getItem("activeUser") || "",
    display_name: localStorage.getItem("activeName") || "",
    department_code: normalizeDept(localStorage.getItem("activeDept") || ""),
    department_name: localStorage.getItem("activeDeptName") || "",
    role: String(role).toLowerCase().trim(),
  };
}

function renderUserInfo() {
  setText("userName", currentProfile.display_name || currentProfile.username || "-");

  const deptText = canSeeAllDepartments()
    ? "เห็นข้อมูลทุกแผนก"
    : currentProfile.department_name || currentProfile.department_code?.toUpperCase() || "-";

  setText("userDept", deptText);
}

function canSeeAllDepartments() {
  return ["admin", "management"].includes(currentProfile.role);
}

function applyDepartmentFilter(query) {
  if (canSeeAllDepartments()) return query;
  return query.eq("department_code", currentProfile.department_code);
}

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

    let query = supabaseClient
      .from("daily_waste_reports")
      .select("*")
      .gte("report_date", startDate)
      .lte("report_date", endDate)
      .order("report_date", { ascending: true });

    query = applyDepartmentFilter(query);

    const { data, error } = await query;
    if (error) throw error;

    renderDashboard(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error("โหลด Dashboard ไม่สำเร็จ:", error);
    alert("โหลด Dashboard ไม่สำเร็จ: " + (error.message || error));
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

function renderDashboard(rows) {
  const totalRecords = rows.length;
  const totalWaste = sumWaste(rows);

  const problemCountMap = groupCount(rows, "problem_type");
  const statusMap = groupCount(rows, "status");
  const dailyWasteMap = groupWasteByDate(rows);
  const machineWasteMap = groupWaste(rows, "machine_no");

  const topProblemEntry = getTopEntry(problemCountMap);
  const topMachineEntry = getTopEntry(machineWasteMap);

  setText("totalRecords", totalRecords.toLocaleString("th-TH"));
  setText("totalWaste", `${formatNumber(totalWaste)} kg`);
  setText("topProblem", topProblemEntry?.[0] || "-");
  setText("topProblemSub", topProblemEntry ? `${formatNumber(topProblemEntry[1])} ครั้ง` : "-");
  setText("topMachine", topMachineEntry?.[0] || "-");
  setText("topMachineSub", topMachineEntry ? `${formatNumber(topMachineEntry[1])} kg` : "-");

  renderDailyTrendChart(dailyWasteMap);
  renderMachineChart(machineWasteMap);
  renderProblemChart(problemCountMap);
  renderStatusChart(statusMap);
  renderTopList(rows);
  renderPriorityArea(rows);
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

function getTopEntry(map) {
  return Object.entries(map).sort((a, b) => b[1] - a[1])[0] || null;
}

function sortTop(map, limit = 10) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function renderDailyTrendChart(map) {
  dailyTrendChart = replaceChart(dailyTrendChart, "dailyTrendChart", {
    type: "line",
    data: {
      labels: Object.keys(map),
      datasets: [{ label: "น้ำหนักของเสีย (kg)", data: Object.values(map), tension: 0.35 }],
    },
  });
}

function renderMachineChart(map) {
  const sorted = sortTop(map, 10);
  machineChart = replaceChart(machineChart, "machineChart", {
    type: "bar",
    data: {
      labels: sorted.map((x) => x[0]),
      datasets: [{ label: "น้ำหนักของเสีย (kg)", data: sorted.map((x) => x[1]) }],
    },
  });
}

function renderProblemChart(map) {
  const sorted = sortTop(map, 10);
  problemChart = replaceChart(problemChart, "problemChart", {
    type: "bar",
    data: {
      labels: sorted.map((x) => x[0]),
      datasets: [{ label: "จำนวนครั้ง", data: sorted.map((x) => x[1]) }],
    },
  });
}

function renderStatusChart(map) {
  statusChart = replaceChart(statusChart, "statusChart", {
    type: "doughnut",
    data: {
      labels: Object.keys(map).map(getStatusLabel),
      datasets: [{ label: "สถานะ", data: Object.values(map) }],
    },
  });
}

function replaceChart(oldChart, canvasId, config) {
  if (oldChart) oldChart.destroy();
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;

  return new Chart(ctx, {
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
      scales: config.type === "doughnut" ? {} : { y: { beginAtZero: true } },
    },
  });
}

function renderTopList(rows) {
  const topList = document.getElementById("topList");
  if (!topList) return;

  const map = {};

  rows.forEach((row) => {
    const machine = row.machine_no || "ไม่ระบุเครื่อง";
    const problem = row.problem_type || "ไม่ระบุปัญหา";
    const key = `${machine} | ${problem}`;

    if (!map[key]) map[key] = { machine, problem, count: 0, waste: 0 };
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
    .map((item, index) => `
      <div class="top-item">
        <div>
          <strong>${index + 1}. เครื่อง ${safeText(item.machine)}</strong>
          <small>ปัญหา: ${safeText(item.problem)}</small>
        </div>
        <div class="top-value">
          <strong>${formatNumber(item.waste)} kg</strong>
          <small>${formatNumber(item.count)} ครั้ง</small>
        </div>
      </div>
    `)
    .join("");
}

function renderPriorityArea(rows) {
  const area = document.getElementById("priorityArea");
  if (!area) return;

  if (!rows.length) {
    area.innerHTML = `<div class="empty-state">ไม่พบข้อมูลในช่วงวันที่เลือก</div>`;
    return;
  }

  const summary = {};

  rows.forEach((row) => {
    const machine = row.machine_no || "-";
    const problem = row.problem_type || "-";
    const key = `${machine}|${problem}`;

    if (!summary[key]) summary[key] = { machine, problem, count: 0, waste: 0 };
    summary[key].count += 1;
    summary[key].waste += getWasteValue(row);
  });

  const top = Object.values(summary).sort((a, b) => b.waste - a.waste || b.count - a.count)[0];

  area.innerHTML = `
    <div class="priority-result">
      <div class="priority-icon">🔥</div>
      <div>
        <strong>เครื่อง ${safeText(top.machine)}</strong>
        <p>
          ปัญหา: <b>${safeText(top.problem)}</b><br />
          เกิด ${formatNumber(top.count)} ครั้ง /
          ของเสียรวม ${formatNumber(top.waste)} kg
        </p>
      </div>
    </div>
  `;
}

function getStatusLabel(status) {
  const labels = {
    pending: "รอตรวจสอบ",
    progress: "กำลังตรวจสอบ",
    checking: "กำลังตรวจสอบ",
    resolved: "ส่งบัญชีแล้ว",
    approved: "ตรวจสอบแล้ว",
    rejected: "ไม่ผ่าน",
  };
  return labels[status] || status || "-";
}

function normalizeDept(value) {
  return String(value || "").trim().toLowerCase();
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
  return Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
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
  localStorage.removeItem("qrDept");
  localStorage.removeItem("qrDeptName");
  localStorage.removeItem("qrToken");

  window.location.href = "/login.html";
}

window.loadDashboard = loadDashboard;
window.logout = logout;
