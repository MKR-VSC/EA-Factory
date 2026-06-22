// =========================================================
// ไฟล์: js/form-department.js
// ใช้กับหน้า form-department.html
// รองรับลิงก์ QR แยกแผนก เช่น form-department.html?dept=blow
// =========================================================

// =========================================================
// CONFIG: รหัสแผนกที่มีจริงในตาราง departments.code
// =========================================================

const VALID_DEPARTMENTS = [
  "mono",
  "print",
  "pipe",
  "sheet",
  "tape",
  "blow",
  "drill",
  "garbage",
];

const DEPARTMENT_NAMES = {
  mono: "แผนกโมโน",
  print: "แผนกเป่าพิล์ม",
  pipe: "แผนกท่อ",
  sheet: "แผนกตัดผืน",
  tape: "แผนกเทปน้ำพุ่ง",
  blow: "แผนกเป่าถุง",
  drill: "แผนกตัดเจาะ",
  garbage: "แผนกถุงขยะ",
};

// =========================================================
// URL / USER / DEPARTMENT STATE
// =========================================================

const urlParams = new URLSearchParams(window.location.search);
const deptFromUrl = urlParams.get("dept");

const activeRoleRaw = localStorage.getItem("activeRole") || "staff";
const activeUserId = localStorage.getItem("activeUserId") || "";

const currentDeptRaw =
  deptFromUrl || localStorage.getItem("activeDept") || "";

let currentDept = normalizeDept(currentDeptRaw);
let appSelectedMachine = "";
let appSelectedProblem = "";

// ถ้า dept ที่ได้มาไม่ถูกต้อง ให้กลับไปใช้ blow เพื่อกัน Foreign Key Error
if (!VALID_DEPARTMENTS.includes(currentDept)) {
  console.error(
    `[DEPT_ERROR] ไม่พบแผนก: ${currentDeptRaw}`
  );

  alert(
    `ไม่พบแผนกของผู้ใช้งาน (${currentDeptRaw})\nกรุณาตรวจสอบ department_code ในตาราง profiles`
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
  const d = String(dept || "blow").toLowerCase().trim();

  const map = {

    mono: "mono",
"โมโน": "mono",
"แผนกโมโน": "mono",


    print: "print",
    "ม้วนพิมพ์": "print",

    pipe: "pipe",
    "ท่อ": "pipe",
    "แผนกท่อ": "pipe",

    sheet: "sheet",
    "sheet": "sheet",
    "ตัดผืน": "sheet",
    "แผ่นหล่อ": "sheet",
    "แผนกแผ่นหล่อ": "sheet",
    "แผนกแผ่นหล่อ/ตัดผืน": "sheet",

    tape: "tape",
    "เทป": "tape",
    "เทปน้ำพุ่ง": "tape",
    "เทปพัน": "tape",
    "แผนกเทปพัน": "tape",
    "แผนกเทปพัน/เทปน้ำพุ่ง": "tape",

    blow: "blow",
    "เป่าถุง": "blow",
    "แผนกเป่าถุง": "blow",

    drill: "drill",
    "ตัดเจาะ": "drill",
    "เจาะรู": "drill",
    "แผนกตัดเจาะ": "drill",

    garbage: "garbage",
    "ถุงขยะ": "garbage",
    "แผนกถุงขยะ": "garbage",
  };

  return map[d] || d;
}

function getDeptDisplayName(dept) {
  return DEPARTMENT_NAMES[dept] || dept || "-";
}

function validateCurrentDept() {
  if (!VALID_DEPARTMENTS.includes(currentDept)) {
    alert(
      `รหัสแผนกไม่ถูกต้อง: ${currentDept}\n\nกรุณาตรวจสอบลิงก์ QR หรือค่า dept ใน URL`
    );
    return false;
  }

  return true;
}

// =========================================================
// ROLE / USER HELPERS
// =========================================================

function normalizeRole(role) {
  return String(role || "").toLowerCase().trim();
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
    String(value || "")
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
    localStorage.getItem("activeRole") || "staff"
  );
}

// =========================================================
// AUTO LOGOUT
// =========================================================

const AUTO_LOGOUT_MINUTES = 5;
let autoLogoutTimer = null;

function startAutoLogoutTimer() {
  resetAutoLogoutTimer();

  [
    "click",
    "keydown",
    "touchstart",
    "mousemove",
    "scroll"
  ].forEach((eventName) => {
    window.addEventListener(eventName, resetAutoLogoutTimer, {
      passive: true
    });
  });
}

function resetAutoLogoutTimer() {
  clearTimeout(autoLogoutTimer);

  autoLogoutTimer = setTimeout(() => {
    forceLogoutByIdle();
  }, AUTO_LOGOUT_MINUTES * 60 * 1000);
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


    if (!validateCurrentDept()) return;

    renderDeptInfo();
    renderUserInfo();
    setupStaffNameBeforeUse();
    
    setupDashboardMenu();
    setupDefaultDateTime();
    setupNetworkStatus();
    setupFormSubmit();
    setupDropdownListeners();
    renderCurrentDeptLabel();

    await loadMasterDataAndRender();
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
      bodyEl.classList.remove(`dept-${dept}`);
    });
    bodyEl.classList.add(`dept-${currentDept}`);
  }
}


function renderCurrentDeptLabel() {
  const el = document.getElementById("current-dept-label");
  if (!el) return;

  const deptName = getDeptDisplayName(currentDept);
  el.textContent = `${deptName} (${currentDept.toUpperCase()})`;
}


function setupDashboardMenu() {
  const dashboardLink = document.getElementById("nav-dashboard-link");
  if (!dashboardLink) return;

  dashboardLink.style.display = canSeeDashboard(activeRoleRaw) ? "flex" : "none";
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
    });
  }
}

// =========================================================
// MASTER DATA
// =========================================================

async function loadMasterDataAndRender() {
  const BACKUP_MACHINES = {
    print: ["Print1", "Print2", "Print3"],
    pipe: ["ท่อ1", "ท่อ2", "ท่อ3", "ท่อ4"],
    blow: ["F1", "F2", "F3", "F4", "F5", "F6", "F7"],
    sheet: ["Sheet1", "Sheet2"],
    tape: ["Tape1", "Tape2"],
    drill: ["Drill1", "Drill2"],
    garbage: ["Garbage1", "Garbage2"],
  };

  const BACKUP_PROBLEMS = {
    print: ["สีเพี้ยน", "พิมพ์ไม่ตรง", "หมึกเลอะ", "ม้วนเสีย", "อื่นๆ"],
    blow: [
      "ทะลุ",
      "ตกใบมีด",
      "ลูกโปร่งส่าย",
      "ซีลไม่ติด",
      "ความหนาไม่ได้",
      "อื่นๆ",
    ],
    pipe: ["ขี้ดายหลุด", "เข้าม้วนหัก", "รอยขีด", "สีไม่สม่ำเสมอ", "อื่นๆ"],
    sheet: ["แผ่นเสีย", "ความหนาไม่ได้", "ขนาดไม่ได้", "อื่นๆ"],
    tape: ["เส้นเทปขาด", "ม้วนไม่เรียบ", "สีไม่สม่ำเสมอ", "อื่นๆ"],
    drill: ["รูไม่ตรง", "เจาะไม่ทะลุ", "ใบมีดสึก", "ขนาดผิด", "อื่นๆ"],
    garbage: ["ซีลไม่ติด", "ถุงขาด", "ม้วนไม่เรียบ", "ความยาวผิด", "อื่นๆ"],
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
    console.warn("master_machines ใช้งานไม่ได้:", err);
  }

  try {
    const { data, error } = await clientSupabase
      .from("pvt_machines")
      .select("machine_name")
      .eq("department", currentDept)
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
    console.warn("master_problems ใช้งานไม่ได้:", err);
  }

  try {
    const { data, error } = await clientSupabase
      .from("pvt_problem_types")
      .select("problem_name")
      .eq("department", currentDept)
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
  const finalMachine = machineSelect?.value || appSelectedMachine || "";
  const finalProblem = problemSelect?.value || appSelectedProblem || "";
  const detailNote = noteInput?.value.trim() || "";
  const wasteWeight = parseFloat(weightInput?.value || "0") || 0;

  if (!dateInput?.value) return alert("กรุณาระบุวัน-เวลาเกิดเหตุ");
  if (!finalShift) return alert("กรุณาเลือกกะการทำงาน");
  if (!finalMachine) return alert("กรุณาเลือกหมายเลขเครื่องจักร");
  if (!finalProblem) return alert("กรุณาเลือกอาการเสีย/ปัญหาที่พบ");
  if (!detailNote) return alert("กรุณากรอกรายละเอียดเหตุการณ์");

  const finalDateTime = new Date(dateInput.value).toISOString();
  const reportDate = finalDateTime.slice(0, 10);

  try {
    setSubmitLoading(submitButton, true);
    showLoginOverlay("กำลังตรวจสอบข้อมูลซ้ำ...");

    const isDuplicate = await checkDuplicateReport(
      clientSupabase,
      reportDate,
      reporterName
    );

    if (isDuplicate) {
      alert(
        "วันนี้ชื่อนี้เคยบันทึกข้อมูลในแผนกนี้แล้วค่ะ\n\nหากเป็นการกรอกซ้ำ ให้หัวหน้าหรือแอดมินตรวจสอบในแดชบอร์ดก่อนนะคะ"
      );
      return;
    }

    const confirmed = confirm("ยืนยันการบันทึกรายงานปัญหานี้เข้าสู่ระบบ?");
    if (!confirmed) return;

    showLoginOverlay("กำลังบันทึกข้อมูล...");

    const reportData = {
      report_date: reportDate,
      incident_datetime: finalDateTime,

      shift: finalShift,
      work_shift: finalShift,

      // สำคัญ: ต้องตรงกับ departments.code เท่านั้น
      department_code: currentDept,

      // เก็บซ้ำไว้สำหรับหน้าเดิมที่อาจยังใช้ column department
      department: currentDept,

      machine_no: finalMachine,
      product_name: "ปัญหาการผลิต",

      problem_type: finalProblem,
      reason_detail: finalProblem,

      note: detailNote,
      detail: detailNote,

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

// =========================================================
// RESET
// =========================================================

function resetFormAfterSubmit() {
  const form = document.getElementById("department-waste-form");

  if (form) form.reset();

  appSelectedMachine = "";
  appSelectedProblem = "";

  setupDefaultDateTime();
}

function resetFormWithConfirm() {
  const confirmed = confirm("ต้องการล้างข้อมูลทั้งหมดใช่หรือไม่?");
  if (!confirmed) return;

  resetFormAfterSubmit();
  alert("ล้างข้อมูลเรียบร้อยแล้ว");
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
window.normalizeDept = normalizeDept;
window.isStaffRole = isStaffRole;
window.openStaffNameModal = openStaffNameModal;
window.confirmStaffName = confirmStaffName;