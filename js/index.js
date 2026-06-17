
// 🛡️ เช็กว่าตัวแปร supabase มีการประกาศ Client ตัวจริงไว้แล้วหรือยัง
// ถ้าระบบยังไม่ได้สร้าง ให้ทำการสร้าง Client ตัวจริงขึ้นมาตรงนี้เลยครับ
if (typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function') {
  
  // 💡 ใส่ URL และ ANON_KEY ประจำโปรเจกต์ Supabase ของพี่ลงในช่องว่างด้านล่างนี้ได้เลยครับ
  const supabaseUrl = "https://wkbahssqznlpkkghwffg.supabase.co"; // <--- ใส่ URL จริงของพี่
  const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrYmFoc3Nxem5scGtrZ2h3ZmZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwOTg2MDYsImV4cCI6MjA5NjY3NDYwNn0.c6XJi91bPcKNikUTw28KqJ4gi7yqPTdT4pUKKAhSsEM"; // <--- ใส่ Anon Key จริงของพี่

  // ประกาศตัวแปร supabase ให้เป็น global instance ของไฟล์นี้
  window.supabaseClientInstance = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
}

function normalizeDept(dept) {
  return String(dept || "")
    .trim()
    .toLowerCase();
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  } else {
    // ใส่ล็อกแจ้งเตือนเบาๆ เผื่อหน้า HTML ไม่มี ID นี้ โค้ดจะได้ไม่พัง
    console.warn(`[ui_update] ไม่พบ Element ID: "${id}" บนหน้าจอหลัก`);
  }
}

/**
 * 🛡️ CENTRAL DEBUG DISPATCHER
 * แปะโค้ดชุดนี้ไว้บรรทัดบนสุดของไฟล์สคริปต์เพื่อดักจับและรายงานบั๊กทุกจุดในหน้าจอ
 */
(function() {
  window.addEventListener('error', function(event) {
    console.error(`[Runtime_Error] ไฟล์: ${event.filename}\nบรรทัดที่: ${event.lineno} | ข้อความ: ${event.message}`);
    return false;
  });
  window.addEventListener('unhandledrejection', function(event) {
    console.error(`[Async_Rejection_Error] สาเหตุ: ${event.reason?.message || event.reason}`);
  });
  if (typeof window.pvtDashboardRawCache === 'undefined') { window.pvtDashboardRawCache = null; }
})();

// 3. ฟังก์ชันสำหรับทำหน้าที่กระจายงานวาดกราฟและตาราง (แยกสัดส่วนชัดเจน)
function executeDashboardRendering() {
  const records = window.pvtDashboardRawCache;
  if (!records) return;

  console.log('[ui_update] กำลังส่งชุดข้อมูลไปประมวลผลบนหน้าสกรีน...');

  if (typeof window.renderReportTable === 'function') {
    window.renderReportTable(records);
  }
  if (typeof window.updateMetricCards === 'function') {
    window.updateMetricCards(records);
  }
  if (typeof window.renderPivotSummaryTable === 'function') {
    window.renderPivotSummaryTable(records);
  }
  if (typeof window.generateExecutiveInsight === 'function') {
    window.generateExecutiveInsight(records);
  }
  if (typeof window.getDepartmentCounters === 'function') {
    const counters = window.getDepartmentCounters(records);
    if (typeof window.renderDepartmentDonutChart === 'function') {
      window.renderDepartmentDonutChart(counters);
    }
  }
}

// 4. สั่งสคริปต์ทำงานทันทีที่โครงสร้างหน้าเว็บพร้อม



if (typeof window.sb === 'undefined') {
    window.sb = window.supabaseClient;
}

if (typeof window.ALLOWED_ROLES === 'undefined') {
    window.ALLOWED_ROLES = ["management", "supervisor", "admin", "MAN", "man"];
}

// นำตัวแปรของ window มาสร้างตัวแปรท้องถิ่นไว้ใช้งานต่อในไฟล์แบบปลอดภัย
var sb = window.supabaseClient || window.sb;
var ALLOWED_ROLES = window.ALLOWED_ROLES;

const LOGIN_PAGE = "login.html";
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

let databaseRetryCount = 0;
const MAX_DATABASE_RETRIES = 10;

async function loadAndProcessDashboardData() {
  try {
    // 1. ตรวจสอบและดึงข้อมูลจาก Supabase
    if (!window.pvtDashboardRawCache) {
      console.log('[database_connected] กำลังดึงข้อมูลสดจาก Supabase...');
      const client = window.supabaseClientInstance || window.supabase;
      if (!client || typeof client.from !== 'function') {
        throw new Error('Supabase Client ยังตั้งค่าไม่สมบูรณ์ หรือตัวแปรหลุดหาย');
      }

      const { data, error } = await client
        .from('daily_waste_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      window.pvtDashboardRawCache = data || [];
    }

    let records = window.pvtDashboardRawCache;
    console.log(`[ui_update] โหลดดาต้าสำเร็จจำนวน: ${records.length} รายการ`);

    // 🎨 2. รันฟังก์ชันพื้นฐานของระบบเดิม (ดักจับเซฟตี้แยกชิ้น)
    try { if (typeof window.renderReportTable === 'function') window.renderReportTable(records); } catch(e){ console.error('Table Error:', e); }
    try { if (typeof window.updateMetricCards === 'function') window.updateMetricCards(records); } catch(e){ console.error('Cards Error:', e); }
    try { if (typeof window.renderPivotSummaryTable === 'function') window.renderPivotSummaryTable(records); } catch(e){ console.error('Pivot Error:', e); }

    // 📊 3. เตรียมตัวแปรคำนวณแยกมิติ
    const monthLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const monthlyCounts = Array(12).fill(0);
    const monthlyWeights = Array(12).fill(0);
    const weeklyWeights = {};
    let totalWasteWeight = 0;

    // ลอจิกหาเลขสัปดาห์แบบคณิตศาสตร์เพียวๆ ป้องกัน NaN
    function getWeekNumber(date) {
      if (!date || isNaN(date.getTime())) return 0;
      const start = new Date(date.getFullYear(), 0, 1);
      const diff = date - start + ((start.getDay() + 1) * 86400000);
      return Math.ceil(diff / 604800000);
    }

    // 🔄 วนลูปคัดกรองข้อมูลลงถังสะสมแบบมีเซฟตี้ทุกแถว
    records.forEach(row => {
      if (!row) return;
      const wasteWeight = parseFloat(row.waste_qty || row.waste_weight_kg || 0);
      totalWasteWeight += wasteWeight;

      const dateStr = row.report_date || row.created_at;
      if (dateStr) {
        const cleanStr = String(dateStr).substring(0, 10);
        const dateObj = new Date(cleanStr);

        if (!isNaN(dateObj.getTime())) {
          // ลงถังรายเดือน
          const mIdx = dateObj.getMonth();
          if (mIdx >= 0 && mIdx < 12) {
            monthlyCounts[mIdx] += 1;
            monthlyWeights[mIdx] += wasteWeight;
          }
          // ลงถังรายสัปดาห์
          const wNum = getWeekNumber(dateObj);
          if (wNum > 0 && wNum <= 54) {
            weeklyWeights[`สัปดาห์ที่ ${wNum}`] = (weeklyWeights[`สัปดาห์ที่ ${wNum}`] || 0) + wasteWeight;
          }
        }
      }
    });

    // ✍️ 4. อัปเดตกล่อง Insight ข้อความ
    const execBox = document.getElementById('exec-insight-box');
    if (execBox) {
      execBox.innerHTML = `🎯 <strong>วิเคราะห์ภาพรวม:</strong> ยอดรวมของเสียสะสมทั้งหมด <strong>${totalWasteWeight.toLocaleString()} kg</strong> กระจายข้อมูลลงกราฟแท่งรายสัปดาห์และรายเดือนเรียบร้อยแล้วครับพี่`;
    }

    // 📊 5. [ปรับปรุงใหม่] กล่องวาดกราฟ "แท่ง" รายสัปดาห์ (Weekly Bar Chart)
    try {
      const weeklyCanvas = document.getElementById('chart-waste-weekly-line'); // ใช้ canvas id เดิมได้เลย ไม่ต้องแก้ HTML
      if (weeklyCanvas && typeof Chart !== 'undefined') {
        // จัดเรียงลำดับสัปดาห์จากน้อยไปมาก (สัปดาห์ที่ 1 -> 52)
        const sortedWeeks = Object.keys(weeklyWeights).sort((a, b) => parseInt(a.replace('สัปดาห์ที่ ', '')) - parseInt(b.replace('สัปดาห์ที่ ', '')));
        const sortedValues = sortedWeeks.map(w => weeklyWeights[w]);

        if (window.myGlobalWeeklyChart) { window.myGlobalWeeklyChart.destroy(); }
        window.myGlobalWeeklyChart = new Chart(weeklyCanvas.getContext('2d'), {
          type: 'bar', // 🎯 เปลี่ยนจาก 'line' เป็น 'bar' ตามสั่งครับพี่
          data: {
            labels: sortedWeeks.length > 0 ? sortedWeeks : ['ไม่มีข้อมูล'],
            datasets: [{ 
              label: 'ปริมาณของเสียรายอาทิตย์ (kg)', 
              data: sortedValues.length > 0 ? sortedValues : [0], 
              backgroundColor: '#f6c23e', // เปลี่ยนเป็นสีเหลืองส้มสไตล์ Warning ให้เด่นตา
              borderRadius: 4,
              borderWidth: 0
            }]
          },
          options: { 
            responsive: true, 
            maintainAspectRatio: false,
            scales: {
              y: { beginAtZero: true, title: { display: true, text: 'น้ำหนัก (kg)' } }
            }
          }
        });
        console.log('[chart_success] อัปเดตกราฟรายสัปดาห์เป็นกราฟแท่งสำเร็จ');
      }
    } catch(err) { console.error('Weekly Chart Crash:', err); }

    // 📊 6. กล่องวาดกราฟแท่งจำนวนครั้งรายเดือน
    try {
      const countCanvas = document.getElementById('chart-problem-count-bar');
      if (countCanvas && typeof Chart !== 'undefined') {
        if (window.myGlobalCountChart) { window.myGlobalCountChart.destroy(); }
        window.myGlobalCountChart = new Chart(countCanvas.getContext('2d'), {
          type: 'bar',
          data: {
            labels: monthLabels,
            datasets: [{ label: 'จำนวนครั้งที่เกิดปัญหา (ครั้ง)', data: monthlyCounts, backgroundColor: '#4e73df', borderRadius: 4 }]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });
      }
    } catch(err) { console.error('Count Chart Crash:', err); }

    // 📊 7. กล่องวาดกราฟแท่งน้ำหนักรายเดือน
    try {
      const weightCanvas = document.getElementById('chart-waste-weight-bar');
      if (weightCanvas && typeof Chart !== 'undefined') {
        if (window.myGlobalWeightChart) { window.myGlobalWeightChart.destroy(); }
        window.myGlobalWeightChart = new Chart(weightCanvas.getContext('2d'), {
          type: 'bar',
          data: {
            labels: monthLabels,
            datasets: [{ label: 'น้ำหนักของเสียรวมรายเดือน (kg)', data: monthlyWeights, backgroundColor: '#1cc88a', borderRadius: 4 }]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });
      }
    } catch(err) { console.error('Weight Chart Crash:', err); }

    // 🍩 8. กราฟโดนัทแผนกเดิม
    try {
      if (typeof window.getDepartmentCounters === 'function' && typeof window.renderDepartmentDonutChart === 'function') {
        window.renderDepartmentDonutChart(window.getDepartmentCounters(records));
      }
    } catch(e) { console.error('Donut Chart Crash:', e); }

  } catch (err) {
    console.error('[database_error] วงจรหลักแดชบอร์ดขัดข้อง:', err.message || err);
  }
}
// 3. ผูกระบบให้เปิดงานทันทีเมื่อโหลดหน้าเว็บสำเร็จ
window.addEventListener('DOMContentLoaded', () => {
  loadAndProcessDashboardData();
});

window.loadAndProcessDashboardData = loadAndProcessDashboardData;
function updateMetricCards(records) {
  if (!Array.isArray(records)) return;

  // แสดงจำนวนรวมทั้งหมดจากตาราง pvt_production_reports
  setText("cnt-total", records.length);
  
  // กรองนับจำนวนแยกตามสถานะ
  setText(
    "cnt-pending",
    records.filter((r) => r.status === "pending" || !r.status).length
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

function getDepartmentCounters(records) {
  const counters = {};
  records.forEach(row => {
    // 🎯 แก้จาก row.department เป็น row.department_code
    const dept = row.department_code || 'ไม่ระบุแผนก'; 
    counters[dept] = (counters[dept] || 0) + 1;
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

  // แก้ไขเปลี่ยน escapeHTML และ escapeAttr เป็น escapeHtml พร้อมถอดอิโมจิออกทั้งหมด
  tr.innerHTML = `
    <td class="nowrap strong">${escapeHtml(renderedDate)}</td>
    <td>
      <span class="btn-dept d-${escapeHtml(dept)} dept-pill">
        ${escapeHtml((row.department || "-").toUpperCase())}
      </span>
    </td>
    <td class="machine-cell">${escapeHtml(row.machine_no || "-")}</td>
    <td class="strong">${escapeHtml(row.problem_type || "-")}</td>
    <td><div class="cell-detail">${escapeHtml(row.detail || row.note || "-")}</div></td>
    <td><span class="reporter-code">${escapeHtml(row.reported_by || "คนงาน")}</span></td>
    <td>
      <div class="status-space">${getStatusBadge(row.status)}</div>
      <select class="select-inline-status" onchange="executeModifyCaseStatus('${escapeHtml(row.id)}', this.value)">
        <option value="pending" ${row.status === "pending" || !row.status ? "selected" : ""}>ตั้งรับเรื่อง</option>
        <option value="progress" ${row.status === "progress" ? "selected" : ""}>กำลังซ่อม</option>
        <option value="resolved" ${row.status === "resolved" ? "selected" : ""}>ปิดงาน</option>
      </select>
    </td>
    <td>
      <input
        type="text"
        class="input-inline-note"
        placeholder="พิมพ์ข้อสั่งการ/วิธีแก้ไข..."
        value="${escapeHtml(row.resolution || "")}"
        onchange="executeModifyCaseResolution('${escapeHtml(row.id)}', this.value)"
      />
      ${row.resolver ? `<small class="small-note">ผู้สั่งงานล่าสุด: <strong>${escapeHtml(row.resolver)}</strong></small>` : ""}
    </td>
  `;

  tbody.appendChild(tr);
});

function getStatusBadge(status) {
  if (status === "progress") {
    return `<span class="badge-status status-progress">กำลังซ่อม</span>`;
  }

  if (status === "resolved") {
    return `<span class="badge-status status-resolved">ปิดงานสำเร็จ</span>`;
  }

  return `<span class="badge-status status-pending">รอดำเนินการ</span>`;
}

// =========================================================
// CHARTS
// =========================================================

// 📊 ฟังก์ชันสร้างกราฟแท่งแนวโน้มการเกิดปัญหาประจำปี (แยกโครงสร้างละเอียด)
// 🚀 วางทับแทนฟังก์ชัน renderMonthlyMachineChart เดิมได้เลยครับพี่
function renderMonthlyMachineChart(records) {
  const canvas = document.getElementById('chart-monthly-bar'); 
  if (!canvas) return;

  // 🛡️ 1. สลายร่างกราฟเก่าในระบบป้องกันปัญหา Canvas ซ้ำซ้อน
  if (typeof window.myGlobalMachineBarChart !== 'undefined' && window.myGlobalMachineBarChart !== null) {
    try {
      window.myGlobalMachineBarChart.destroy();
      window.myGlobalMachineBarChart = null;
      console.log('[chart_cleanup] ทำลายกราฟแท่งเครื่องจักรตัวเก่าสำเร็จ');
    } catch (destroyError) {
      console.warn('[chart_cleanup_warn] ไม่สามารถทำลายกราฟแท่งได้:', destroyError);
    }
  }

  try {
    const ctx = canvas.getContext('2d');

    // เตรียมโครงสร้างเดือน ม.ค. - ธ.ค.
    const labels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const dataValues = Array(12).fill(0);

    // 🔄 2. ลอจิกใหม่: เปลี่ยนจากวิ่งหา object มาคัดแยก Array ดิบของตาราง daily_waste_reports
    if (Array.isArray(records)) {
      records.forEach(row => {
        // 🎯 ดึงคอลัมน์วันที่จริง 'report_date' (จาก Log: 2026-06-17)
        const dateStr = row.report_date || row.created_at;
        
        if (dateStr) {
          const dateObj = new Date(dateStr);
          const monthIndex = dateObj.getMonth(); // ม.ค. = 0, มิ.ย. = 5, ธ.ค. = 11

          if (monthIndex >= 0 && monthIndex < 12) {
            // 💡 หยอดสถิตินับจำนวนครั้งสะสม หรือจะเปลี่ยนเป็นบวกค่า row.waste_qty ก็ได้ครับ
            dataValues[monthIndex] += 1; 
          }
        }
      });
    }

    console.log('[chart_debug] ผลรวมจำนวนปัญหาแยกตาม 12 เดือนที่คัดเสร็จแล้ว:', dataValues);

    // 🎨 3. สั่งวาดกราฟแท่งตัวใหม่
    window.myGlobalMachineBarChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'แนวโน้มการรายงานของเสียรายเดือน (ครั้ง)',
          data: dataValues,
          backgroundColor: '#3b82f6', 
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { 
            beginAtZero: true,
            ticks: { stepSize: 1 } // เหมาะสำหรับตอนเริ่มต้นที่ยังมีข้อมูลน้อย (5 รายการ)
          }
        }
      }
    });

  } catch (err) {
    console.error('[chart_error] ฟังก์ชัน renderMonthlyMachineChart ทำงานล้มเหลว:', err.message || err);
  }
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
  // ตัวอย่างกรณีใช้ SweetAlert2 เพื่อยิงไอคอนระบบขึ้นมาโชว์คู่กับข้อความเตือน
if (!startInput || !endInput) {
  Swal.fire({
    title: 'แจ้งเตือนระบบ',
    html: '<div style="display: flex; align-items: center; justify-content: center; gap: 8px;"><span class="material-symbols-outlined" style="color: #f59e0b; font-size: 28px;">calendar_month</span> กรุณาเลือกวันที่เริ่มต้นและสิ้นสุดให้ครบถ้วนก่อนกดค้นหาครับ</div>',
    icon: 'warning',
    confirmButtonText: 'ตกลง'
  });
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
// 1. ประกาศตัวแปร Global ไว้บนสุดนอกฟังก์ชัน (เพื่อใช้จำว่าตอนนี้มีกราฟวาดค้างอยู่ไหม)
let departmentDonutChartInstance = null;
let monthlyBarChartInstance = null;

function renderDepartmentDonutChart(counters) {
  const canvas = document.getElementById('chart-dept-donut');
  if (!canvas) return;

  // 🛡️ เปลี่ยนมาใช้ window.myGlobalDonutChart ในการจดจำและเช็กสถานะกราฟเก่า
  if (typeof window.myGlobalDonutChart !== 'undefined' && window.myGlobalDonutChart !== null) {
    try {
      window.myGlobalDonutChart.destroy();
      window.myGlobalDonutChart = null; // ล้างค่าทิ้งให้สะอาดเคลียร์หน่วยความจำ
      console.log('[chart_cleanup] ทำลายกราฟโดนัทตัวเก่าสำเร็จ');
    } catch (destroyError) {
      console.warn('[chart_cleanup_warn] ไม่สามารถทำลายกราฟได้อัตโนมัติ:', destroyError);
    }
  }

  try {
    const ctx = canvas.getContext('2d');
    const labels = Object.keys(counters);
    const dataValues = Object.values(counters);

    // 🎨 สร้างกราฟใหม่และจัดเก็บไว้ที่เซฟกลางของบราวเซอร์ (window)
    window.myGlobalDonutChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: dataValues,
          backgroundColor: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#6366f1', '#ec4899']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  } catch (err) {
    console.error('[chart_error] กราฟโดนัทพัง:', err.message || err);
  }
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
  // ดักจับ Element กล่องข้อความสรุปผู้บริหาร
  const summaryBox = document.getElementById('executive-summary-box') || document.querySelector('.psychology + div') || document.getElementById('insight-container');
  
  if (!records || records.length === 0) {
    if (summaryBox) summaryBox.textContent = "ไม่พบข้อมูลรายงานของเสียในระบบ";
    return;
  }

  try {
    let totalWaste = 0;
    records.forEach(row => {
      // 🎯 ดึงคอลัมน์จำนวนของเสียจริงมาคำนวณ
      totalWaste += parseFloat(row.waste_qty || row.waste_weight_kg || 0);
    });

    // ✍️ จุดสำคัญ: สั่งเขียนข้อความทับคำว่า "กำลังวิเคราะห์..." ทันที
    if (summaryBox) {
      summaryBox.textContent = `วิเคราะห์ภาพรวมสำเร็จ: มีรายงานทั้งหมด ${records.length} รายการ พบยอดของเสียสะสมรวม ${totalWaste.toLocaleString()} kg โดยระบบตรวจพบความเคลื่อนไหวล่าสุดในกะการทำงานปัจจุบัน`;
    }

    // 🎯 ถ้ามีกล่องข้อความ "สรุปปัญหาอัตโนมัติ" ตัวบนด้วย ให้เคลียร์คำว่า "กำลังวิเคราะห์..." ของมันออกด้วยครับ
    const autoSummaryBox = document.getElementById('auto-summary-box') || document.querySelector('.art_toy + div');
    if (autoSummaryBox) {
      autoSummaryBox.textContent = `พบรายการของเสียล่าสุดประจำวันที่เรียบร้อยแล้ว`;
    }

  } catch (err) {
    console.error('[insight_error]', err);
  }
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
  window.location.href = "login.html";
}

window.handleDashboardLogout = handleDashboardLogout;

// =========================================================
// HELPERS
// =========================================================


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
     sheet.getCell('J1').value = 'เลือกตัวกรองเดือน (คลิกเลือก)';
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ผูกฟังก์ชันเข้าหน้าต่างระบบเพื่อให้ปุ่มหน้า HTML วิ่งมาเรียกเจอแน่นอน
window.exportComplexPivotExcel = exportComplexPivotExcel;
// 🔗 แปะเพิ่มที่บรรทัดท้ายสุดของไฟล์ เพื่อทำป้ายชื่อเล่นผูกสัญญาณข้ามหากันอัตโนมัติ
window.renderDoughnutChart = window.renderDepartmentDonutChart;
}
window.addEventListener('DOMContentLoaded', () => {
  loadAndProcessDashboardData();
});
