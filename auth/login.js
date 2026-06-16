/* ======================================================
   LOGIN SYSTEM - EA Factory
   Notebook / PC = Username + Password
   Tablet / Mobile = QR Department + Select Staff
====================================================== */

const sb = window.supabaseClient;

/* ======================================================
   PAGE LOAD
====================================================== */

window.addEventListener("DOMContentLoaded", async () => {
  hideSplash();
  loadRememberedUser();

  if (!sb) {
    alert("ไม่พบการเชื่อมต่อ Supabase กรุณาตรวจสอบไฟล์ supabaseClient.js");
    return;
  }

  await checkQrMode();
});

/* ======================================================
   SPLASH
====================================================== */

function hideSplash() {
  setTimeout(() => {
    const splash = document.getElementById("splash-screen");
    if (splash) splash.classList.add("hide");
  }, 700);
}

/* ======================================================
   OVERLAY
====================================================== */

function showLoginOverlay() {
  const overlay = document.getElementById("login-overlay");
  if (overlay) overlay.classList.remove("hidden");
}

function hideLoginOverlay() {
  const overlay = document.getElementById("login-overlay");
  if (overlay) overlay.classList.add("hidden");
}

/* ======================================================
   REMEMBER USER
====================================================== */

function loadRememberedUser() {
  const savedUser = localStorage.getItem("rememberedUser");
  const usernameInput = document.getElementById("username");
  const rememberMe = document.getElementById("rememberMe");

  if (savedUser && usernameInput && rememberMe) {
    usernameInput.value = savedUser;
    rememberMe.checked = true;
  }
}

/* ======================================================
   TOGGLE PASSWORD
====================================================== */

function togglePasswordVisibility() {
  const input = document.getElementById("pvtPassword");
  const icon = document.getElementById("eyeIcon");

  if (!input) return;

  if (input.type === "password") {
    input.type = "text";
    if (icon) icon.textContent = "visibility_off";
  } else {
    input.type = "password";
    if (icon) icon.textContent = "visibility";
  }
}

/* ======================================================
   PASSWORD LOGIN
   ใช้ username + password จากตาราง profiles
   หมายเหตุ: วิธีนี้ใช้ได้ แต่ถ้าต้องการปลอดภัยขึ้นควรย้ายไปใช้ Supabase Auth
====================================================== */

async function handlePasswordLogin(event) {
  event.preventDefault();

  const loginBtn = document.querySelector(".btn-login");
  const usernameEl = document.getElementById("username");
  const passwordEl = document.getElementById("pvtPassword");
  const rememberMeEl = document.getElementById("rememberMe");

  if (!usernameEl || !passwordEl) {
    alert("ไม่พบช่อง Username หรือ Password");
    return;
  }

  const usernameInput = usernameEl.value.trim().toUpperCase();
  const passwordInput = passwordEl.value.trim();
  const rememberMeChecked = rememberMeEl?.checked || false;

  if (!usernameInput || !passwordInput) {
    alert("กรุณากรอก Username และ Password");
    return;
  }

  try {
    if (loginBtn) {
      loginBtn.disabled = true;
      loginBtn.textContent = "กำลังเข้าสู่ระบบ...";
    }

    showLoginOverlay();

    const { data: profile, error } = await sb
      .from("profiles")
      .select(
        `
    id,
    email,
    username,
    full_name,
    display_name,
    department,
    department_code,
    role,
    status
  `,
      )
      .ilike("username", usernameInput)
      .eq("password", passwordInput)
      .in("status", ["active", "Active", "ACTIVE"])
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!profile) {
      throw new Error("Invalid login");
    }

    const activeName =
      profile.full_name ||
      profile.display_name ||
      profile.username ||
      "พนักงาน PVT";

    saveSession({
      loginType: "password",
      userId: profile.id,
      username: profile.username || usernameInput,
      fullName: activeName,
      department: profile.department_code || profile.department || "",
      departmentName: profile.department || profile.department_code || "",
      role: profile.role || "staff",
    });

    redirectByRole(profile.role);
  } catch (err) {
    console.error("Login Error:", err);
    alert("Username หรือ Password ไม่ถูกต้อง หรือบัญชีถูกปิดใช้งาน");
  } finally {
    hideLoginOverlay();

    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.textContent = "เข้าสู่ระบบ";
    }
  }
}

/* ======================================================
   QR MODE
   URL ตัวอย่าง:
   /login.html?dept=blow&token=BLOW001
====================================================== */

async function checkQrMode() {
  const params = new URLSearchParams(window.location.search);
  const dept = params.get("dept");
  const token = params.get("token");

  if (!dept || !token) return;

  const qrBox = document.getElementById("qrLoginBox");
  const qrDeptName = document.getElementById("qrDeptName");

  try {
    const { data: qrData, error: qrError } = await sb
      .from("department_qr_tokens")
      .select("*")
      .eq("department_code", dept)
      .eq("token", token)
      .eq("status", "active")
      .single();

    if (qrError || !qrData) {
      throw new Error("Invalid QR");
    }

    const departmentCode = qrData.department_code || qrData.department || dept;

    const departmentName =
      qrData.department_name || qrData.department || departmentCode;

    if (qrBox) qrBox.classList.remove("hidden");
    if (qrDeptName) qrDeptName.textContent = departmentName;

    localStorage.setItem("qrDept", departmentCode);
    localStorage.setItem("qrDeptName", departmentName);
    localStorage.setItem("qrToken", token);

    await loadStaffByDepartment(departmentCode);
  } catch (err) {
    console.error("QR Login Error:", err);
    alert("QR Code นี้ไม่ถูกต้อง หรือถูกปิดใช้งานแล้ว");
  }
}

/* ======================================================
   LOAD STAFF BY DEPARTMENT
====================================================== */

async function loadStaffByDepartment(departmentCode) {
  const select = document.getElementById("qrStaffSelect");

  if (!select) return;

  select.innerHTML = `<option value="">กำลังโหลดรายชื่อ...</option>`;

  try {
    const { data: staffList, error } = await sb
      .from("profiles")
      .select(
        `
        id,
        email,
        username,
        full_name,
        display_name,
        department,
        department_code,
        role,
        status
      `,
      )
      .eq("department_code", departmentCode)
      .eq("status", "active")
      .order("full_name", { ascending: true });

    if (error) throw error;

    if (!staffList || staffList.length === 0) {
      select.innerHTML = `<option value="">ไม่พบรายชื่อพนักงานในแผนกนี้</option>`;
      return;
    }

    select.innerHTML = `<option value="">-- เลือกผู้บันทึก --</option>`;

    staffList.forEach((staff) => {
      const fullName =
        staff.full_name ||
        staff.display_name ||
        staff.username ||
        "ไม่ระบุชื่อ";

      const option = document.createElement("option");
      option.value = staff.id;
      option.textContent = fullName;

      option.dataset.username = staff.username || "";
      option.dataset.fullName = fullName;
      option.dataset.department = staff.department_code || departmentCode;
      option.dataset.departmentName =
        staff.department || staff.department_code || departmentCode;
      option.dataset.role = staff.role || "staff";

      select.appendChild(option);
    });
  } catch (err) {
    console.error("Load Staff Error:", err);
    select.innerHTML = `<option value="">โหลดรายชื่อไม่สำเร็จ</option>`;
  }
}

/* ======================================================
   QR LOGIN
====================================================== */

function handleQrLogin() {
  const select = document.getElementById("qrStaffSelect");

  if (!select || !select.value) {
    alert("กรุณาเลือกชื่อผู้บันทึก");
    return;
  }

  const selected = select.options[select.selectedIndex];

  saveSession({
    loginType: "qr",
    userId: select.value,
    username: selected.dataset.username || "",
    fullName: selected.dataset.fullName || "",
    department:
      selected.dataset.department || localStorage.getItem("qrDept") || "",
    departmentName:
      selected.dataset.departmentName ||
      localStorage.getItem("qrDeptName") ||
      "",
    role: "staff_qr",
  });

  window.location.href = "/html/form-department.html";
}

/* ======================================================
   SAVE SESSION
====================================================== */

function saveSession(data) {
  localStorage.setItem("loginType", data.loginType || "");
  localStorage.setItem("activeUserId", data.userId || "");
  localStorage.setItem("activeUser", data.username || "");
  localStorage.setItem("activeName", data.fullName || data.username || "");
  localStorage.setItem("activeDept", data.department || "");
  localStorage.setItem(
    "activeDeptName",
    data.departmentName || data.department || "",
  );
  localStorage.setItem(
    "activeRole",
    String(data.role || "staff").toLowerCase(),
  );
}

/* ======================================================
   REDIRECT BY ROLE
====================================================== */

function redirectByRole(role) {
  const currentRole = String(role || "staff")
    .toLowerCase()
    .trim();

  const rolePages = {
    admin: "/html/admintor.html",
    accounting: "/html/accounting-panel.html",
    management: "/index.html",
    manager: "/index.html",
    executive: "/index.html",
    supervisor: "/html/form-department.html",
    staff: "/html/form-department.html",
    staff_qr: "/html/form-department.html",
  };

  const targetPage = rolePages[currentRole] || "/html/form-department.html";

  window.location.href = targetPage;
}

/* ======================================================
   GUIDE PANEL
====================================================== */

function toggleGuidePanel() {
  const guideCard = document.getElementById("guideCard");
  if (!guideCard) return;

  const toggleText = guideCard.querySelector(".toggle-text");
  const toggleIcon = guideCard.querySelector(".toggle-icon");

  guideCard.classList.toggle("active");

  if (guideCard.classList.contains("active")) {
    if (toggleText) toggleText.innerText = "ซ่อนคำแนะนำ";
    if (toggleIcon) toggleIcon.innerText = "❌";
  } else {
    if (toggleText) toggleText.innerText = "ดูวิธีเข้าใช้งาน";
    if (toggleIcon) toggleIcon.innerText = "ℹ️";
  }
}

function openQrScanner() {
  alert("กรุณาสแกน QR Code ด้วยกล้องมือถือ หรือเปิดลิงก์ QR ที่เตรียมไว้");

  // ถ้าต้องการให้ไปหน้าสแกน QR แยก
  // window.location.href = "/html/qr-scanner.html";
}
