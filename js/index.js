// =========================================================
// index.js
// แยกจาก HTML แล้ว และใช้ window.supabaseClient
// =========================================================
// =================================================================
// 🛠️ ชุดโค้ดพิเศษสำหรับแก้ปัญหาตารางผิด (แปะไว้บนสุดของไฟล์ index.js)
// =================================================================


// =================================================================

const sb = window.supabaseClient;

const ALLOWED_ROLES = ["management", "supervisor", "admin", "MAN", "man"];
const LOGIN_PAGE = "/login2.html";
const FORM_PAGE = "html/form-department.html";

const DEPARTMENT_LABELS = {
  print: "ม้วนพิมพ์",
  sheet: "แผ่นหล่อ",
  tape: "เทปพัน",
  blow: "เป่าถุง",
  drill: "เจาะรู",
  garbage: "ถุงขยะ",
  mono: "โมโน",
  salan: "สแลน",
};

const EXCEL_MACHINE_PROBLEM_DB = {
  print: {
    machines: ["เครื่องพิมพ์1", "เครื่องพิมพ์2"],
    problems: ["สกรีนไม่สวย", "สีเพี้ยน", "พิมพ์เลอะ", "อื่นๆ"],
  },
  mono: {
    machines: ["Mono1", "Mono2", "Mono3"],
    problems: [
      "ขาดหน้าดาย",
      "ขาดอ่างน้ำร้อน",
      "ขาดพันลูกกลิ้ง",
      "ตัดเส้นไม่ขาด",
      "ขาดลมร้อน",
      "เดินเครื่องใหม่",
      "เปลี่ยนสีโมโน",
      "ไฟดับ",
      "ก้อนแข็ง",
      "อื่นๆ",
    ],
  },
  blow: {
    machines: [
      "F1",
      "F2",
      "F3",
      "F4",
      "F5",
      "F6",
      "F7",
      "เป่าถุง",
      "เทปน้ำพุ่ง",
    ],
    problems: [
      "ทะลุ",
      "ตกใบมีด",
      "ลูกโปร่งส่าย",
      "รอยกรีดไม่สวย",
      "รูเจาะไม่ทะลุ",
      "เจาะรูไม่ทะลุ",
      "เนื้อฟิล์มแข็งเป็นเม็ด",
      "สกรีนไม่สวย",
      "น้ำหนักไม่ถึง/เกิน",
      "จับจีบไม่สวย",
      "ไซร้ไม่ได้ขนาด",
      "ขี้ดายหลุด",
      "เดินเครื่องใหม่",
      "เปลี่ยนสี",
      "เปลี่ยนไซร้",
      "เศษเจาะ",
      "ขัดหน้าดาย",
      "ตั้งมีดใหม่",
      "อื่นๆ",
      "ไฟดับ",
    ],
  },
  drill: {
    machines: ["ตัดเจาะ1", "ตัดเจาะ2", "ตัดเจาะ3", "ตัดเจาะ4"],
    problems: [
      "มีดตัดไม่ขาด",
      "ตัดเอียง",
      "ซีนไม่ติด",
      "ซีนขาด",
      "เจาะไม่ทะลุ",
      "รูเจาะเอียง",
      "ขนาดไม่ได้",
      "ถุงเอียง / ก้นถุงใหญ่",
      "เช็คดูซีน",
      "เปลี่ยนยาง / ลวด / ลวดซีนเคลื่อน",
      "เปลี่ยนซีน",
      "เปลี่ยนไซร้",
      "ซ่อมเครื่อง",
      "ไฟดับ",
      "อื่นๆ",
    ],
  },
  garbage: {
    machines: ["ตัดถุงขยะ-ถุงอเนก"],
    problems: [
      "ซีนไม่ติด / ซีนขาด",
      "ถุงมีรอยขาด / ขูด",
      "ตัดไม่ขาด",
      "ถุงเอียง / ก้นถุงใหญ่",
      "ขนาดไม่ได้",
      "ต้นม้วน / ปลายม้วน",
      "เปลี่ยนไซร้",
      "ซ่อมเครื่อง",
      "ไฟดับ",
    ],
  },
  tape: {
    machines: ["ตัดเทปน้ำพุ่ง"],
    problems: [
      "ความยาวไม่ถึง",
      "ม้วนล้นกระดาษ",
      "เข็มหัก",
      "รูไม่ทะลุ",
      "สกรีนหาย",
      "ต้นม้วน / ปลายม้วน",
      "ซ่อมเครื่อง",
      "ตั้งไซร้",
      "ตัดดูรู",
      "ไฟดับ",
      "รอยต่อม้วน",
      "เศษลองน้ำ / ตัดดูรู",
    ],
  },
  sheet: {
    machines: ["ตัดผืน1"],
    problems: [
      "ความยาวไม่ถึง",
      "เศษหัวม้วน / ปลายม้วน",
      "เครื่องเสีย",
      "ส่วนที่เสียจากแผนกสแลน",
      "เปลี่ยนเปอร์เซ็นต์การผลิต",
      "อื่นๆ",
    ],
  },
  salan: {
    machines: [
      "สแลน ทอ 1",
      "สแลน ทอ 2",
      "สแลน ทอ 3",
      "สแลน ทอ 4",
      "สแลน ทอ 5",
      "สแลน ทอ 6",
      "สแลน ทอ 7",
      "สแลน ทอ 8",
      "สแลน ทอ 9",
      "สแลน ทอ 10",
      "สแลน ทอ 11",
      "สแลน ทอ 12",
      "สแลน ทอ 13",
      "สแลน ทอ 14",
      "สแลน ทอ 15",
      "สแลน ทอ 16",
      "สแลน ทอ 17",
      "สแลน ทอ 18",
    ],
    problems: [
      "ฟิล์มขาดยาว",
      "โมโนขาด",
      "เปลี่ยนความกว้าง",
      "สีไม่ได้คุณภาพ",
      "น้ำหนักไม่ได้คุณภาพ",
      "ความกว้างไม่ถึง",
      "เศษฟิล์มปลายม้วน (ดำ, เขียว, เงิน, ฟ้า, ขาว)",
      "เศษฟิล์มเส้นข้าง (ดำ, เขียว, เงิน, ฟ้า, ขาว)",
      "โมโนปลายม้วน",
      "เศษฟิล์มกรีดหา (ดำ, เขียว, เงิน, ฟ้า, ขาว)",
      "เศษแสลนทอแล้ว",
      "ตัดทิ้ง",
      "อื่นๆ",
    ],
  },
};

let currentDept = localStorage.getItem("activeDept") || "print";
let globalDeptChart = null;
let globalMonthlyChart = null;

window.addEventListener("DOMContentLoaded", () => {
  protectExecutivePage();
  setActiveUserLabel();
  loadAndProcessDashboardData();
  setInterval(loadAndProcessDashboardData, 30000);
});

// =========================================================
// SECURITY
// =========================================================


function protectExecutivePage() {
  const user = localStorage.getItem("activeUser");
  const role = localStorage.getItem("activeRole");

  const allowRoles = ["admin", "accounting", "supervisor", "management"];

  if (!user || !allowRoles.includes(role)) {
    alert("ไม่มีสิทธิ์เข้าใช้งานหน้านี้");
    window.location.href = "/login2.html";
  }
}

function setActiveUserLabel() {
  const label = document.getElementById("lbl-active-user");
  if (label) {
    label.textContent =
      localStorage.getItem("activeName") ||
      localStorage.getItem("activeUser") ||
      "MAN_DIRECTOR";
  }
}

function switchDepartment(deptName) {
  localStorage.setItem("activeDept", deptName);
  window.location.href = FORM_PAGE;
}

window.switchDepartment = switchDepartment;

// =========================================================
// LOAD DATA
// =========================================================

async function loadAndProcessDashboardData() {
  let records = [];

  try {
    if (!sb) throw new Error("ไม่พบ window.supabaseClient");

    const { data, error } = await sb
      .from("production_reports")
      .select("*")
      .order("incident_datetime", { ascending: false });

    if (error) throw error;

    records = Array.isArray(data) ? data : [];
  } catch (error) {
    console.error("โหลดข้อมูลไม่สำเร็จ:", error);
    records = [];
  }

  updateMetricCards(records);
  renderDoughnutChart(getDepartmentCounters(records));
  renderMonthlyMachineChart(records);
  generateExecutiveSummary(records);
  generateExecutiveInsight(records);
  renderReportTable(records);
}

window.loadAndProcessDashboardData = loadAndProcessDashboardData;

function updateMetricCards(records) {
  setText("cnt-total", records.length);
  setText(
    "cnt-pending",
    records.filter((r) => r.status === "pending" || !r.status).length,
  );
  setText(
    "cnt-progress",
    records.filter((r) => r.status === "progress").length,
  );
  setText(
    "cnt-resolved",
    records.filter((r) => r.status === "resolved").length,
  );
}

function getDepartmentCounters(records) {
  const counters = {
    print: 0,
    sheet: 0,
    tape: 0,
    blow: 0,
    drill: 0,
    garbage: 0,
    mono: 0,
    salan: 0,
  };

  records.forEach((item) => {
    const dept = normalizeDept(item.department);
    if (counters[dept] !== undefined) counters[dept]++;
  });

  return counters;
}

// =========================================================
// TABLE
// =========================================================

function renderReportTable(records) {
  const tbody = document.getElementById("dom-table-body");
  const filter = document.getElementById("sel-dept-filter")?.value || "all";

  let displayRecords =
    filter === "all"
      ? records
      : records.filter((r) => normalizeDept(r.department) === filter);

  window.pvtExecutiveFilteredCache = displayRecords;

  if (!tbody) return;

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
    const dept = normalizeDept(row.department);
    const renderedDate = row.incident_datetime
      ? new Date(row.incident_datetime).toLocaleString("th-TH")
      : "-";

    tr.innerHTML = `
      <td class="nowrap strong">${escapeHTML(renderedDate)}</td>
      <td>
        <span class="btn-dept d-${escapeHTML(dept)} dept-pill">
          ${escapeHTML((row.department || "-").toUpperCase())}
        </span>
      </td>
      <td class="machine-cell">${escapeHTML(row.machine_no || "-")}</td>
      <td class="strong">${escapeHTML(row.problem_type || "-")}</td>
      <td><div class="cell-detail">${escapeHTML(row.detail || row.note || "-")}</div></td>
      <td><span class="reporter-code">${escapeHTML(row.reported_by || "คนงาน")}</span></td>
      <td>
        <div class="status-space">${getStatusBadge(row.status)}</div>
        <select class="select-inline-status" onchange="executeModifyCaseStatus('${escapeHTML(row.id)}', this.value)">
          <option value="pending" ${row.status === "pending" || !row.status ? "selected" : ""}>⏳ ตั้งรับเรื่อง</option>
          <option value="progress" ${row.status === "progress" ? "selected" : ""}>⚙️ กำลังซ่อม</option>
          <option value="resolved" ${row.status === "resolved" ? "selected" : ""}>✅ ปิดงาน</option>
        </select>
      </td>
      <td>
        <input
          type="text"
          class="input-inline-note"
          placeholder="พิมพ์ข้อสั่งการ/วิธีแก้ไข..."
          value="${escapeAttr(row.resolution || "")}"
          onchange="executeModifyCaseResolution('${escapeHTML(row.id)}', this.value)"
        />
        ${row.resolver ? `<small class="small-note">📌 ผู้สั่งงานล่าสุด: <strong>${escapeHTML(row.resolver)}</strong></small>` : ""}
      </td>
    `;

    tbody.appendChild(tr);
  });
}

function getStatusBadge(status) {
  if (status === "progress") {
    return `<span class="badge-status status-progress">⚙️ กำลังซ่อม</span>`;
  }

  if (status === "resolved") {
    return `<span class="badge-status status-resolved">✅ ปิดงานสำเร็จ</span>`;
  }

  return `<span class="badge-status status-pending">⏳ รอดำเนินการ</span>`;
}

// =========================================================
// CHARTS
// =========================================================

function renderDoughnutChart(counts) {
  const canvas = document.getElementById("dom-dept-chart");
  if (!canvas || typeof Chart === "undefined") return;

  const ctx = canvas.getContext("2d");
  if (globalDeptChart) globalDeptChart.destroy();

  globalDeptChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: [
        "ม้วนพิมพ์",
        "แผ่นหล่อ",
        "เทปพัน",
        "เป่าถุง",
        "เจาะรู",
        "ถุงขยะ",
        "โมโน",
        "สแลน",
      ],
      datasets: [
        {
          data: [
            counts.print,
            counts.sheet,
            counts.tape,
            counts.blow,
            counts.drill,
            counts.garbage,
            counts.mono,
            counts.salan,
          ],
          backgroundColor: [
            "#dc2626",
            "#2563eb",
            "#16a34a",
            "#9333ea",
            "#ea580c",
            "#4b5563",
            "#0891b2",
            "#14532d",
          ],
          borderWidth: 1,
          borderColor: "#ffffff",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom" },
      },
    },
  });
}

function renderMonthlyMachineChart(records) {
  const canvas = document.getElementById("dom-monthly-machine-chart");
  if (!canvas || typeof Chart === "undefined") return;

  const ctx = canvas.getContext("2d");
  if (globalMonthlyChart) globalMonthlyChart.destroy();

  const months = [
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

  const monthlyData = {
    print: new Array(12).fill(0),
    blow: new Array(12).fill(0),
    mono: new Array(12).fill(0),
    drill: new Array(12).fill(0),
    sheet: new Array(12).fill(0),
    salan: new Array(12).fill(0),
  };

  records.forEach((r) => {
    const monthIndex = getMonthIndex(
      r.incident_datetime || r.datetime || r.created_at,
    );
    const dept = normalizeDept(r.department);

    if (monthIndex < 0 || monthIndex > 11) return;

    if (dept === "print") monthlyData.print[monthIndex]++;
    else if (dept === "blow" || dept === "tape") monthlyData.blow[monthIndex]++;
    else if (dept === "mono") monthlyData.mono[monthIndex]++;
    else if (dept === "drill" || dept === "garbage")
      monthlyData.drill[monthIndex]++;
    else if (dept === "sheet") monthlyData.sheet[monthIndex]++;
    else if (dept === "salan") monthlyData.salan[monthIndex]++;
  });

  globalMonthlyChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        {
          label: "ม้วนพิมพ์",
          data: monthlyData.print,
          backgroundColor: "#dc2626",
        },
        {
          label: "เป่าถุง/เทป",
          data: monthlyData.blow,
          backgroundColor: "#9333ea",
        },
        { label: "โมโน", data: monthlyData.mono, backgroundColor: "#0891b2" },
        {
          label: "ตัดเจาะ/ถุงขยะ",
          data: monthlyData.drill,
          backgroundColor: "#ea580c",
        },
        {
          label: "แผ่นหล่อ/ตัดผืน",
          data: monthlyData.sheet,
          backgroundColor: "#2563eb",
        },
        { label: "สแลน", data: monthlyData.salan, backgroundColor: "#14532d" },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true },
        y: { stacked: true, beginAtZero: true },
      },
      plugins: {
        legend: {
          position: "top",
          labels: { font: { family: "Sarabun", size: 14 } },
        },
      },
    },
  });
}

// =========================================================
// UPDATE CASE
// =========================================================

async function executeModifyCaseStatus(caseId, targetStatus) {
  const actingManager = localStorage.getItem("activeUser") || "MAN";

  try {
    const { error } = await sb
      .from("production_reports")
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
  const actingManager = localStorage.getItem("activeUser") || "MAN";

  try {
    const { error } = await sb
      .from("production_reports")
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

window.executeModifyCaseStatus = executeModifyCaseStatus;
window.executeModifyCaseResolution = executeModifyCaseResolution;

// =========================================================
// SUMMARY / INSIGHT
// =========================================================

function generateExecutiveSummary(records) {
  const summaryBox = document.getElementById("ai-summary-box");
  if (!summaryBox) return;

  if (records.length === 0) {
    summaryBox.textContent = "ไม่พบข้อมูลปัญหา";
    return;
  }

  const machineCounter = {};

  records.forEach((r) => {
    const machine = r.machine_no || "ไม่ระบุ";
    const problem = r.problem_type || "อื่นๆ";

    if (!machineCounter[machine]) {
      machineCounter[machine] = { total: 0, problems: {} };
    }

    machineCounter[machine].total++;
    machineCounter[machine].problems[problem] =
      (machineCounter[machine].problems[problem] || 0) + 1;
  });

  let topMachine = "";
  let maxCount = 0;

  Object.keys(machineCounter).forEach((machine) => {
    if (machineCounter[machine].total > maxCount) {
      maxCount = machineCounter[machine].total;
      topMachine = machine;
    }
  });

  if (!topMachine) {
    summaryBox.textContent = "ไม่มีข้อมูล";
    return;
  }

  const topProblems = Object.entries(machineCounter[topMachine].problems)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const listItems = topProblems
    .map(
      ([problem, count]) => `<li>${escapeHTML(problem)} (${count} ครั้ง)</li>`,
    )
    .join("");

  summaryBox.innerHTML = `
    <h3>🚨 เครื่อง ${escapeHTML(topMachine)} มีปัญหามากที่สุด</h3>
    <p>พบปัญหา ${maxCount} ครั้ง</p>
    <ul>${listItems}</ul>
  `;
}

function generateExecutiveInsight(records) {
  const box = document.getElementById("exec-insight-box");
  if (!box) return;

  if (records.length === 0) {
    box.textContent = "ไม่มีข้อมูลในระบบ";
    return;
  }

  const total = records.length;
  const pending = records.filter(
    (r) => r.status === "pending" || !r.status,
  ).length;
  const progress = records.filter((r) => r.status === "progress").length;
  const resolved = records.filter((r) => r.status === "resolved").length;

  const topMachine = findTopValue(records, "machine_no", "ไม่ระบุ");
  const topDept = findTopValue(
    records.map((r) => ({ department: normalizeDept(r.department) })),
    "department",
    "unknown",
  );
  const topProblem = findTopValue(records, "problem_type", "ไม่ระบุ");

  box.innerHTML = `
    <div>📊 งานทั้งหมด: <b>${total}</b> รายการ</div>
    <div>⏳ รอดำเนินการ: <b>${pending}</b></div>
    <div>⚙️ กำลังซ่อม: <b>${progress}</b></div>
    <div>✅ ปิดงานแล้ว: <b>${resolved}</b></div>

    <hr class="insight-line" />

    <div>🚨 เครื่องที่เกิดปัญหาสูงสุด: <b>${escapeHTML(topMachine.value)}</b></div>
    <div>⚠️ ปัญหาที่พบมากที่สุด: <b>${escapeHTML(topProblem.value)}</b></div>
    <div>🏭 แผนกที่มีปัญหาสูงสุด: <b>${escapeHTML(topDept.value.toUpperCase())}</b></div>

    <hr class="insight-line" />

    <div class="insight-warning">
      💡 ข้อเสนอแนะ:
      ควรตรวจสอบเครื่อง <b>${escapeHTML(topMachine.value)}</b>
      เนื่องจากพบปัญหา "<b>${escapeHTML(topProblem.value)}</b>"
      บ่อยที่สุดในระบบ
    </div>
  `;
}

// =========================================================
// EXPORT CSV
// =========================================================

function exportToDataExcelCSV() {
  try {
    const targetData = window.pvtExecutiveFilteredCache || [];

    if (targetData.length === 0) {
      alert("❌ ไม่มีข้อมูล");
      return;
    }

    let csvRawString = "data:text/csv;charset=utf-8,\uFEFF";
    csvRawString +=
      "วันเวลาเกิดเหตุ,แผนก,หมายเลขเครื่องจักร,หัวข้อปัญหาขัดข้อง,รายละเอียดอาการ,ผู้แจ้งเรื่อง,สถานะปัจจุบัน,สั่งการแก้ไข,ผู้สั่งงาน\n";

    targetData.forEach((item) => {
      const formattedTime = item.incident_datetime
        ? new Date(item.incident_datetime)
            .toLocaleString("th-TH")
            .replace(/,/g, "")
        : "";

      const statusText =
        item.status === "progress"
          ? "กำลังดำเนินการซ่อม"
          : item.status === "resolved"
            ? "แก้ไขสำเร็จปิดงาน"
            : "รอดำเนินการ";

      csvRawString +=
        [
          formattedTime,
          (item.department || "").toUpperCase(),
          item.machine_no || "-",
          item.problem_type || "-",
          item.detail || item.note || "-",
          item.reported_by || "-",
          statusText,
          item.resolution || "-",
          item.resolver || "-",
        ]
          .map(csvCell)
          .join(",") + "\n";
    });

    const encodedUri = encodeURI(csvRawString);
    const downloader = document.createElement("a");

    downloader.setAttribute("href", encodedUri);
    downloader.setAttribute(
      "download",
      "รายงานสถิติปัญหาการผลิต_PVT_EXECUTIVE.csv",
    );

    document.body.appendChild(downloader);
    downloader.click();
    document.body.removeChild(downloader);
  } catch (error) {
    alert("Error: " + error.message);
  }
}

window.exportToDataExcelCSV = exportToDataExcelCSV;

// =========================================================
// LOGOUT
// =========================================================

async function handleDashboardLogout() {
  try {
    if (sb?.auth) {
      await sb.auth.signOut();
    }
  } catch (error) {
    console.warn("Supabase signOut ไม่สำเร็จ:", error);
  }

  localStorage.clear();
  alert("🔒 ออกจากระบบเรียบร้อยแล้ว");
  window.location.href = LOGIN_PAGE;
}

window.handleDashboardLogout = handleDashboardLogout;

// =========================================================
// HELPERS
// =========================================================

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function normalizeDept(dept) {
  return String(dept || "")
    .trim()
    .toLowerCase();
}

function getMonthIndex(dateValue) {
  if (!dateValue) return -1;

  const dateObj = new Date(dateValue);
  if (!Number.isNaN(dateObj.getTime())) {
    return dateObj.getMonth();
  }

  const text = String(dateValue);
  const matchDash = text.match(/-(\d{2})-/);
  const matchSlash = text.match(/\/(\d{2})\//);

  if (matchDash?.[1]) return parseInt(matchDash[1], 10) - 1;
  if (matchSlash?.[1]) return parseInt(matchSlash[1], 10) - 1;

  return -1;
}

function findTopValue(records, field, fallback) {
  const counter = {};

  records.forEach((r) => {
    const value = r[field] || fallback;
    counter[value] = (counter[value] || 0) + 1;
  });

  let top = fallback;
  let count = 0;

  Object.entries(counter).forEach(([value, total]) => {
    if (total > count) {
      top = value;
      count = total;
    }
  });

  return { value: top, count };
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
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
  return escapeHTML(value);
}

// บังคับแก้ชื่อตารางที่ผิดพลาดให้เป็นตาราง daily_waste_reports ที่ถูกต้อง
if (typeof supabase !== 'undefined' && supabase.from) {
  const originalFrom = supabase.from;
  supabase.from = function(tableName) {
    if (tableName === 'production_reports') {
      return originalFrom.call(this, 'daily_waste_reports');
    }
    return originalFrom.call(this, tableName);
  };
}