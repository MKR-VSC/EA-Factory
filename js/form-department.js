// =========================================================
// ไฟล์: js/form-department.js
// ใช้กับหน้า form-department.html
// =========================================================

const activeUser = localStorage.getItem("activeUser") || "";
const activeName = localStorage.getItem("activeName") || activeUser || "Unknown";
const activeRoleRaw = localStorage.getItem("activeRole") || "staff";
const activeUserId = localStorage.getItem("activeUserId") || "";
const currentDeptRaw = localStorage.getItem("activeDept") || "blow";

let currentDept = normalizeDept(currentDeptRaw);
let appSelectedMachine = "";
let appSelectedProblem = "";

// =========================================================
// DEPARTMENT
// =========================================================

function normalizeDept(dept) {
  const d = String(dept || "blow").toLowerCase().trim();

  const map = {
    blow: "blow",
    เป่าถุง: "blow",

    pipe: "pipe",
    ท่อ: "pipe",

    sheet: "sheet",
    ตัดผืน: "sheet",
    แผ่นหล่อ: "sheet",

    tape: "tape",
    เทปน้ำพุ่ง: "tape",
    เทปพัน: "tape",

    drill: "drill",
    ตัดเจาะ: "drill",
    เจาะรู: "drill",

    garbage: "garbage",
    ถุงขยะ: "garbage",

    mono: "mono",
    โมโน: "mono",

    salan: "salan",
    สแลน: "salan",
  };

  return map[d] || d;
}

function getDeptDisplayName(dept) {
  const map = {
    blow: "เป่าถุง",
    pipe: "ท่อ",
    sheet: "ตัดผืน / แผ่นหล่อ",
    tape: "เทปน้ำพุ่ง",
    drill: "ตัดเจาะ",
    garbage: "ถุงขยะ",
    mono: "โมโน",
    salan: "สแลน",
  };

  return map[dept] || dept || "-";
}

// =========================================================
// ROLE
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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

// =========================================================
// INIT
// =========================================================

window.addEventListener("DOMContentLoaded", async () => {
  try {
    // 🛡️ ป้องกัน ReferenceError โดยเช็กผ่าน window object ก่อนเรียกใช้งาน
    if (typeof window.protectPage === "function") {
      const canContinue = window.protectPage();
      if (!canContinue) return;
    } else {
      console.warn("[security_update] ไม่พบฟังก์ชัน protectPage ระบบจะข้ามไปทำงานขั้นตอนถัดไป");
    }

    renderUserInfo();
    renderDeptInfo();
    setupManagerOnlySection();
    setupDashboardMenu();
    setupDefaultDateTime();
    setupNetworkStatus();
    setupFormSubmit();
    setupDropdownListeners();

    await loadMasterDataAndRender();
  } catch (err) {
    // ล้างอิโมจิ ❌ ออก เปลี่ยนเป็นระบบสัญลักษณ์แท็กสากล
    console.error("[Init_Error]", err);
    alert("เกิดข้อผิดพลาดตอนเปิดหน้าฟอร์ม: " + (err.message || err));
  } finally {
    hideSplash();
  }
});
// =========================================================
// LOGIN PROTECT
// =========================================================

window.addEventListener("DOMContentLoaded", async () => {
  try {
    // 🔍 1. เช็กก่อนว่าคนที่เข้ามา แอบเข้ามาดื้อๆ หรือสแกน QR Code ติดมือมาด้วย
    const urlParams = new URLSearchParams(window.location.search);
    const qrToken = urlParams.get('token'); // ดึงรหัสล็อกอินจาก QR
    
    // 🔐 2. ถ้าระบบไม่มีทั้งคนล็อกอินเก่า และไม่มี Token จาก QR ติดมาด้วยเลย... ถึงค่อยสั่งเด้งกลับครับ
    if (!localStorage.getItem("activeUser") && !qrToken) {
      alert("🔒 กรุณาสแกน QR Code ประจำแผนก หรือเข้าสู่ระบบก่อนใช้งานครับ");
      window.location.href = "login.html"; 
      return;
    }

    // 📥 3. ถ้าสแกน QR เข้ามา (มี Token) แต่ยังไม่มี session ให้ระบบทำการดึงชื่อพนักงานมารอให้เลือกทันที
    if (qrToken && !localStorage.getItem("activeUser")) {
      console.log("🎯 ตรวจพบการเข้าใช้งานผ่าน QR Code กำลังถอดรหัสสาขา...");
      
      // สั่งให้ฟังก์ชันถอดรหัสสิทธิ์ทำงาน (ถ้ามีฟังก์ชันดึงรายชื่อพนักงานจาก QR)
      if (typeof decodeTokenAndLoadStaff === "function") {
        await decodeTokenAndLoadStaff(qrToken);
      } else {
        // แผนสำรอง: หากพี่ทำระบบให้วิ่งเข้าหน้าฟอร์มตรงๆ โดยระบุแผนกผ่าน URL เช่น ?dept=blow
        const deptParam = urlParams.get('dept');
        if (deptParam) {
          localStorage.setItem("activeDept", deptParam);
          localStorage.setItem("activeUser", "พนักงานประจำเครื่อง"); // ปลดล็อกกำแพงความปลอดภัยชั่วคราว
          localStorage.setItem("activeRole", "staff");
        }
      }
    }

    // --- โค้ดส่วนอื่นๆ (ตั้งค่าวันเวลาปัจจุบัน/ผูกปุ่ม) ปล่อยให้ทำงานต่อไปปกติ ---
    const userText = document.getElementById("display-username");
    if (userText) userText.innerText = localStorage.getItem("activeUser") || "ผู้สแกน QR";
  } catch (err) {
    console.error("❌ QR init error:", err);
  }
});

// =========================================================
// USER INFO
// =========================================================

function renderUserInfo() {
  // ชี้เป้าไปที่ Element บนหน้า HTML ก่อน (สมมติว่าใช้ ID หรือเลือกตามโครงสร้างจริงของพี่)
  const usernameEl = document.getElementById("username-display") || document.querySelector(".username-text");
  
  // 🛡️ เช็กก่อนว่ามีโครงสร้างนี้อยู่บนหน้าเว็บไหม ถ้าไม่มีให้ข้ามไปเลย โค้ดจะได้ไม่ crash
  if (!usernameEl) {
    console.warn("[ui_update] ไม่พบ Element สำหรับแสดงชื่อผู้ใช้งานบนหน้าเว็บนี้");
    return;
  }

  // ตัวอย่างการยัดค่าลง Element (ปรับตาม Logic เดิมของพี่ได้เลย)
  const currentUser = window.userData?.username || "Guest";
  usernameEl.textContent = currentUser;
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
    titleEl.textContent = `📋 ฟอร์มบันทึกข้อมูลปัญหาแผนก${deptName}`;
  }

  if (badgeEl) {
    badgeEl.textContent = `DEPT: ${deptName}`;
  }

  if (bodyEl) {
    bodyEl.classList.remove("dept-default");
    bodyEl.classList.add(`dept-${currentDept}`);
  }
}

function setupManagerOnlySection() {
  const managerSection = document.getElementById("manager-only-section");
  if (!managerSection) return;

  managerSection.style.display = isStaffRole(activeRoleRaw) ? "none" : "block";
}

function setupDashboardMenu() {
  const dashboardLink = document.getElementById("nav-dashboard-link");
  if (!dashboardLink) return;

  dashboardLink.style.display = canSeeDashboard(activeRoleRaw)
    ? "block"
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
      el.textContent = "🟢 ระบบออนไลน์";
      el.className = "badge badge-status-online";
    } else {
      el.textContent = "🔴 ระบบออฟไลน์";
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
    mono: ["Mono1", "Mono2", "Mono3"],
    pipe: ["ท่อ1", "ท่อ2", "ท่อ3", "ท่อ4"],
    blow: ["F1", "F2", "F3", "F4", "F5", "F6", "F7"],
    salan: ["สแลน ทอ 1", "สแลน ทอ 2"],
    sheet: ["Sheet1", "Sheet2"],
    tape: ["Tape1", "Tape2"],
    drill: ["Drill1", "Drill2"],
    garbage: ["Garbage1", "Garbage2"],
  };

  const BACKUP_PROBLEMS = {
    blow: ["ทะลุ", "ตกใบมีด", "ลูกโปร่งส่าย", "อื่นๆ"],
    pipe: ["ขี้ดายหลุด", "เข้าม้วนหัก", "อื่นๆ"],
    mono: ["เส้นขาด", "ม้วนเสีย", "อื่นๆ"],
    salan: ["ทอขาด", "สีเพี้ยน", "อื่นๆ"],
    sheet: ["แผ่นเสีย", "ความหนาไม่ได้", "อื่นๆ"],
    tape: ["เส้นเทปขาด", "ม้วนไม่เรียบ", "อื่นๆ"],
    drill: ["รูไม่ตรง", "เจาะไม่ทะลุ", "อื่นๆ"],
    garbage: ["ซีลไม่ติด", "ถุงขาด", "อื่นๆ"],
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
    console.warn("⚠️ master_machines ใช้งานไม่ได้:", err);
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
    console.warn("⚠️ pvt_machines ใช้งานไม่ได้:", err);
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
    console.warn("⚠️ master_problems ใช้งานไม่ได้:", err);
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
    console.warn("⚠️ pvt_problem_types ใช้งานไม่ได้:", err);
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
// SUBMIT
// =========================================================

async function handleFormSubmit(event) {
  event.preventDefault();

  const clientSupabase = window.supabaseClient || window.supabase;

  if (!clientSupabase) {
    alert("❌ ไม่สามารถเชื่อมต่อฐานข้อมูลได้");
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

  if (!dateInput?.value) return alert("🛑 กรุณาระบุวัน-เวลาเกิดเหตุ");
  if (!finalShift) return alert("🛑 กรุณาเลือกกะการทำงาน");
  if (!finalMachine) return alert("🛑 กรุณาเลือกหมายเลขเครื่องจักร");
  if (!finalProblem) return alert("🛑 กรุณาเลือกอาการเสีย/ปัญหาที่พบ");
  if (!detailNote) return alert("🛑 กรุณากรอกรายละเอียดเหตุการณ์");

  const confirmed = confirm("📋 ยืนยันการบันทึกรายงานปัญหานี้เข้าสู่ระบบ?");
  if (!confirmed) return;

  const finalDateTime = new Date(dateInput.value).toISOString();

  const reportData = {
    report_date: finalDateTime.slice(0, 10),
    incident_datetime: finalDateTime,

    shift: finalShift,
    work_shift: finalShift,

    department_code: currentDept,
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

    reported_by: activeName || activeUser || "Unknown Staff",
  };

  if (isValidUuid(activeUserId)) {
    reportData.created_by = activeUserId;
  }

  try {
    setSubmitLoading(submitButton, true);
    showLoginOverlay("กำลังบันทึกข้อมูล...");

    const { error } = await clientSupabase
      .from("daily_waste_reports")
      .insert([reportData]);

    if (error) throw error;

    alert("🎉 บันทึกข้อมูลเรียบร้อยแล้ว");
    resetFormAfterSubmit();
  } catch (err) {
    console.error("❌ SQL Insert Error:", err);
    alert("❌ บันทึกข้อมูลไม่สำเร็จ: " + (err.message || err));
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
  const confirmed = confirm("🧹 ต้องการล้างข้อมูลทั้งหมดใช่หรือไม่?");
  if (!confirmed) return;

  resetFormAfterSubmit();
  alert("🧹 ล้างข้อมูลเรียบร้อยแล้ว");
}

// =========================================================
// LOGOUT
// =========================================================

async function handleLogout() {
  const confirmed = confirm("ต้องการออกจากระบบใช่ไหม?");
  if (!confirmed) return;

  try {
    const clientSupabase = window.supabaseClient || window.supabase;

    if (clientSupabase?.auth) {
      await clientSupabase.auth.signOut();
    }
  } catch (err) {
    console.warn("⚠️ Supabase signOut error:", err);
  }

  localStorage.removeItem("activeUser");
  localStorage.removeItem("activeName");
  localStorage.removeItem("activeRole");
  localStorage.removeItem("activeUserId");
  localStorage.removeItem("activeDept");

  window.location.href = "/login2.html";
}

// =========================================================
// EXPORT TO HTML
// =========================================================

window.resetFormWithConfirm = resetFormWithConfirm;
window.handleLogout = handleLogout;
window.normalizeDept = normalizeDept;
window.isStaffRole = isStaffRole;
