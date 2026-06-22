// ======================================================
// supervisor-dashboard.js
// Dashboard สถิติของเสียสำหรับหัวหน้างาน
// ======================================================

let currentProfile = null;

let dailyTrendChart = null;
let machineChart = null;
let problemChart = null;
let statusChart = null;

document.addEventListener("DOMContentLoaded", async () => {
  initDateRange();

  currentProfile = getLocalProfile();

  document.getElementById("userName").textContent =
  currentProfile.display_name || currentProfile.username;

document.getElementById("userDept").textContent =
  currentProfile.department_name ||
  currentProfile.department_code;

  if (!currentProfile) {
    alert("ไม่พบข้อมูลผู้ใช้งาน กรุณา Login ใหม่");
    window.location.href = "/login.html";
    return;
  }

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
});

function initDateRange() {
  const today = new Date();
  const endDate = today.toISOString().slice(0, 10);

  const start = new Date(today);
  start.setDate(start.getDate() - 29);
  const startDate = start.toISOString().slice(0, 10);

  document.getElementById("startDate").value = startDate;
  document.getElementById("endDate").value = endDate;
}

function getLocalProfile() {
  const role = localStorage.getItem("activeRole");

  if (!role) return null;

  return {
    id: localStorage.getItem("activeUserId") || "",
    username: localStorage.getItem("activeUser") || "",
    display_name: localStorage.getItem("activeName") || "",
    department_code: (localStorage.getItem("activeDept") || "").toLowerCase(),
    department_name: localStorage.getItem("activeDeptName") || "",
    role: String(role).toLowerCase(),
  };
}

function canSeeAllDepartments() {
  return ["admin", "management"].includes(currentProfile.role);
}

function applyDepartmentFilter(query) {
  if (canSeeAllDepartments()) return query;

  return query.eq("department_code", currentProfile.department_code);
}

async function loadDashboard() {
  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;

  if (!startDate || !endDate) {
    alert("กรุณาเลือกช่วงวันที่");
    return;
  }

  try {
    let query = supabaseClient
      .from("daily_waste_reports")
      .select("*")
      .gte("report_date", startDate)
      .lte("report_date", endDate)
      .order("report_date", { ascending: true });

    query = applyDepartmentFilter(query);

    const { data, error } = await query;

    if (error) throw error;

    renderDashboard(data || []);
  } catch (error) {
    console.error("โหลด Dashboard ไม่สำเร็จ:", error);
    alert("โหลด Dashboard ไม่สำเร็จ: " + error.message);
  }
}

function renderDashboard(rows) {
  const totalRecords = rows.length;
  const totalWaste = sumWaste(rows);

  const problemMap = groupCount(rows, "problem_type");
  const machineMap = groupCount(rows, "machine_no");
  const statusMap = groupCount(rows, "status");
  const dailyWasteMap = groupWasteByDate(rows);

  const topProblem = getTopKey(problemMap);
  const topMachine = getTopKey(machineMap);

  setText("totalRecords", totalRecords);
  setText("totalWaste", `${formatNumber(totalWaste)} kg`);
  setText("topProblem", topProblem || "-");
  setText("topMachine", topMachine || "-");

  renderDailyTrendChart(dailyWasteMap);
  renderMachineChart(machineMap);
  renderProblemChart(problemMap);
  renderStatusChart(statusMap);
  renderTopList(rows);
  renderPriorityArea(rows);
}

function sumWaste(rows) {
  return rows.reduce((sum, row) => {
    return sum + Number(row.waste_weight_kg || 0);
  }, 0);
}

function groupCount(rows, key) {
  return rows.reduce((map, row) => {
    const name = row[key] || "ไม่ระบุ";
    map[name] = (map[name] || 0) + 1;
    return map;
  }, {});
}

function groupWasteByDate(rows) {
  return rows.reduce((map, row) => {
    const date = row.report_date || "ไม่ระบุ";
    map[date] = (map[date] || 0) + Number(row.waste_weight_kg || 0);
    return map;
  }, {});
}

function getTopKey(map) {
  return Object.entries(map).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function toChartLabels(map) {
  return Object.keys(map);
}

function toChartValues(map) {
  return Object.values(map);
}

function renderDailyTrendChart(map) {
  const labels = toChartLabels(map);
  const values = toChartValues(map);

  dailyTrendChart = replaceChart(dailyTrendChart, "dailyTrendChart", {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "น้ำหนักของเสีย (kg)",
          data: values,
          tension: 0.35,
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
          label: "จำนวนครั้ง",
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
  const labels = Object.keys(map).map(getStatusLabel);
  const values = Object.values(map);

  statusChart = replaceChart(statusChart, "statusChart", {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          label: "สถานะ",
          data: values,
        },
      ],
    },
  });
}

function replaceChart(oldChart, canvasId, config) {
  if (oldChart) oldChart.destroy();

  const ctx = document.getElementById(canvasId);

  return new Chart(ctx, {
    ...config,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 200,
      plugins: {
        legend: {
          display: true,
        },
      },
      scales:
        config.type === "doughnut"
          ? {}
          : {
              y: {
                beginAtZero: true,
              },
            },
    },
  });
}

function renderTopList(rows) {
  const topList = document.getElementById("topList");

  const map = {};

  rows.forEach((row) => {
    const machine = row.machine_no || "ไม่ระบุเครื่อง";
    const problem = row.problem_type || "ไม่ระบุปัญหา";
    const key = `${machine} | ${problem}`;

    if (!map[key]) {
      map[key] = {
        machine,
        problem,
        count: 0,
        waste: 0,
      };
    }

    map[key].count += 1;
    map[key].waste += Number(row.waste_weight_kg || 0);
  });

  const top = Object.values(map)
    .sort((a, b) => b.count - a.count || b.waste - a.waste)
    .slice(0, 5);

  if (top.length === 0) {
    topList.innerHTML = "ไม่พบข้อมูล";
    return;
  }

  topList.innerHTML = top
    .map(
      (item, index) => `
      <div class="top-item">
        <div>
          <strong>${index + 1}. เครื่อง ${safeText(item.machine)}</strong>
          <small>ปัญหา: ${safeText(item.problem)}</small>
        </div>

        <div>
          <strong>${item.count} ครั้ง</strong>
          <small>${formatNumber(item.waste)} kg</small>
        </div>
      </div>
    `,
    )
    .join("");
}

function sortTop(map, limit = 10) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function getStatusLabel(status) {
  const labels = {
    pending: "รอตรวจสอบ",
    progress: "กำลังตรวจสอบ",
    resolved: "ส่งบัญชีแล้ว",
  };

  return labels[status] || status || "-";
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    maximumFractionDigits: 2,
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

function renderPriorityArea(rows) {

  const area = document.getElementById("priorityArea");

  if (!rows.length) {
    area.innerHTML = "ไม่พบข้อมูล";
    return;
  }

  const summary = {};

  rows.forEach((row) => {

    const machine = row.machine_no || "-";
    const problem = row.problem_type || "-";

    const key = `${machine}|${problem}`;

    if (!summary[key]) {
      summary[key] = {
        machine,
        problem,
        count: 0,
        waste: 0,
      };
    }

    summary[key].count += 1;
    summary[key].waste += Number(
      row.waste_weight_kg || 0
    );
  });

  const top = Object.values(summary)
    .sort((a, b) => b.waste - a.waste)[0];

  area.innerHTML = `
    <strong>เครื่อง ${top.machine}</strong><br>
    ปัญหา: ${top.problem}<br>
    เกิด ${top.count} ครั้ง<br>
    ของเสียรวม ${formatNumber(top.waste)} kg
  `;
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