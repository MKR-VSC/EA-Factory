// ======================================================
// LOGIN SYSTEM
// Notebook / PC = Username + Password
// Tablet / Mobile = QR Department + Select Staff
// ======================================================

const sb = window.supabaseClient;

// ======================================================
// PAGE LOAD
// ======================================================
window.addEventListener("DOMContentLoaded", async () => {
  loadRememberedUser();
  await checkQrMode();
});

// ======================================================
// REMEMBER USER
// ======================================================
function loadRememberedUser() {
  const savedUser = localStorage.getItem("rememberedUser");

  if (savedUser) {
    document.getElementById("username").value = savedUser;
    document.getElementById("rememberMe").checked = true;
  }
}

// ======================================================
// TOGGLE PASSWORD
// ======================================================
function togglePasswordVisibility() {
  const input = document.getElementById("pvtPassword");
  const btn = document.querySelector(".btn-eye");

  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "🙈";
  } else {
    input.type = "password";
    btn.textContent = "👁️";
  }
}

// ======================================================
// 1) PASSWORD LOGIN สำหรับ Notebook / PC
// ======================================================
async function handlePasswordLogin(event) {
  event.preventDefault();

  const username = document.getElementById("username").value.trim().toLowerCase();
  const password = document.getElementById("pvtPassword").value;
  const rememberMe = document.getElementById("rememberMe").checked;

  if (!username || !password) {
    alert("กรุณากรอก Username และ Password");
    return;
  }

  const loginEmail = username.includes("@")
    ? username
    : `${username}@pvt.local`;

  const { data: authData, error: authError } = await sb.auth.signInWithPassword({
    email: loginEmail,
    password: password
  });

  if (authError) {
    alert("❌ Username หรือ Password ไม่ถูกต้อง");
    return;
  }

  const { data: profile, error: profileError } = await sb
    .from("profiles")
    .select("id, email, username, display_name, department_code, role, status")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !profile) {
  alert("เข้าสู่ระบบได้ แต่ไม่พบข้อมูลผู้ใช้ในตาราง profiles");
  return;
}

  if (profile.status !== "active") {
    alert("บัญชีนี้ถูกปิดใช้งาน");
    await sb.auth.signOut();
    return;
  }

saveSession({
  loginType: "password",
  userId: profile.id,
  username: profile.username,
  fullName: profile.display_name,
  department: profile.department_code,
  role: profile.role
});

  if (rememberMe) {
    localStorage.setItem("rememberedUser", username);
  } else {
    localStorage.removeItem("rememberedUser");
  }

  redirectByRole(profile.role);
}

// ======================================================
// 2) QR MODE สำหรับ Tablet / Mobile
// URL ตัวอย่าง:
// /login.html?dept=blow&token=BLOW001
// ======================================================
async function checkQrMode() {
  const params = new URLSearchParams(window.location.search);
  const dept = params.get("dept");
  const token = params.get("token");

  if (!dept || !token) return;

  const { data: qrData, error: qrError } = await sb
    .from("department_qr_tokens")
    .select("id, email, username, display_name, department_code, role, status")
    .eq("department", dept)
    .eq("token", token)
    .eq("status", "active")
    .single();

  if (qrError || !qrData) {
    alert("QR Code นี้ไม่ถูกต้อง หรือถูกปิดใช้งานแล้ว");
    return;
  }

  document.getElementById("qrLoginBox").classList.remove("hidden");
  document.getElementById("qrDeptName").textContent =
    qrData.department_name || qrData.department;

  localStorage.setItem("qrDept", qrData.department);
  localStorage.setItem("qrDeptName", qrData.department_name || qrData.department);
  localStorage.setItem("qrToken", token);

  await loadStaffByDepartment(qrData.department);
}

// ======================================================
// LOAD STAFF LIST BY DEPARTMENT
// ======================================================
async function loadStaffByDepartment(department) {
  const select = document.getElementById("qrStaffSelect");

  const { data: staffList, error } = await sb
    .from("profiles")
    .select("id, email, username, display_name, department_code, role, status")
    .eq("department", department)
    .eq("status", "active")
    .order("full_name", { ascending: true });

  if (error) {
    select.innerHTML = `<option value="">โหลดรายชื่อไม่สำเร็จ</option>`;
    return;
  }

  if (!staffList || staffList.length === 0) {
    select.innerHTML = `<option value="">ไม่พบรายชื่อพนักงานในแผนกนี้</option>`;
    return;
  }

  select.innerHTML = `<option value="">-- เลือกผู้บันทึก --</option>`;

  staffList.forEach((staff) => {
    const option = document.createElement("option");
    option.value = staff.id;
    option.textContent = staff.full_name || staff.username;
    option.dataset.username = staff.username || "";
    option.dataset.fullName = staff.full_name || staff.username || "";
    option.dataset.department = staff.department || "";
    option.dataset.role = staff.role || "staff";
    select.appendChild(option);
  });
}

// ======================================================
// QR LOGIN
// ======================================================
function handleQrLogin() {
  const select = document.getElementById("qrStaffSelect");
  const selected = select.options[select.selectedIndex];

  if (!select.value) {
    alert("กรุณาเลือกชื่อผู้บันทึก");
    return;
  }

  const department = localStorage.getItem("qrDept");
  const departmentName = localStorage.getItem("qrDeptName");

  saveSession({
    loginType: "qr",
    userId: select.value,
    username: selected.dataset.username,
    fullName: selected.dataset.fullName,
    department: department,
    departmentName: departmentName,
    role: "staff_qr"
  });

  window.location.href = "/html/form-department.html";
}

// ======================================================
// SAVE SESSION
// ======================================================
function saveSession(data) {
  localStorage.setItem("loginType", data.loginType || "");
  localStorage.setItem("activeUserId", data.userId || "");
  localStorage.setItem("activeUser", data.username || "");
  localStorage.setItem("activeName", data.fullName || data.username || "");
  localStorage.setItem("activeDept", data.department || "");
  localStorage.setItem("activeRole", data.role || "staff");
}
// ======================================================
// REDIRECT BY ROLE
// ======================================================
function redirectByRole(role) {
  if (
    role === "admin" ||
    role === "accounting" ||
    role === "supervisor" ||
    role === "management"
  ) {
    window.location.href = "/index2.html";
    return;
  }

  window.location.href = "/html/form-department.html";
}