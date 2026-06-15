// =========================================================
// index.js
// แยกจาก HTML แล้ว และใช้ window.supabaseClient
// =========================================================
// =================================================================
// 🛠️ ชุดโค้ดพิเศษสำหรับแก้ปัญหาตารางผิด (แปะไว้บนสุดของไฟล์ index.js)
// =================================================================


// =================================================================

// =========================================================
// แก้ไขส่วนหัวของไฟล์ index.js เพื่อป้องกันสคริปต์ชนกันเอง
// =========================================================

if (typeof window.sb === 'undefined') {
    window.sb = window.supabaseClient;
}

if (typeof window.ALLOWED_ROLES === 'undefined') {
    window.ALLOWED_ROLES = ["management", "supervisor", "admin", "MAN", "man"];
}

// นำตัวแปรของ window มาสร้างตัวแปรท้องถิ่นไว้ใช้งานต่อในไฟล์แบบปลอดภัย
var sb = window.supabaseClient || window.sb;
var ALLOWED_ROLES = window.ALLOWED_ROLES;

const LOGIN_PAGE = "login2.html";
const FORM_PAGE = "html/form-department.html";
// ... โค้ดส่วนอื่นๆ คงเดิม ...

const DEPARTMENT_LABELS = {
  pipe: "ท่อ",
  sheet: "แผ่นหล่อ",
  tape: "เทปพัน",
  blow: "เป่าถุง",
  drill: "เจาะรู",
  garbage: "ถุงขยะ",
  mono: "โมโน",
  salan: "สแลน",
};

const EXCEL_MACHINE_PROBLEM_DB = {
  pipe: {
    machines: ["ท่อ1", "ท่อ2", "ท่อ3", "ท่อ4"],
    problems: ["ขี้ดายหลุด", "เข้าม้วนหัก", "โครไม่สวย", "เดินเครื่องใหม่", "ทะลุ", "น้ำท่วมถังแว็ก", "เปลี่ยนไซร้", "ไฟดับ", "แว็กตก", "แว็กสูง", "หนาบางกลางม้วน", "อื่นๆ"]
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

let currentDept = localStorage.getItem("activeDept") || "";
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
  // กำหนดสิทธิ์กลุ่มผู้ใช้ที่อนุญาตให้เข้าดูแดชบอร์ดสรุปยอดได้
  const allowRoles = ["admin", "accounting", "supervisor", "management", "MAN", "man"];

  if (!user || !allowRoles.includes(role)) {
    alert("🔒 คุณไม่มีสิทธิ์เข้าใช้งานหน้าแดชบอร์ดสรุปผลนี้");
    window.location.href = LOGIN_PAGE;
  }
}
window.protectExecutivePage = protectExecutivePage;

function setActiveUserLabel() {
  const label = document.getElementById("lbl-active-user");
  if (label) {
    label.textContent =
      localStorage.getItem("activeName") ||
      localStorage.getItem("activeUser") ||
      "ผู้จัดการระบบ";
  }
}
window.setActiveUserLabel = setActiveUserLabel;

function switchDepartment(deptName) {
  localStorage.setItem("activeDept", deptName);
  // ลิงก์ตรงพาข้ามไปยังหน้าจอแบบฟอร์มบันทึกของเสียประจำแผนก
  window.location.href = FORM_PAGE;
}
// ⚠️ สำคัญมาก: ต้องผูกเข้ากับ window เสมอ เพื่อให้ปุ่ม onclick ในหน้า HTML เรียกหาเจอ 100%
window.switchDepartment = switchDepartment;

// =========================================================
// LOAD DATA
// =========================================================

async function loadAndProcessDashboardData() {
  const currentClient = window.supabaseClient || sb;
  
  if (!currentClient) {
    console.warn("⏳ กำลังรอสคริปต์ฐานข้อมูลจัดตั้งตัวแปร... จะลองโหลดใหม่อีกครั้งใน 500ms");
    setTimeout(loadAndProcessDashboardData, 500);
    return;
  }

  try {
    // 🛠️ แก้ไข: เปลี่ยนจาก incident_datetime เป็น created_at เพื่อป้องกัน Error คอลัมน์ไม่มีอยู่จริง
    const { data, error } = await currentClient
      .from("daily_waste_reports") 
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (data) {
      // ตรวจสอบและแมปข้อมูลกรณีที่ชื่อคอลัมน์ในฐานข้อมูลจริงอาจต่างออกไป
      const normalizedData = data.map(item => ({
        ...item,
        // ถ้าในฐานข้อมูลไม่มี incident_datetime ให้ดึงค่าจาก created_at หรือ datetime มาใช้แทนชั่วคราวในการแสดงผลตาราง
        incident_datetime: item.incident_datetime || item.datetime || item.created_at
      }));

      // ✅ แก้ไขใหม่ให้เป็นแบบนี้ (หน้าตาหลังแก้เสร็จ):
      updateMetricCards(normalizedData);
      renderReportTable(normalizedData);
      const counters = getDepartmentCounters(normalizedData);
      renderDepartmentDonutChart(counters); // ✨ เติมคำว่า Department และแก้ตัวสะกด Donut ให้ถูก
      renderMonthlyMachineChart(normalizedData);
      generateExecutiveSummary(normalizedData);
      generateExecutiveInsight(normalizedData);
    }
    
  } catch (error) {
    console.error("โหลดข้อมูลไม่สำเร็จ:", error);
  }
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
    pipe: 0,
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

// 📊 ฟังก์ชันสร้างกราฟแท่งแนวโน้มการเกิดปัญหาประจำปี (แยกโครงสร้างละเอียด)
let monthlyChartInstance = null; // ตัวแปรเก็บสถานะกราฟแท่งรายเดือนระดับ Global ของไฟล์

function renderMonthlyMachineChart(records) {
  // ชี้เป้าไปที่กล่อง Canvas ของกราฟแท่งบนหน้า HTML
  const ctx = document.getElementById("chart-machine-bar");
  if (!ctx) {
    console.warn("⚠️ ไม่พบ Element ID 'chart-machine-bar' บนหน้าเว็บนี้");
    return;
  }

  // 🧹 ทำลายกราฟเก่าในความจำเพื่อเคลียร์พื้นที่แสดงผลใหม่
  if (monthlyChartInstance) {
    monthlyChartInstance.destroy();
  }

  // สร้างกล่องสล็อตจำลองไว้ 12 ช่อง (แทนเดือน ม.ค. - ธ.ค.) ตั้งค่าเริ่มต้นเป็นเลข 0 ครั้ง
  const monthlyCounts = Array(12).fill(0);

  // วนลูปตรวจสอบข้อมูลทีละแถวเพื่อจัดหมวดหมู่ลงเดือน
  records.forEach(row => {
    const rawDate = row.incident_datetime || row.created_at;
    
    // 🛡️ ซ่อมจุดเปราะบาง: ถ้าไม่มีวันที่ระบุ ให้ข้ามไปทันทีเพื่อป้องกัน TypeError ล่มกลางคัน
    if (!rawDate) return;

    const parsedDate = new Date(rawDate);
    const monthIndex = parsedDate.getMonth(); // จะได้เลข index เดือน 0 = ม.ค. ถึง 11 = ธ.ค.

    if (monthIndex >= 0 && monthIndex <= 11) {
      monthlyCounts[monthIndex]++; // บวกจำนวนครั้งเพิ่มเข้าไปในเดือนนั้นๆ
    }
  });

  // สั่งวาดโครงสร้างกราฟแท่งลงหน้าจอ
  monthlyChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."],
      datasets: [{
        label: "จำนวนปัญหาที่พบ (ครั้ง/เดือน)",
        data: monthlyCounts,
        backgroundColor: "#4e73df", // ใช้สีน้ำเงินหลักของระบบแดชบอร์ด
        borderColor: "#4e73df",
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1 // บังคับให้สเกลตัวเลขเป็นจำนวนเต็ม (เพราะจำนวนครั้งนับเป็นจำนวนเต็ม)
          }
        }
      }
    }
  });
}
window.renderMonthlyMachineChart = renderMonthlyMachineChart;

// =========================================================
// UPDATE CASE
// =========================================================

async function executeModifyCaseStatus(caseId, targetStatus) {
  const actingManager = localStorage.getItem("activeUser") || "MAN";

  try {
    const { error } = await sb
      .from("pvt_production_reports")
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
      .from("pvt_production_reports")
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

// 📅 ฟังก์ชันคัดกรองข้อมูลตามช่วงวันที่ (แก้ไขให้ค้นหาตัวตนเจอแน่นอน)
function executeDateRangeFilter() {
  // 1. ดึงค่าจากกล่องปฏิทินในหน้า HTML
  const startInput = document.getElementById("inp-start-date")?.value;
  const endInput = document.getElementById("inp-end-date")?.value;

  // 2. ถ้าผู้ใช้ไม่ได้เลือกวันที่ ให้แจ้งเตือนระบบและหยุดทำงานทันที ไม่ให้โค้ดเอ๋อ
  if (!startInput || !endInput) {
    alert("📅 กรุณาเลือกวันที่เริ่มต้นและสิ้นสุดให้ครบถ้วนก่อนกดค้นหาครับ");
    return;
  }

  // 3. กำหนดช่วงเวลาให้ครอบคลุมตั้งแต่วินาทีแรกของวันเริ่ม จนถึงวินาทีสุดท้ายของวันสิ้นสุด
  const start = new Date(startInput + "T00:00:00");
  const end = new Date(endInput + "T23:59:59");

  // 4. ตรวจสอบว่าในเครื่องมีข้อมูลแคชหลักที่ดึงมาจาก Supabase หรือไม่
  if (!window.pvtDashboardRawCache) {
    console.error("❌ ไม่พบข้อมูลหลักในระบบแคช ไม่สามารถคัดกรองวันที่ได้");
    return;
  }

  // 5. ทำการกรอง (Filter) ข้อมูลดิบเอาเฉพาะแถวที่อยู่ในช่วงวันที่กำหนด
  const filtered = window.pvtDashboardRawCache.filter(row => {
    const targetDate = new Date(row.incident_datetime || row.created_at);
    return targetDate >= start && targetDate <= end;
  });

  // 6. ส่งชุดข้อมูลที่กรองเสร็จแล้ว ไปให้ฟังก์ชันอื่นๆ วาดหน้าจอและกราฟิกใหม่
  if (typeof window.renderReportTable === "function") {
    window.renderReportTable(filtered);
  }
  if (typeof window.updateMetricCards === "function") {
    window.updateMetricCards(filtered);
  }
  if (typeof window.renderPivotSummaryTable === "function") {
    window.renderPivotSummaryTable(filtered);
  }
  if (typeof window.getDepartmentCounters === "function") {
    const counters = window.getDepartmentCounters(filtered);
    if (typeof window.renderDepartmentDonutChart === "function") {
      window.renderDepartmentDonutChart(counters);
    }
  }
}

function clearDateFilter() {
  // ล้างค่าในช่อง Input วันที่ให้โล่ง
  if (document.getElementById("inp-start-date")) document.getElementById("inp-start-date").value = "";
  if (document.getElementById("inp-end-date")) document.getElementById("inp-end-date").value = "";
  
  // หากมีข้อมูลเดิมเก็บอยู่ในความจำ ให้ดึงกลับมาวาดใหม่ทั้งหมด
  if (window.pvtDashboardRawCache) {
    if (typeof window.renderReportTable === "function") window.renderReportTable(window.pvtDashboardRawCache);
    if (typeof window.updateMetricCards === "function") window.updateMetricCards(window.pvtDashboardRawCache);
    if (typeof window.renderPivotSummaryTable === "function") window.renderPivotSummaryTable(window.pvtDashboardRawCache);
    
    if (typeof window.getDepartmentCounters === "function") {
      const counters = window.getDepartmentCounters(window.pvtDashboardRawCache);
      if (typeof window.renderDepartmentDonutChart === "function") window.renderDepartmentDonutChart(counters);
    }
  }
}
window.clearDateFilter = clearDateFilter;


// 📊 ฟังก์ชันสร้างกราฟวงกลมจำแนกปัญหารายแผนก (แยกโครงสร้างชัดเจน)
let donutChartInstance = null; // ตัวแปรเก็บสถานะกราฟวงกลมระดับ Global ของไฟล์

function renderDepartmentDonutChart(counters) {
  // ชี้เป้าไปที่กล่อง Canvas บนหน้า HTML
  const ctx = document.getElementById("chart-dept-donut");
  if (!ctx) {
    console.warn("⚠️ ไม่พบ Element ID 'chart-dept-donut' บนหน้าเว็บนี้");
    return;
  }

  // 🧹 หากมีกราฟเก่าฝังอยู่ในความจำเครื่อง ให้ทำลายทิ้งก่อนเพื่อเคลียร์แรม (กันบั๊กกราฟกระพริบซ้อน)
  if (donutChartInstance) {
    donutChartInstance.destroy();
  }

  // ดึงชื่อป้ายกำกับภาษาไทยมาจับคู่กับค่าคีย์ภาษาอังกฤษ
  const chartLabels = Object.keys(counters).map(key => {
    return typeof DEPARTMENT_LABELS !== "undefined" && DEPARTMENT_LABELS[key] 
      ? DEPARTMENT_LABELS[key] 
      : key;
  });
  
  const chartDataValues = Object.values(counters);

  // สั่งวาดกราฟวงกลมตัวใหม่ลงหน้าจอ
  donutChartInstance = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: chartLabels,
      datasets: [{
        data: chartDataValues,
        // ชุดสีมาตรฐานสำหรับแบ่งแยกแท่งแผนกงานโรงงาน
        backgroundColor: [
          "#4e73df", "#1cc88a", "#36b9cc", "#f6c23e", 
          "#e74a3b", "#858796", "#5a5c69", "#f8f9fc"
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom' // ย้ายคำอธิบายสีไปไว้ด้านล่างกราฟเพื่อความสวยงาม
        }
      }
    }
  });
}
window.renderDepartmentDonutChart = renderDepartmentDonutChart;


function exportTableToExcel() {
  // ดึงข้อมูลจากแคชที่กรอกล่าสุด ถ้าไม่มีให้ใช้แคชหลัก
  const records = window.pvtExecutiveFilteredCache || window.pvtDashboardRawCache || [];
  if (records.length === 0) { 
    alert("❌ ไม่มีข้อมูลในตารางสำหรับการดาวน์โหลดในขณะนี้"); 
    return; 
  }

  // ใส่รหัสตัวอักษร \uFEFF ด้านหน้าสุดเพื่อให้ Excel อ่านภาษาไทยออก ไม่กลายเป็นต่างดาว
  let csvContent = "\uFEFF"; 
  csvContent += "วัน-เวลาที่เกิดเหตุ,แผนก,หมายเลขเครื่องจักร,ปัญหาที่พบ,รายละเอียดเหตุการณ์,น้ำหนักของเสีย (กก.),สถานะ,แนวทางแก้ไข\n";

  // วนลูปแปลงทีละแถวข้อมูล
  records.forEach(row => {
    const d = row.incident_datetime || row.created_at ? new Date(row.incident_datetime || row.created_at).toLocaleString("th-TH") : "-";
    const dept = (DEPARTMENT_LABELS[normalizeDept(row.department_code || row.department)] || "ทั่วไป").toUpperCase();
    const mach = row.machine_no || "-";
    
    // ดักจับและล้างเครื่องหมายคอมมา , ออก เพื่อไม่ให้ไฟล์ CSV เข้าใจผิดว่าเป็นคอลัมน์ใหม่
    const prob = (row.reason_detail || row.problem_type || "-").replace(/,/g, " ");
    const det = (row.note || row.detail || "-").replace(/,/g, " ").replace(/\n/g, " ");
    const w = parseFloat(row.waste_qty || row.waste_weight_kg || 0).toFixed(2);
    
    const st = row.status === "resolved" ? "ปิดงานสำเร็จ" : row.status === "progress" ? "กำลังแก้ไข" : "รอดำเนินการ";
    const res = (row.resolution || row.corrective_action || "-").replace(/,/g, " ");

    csvContent += `"${d}","${dept}","${mach}","${prob}","${det}",${w},"${st}","${res}"\n`;
  });

  // สร้างไฟล์และสั่งให้เว็บบราว์เซอร์เด้งดาวน์โหลดลงเครื่องคอมพิวเตอร์
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", `รายงานปัญหาของเสียโรงงาน_${new Date().toLocaleDateString("th-TH")}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
window.exportTableToExcel = exportTableToExcel;


// ⚠️ บรรทัดสำคัญที่สุด: บังคับผูกฟังก์ชันเข้ากับ Global Window เพื่อให้หน้า HTML เรียกใช้เจอทันที
window.executeDateRangeFilter = executeDateRangeFilter;

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
  window.location.href = "login2.html";
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
    if (tableName === 'pvt_production_reports') {
      return originalFrom.call(this, 'daily_waste_reports');
    }
    return originalFrom.call(this, tableName);
  };
}

// =================================================================
// 📊 ฟังก์ชันวิเคราะห์คำนวณและเจนโครงตารางคู่ขนานข้ามหน้าชีทตามตัวอย่างรูปถ่าย Excel
// =================================================================
// =================================================================
// 📊 เวอร์ชันอัปเกรด: ส่งออก Excel เจนโครงสร้าง Pivot + Slicer เลือกเดือนได้อิสระ
// =================================================================
// =================================================================
// 📊 ฟังก์ชันเวอร์ชันอัปเกรด: ส่งออก Excel แยกแท็บเครื่องจักร + ผูกสูตรเลือกเดือนได้อิสระ
// =================================================================
// ========================================================================================
// 📊 ฟังก์ชันเวอร์ชันอัปเกรด: ส่งออก Excel แยกแท็บเครื่องจักร + ผูกสูตรกล่องดร็อปดาวน์เลือกเดือนได้อิสระ
// ========================================================================================
async function exportComplexPivotExcel() {
  try {
    const rawRecords = window.pvtExecutiveFilteredCache || [];
    if (rawRecords.length === 0) {
      alert("❌ ไม่พบข้อมูลรายงานในเงื่อนไขปัจจุบัน ไม่สามารถส่งออกได้");
      return;
    }

    const workbook = new ExcelJS.Workbook();
    
    // 1. สร้างหน้าฐานข้อมูลดิบแฝงไว้
    const dataSheet = workbook.addWorksheet('Data_Source', { views: [{ showGridLines: true }] });
    dataSheet.columns = [
      { header: 'วันที่', key: 'date', width: 15 },
      { header: 'เดือน', key: 'month', width: 15 },
      { header: 'Week', key: 'week', width: 12 },
      { header: 'เครื่องจักร', key: 'machine', width: 15 },
      { header: 'กะ', key: 'shift', width: 12 },
      { header: 'อาการขัดข้อง', key: 'problem', width: 25 },
      { header: 'น้ำหนักสูญเสีย', key: 'loss', width: 15 },
      { header: 'น้ำหนักผลิต', key: 'prod', width: 15 }
    ];

    dataSheet.getRow(1).eachCell((cell) => {
      cell.font = { name: 'Sarabun', size: 11, bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6E6' } };
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    });

    rawRecords.forEach(item => {
      const targetDateStr = item.incident_datetime || item.datetime || item.created_at;
      const rDate = targetDateStr ? new Date(targetDateStr).toLocaleDateString('th-TH') : '-';
      const monthNames = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
      let rMonth = "ไม่ระบุ";
      if(targetDateStr) {
         rMonth = monthNames[new Date(targetDateStr).getMonth()];
      }

      dataSheet.addRow({
        date: rDate,
        month: rMonth,
        week: item.week_no || "week1",
        machine: String(item.machine_no || item.machine || "ทั่วไป").trim(),
        shift: item.shift || "เช้า",
        problem: item.problem_type || item.detail || "อื่นๆ",
        loss: item.weight_loss ? parseFloat(item.weight_loss) : 0,
        prod: item.weight_prod ? parseFloat(item.weight_prod) : 0
      });
    });

    // 2. แตกกลุ่มสร้างหน้าชีทแยกรายเครื่องจักร
    const machines = [...new Set(rawRecords.map(item => String(item.machine_no || item.machine || "ทั่วไป").trim()))];

    machines.forEach(machineKey => {
      const sheet = workbook.addWorksheet(machineKey, { views: [{ showGridLines: true }] });
      
      sheet.columns = [
        { width: 18 }, { width: 12 }, { width: 10 }, { width: 12 }, 
        { width: 10 }, { width: 22 }, { width: 15 }, { width: 15 },
        { width: 4 },  
        { width: 25 }, // J
        { width: 25 }, // K
        { width: 25 }  // L
      ];

      const leftHeaders = ['วันที่', 'เดือน', 'Week', 'เครื่อง', 'กะ', 'อาการ', 'น้ำหนักสูญเสีย', 'น้ำหนักผลิต'];
      leftHeaders.forEach((h, i) => {
        const cell = sheet.getCell(3, i + 1);
        cell.value = h;
        cell.font = { name: 'Sarabun', size: 11, bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        cell.alignment = { horizontal: 'center' };
      });

      let rowIdx = 4;
      dataSheet.eachRow((row, eIdx) => {
        if(eIdx === 1) return;
        if(row.getCell(4).value === machineKey) {
          sheet.getCell(`A${rowIdx}`).value = row.getCell(1).value;
          sheet.getCell(`B${rowIdx}`).value = row.getCell(2).value;
          sheet.getCell(`C${rowIdx}`).value = row.getCell(3).value;
          sheet.getCell(`D${rowIdx}`).value = row.getCell(4).value;
          sheet.getCell(`E${rowIdx}`).value = row.getCell(5).value;
          sheet.getCell(`F${rowIdx}`).value = row.getCell(6).value;
          sheet.getCell(`G${rowIdx}`).value = row.getCell(7).value || 0;
          sheet.getCell(`H${rowIdx}`).value = row.getCell(8).value || 0;
          
          ['A','B','C','D','E','F','G','H'].forEach(col => {
            const c = sheet.getCell(`${col}${rowIdx}`);
            c.font = { name: 'Sarabun', size: 11 };
            c.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
            if(['G','H'].includes(col)) {
              c.numFmt = '#,##0.00';
              c.alignment = { horizontal: 'right' };
            } else if(['A','B','C','D','E'].includes(col)) {
              c.alignment = { horizontal: 'center' };
            }
          });
          rowIdx++;
        }
      });

      // 3. สร้างกล่องเลือกตัวกรองดร็อปดาวน์ที่ช่อง J1:K1
      sheet.getCell('J1').value = 'เลือกตัวกรองเดือน 🔽';
      sheet.getCell('J1').font = { name: 'Sarabun', size: 11, bold: true };
      sheet.getCell('J1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
      sheet.getCell('J1').border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

      sheet.getCell('K1').value = 'ทั้งหมด'; 
      sheet.getCell('K1').font = { name: 'Sarabun', size: 11, bold: true, color: { argb: 'FFC00000' } };
      sheet.getCell('K1').border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
      sheet.getCell('K1').alignment = { horizontal: 'center' };
      
      sheet.getCell('K1').dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"ทั้งหมด,มกราคม,กุมภาพันธ์,มีนาคม,เมษายน,พฤษภาคม,มิถุนายน,กรกฎาคม,สิงหาคม,กันยายน,ตุลาคม,พฤศจิกายน,ธันวาคม"']
      };

      // 4. หัวตารางสรุปฝั่งขวา ผูกสูตร SUMIFS
      sheet.getCell('J3').value = 'ป้ายชื่อแถว (อาการเสีย)';
      sheet.getCell('K3').value = 'ผลรวมของ น้ำหนักสูญเสีย';
      sheet.getCell('L3').value = 'ผลรวมของ น้ำหนักผลิต';

      const pivotHeaders = ['J3', 'K3', 'L3'];
      pivotHeaders.forEach((cellPos, i) => {
        const cell = sheet.getCell(cellPos);
        cell.font = { name: 'Sarabun', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }; 
        cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        cell.alignment = { horizontal: i === 0 ? 'left' : 'right', vertical: 'middle' };
      });

      const currentMachineRecords = rawRecords.filter(item => String(item.machine_no || item.machine || "ทั่วไป").trim() === machineKey);
      const uniqueProblems = [...new Set(currentMachineRecords.map(item => item.problem_type || item.detail || "อื่นๆ"))];

      let pivotRowIdx = 4;
      uniqueProblems.forEach((prob, pIdx) => {
        const cellJ = sheet.getCell(`J${pivotRowIdx}`);
        const cellK = sheet.getCell(`K${pivotRowIdx}`);
        const cellL = sheet.getCell(`L${pivotRowIdx}`);

        cellJ.value = prob;

        cellK.value = {
          formula: `=IF($K$1="ทั้งหมด", SUMIFS(G$4:G$${rowIdx-1}, F$4:F$${rowIdx-1}, J${pivotRowIdx}), SUMIFS(G$4:G$${rowIdx-1}, F$4:F$${rowIdx-1}, J${pivotRowIdx}, B$4:B$${rowIdx-1}, $K$1))`
        };
        cellL.value = {
          formula: `=IF($K$1="ทั้งหมด", SUMIFS(H$4:H$${rowIdx-1}, F$4:F$${rowIdx-1}, J${pivotRowIdx}), SUMIFS(H$4:H$${rowIdx-1}, F$4:F$${rowIdx-1}, J${pivotRowIdx}, B$4:B$${rowIdx-1}, $K$1))`
        };

        cellK.numFmt = '#,##0.00';
        cellL.numFmt = '#,##0.00';

        const isZebra = (pIdx % 2 === 1);
        [cellJ, cellK, cellL].forEach((c, cIdx) => {
          c.font = { name: 'Sarabun', size: 11 };
          c.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
          c.alignment = { horizontal: cIdx === 0 ? 'left' : 'right' };
          if(isZebra) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
        });
        pivotRowIdx++;
      });

      // 5. แถวผลรวมทั้งหมด (Total Row)
      const totalJ = sheet.getCell(`J${pivotRowIdx}`);
      const totalK = sheet.getCell(`K${pivotRowIdx}`);
      const totalL = sheet.getCell(`L${pivotRowIdx}`);

      totalJ.value = 'ผลรวมทั้งหมด';
      totalK.value = { formula: `=SUM(K4:K${pivotRowIdx-1})` };
      totalL.value = { formula: `=SUM(L4:L${pivotRowIdx-1})` };

      totalK.numFmt = '#,##0.00';
      totalL.numFmt = '#,##0.00';

      [totalJ, totalK, totalL].forEach((c, cIdx) => {
        c.font = { name: 'Sarabun', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
        c.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
        c.alignment = { horizontal: cIdx === 0 ? 'left' : 'right' };
      });
    });

    // 6. บันทึกและดาวน์โหลดเล่มรายงานจริง
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(blob, `รายงานวิเคราะห์รูปเล่มสรุปเลือกเดือนได้_PVT_Plastics.xlsx`);

  } catch (err) {
    alert("เกิดข้อผิดพลาดในการเจนไฟล์วิเคราะห์: " + err.message);
  }
}

// ผูกฟังก์ชันเข้าหน้าต่างระบบเพื่อให้ปุ่มหน้า HTML วิ่งมาเรียกเจอแน่นอน
window.exportComplexPivotExcel = exportComplexPivotExcel;
// 🔗 แปะเพิ่มที่บรรทัดท้ายสุดของไฟล์ เพื่อทำป้ายชื่อเล่นผูกสัญญาณข้ามหากันอัตโนมัติ
window.renderDoughnutChart = window.renderDepartmentDonutChart;