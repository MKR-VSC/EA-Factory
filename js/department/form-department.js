// =========================================================
// ไฟล์: js/form-department.js
// ใช้กับหน้า form-department.html
// รองรับลิงก์ QR แยกแผนก เช่น form-department.html?dept=BLOW
// รองรับลิงก์ QR รายเครื่อง เช่น form-department.html?dept=BLOW&machine=BLOW-01
// =========================================================

// =========================================================
// CONFIG: รหัสแผนกมาตรฐานจากตาราง master_departments.department_code
// ---------------------------------------------------------
// สำคัญมาก:
// - ระบบใหม่ยึด master_departments เป็นตารางหลักของแผนก
// - ทุกตารางที่มี department_code ต้องใช้รหัสชุดนี้เท่านั้น
// - ห้ามบันทึกเป็นชื่อไทย เช่น "โมโน", "เป่าถุง", "ตัดเจาะ"
// =========================================================

const VALID_DEPARTMENTS = [
  "PIPE",
  "MONO",
  "RAIN_TAPE",
  "BLOW",
  "BLOWN_FILM",
  "SHEET_CUTTING",
  "CUT_PUNCH",
  "GARBAGE_BAG_CUT",
  "RAIN_TAPE_CUT_PUNCH",
  "SHADE_NET",
];

// ชื่อที่ใช้แสดงบนหน้าเว็บเท่านั้น
// แต่ค่าที่บันทึกลงฐานข้อมูลยังเป็น department_code ภาษาอังกฤษตัวใหญ่
const DEPARTMENT_NAMES = {
  PIPE: "ท่อ",
  MONO: "โมโน",
  RAIN_TAPE: "เป่าเทปน้ำพุ่ง",
  BLOW: "เป่าถุง",
  BLOWN_FILM: "เป่าฟิล์ม",
  SHEET_CUTTING: "ตัดผืน",
  CUT_PUNCH: "ตัดเจาะ",
  GARBAGE_BAG_CUT: "ตัดถุงขยะ",
  RAIN_TAPE_CUT_PUNCH: "ตัดเทปน้ำพุ่ง",
  SHADE_NET: "สแลน",
};

// =========================================================
// URL / USER / DEPARTMENT STATE
// =========================================================

// อ่านค่าจาก URL เพื่อรองรับ QR Code
// ตัวอย่าง QR แผนก:       form-department.html?dept=BLOW
// ตัวอย่าง QR รายเครื่อง: form-department.html?dept=BLOW&machine=BLOW-01
//
// หมายเหตุ:
// - dept ใช้สำหรับล็อกแผนก
// - machine ใช้สำหรับเลือก/ล็อกเครื่องจักรให้อัตโนมัติ
// - ถ้าไม่มี machine ระบบยังให้พนักงานเลือกเครื่องเองได้เหมือนเดิม
const urlParams = new URLSearchParams(window.location.search);
const deptFromUrl = urlParams.get("dept");
const machineFromUrl = urlParams.get("machine");

// ใช้ตัวแปร QR_... เพื่อให้อ่านง่ายทั้งไฟล์
// ถ้าวันหลังกลับมาแก้ จะรู้ทันทีว่าค่านี้มาจาก QR/URL
const QR_DEPT = deptFromUrl;
const QR_MACHINE = normalizeMachineNo(machineFromUrl);

const activeRoleRaw = localStorage.getItem("activeRole") || "staff";
const activeUserId = localStorage.getItem("activeUserId") || "";

const currentDeptRaw = QR_DEPT || localStorage.getItem("activeDept") || "";

let currentDept = normalizeDept(currentDeptRaw);
let appSelectedMachine = QR_MACHINE || "";
let appSelectedProblem = "";

// เก็บรายละเอียดเมื่อเลือกประเภทปัญหาเป็น "อื่นๆ"
// เหตุผลที่ต้องเก็บแยก:
// - problem_type ยังเก็บเป็น "อื่นๆ" เพื่อคงหมวดหลัก
// - other_problem_detail เก็บคำอธิบายจริง เพื่อเอาไปวิเคราะห์ภายหลัง
// - reason_detail จะเก็บข้อความวิเคราะห์ง่าย เช่น "อื่นๆ: ลูกกลิ้งมีรอย"
let appOtherProblemDetail = "";

// ถ้า dept ที่ได้มาไม่ถูกต้อง ให้หยุดก่อน เพื่อกัน Foreign Key Error
if (!VALID_DEPARTMENTS.includes(currentDept)) {
  console.error(`[DEPT_ERROR] ไม่พบแผนก: ${currentDeptRaw}`);

  alert(
    `ไม่พบแผนกของผู้ใช้งาน (${currentDeptRaw})\nกรุณาตรวจสอบ department_code ในตาราง profiles`,
  );

  window.location.href = "/login.html";

  throw new Error("INVALID_DEPARTMENT");
}

// จำแผนกที่ผ่านการตรวจแล้วไว้ในเครื่อง
localStorage.setItem("activeDept", currentDept);

// =========================================================
// DEPARTMENT HELPERS
// =========================================================

function normalizeDept(dept) {
  // รับได้ทั้งรหัสเก่า / รหัสใหม่ / ชื่อไทย
  // แล้วแปลงให้เป็นรหัสมาตรฐานจาก master_departments.department_code เสมอ
  const raw = String(dept || "BLOW").trim();
  const key = raw.toLowerCase();

  const map = {
    // ===== รหัสมาตรฐานใหม่ =====
    pipe: "PIPE",
    mono: "MONO",
    rain_tape: "RAIN_TAPE",
    blow: "BLOW",
    blown_film: "BLOWN_FILM",
    sheet_cutting: "SHEET_CUTTING",
    cut_punch: "CUT_PUNCH",
    garbage_bag_cut: "GARBAGE_BAG_CUT",
    rain_tape_cut_punch: "RAIN_TAPE_CUT_PUNCH",
    shade_net: "SHADE_NET",

    // ===== รหัสเก่าจากระบบเดิม / QR เดิม =====
    print: "BLOWN_FILM",
    sheet: "SHEET_CUTTING",
    tape: "RAIN_TAPE",
    drill: "CUT_PUNCH",
    garbage: "GARBAGE_BAG_CUT",

    // ===== ชื่อไทย / คำที่พนักงานหรือข้อมูลเก่าอาจใช้อยู่ =====
    โมโน: "MONO",
    แผนกโมโน: "MONO",

    ท่อ: "PIPE",
    แผนกท่อ: "PIPE",

    เป่าถุง: "BLOW",
    แผนกเป่าถุง: "BLOW",

    เป่าฟิล์ม: "BLOWN_FILM",
    เป่าพิล์ม: "BLOWN_FILM",
    ม้วนพิมพ์: "BLOWN_FILM",
    แผนกเป่าฟิล์ม: "BLOWN_FILM",

    ตัดผืน: "SHEET_CUTTING",
    แผ่นหล่อ: "SHEET_CUTTING",
    แผนกแผ่นหล่อ: "SHEET_CUTTING",
    "แผนกแผ่นหล่อ/ตัดผืน": "SHEET_CUTTING",

    ตัดเจาะ: "CUT_PUNCH",
    เจาะรู: "CUT_PUNCH",
    แผนกตัดเจาะ: "CUT_PUNCH",

    ถุงขยะ: "GARBAGE_BAG_CUT",
    ตัดถุงขยะ: "GARBAGE_BAG_CUT",
    แผนกถุงขยะ: "GARBAGE_BAG_CUT",

    เทป: "RAIN_TAPE",
    เทปน้ำพุ่ง: "RAIN_TAPE",
    เป่าเทปน้ำพุ่ง: "RAIN_TAPE",
    เทปสายฝน: "RAIN_TAPE",
    เทปพัน: "RAIN_TAPE",
    แผนกเทปพัน: "RAIN_TAPE",
    "แผนกเทปพัน/เทปน้ำพุ่ง": "RAIN_TAPE",

    ตัดเทปน้ำพุ่ง: "RAIN_TAPE_CUT_PUNCH",
    ตัดเทปน้ำพุง: "RAIN_TAPE_CUT_PUNCH",
    ตัดและเจาะเทปน้ำพุ่ง: "RAIN_TAPE_CUT_PUNCH",

    สแลน: "SHADE_NET",
    ตาข่ายกรองแสง: "SHADE_NET",
    แผนกสแลน: "SHADE_NET",
  };

  return map[key] || raw.toUpperCase();
}

// แปลง department_code เป็นชื่อ class สำหรับ CSS
// เช่น BLOWN_FILM -> dept-blown-film
function getDeptCssClass(dept) {
  return String(dept || "")
    .toLowerCase()
    .replaceAll("_", "-");
}

// แปลงค่าเครื่องจักรจาก URL ให้สะอาดก่อนใช้งาน
// เช่น URL อาจส่งมาเป็น " BLOW-01 " หรือมี encoding จาก QR
// เรา trim ก่อน เพื่อไม่ให้ value ผิดตอนเทียบกับ dropdown
function normalizeMachineNo(machineNo) {
  return String(machineNo || "").trim();
}

function getDeptDisplayName(dept) {
  return DEPARTMENT_NAMES[dept] || dept || "-";
}

function validateCurrentDept() {
  if (!VALID_DEPARTMENTS.includes(currentDept)) {
    alert(
      `รหัสแผนกไม่ถูกต้อง: ${currentDept}\n\nกรุณาตรวจสอบลิงก์ QR หรือค่า dept ใน URL`,
    );
    return false;
  }

  return true;
}

// =========================================================
// ROLE / USER HELPERS
// =========================================================

function normalizeRole(role) {
  return String(role || "")
    .toLowerCase()
    .trim();
}

function isStaffRole(role) {
  const r = normalizeRole(role);

  return ["staff", "user", "employee", "พนักงาน", "พนักงานทั่วไป"].includes(r);
}

function canSeeDashboard(role) {
  const r = normalizeRole(role);

  return [
    "admin",
    "accounting",
    "supervisor",
    "management",
    "manager",
    "executive",
    "หัวหน้า",
    "บัญชี",
    "ผู้บริหาร",
  ].includes(r);
}

function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

function getActiveUserName() {
  return (
    localStorage.getItem("activeName") ||
    localStorage.getItem("activeUser") ||
    ""
  ).trim();
}

function setActiveUserName(name) {
  const cleanName = String(name || "").trim();

  localStorage.setItem("activeUser", cleanName);
  localStorage.setItem("activeName", cleanName);
  localStorage.setItem(
    "activeRole",
    localStorage.getItem("activeRole") || "staff",
  );
}

// =========================================================
// AUTO LOGOUT
// =========================================================

const AUTO_LOGOUT_MINUTES = 5;
let autoLogoutTimer = null;

function startAutoLogoutTimer() {
  resetAutoLogoutTimer();

  ["click", "keydown", "touchstart", "mousemove", "scroll"].forEach(
    (eventName) => {
      window.addEventListener(eventName, resetAutoLogoutTimer, {
        passive: true,
      });
    },
  );
}

function resetAutoLogoutTimer() {
  clearTimeout(autoLogoutTimer);

  autoLogoutTimer = setTimeout(
    () => {
      forceLogoutByIdle();
    },
    AUTO_LOGOUT_MINUTES * 60 * 1000,
  );
}

async function forceLogoutByIdle() {
  try {
    const clientSupabase = window.supabaseClient;

    if (clientSupabase?.auth) {
      await clientSupabase.auth.signOut();
    }
  } catch (err) {
    console.warn(err);
  }

  localStorage.clear();

  alert("ไม่มีการใช้งานเกิน 5 นาที ระบบออกจากระบบอัตโนมัติ");

  window.location.href = "/login.html";
}

// =========================================================
// INIT
// =========================================================

window.addEventListener("DOMContentLoaded", async () => {
  try {
    if (
      typeof window.protectPage === "function" &&
      localStorage.getItem("activeUserId")
    ) {
      const canContinue = window.protectPage();
      if (!canContinue) return;
    }

    // logout auto
    startAutoLogoutTimer();

    // ถ้าเปิดจาก QR ให้จับเวลาไม่ใช้งานอีกชั้น
    // กันเครื่องค้างอยู่หน้าฟอร์มหลังสแกน QR
    startQrIdleLogout();

    if (!validateCurrentDept()) return;

    renderDeptInfo();
    renderUserInfo();
    setupStaffNameBeforeUse();

    setupQrContextCard();

    setupDashboardMenu();
    setupDefaultDateTime();
    setupNetworkStatus();
    setupFormSubmit();
    setupDropdownListeners();
    setupOtherProblemModal();
    renderCurrentDeptLabel();

    await loadShiftOptions();
    await loadMasterDataAndRender();

    applyQrMachineLock();

    // ✅ บันทึก Log ว่ามีการเปิดฟอร์ม
    if (typeof logActivity === "function") {
      logActivity("OPEN_FORM", {
        note: `เปิดฟอร์มแผนก ${currentDept}${
          QR_MACHINE ? ` เครื่อง ${QR_MACHINE}` : ""
        }`,
      });
    }
  } catch (err) {
    console.error("[Init_Error]", err);
    alert("เกิดข้อผิดพลาดตอนเปิดหน้าฟอร์ม: " + (err.message || err));
  } finally {
    hideSplash();
  }
});
// =========================================================
// STAFF NAME MODAL
// =========================================================

function setupStaffNameBeforeUse() {
  const role = normalizeRole(activeRoleRaw);

  // staff ต้องกรอกชื่อทุกครั้ง
  if (isStaffRole(role)) {
    localStorage.removeItem("activeUser");
    localStorage.removeItem("activeName");
    renderUserInfo();
    openStaffNameModal(false);
    return;
  }

  // role อื่นใช้ชื่อจาก login ได้เลย
  const savedName = getActiveUserName();

  if (!savedName) {
    openStaffNameModal(false);
    return;
  }

  closeStaffNameModal();
}

function openStaffNameModal(allowChange = true) {
  const modal = document.getElementById("staff-name-modal");
  const input = document.getElementById("staff-name-input");

  if (!modal) return;

  if (input) {
    input.value = allowChange ? getActiveUserName() : "";
    setTimeout(() => input.focus(), 80);
  }

  modal.classList.remove("hidden");
}

function closeStaffNameModal() {
  const modal = document.getElementById("staff-name-modal");
  if (modal) modal.classList.add("hidden");
}

function confirmStaffName() {
  const input = document.getElementById("staff-name-input");
  const name = input?.value.trim() || "";

  if (!name) {
    alert("กรุณากรอกชื่อผู้บันทึกข้อมูลก่อนค่ะ");
    input?.focus();
    return;
  }

  setActiveUserName(name);
  renderUserInfo();
  closeStaffNameModal();

  // ✅ บันทึก log หลังจากมีชื่อแล้ว
  if (typeof logActivity === "function") {
    logActivity("STAFF_NAME_CONFIRMED", {
      note: `พนักงานระบุชื่อ: ${name} / แผนก ${currentDept}`,
    });
  }
}

// =========================================================
// USER INFO
// =========================================================

function renderUserInfo() {
  const usernameEl = document.getElementById("display-username");
  if (!usernameEl) return;

  usernameEl.textContent = getActiveUserName() || "ยังไม่ได้ระบุชื่อ";
}

// =========================================================
// SPLASH / OVERLAY
// =========================================================

function hideSplash() {
  setTimeout(() => {
    const splash = document.getElementById("splash-screen");
    if (splash) splash.classList.add("hide");
  }, 600);
}

function showLoginOverlay(text = "กำลังบันทึกข้อมูล...") {
  const overlay = document.getElementById("login-overlay");
  if (!overlay) return;

  const title = overlay.querySelector("h3");
  const desc = overlay.querySelector("p");

  if (title) title.textContent = text;
  if (desc) desc.textContent = "กรุณารอสักครู่";

  overlay.classList.remove("hidden");
}

function hideLoginOverlay() {
  const overlay = document.getElementById("login-overlay");
  if (overlay) overlay.classList.add("hidden");
}

// =========================================================
// DEPARTMENT UI
// =========================================================

function renderDeptInfo() {
  const deptName = getDeptDisplayName(currentDept);

  const titleEl = document.getElementById("dept-title-main");
  const badgeEl = document.getElementById("dept-badge-name");
  const bodyEl = document.getElementById("dept-body");

  if (titleEl) {
    titleEl.innerHTML = `
      <span class="material-symbols-outlined">assignment</span>
      ฟอร์มบันทึกข้อมูลปัญหา${deptName}
    `;
  }

  if (badgeEl) {
    badgeEl.textContent = `DEPT: ${deptName}`;
  }

  if (bodyEl) {
    bodyEl.classList.remove("dept-default");
    VALID_DEPARTMENTS.forEach((dept) => {
      bodyEl.classList.remove(`dept-${getDeptCssClass(dept)}`);
    });
    bodyEl.classList.add(`dept-${getDeptCssClass(currentDept)}`);
  }
}

function renderCurrentDeptLabel() {
  const el = document.getElementById("current-dept-label");
  if (!el) return;

  const deptName = getDeptDisplayName(currentDept);
  el.textContent = `${deptName} (${currentDept})`;
}

// =========================================================
// QR CONTEXT UI
// =========================================================

function setupQrContextCard() {
  // ถ้าไม่ได้เปิดผ่าน QR ก็ไม่ต้องแสดงกล่องพิเศษ
  if (!QR_DEPT && !QR_MACHINE) return;

  ensureQrContextCardExists();
  ensureQrContextStyleExists();
  renderQrContext();
}

// สร้างกล่อง QR อัตโนมัติด้วย JS
// ทำแบบนี้เพื่อให้ไม่ต้องรีบแก้ HTML หลายจุด ถ้าหน้าเดิมยังไม่มี div นี้
function ensureQrContextCardExists() {
  if (document.getElementById("qr-context-card")) return;

  const form = document.getElementById("department-waste-form");
  if (!form) return;

  const card = document.createElement("div");
  card.id = "qr-context-card";
  card.className = "qr-context-card";
  card.innerHTML = `
    <div class="qr-context-row">
      <strong>📍 แผนก</strong>
      <span id="qr-dept-label">-</span>
    </div>
    <div class="qr-context-row">
      <strong>⚙️ เครื่องจักร</strong>
      <span id="qr-machine-label">-</span>
    </div>
    <small class="qr-context-help">
      ระบบเลือกข้อมูลจาก QR ให้แล้ว เพื่อลดการเลือกผิด
    </small>
  `;

  form.prepend(card);
}

// ใส่ CSS เฉพาะกล่อง QR ด้วย JS
// ถ้าวันหลังย้ายไปไฟล์ CSS หลักได้ ก็สามารถลบฟังก์ชันนี้ออกได้
function ensureQrContextStyleExists() {
  if (document.getElementById("qr-context-style")) return;

  const style = document.createElement("style");
  style.id = "qr-context-style";
  style.textContent = `
    .qr-context-card {
      margin: 0 0 20px;
      padding: 16px;
      border-radius: 18px;
      background: #ecfdf5;
      border: 1px solid #bbf7d0;
      color: #064e3b;
      display: grid;
      gap: 10px;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
    }

    .qr-context-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 18px;
    }

    .qr-context-row span {
      font-size: 20px;
      font-weight: 800;
      text-align: right;
    }

    .qr-context-help {
      color: #047857;
      font-size: 14px;
      line-height: 1.5;
    }

    .qr-locked-field {
      background: #f1f5f9 !important;
      color: #334155 !important;
      cursor: not-allowed;
      border-color: #cbd5e1 !important;
    }
  `;

  document.head.appendChild(style);
}

function renderQrContext() {
  const card = document.getElementById("qr-context-card");
  const deptLabel = document.getElementById("qr-dept-label");
  const machineLabel = document.getElementById("qr-machine-label");

  if (!card) return;

  card.style.display = "grid";

  if (deptLabel) {
    deptLabel.textContent = `${getDeptDisplayName(currentDept)} (${currentDept.toUpperCase()})`;
  }

  if (machineLabel) {
    machineLabel.textContent = QR_MACHINE || "เลือกเครื่องเอง";
  }
}

// ล็อกช่องเครื่องจักรเมื่อ QR ส่งค่า machine มา
// จุดสำคัญ: ฟังก์ชันนี้ต้องถูกเรียกหลัง renderMachineDropdown()
function applyQrMachineLock() {
  const machineSelect = document.getElementById("machine-no");
  if (!machineSelect || !QR_MACHINE) return;

  const hasMachineOption = Array.from(machineSelect.options).some(
    (option) => option.value === QR_MACHINE,
  );

  // ถ้าเครื่องจาก QR ไม่มีใน master data ให้เพิ่ม option ชั่วคราวไว้ก่อน
  // กันกรณี master data ยังไม่ครบ แต่หน้างานต้องบันทึกได้
  if (!hasMachineOption) {
    const option = document.createElement("option");
    option.value = QR_MACHINE;
    option.textContent = `${QR_MACHINE} (จาก QR)`;
    machineSelect.appendChild(option);
  }

  machineSelect.value = QR_MACHINE;
  appSelectedMachine = QR_MACHINE;

  // disabled ทำให้ผู้ใช้แก้ไม่ได้ และเวลาอ่านค่าด้วย JS ยังอ่านได้ปกติ
  // ใน handleFormSubmit เราก็มี fallback จาก QR_MACHINE อีกชั้น เพื่อกันค่าหาย
  machineSelect.disabled = true;
  machineSelect.classList.add("qr-locked-field");
}

function setupDashboardMenu() {
  const dashboardLink = document.getElementById("nav-dashboard-link");
  if (!dashboardLink) return;

  dashboardLink.style.display = canSeeDashboard(activeRoleRaw)
    ? "flex"
    : "none";
}

// =========================================================
// FORM SETUP
// =========================================================

function setupDefaultDateTime() {
  const input = document.getElementById("incident-datetime");
  if (!input) return;

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());

  input.value = now.toISOString().slice(0, 16);
}

function setupNetworkStatus() {
  const el = document.getElementById("network-status");
  if (!el) return;

  function updateStatus() {
    if (navigator.onLine) {
      el.innerHTML = `<span class="material-symbols-outlined">fiber_manual_record</span> ระบบออนไลน์`;
      el.className = "badge badge-status-online";
    } else {
      el.innerHTML = `<span class="material-symbols-outlined">fiber_manual_record</span> ระบบออฟไลน์`;
      el.className = "badge badge-status-offline";
    }
  }

  updateStatus();

  window.addEventListener("online", updateStatus);
  window.addEventListener("offline", updateStatus);
}

function setupFormSubmit() {
  const form = document.getElementById("department-waste-form");
  if (!form) return;

  form.addEventListener("submit", handleFormSubmit);
}

function setupDropdownListeners() {
  const machineSelect = document.getElementById("machine-no");
  const problemSelect = document.getElementById("problem-type");

  if (machineSelect) {
    machineSelect.addEventListener("change", (event) => {
      appSelectedMachine = event.target.value;
    });
  }

  if (problemSelect) {
    problemSelect.addEventListener("change", (event) => {
      appSelectedProblem = event.target.value;

      // ถ้าเลือก "อื่นๆ" ให้เด้งกล่องกรอกสาเหตุจริงทันที
      // เพราะถ้าไม่เก็บรายละเอียดเพิ่ม ข้อมูล "อื่นๆ" จะนำไปวิเคราะห์ต่อได้ยาก
      if (isOtherProblem(appSelectedProblem)) {
        openOtherProblemModal();
      } else {
        appOtherProblemDetail = "";
      }
    });
  }
}


// =========================================================
// OTHER PROBLEM MODAL
// ใช้เมื่อเลือกประเภทปัญหาเป็น "อื่นๆ"
// =========================================================

function setupOtherProblemModal() {
  ensureOtherProblemStyleExists();

  const input = document.getElementById("other-problem-input");

  // กด Ctrl+Enter เพื่อบันทึกรายละเอียดได้เร็วขึ้น
  if (input) {
    input.addEventListener("keydown", (event) => {
      if (event.ctrlKey && event.key === "Enter") {
        confirmOtherProblem();
      }
    });
  }
}

function isOtherProblem(value) {
  const text = String(value || "").trim().toLowerCase();

  return [
    "อื่นๆ",
    "อื่น ๆ",
    "other",
    "others",
    "other problem",
  ].includes(text);
}

function openOtherProblemModal() {
  const modal = document.getElementById("other-problem-modal");
  const input = document.getElementById("other-problem-input");

  if (!modal) {
    // fallback ถ้า HTML ยังไม่มี modal
    const text = prompt("กรุณาระบุว่า อื่นๆ คือปัญหาอะไร", appOtherProblemDetail || "");

    if (text === null) {
      clearOtherProblemSelection();
      return;
    }

    const cleanText = text.trim();

    if (!cleanText) {
      alert("กรุณาระบุรายละเอียดปัญหาอื่นๆ");
      clearOtherProblemSelection();
      return;
    }

    appOtherProblemDetail = cleanText;
    return;
  }

  if (input) {
    input.value = appOtherProblemDetail || "";
    setTimeout(() => input.focus(), 80);
  }

  modal.classList.remove("hidden");
}

function closeOtherProblemModal() {
  const modal = document.getElementById("other-problem-modal");
  if (modal) modal.classList.add("hidden");
}

function confirmOtherProblem() {
  const input = document.getElementById("other-problem-input");
  const value = input?.value.trim() || "";

  if (!value) {
    alert("กรุณาระบุว่า อื่นๆ คือปัญหาอะไร");
    input?.focus();
    return;
  }

  appOtherProblemDetail = value;
  closeOtherProblemModal();

  // ช่วยให้พนักงานเห็นในช่องรายละเอียดด้วย
  // ถ้ายังไม่ได้พิมพ์รายละเอียดเหตุการณ์ ระบบเติมข้อความตั้งต้นให้
  const noteInput = document.getElementById("problem-description");
  if (noteInput && !noteInput.value.trim()) {
    noteInput.value = `ปัญหาอื่นๆ: ${value}`;
  }
}

function cancelOtherProblem() {
  clearOtherProblemSelection();
  closeOtherProblemModal();
}

function clearOtherProblemSelection() {
  appOtherProblemDetail = "";

  const problemSelect = document.getElementById("problem-type");
  if (problemSelect) {
    problemSelect.value = "";
  }

  appSelectedProblem = "";
  appOtherProblemDetail = "";
}

function ensureOtherProblemStyleExists() {
  if (document.getElementById("other-problem-style")) return;

  const style = document.createElement("style");
  style.id = "other-problem-style";
  style.textContent = `
    .other-problem-modal {
      position: fixed;
      inset: 0;
      z-index: 100001;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(15, 23, 42, 0.65);
      -webkit-backdrop-filter: blur(7px);
      backdrop-filter: blur(7px);
    }

    .other-problem-modal.hidden {
      display: none;
    }

    .other-problem-box {
      width: min(480px, 100%);
      background: #ffffff;
      border-radius: 22px;
      padding: 26px;
      box-shadow: 0 24px 70px rgba(15, 23, 42, 0.28);
    }

    .other-problem-icon {
      width: 58px;
      height: 58px;
      display: grid;
      place-items: center;
      border-radius: 18px;
      background: #fef3c7;
      color: #b45309;
      margin-bottom: 14px;
    }

    .other-problem-icon .material-symbols-outlined {
      font-size: 34px;
    }

    .other-problem-box h3 {
      margin: 0 0 8px;
      font-size: 22px;
      color: #0f172a;
    }

    .other-problem-box p,
    .other-problem-box small {
      color: #64748b;
      line-height: 1.6;
    }

    .other-problem-box label {
      display: block;
      margin: 16px 0 8px;
      font-weight: 700;
      color: #0f172a;
    }

    .other-problem-box textarea {
      width: 100%;
      padding: 14px 16px;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      font-family: inherit;
      font-size: 16px;
      outline: none;
      resize: vertical;
    }

    .other-problem-box textarea:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.14);
    }

    .other-problem-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 16px;
    }

    .btn-other-cancel,
    .btn-other-save {
      border: 0;
      border-radius: 12px;
      padding: 12px 16px;
      font-family: inherit;
      font-weight: 800;
      cursor: pointer;
    }

    .btn-other-cancel {
      background: #e2e8f0;
      color: #334155;
    }

    .btn-other-save {
      background: #2563eb;
      color: #ffffff;
    }

    @media (max-width: 640px) {
      .other-problem-actions {
        flex-direction: column-reverse;
      }

      .btn-other-cancel,
      .btn-other-save {
        width: 100%;
      }
    }
  `;

  document.head.appendChild(style);
}


// =========================================================
// MASTER DATA
// =========================================================

async function loadMasterDataAndRender() {
  const BACKUP_MACHINES = {
    PIPE: ["ท่อ1", "ท่อ2", "ท่อ3", "ท่อ4"],
    MONO: ["MONO-01", "MONO-02"],
    RAIN_TAPE: ["Tape1", "Tape2"],
    BLOW: ["F1", "F2", "F3", "F4", "F5", "F6", "F7"],
    BLOWN_FILM: ["Film1", "Film2", "Film3"],
    SHEET_CUTTING: ["Sheet1", "Sheet2"],
    CUT_PUNCH: ["Drill1", "Drill2"],
    GARBAGE_BAG_CUT: ["Garbage1", "Garbage2"],
    RAIN_TAPE_CUT_PUNCH: ["RT-Drill1", "RT-Drill2"],
    SHADE_NET: ["ShadeNet1", "ShadeNet2"],
  };

  const BACKUP_PROBLEMS = {
    PIPE: ["ขี้ดายหลุด", "เข้าม้วนหัก", "รอยขีด", "สีไม่สม่ำเสมอ", "อื่นๆ"],
    MONO: ["ความหนาไม่ได้", "ขนาดไม่ได้", "สีไม่สม่ำเสมอ", "อื่นๆ"],
    RAIN_TAPE: ["เส้นเทปขาด", "ม้วนไม่เรียบ", "สีไม่สม่ำเสมอ", "อื่นๆ"],
    BLOW: [
      "ทะลุ",
      "ตกใบมีด",
      "ลูกโปร่งส่าย",
      "ซีลไม่ติด",
      "ความหนาไม่ได้",
      "อื่นๆ",
    ],
    BLOWN_FILM: ["ฟิล์มทะลุ", "ความหนาไม่ได้", "ม้วนเสีย", "อื่นๆ"],
    SHEET_CUTTING: ["แผ่นเสีย", "ความหนาไม่ได้", "ขนาดไม่ได้", "อื่นๆ"],
    CUT_PUNCH: ["รูไม่ตรง", "เจาะไม่ทะลุ", "ใบมีดสึก", "ขนาดผิด", "อื่นๆ"],
    GARBAGE_BAG_CUT: ["ซีลไม่ติด", "ถุงขาด", "ม้วนไม่เรียบ", "ความยาวผิด", "อื่นๆ"],
    RAIN_TAPE_CUT_PUNCH: ["รูไม่ตรงระยะ", "เจาะไม่ทะลุ", "เทปขาด", "อื่นๆ"],
    SHADE_NET: ["เส้นขาด", "ตาข่ายไม่สม่ำเสมอ", "ขนาดผิด", "อื่นๆ"],
  };

  let finalMachinesList = [];
  let finalProblemsList = [];

  const clientSupabase = window.supabaseClient || window.supabase;

  if (clientSupabase) {
    finalMachinesList = await loadMachinesFromDatabase(clientSupabase);
    finalProblemsList = await loadProblemsFromDatabase(clientSupabase);
  }

  if (finalMachinesList.length === 0) {
    finalMachinesList = BACKUP_MACHINES[currentDept] || ["M1"];
  }

  if (finalProblemsList.length === 0) {
    finalProblemsList = BACKUP_PROBLEMS[currentDept] || ["อื่นๆ"];
  }

  renderMachineDropdown(finalMachinesList);
  renderProblemDropdown(finalProblemsList);
}

async function loadMachinesFromDatabase(clientSupabase) {
  // ตารางใหม่ควรใช้ master_machines.department_code ให้ตรงกับ master_departments.department_code
  try {
    const { data, error } = await clientSupabase
      .from("master_machines")
      .select("machine_no")
      .eq("department_code", currentDept)
      .eq("is_active", true)
      .order("machine_no", { ascending: true });

    if (!error && data?.length > 0) {
      return data.map((item) => item.machine_no).filter(Boolean);
    }
  } catch (err) {
    console.warn("โหลด master_machines ด้วย department_code ไม่สำเร็จ:", err);
  }

  // fallback เผื่อฐานข้อมูล DEV บางชุดยังใช้ column department อยู่
  try {
    const { data, error } = await clientSupabase
      .from("master_machines")
      .select("machine_no")
      .eq("department", currentDept)
      .eq("is_active", true)
      .order("machine_no", { ascending: true });

    if (!error && data?.length > 0) {
      return data.map((item) => item.machine_no).filter(Boolean);
    }
  } catch (err) {
    console.warn("โหลด master_machines ด้วย department ไม่สำเร็จ:", err);
  }

  try {
    const { data, error } = await clientSupabase
      .from("pvt_machines")
      .select("machine_name")
      .eq("department_code", currentDept)
      .order("machine_name", { ascending: true });

    if (!error && data?.length > 0) {
      return data.map((item) => item.machine_name).filter(Boolean);
    }
  } catch (err) {
    console.warn("pvt_machines ใช้งานไม่ได้:", err);
  }

  return [];
}

async function loadProblemsFromDatabase(clientSupabase) {
  // ตารางใหม่ควรใช้ master_problems.department_code ให้ตรงกับ master_departments.department_code
  try {
    const { data, error } = await clientSupabase
      .from("master_problems")
      .select("problem_type")
      .eq("department_code", currentDept)
      .eq("is_active", true)
      .order("problem_type", { ascending: true });

    if (!error && data?.length > 0) {
      return data.map((item) => item.problem_type).filter(Boolean);
    }
  } catch (err) {
    console.warn("โหลด master_problems ด้วย department_code ไม่สำเร็จ:", err);
  }

  // fallback เผื่อฐานข้อมูล DEV บางชุดยังใช้ column department อยู่
  try {
    const { data, error } = await clientSupabase
      .from("master_problems")
      .select("problem_type")
      .eq("department", currentDept)
      .eq("is_active", true)
      .order("problem_type", { ascending: true });

    if (!error && data?.length > 0) {
      return data.map((item) => item.problem_type).filter(Boolean);
    }
  } catch (err) {
    console.warn("โหลด master_problems ด้วย department ไม่สำเร็จ:", err);
  }

  try {
    const { data, error } = await clientSupabase
      .from("pvt_problem_types")
      .select("problem_name")
      .eq("department_code", currentDept)
      .order("problem_name", { ascending: true });

    if (!error && data?.length > 0) {
      return data.map((item) => item.problem_name).filter(Boolean);
    }
  } catch (err) {
    console.warn("pvt_problem_types ใช้งานไม่ได้:", err);
  }

  return [];
}

function renderMachineDropdown(machineList) {
  const select = document.getElementById("machine-no");
  if (!select) return;

  select.innerHTML = `<option value="">-- โปรดเลือกเครื่องจักร --</option>`;

  machineList.forEach((machine) => {
    const option = document.createElement("option");
    option.value = machine;
    option.textContent = machine;
    select.appendChild(option);
  });

  // ถ้าเปิดจาก QR รายเครื่อง ให้เลือกเครื่องและล็อกทันที
  applyQrMachineLock();
}

function renderProblemDropdown(problemList) {
  const select = document.getElementById("problem-type");
  if (!select) return;

  select.innerHTML = `<option value="">-- โปรดเลือกปัญหาที่พบ --</option>`;

  problemList.forEach((problem) => {
    const option = document.createElement("option");
    option.value = problem;
    option.textContent = problem;
    select.appendChild(option);
  });
}

// =========================================================
// DUPLICATE CHECK
// =========================================================

async function checkDuplicateReport(clientSupabase, reportDate, reporterName) {
  const { data, error } = await clientSupabase
    .from("daily_waste_reports")
    .select("id")
    .eq("report_date", reportDate)
    .eq("department_code", currentDept)
    .eq("reported_by", reporterName)
    .limit(1);

  if (error) throw error;

  return Array.isArray(data) && data.length > 0;
}

// =========================================================
// SUBMIT
// =========================================================

async function handleFormSubmit(event) {
  event.preventDefault();

  const clientSupabase = window.supabaseClient || window.supabase;

  if (!clientSupabase) {
    alert("ไม่สามารถเชื่อมต่อฐานข้อมูลได้");
    return;
  }

  if (!validateCurrentDept()) return;

  const reporterName = getActiveUserName();

  if (!reporterName) {
    alert("กรุณากรอกชื่อผู้บันทึกข้อมูลก่อนค่ะ");
    openStaffNameModal(false);
    return;
  }

  const submitButton = event.submitter || document.querySelector(".btn-submit");

  const dateInput = document.getElementById("incident-datetime");
  const shiftSelect = document.getElementById("work-shift");
  const machineSelect = document.getElementById("machine-no");
  const problemSelect = document.getElementById("problem-type");
  const weightInput = document.getElementById("waste-weight");
  const noteInput = document.getElementById("problem-description");

  const finalShift = shiftSelect?.value || "";
  const selectedShift =
    typeof getShiftByCode === "function" ? getShiftByCode(finalShift) : null;
  // ถ้าเปิดจาก QR รายเครื่อง ให้ใช้ QR_MACHINE ก่อนเสมอ
  // เพราะบาง browser หรือบาง form อาจไม่ส่งค่าจาก select ที่ disabled
  const finalMachine = QR_MACHINE || machineSelect?.value || appSelectedMachine || "";
  const finalProblem = problemSelect?.value || appSelectedProblem || "";
  const detailNote = noteInput?.value.trim() || "";
  const wasteWeight = parseFloat(weightInput?.value || "0") || 0;

  if (!dateInput?.value) return alert("กรุณาระบุวัน-เวลาเกิดเหตุ");
  if (!finalShift) return alert("กรุณาเลือกกะการทำงาน");
  if (!finalMachine) return alert("กรุณาเลือกหมายเลขเครื่องจักร");
  if (!finalProblem) return alert("กรุณาเลือกอาการเสีย/ปัญหาที่พบ");

  if (isOtherProblem(finalProblem) && !appOtherProblemDetail.trim()) {
    alert("กรุณาระบุรายละเอียดว่า อื่นๆ คือปัญหาอะไร");
    openOtherProblemModal();
    return;
  }

  if (!detailNote) return alert("กรุณากรอกรายละเอียดเหตุการณ์");

  const finalDateTime = new Date(dateInput.value).toISOString();
  const reportDate = finalDateTime.slice(0, 10);

  try {
    setSubmitLoading(submitButton, true);
    showLoginOverlay("กำลังตรวจสอบข้อมูลซ้ำ...");

    const isDuplicate = await checkDuplicateReport(
      clientSupabase,
      reportDate,
      reporterName,
    );

    if (isDuplicate) {
      alert(
        "วันนี้ชื่อนี้เคยบันทึกข้อมูลในแผนกนี้แล้วค่ะ\n\nหากเป็นการกรอกซ้ำ ให้หัวหน้าหรือแอดมินตรวจสอบในแดชบอร์ดก่อนนะคะ",
      );
      return;
    }

    const confirmed = confirm("ยืนยันการบันทึกรายงานปัญหานี้เข้าสู่ระบบ?");
    if (!confirmed) return;

    showLoginOverlay("กำลังบันทึกข้อมูล...");

    // เตรียมข้อมูลปัญหาสำหรับบันทึก
    // ถ้าเลือก "อื่นๆ" จะยังเก็บ problem_type = "อื่นๆ"
    // แต่เพิ่ม other_problem_detail และ reason_detail เพื่อให้ Dashboard วิเคราะห์สาเหตุจริงได้
    const finalOtherProblemDetail = isOtherProblem(finalProblem)
      ? appOtherProblemDetail.trim()
      : "";

    const finalReasonDetail = finalOtherProblemDetail
      ? `${finalProblem}: ${finalOtherProblemDetail}`
      : finalProblem;

    const finalDetailNote = finalOtherProblemDetail
      ? `${detailNote}\n\n[รายละเอียดอื่นๆ] ${finalOtherProblemDetail}`
      : detailNote;

    const reportData = {
      report_date: reportDate,
      incident_datetime: finalDateTime,

      shift: selectedShift?.name || finalShift,
      work_shift: finalShift,
      // work_shift_name: selectedShift?.name || "",
      // shift_start: selectedShift?.start || "",
      // shift_end: selectedShift?.end || "",
      // shift_type: selectedShift?.type || "",

      // สำคัญ: ต้องตรงกับ master_departments.department_code เท่านั้น
      // currentDept มาจาก QR_DEPT หรือ activeDept ที่ผ่าน normalizeDept() แล้ว
      department_code: currentDept,

      // เก็บซ้ำไว้สำหรับหน้าเดิมที่อาจยังใช้ column department
      // แนะนำให้เก็บชื่อไทยเพื่อแสดงผลอ่านง่าย แต่ตัวกรองหลักให้ใช้ department_code
      department: getDeptDisplayName(currentDept),

      machine_no: finalMachine,
      product_name: "ปัญหาการผลิต",

      problem_type: finalProblem,
      reason_detail: finalReasonDetail,

      // คอลัมน์นี้แนะนำให้เพิ่มใน Supabase:
      // ALTER TABLE daily_waste_reports ADD COLUMN IF NOT EXISTS other_problem_detail TEXT;
      // ถ้ายังไม่ได้เพิ่มคอลัมน์ ให้ดู SQL ใน README แล้วรันก่อน deploy
      other_problem_detail: finalOtherProblemDetail || null,

      note: finalDetailNote,
      detail: finalDetailNote,

      waste_qty: wasteWeight,
      waste_weight_kg: wasteWeight,
      total_qty: wasteWeight,
      good_qty: 0,
      unit: "kg",

      status: "pending",

      reported_by: reporterName,

      // ถ้ายังไม่ได้ใช้ reason_id ให้ส่ง null เพื่อไม่ชน foreign key
      reason_id: null,
    };

    if (isValidUuid(activeUserId)) {
      reportData.created_by = activeUserId;
    }

    console.log("[SUBMIT_DEPT]", currentDept);
    console.log("[SUBMIT_DATA]", reportData);

    const { error } = await clientSupabase
      .from("daily_waste_reports")
      .insert([reportData]);

    if (error) throw error;

    alert("บันทึกข้อมูลเรียบร้อยแล้ว");

    // ถ้าเข้าหน้าฟอร์มด้วย QR:
    // หลังส่งสำเร็จให้ไปหน้าส่งสำเร็จ เพื่อให้เลือก "สแกน QR ใหม่" หรือ "กลับหน้า Login"
    // เหตุผล: พนักงานที่ต้องกรอกหลายเครื่อง จะได้เริ่มสแกนเครื่องถัดไปใหม่ ไม่ค้างอยู่ฟอร์มเดิม
    if (isQrMode()) {
      goToQrSuccessPage();
      return;
    }

    // ถ้าไม่ได้มาจาก QR ให้ล้างฟอร์มตามปกติ
    resetFormAfterSubmit();
  } catch (err) {
    console.error("SQL Insert Error:", err);
    alert("บันทึกข้อมูลไม่สำเร็จ: " + (err.message || err));
  } finally {
    hideLoginOverlay();
    setSubmitLoading(submitButton, false);
  }
}

function setSubmitLoading(button, isLoading) {
  if (!button) return;

  button.disabled = isLoading;
  button.dataset.originalText ||= button.textContent;

  button.textContent = isLoading
    ? "⏳ กำลังบันทึก..."
    : button.dataset.originalText;
}

async function loadShiftOptions() {
  const select = document.getElementById("work-shift");
  if (!select) return;

  select.innerHTML =
    '<option value="">-- โปรดเลือกกะการทำงาน --</option>';

  const fallbackShifts = [
    "กะเช้า",
    "กะบ่าย",
    "กะดึก",
    "OT",
    "วันอาทิตย์",
  ];

  const clientSupabase = window.supabaseClient || window.supabase;

  if (!clientSupabase) {
    renderShiftOptions(select, fallbackShifts);
    return;
  }

  try {
    const { data, error } = await clientSupabase
      .from("master_shifts")
      .select("shift_name")
      .eq("is_active", true)
      .order("id", { ascending: true });

    if (error) throw error;

    const shifts = data
      .map((item) => item.shift_name)
      .filter(Boolean);

    renderShiftOptions(
      select,
      shifts.length ? shifts : fallbackShifts
    );
  } catch (err) {
    console.warn("โหลดกะจาก master_shifts ไม่สำเร็จ:", err);
    renderShiftOptions(select, fallbackShifts);
  }
}

function renderShiftOptions(select, shiftList) {
  shiftList.forEach((shiftName) => {
    const option = document.createElement("option");
    option.value = shiftName;
    option.textContent = shiftName;
    select.appendChild(option);
  });
}

// =========================================================
// RESET
// =========================================================

function resetFormAfterSubmit() {
  const form = document.getElementById("department-waste-form");

  if (form) form.reset();

  // ถ้ามาจาก QR รายเครื่อง ต้องคงค่าเครื่องเดิมไว้
  // ไม่อย่างนั้นกดบันทึกเสร็จแล้ว dropdown จะว่าง ทั้งที่ QR ระบุเครื่องไว้แล้ว
  appSelectedMachine = QR_MACHINE || "";
  appSelectedProblem = "";
  appOtherProblemDetail = "";

  setupDefaultDateTime();
  applyQrMachineLock();
  renderQrContext();
}

function resetFormWithConfirm() {
  const confirmed = confirm("ต้องการล้างข้อมูลทั้งหมดใช่หรือไม่?");
  if (!confirmed) return;

  resetFormAfterSubmit();
  alert("ล้างข้อมูลเรียบร้อยแล้ว");
}


// ======================================================
// QR MODE: ส่งข้อมูลเสร็จแล้วเด้งกลับ Login
// + Auto logout เมื่อไม่มีการใช้งาน 5 นาที
// ======================================================

const QR_IDLE_LIMIT = 5 * 60 * 1000; // 5 นาที
let qrIdleTimer = null;

// เช็กว่าเข้ามาจาก QR หรือไม่
function isQrMode() {
  const params = new URLSearchParams(window.location.search);
  return params.has("dept") || params.has("department") || params.has("department_code") || params.has("machine");
}

// กลับหน้า Login และล้างข้อมูลคนกรอก
function goBackToLogin() {
  localStorage.removeItem("activeUser");
  localStorage.removeItem("activeName");
  localStorage.removeItem("activeRole");
  localStorage.removeItem("activeUserId");
  localStorage.removeItem("activeDept");

  window.location.href = "/login.html";
}

// ไปหน้าบันทึกสำเร็จของ QR
// หน้านี้จะมีปุ่มให้เลือก:
// 1) สแกน QR ใหม่
// 2) กลับหน้า Login
function goToQrSuccessPage() {
  localStorage.removeItem("activeUser");
  localStorage.removeItem("activeName");
  localStorage.removeItem("activeRole");
  localStorage.removeItem("activeUserId");
  localStorage.removeItem("activeDept");

  window.location.href = "/pages/qr-success.html";
}

// เริ่มจับเวลาไม่ใช้งาน
function startQrIdleLogout() {
  if (!isQrMode()) return;

  resetQrIdleTimer();

  ["click", "input", "change", "keydown", "touchstart", "mousemove"].forEach((eventName) => {
    document.addEventListener(eventName, resetQrIdleTimer, true);
  });
}

// รีเซ็ตเวลาเมื่อมีการใช้งาน
function resetQrIdleTimer() {
  clearTimeout(qrIdleTimer);

  qrIdleTimer = setTimeout(() => {
    alert("ไม่มีการใช้งานเกิน 5 นาที ระบบจะกลับไปหน้า Login");
    goBackToLogin();
  }, QR_IDLE_LIMIT);
}

// =========================================================
// LOGOUT
// =========================================================

async function handleLogout() {
  const confirmed = confirm("ต้องการออกจากระบบใช่ไหม?");
  if (!confirmed) return;

  try {
    const clientSupabase = window.supabaseClient;

    if (clientSupabase?.auth) {
      await clientSupabase.auth.signOut();
    }
  } catch (err) {
    console.warn("Supabase signOut error:", err);
  }

  localStorage.removeItem("activeUser");
  localStorage.removeItem("activeName");
  localStorage.removeItem("activeRole");
  localStorage.removeItem("activeUserId");
  // localStorage.removeItem("activeDept");

  window.location.href = "/login.html";
}

// =========================================================
// EXPORT TO HTML
// =========================================================

window.resetFormWithConfirm = resetFormWithConfirm;
window.handleLogout = handleLogout;
window.goBackToLogin = goBackToLogin;
window.goToQrSuccessPage = goToQrSuccessPage;
window.normalizeDept = normalizeDept;
window.getDeptCssClass = getDeptCssClass;
window.isStaffRole = isStaffRole;
window.openStaffNameModal = openStaffNameModal;
window.confirmStaffName = confirmStaffName;
window.applyQrMachineLock = applyQrMachineLock;
window.confirmOtherProblem = confirmOtherProblem;
window.cancelOtherProblem = cancelOtherProblem;
window.openOtherProblemModal = openOtherProblemModal;
