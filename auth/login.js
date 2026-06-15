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

  const loginBtn = document.querySelector(".btn-login");
  if (loginBtn) loginBtn.disabled = true;

  const usernameInput = document
    .getElementById("username")
    .value
    .trim()
    .toUpperCase();

  const passwordInput = document.getElementById("pvtPassword").value;

  const rememberMeChecked =
    document.getElementById("rememberMe")?.checked;

  try {
    console.log("🔍 กำลังตรวจสอบ Username และ Password...");

    const { data: profile, error } = await sb
      .from("profiles")
      .select("*")
      .eq("username", usernameInput)
      .eq("password", passwordInput)
      .eq("status", "active")
      .single();

    if (error || !profile) {
      throw new Error("Invalid login");
    }

    const activeName =
      profile.full_name ||
      profile.display_name ||
      profile.username ||
      "พนักงาน PVT";

    // Remember Me
    if (rememberMeChecked) {
      localStorage.setItem("rememberedUser", usernameInput);
    } else {
      localStorage.removeItem("rememberedUser");
    }

    // Save Session
    localStorage.setItem("loginType", "password");
    localStorage.setItem("activeUserId", profile.id);
    localStorage.setItem("activeUser", profile.username);
    localStorage.setItem("activeName", activeName);
    localStorage.setItem(
      "activeDept",
      profile.department || ""
    );
    localStorage.setItem(
      "activeRole",
      profile.role || "staff"
    );

    alert(`🎉 ยินดีต้อนรับคุณ ${activeName}`);

    redirectByRole(profile.role);

  } catch (err) {
    console.error("❌ Login Error:", err);

    alert("❌ Username หรือ Password ไม่ถูกต้อง");
  } finally {
    if (loginBtn) {
      loginBtn.disabled = false;
    }
  }
}

// ======================================================
// 1) PASSWORD LOGIN สำหรับ Notebook / PC (เวอร์ชันซ่อมบั๊กรีหน้าเดิม)
// ======================================================
// async function handlePasswordLogin(event) {
//   event.preventDefault();
  
//   // 🎯 ดักจับปุ่ม Login เผื่อไว้หมุนโหลด
//   const loginBtn = document.querySelector(".btn-login");
//   if (loginBtn) loginBtn.disabled = true;

//   const usernameInput = document.getElementById("username").value.trim(); // เช่น blow01
//   const passwordInput = document.getElementById("pvtPassword").value;
//   const rememberMeChecked = document.getElementById("rememberMe")?.checked;

//   // ⚡ เติมโดเมนอัตโนมัติหลังบ้านเพื่อให้ Supabase Auth ทำงานได้ผ่านชื่อย่อ
//   const targetEmail = usernameInput.includes("@") ? usernameInput : `${usernameInput}@pvt.com`;

//   try {
//     console.log("🚀 กำลังส่งข้อมูลไปตรวจสอบกับ Supabase Auth...");
//     const { data, error } = await sb.auth.signInWithPassword({
//       email: targetEmail,
//       password: passwordInput,
//     });

//     if (error) throw error;

//     console.log("🔑 Auth สำเร็จ! กำลังดึงข้อมูลจากตาราง profiles...");
//     // ดึง Profile ไปเช็ค Role และแผนก
//     const { data: profile, error: profError } = await sb
//       .from('profiles')
//       .select('*')
//       .eq('id', data.user.id)
//       .single();

//     if (profError) throw profError;

//     // 🎯 แก้บั๊กจุดตกม้าตาย: ดักจับชื่อพนักงานให้รองรับทุกโครงสร้างตาราง (ป้องกัน undefined ทำระบบล่ม)
//     const activeName = profile.full_name || profile.display_name || profile.username || "พนักงาน PVT";

//     // 🎯 ระบบจดจำผู้ใช้งาน (Remember Me)
//     if (rememberMeChecked) {
//       localStorage.setItem("rememberedUser", usernameInput);
//     } else {
//       localStorage.removeItem("rememberedUser");
//     }

//     // เซ็ตระบบความปลอดภัยลงเครื่อง
//     localStorage.setItem("loginType", "password");
//     localStorage.setItem("activeUserId", data.user.id);
//     localStorage.setItem("activeUser", profile.username || usernameInput);
//     localStorage.setItem("activeName", activeName);
//     localStorage.setItem("activeDept", profile.department || profile.department_code || "");
//     localStorage.setItem("activeRole", profile.role || "staff");

//     alert(`🎉 ยินดีต้อนรับคุณ ${activeName} เข้าสู่ระบบ!`);
    
//     // นำทางไปยังหน้าตามตำแหน่งสิทธิ์
//     redirectByRole(profile.role);

//   } catch (err) {
//     console.error("❌ Login Error Detail:", err);
//     alert("❌ เข้าสู่ระบบล้มเหลว: Username หรือ Password ไม่ถูกต้อง หรือโครงสร้างบัญชีมีปัญหา");
//   } finally {
//     if (loginBtn) loginBtn.disabled = false;
//   }
// }

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
// ฟังก์ชันแยกทางเดินหลังจาก Login สำเร็จ
// ======================================================
// REDIRECT BY ROLE (เวอร์ชันแก้ไขใหม่สลายบั๊ก 404 สำหรับ PVT)
// ======================================================
function redirectByRole(role) {
  // แปลงให้เป็นตัวพิมพ์เล็กทั้งหมดเพื่อป้องกันระบบพิมพ์ผิดพิมพ์ถูก
  const currentRole = String(role).toLowerCase().trim();

  console.log("🎯 ระบบกำลังนำทางสำหรับสิทธิ์ตำแหน่ง:", currentRole);

  if (currentRole === "admin") {
    // 1. แอดมิน -> ไปหน้าจัดการเครื่องจักร/ปัญหา
    window.location.href = "html/admintor.html";
  } 
  else if (currentRole === "management") {
    // 2. ผู้บริหาร -> ไปหน้าแดชบอร์ดสรุปยอดรวม
    window.location.href = "index2.html";
  } 
  else if (currentRole === "accounting") {
    // 3. แผนกบัญชี -> ไปหน้าคีย์ต้นทุนบาทและโหลด Excel ภาษาไทย
    window.location.href = "accounting-panel.html";
  } 
  else if (currentRole === "supervisor") {
    // 4. หัวหน้าแผนก -> ไปหน้าฟอร์มกรอกข้อมูล (เพื่อคีย์น้ำหนักของเสีย Kg)
    // ⚠️ ถ้าไฟล์อยู่ที่หน้าแรกสุด ใช้ตัวเลือกนี้:
    window.location.href = "index2.html";
    
    // 💡 หมายเหตุ: หากลองกดแล้วยังเจอ 404 อีก ให้ลบคอมเมนต์บรรทัดข้างล่างนี้ออกแล้วเปิดใช้แทนครับ
    // window.location.href = "html/form-department.html";
  } 
  else {
    // 5. พนักงานทั่วไป / คนที่สแกน QR Code เข้ามา -> ไปหน้าฟอร์มปกติ
    window.location.href = "form-department.html";
  }
}

// ฟังก์ชันสำหรับ สลับสถานะ ซ่อน/แสดง แผงคำแนะนำ (ไกด์)
// ฟังก์ชันสำหรับสลับสถานะ ซ่อน/แสดง แผงคำแนะนำ (ไกด์)
function toggleGuidePanel() {
  const guideCard = document.getElementById('guideCard');
  if (!guideCard) return;
  
  const toggleText = guideCard.querySelector('.toggle-text');
  const toggleIcon = guideCard.querySelector('.toggle-icon');
  
  // สลับการสไลด์ เปิด-ปิด กล่องแผงไกด์คำแนะนำ
  guideCard.classList.toggle('active');
  
  // ⚡ สลับคำบนปุ่มให้อ่านง่าย สบายตา ไม่มึนหัว
  if (guideCard.classList.contains('active')) {
    if (toggleText) toggleText.innerText = 'ซ่อนคำแนะนำ';
    if (toggleIcon) toggleIcon.innerText = '❌';
  } else {
    if (toggleText) toggleText.innerText = 'ดูวิธีเข้าใช้งาน';
    if (toggleIcon) toggleIcon.innerText = 'ℹ️';
  }

}