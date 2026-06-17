
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
  const token = params.get("token");
  // แม้ไม่มี dept ส่งมา โค้ดจะอนุญาตให้ทำงานต่อเพื่อนำ token ไปค้นหาแผนกจริงหลังบ้าน
  const dept = params.get("dept"); 

  if (!token) return; // หากไม่มี token เลยค่อยยกเลิก

  console.log("[qr_process] พบรหัส Token จากการสแกน:", token);

  const qrBox = document.getElementById("qrLoginBox");
  const qrDeptName = document.getElementById("qrDeptName");

  try {
    showLoginOverlay(); // เปิดแอนิเมชันกำลังโหลด

    // วิ่งไปค้นหาข้อมูลแผนกจากฐานข้อมูลโดยใช้สิทธิ์ของ Token ตัวเดียวเพื่อความปลอดภัย
    const { data: qrData, error: qrError } = await sb
      .from("department_qr_tokens")
      .select("*")
      .eq("token", token)
      .eq("status", "active")
      .maybeSingle();

    if (qrError || !qrData) {
      throw new Error("QR Code นี้ไม่มีอยู่ในระบบ หรือถูกยกเลิกการใช้งานแล้ว");
    }

    // สกัดดึงรหัสแผนก และชื่อแผนกจริงออกมาจากแถวข้อมูลในฐานข้อมูล
    const departmentCode = qrData.department_code || qrData.department;
    const departmentName = qrData.department_name || qrData.department || departmentCode;

    if (!departmentCode) {
      throw new Error("ข้อมูล Token นี้ไม่ได้ผูกกับรหัสแผนกใดๆ");
    }

    // 🎯 1. เปิดกล่องเลือกรายชื่อพนักงานขึ้นมาโชว์บนหน้าจอ
    if (qrBox) qrBox.classList.remove("hidden");
    if (qrDeptName) qrDeptName.textContent = `แผนก: ${departmentName}`;

    // 🎯 2. จำลองบันทึกค่าลงเครื่องชั่วคราว
    localStorage.setItem("qrDept", departmentCode);
    localStorage.setItem("qrDeptName", departmentName);
    localStorage.setItem("qrToken", token);

    // 🎯 3. สั่งโหลดรายชื่อเพื่อนพนักงานในแผนกนั้นมาใส่ใน Select Option
    await loadStaffByDepartment(departmentCode);

  } catch (err) {
    console.error("QR Login Error:", err);
    alert(err.message || "QR Code นี้ไม่ถูกต้อง หรือถูกปิดใช้งานแล้ว");
  } finally {
    hideLoginOverlay(); // ปิดแอนิเมชันโหลด
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


let qrScanner = null;

/* ======================================================
   QR SCANNER
====================================================== */

function showQrScanner() {

  const modal =
    document.getElementById("qrScannerModal");

  if (!modal) return;

  modal.classList.remove("hidden");

  qrScanner = new Html5Qrcode("qr-reader");

  qrScanner
    .start(
      {
        facingMode: "environment",
      },
      {
        fps: 10,
        qrbox: 250,
      },
      onQrScanSuccess
    )
    .catch((err) => {
      console.error(err);
      alert("ไม่สามารถเปิดกล้องได้");
    });
}

function closeQrScanner() {

  const modal =
    document.getElementById("qrScannerModal");

  if (qrScanner) {
    qrScanner
      .stop()
      .then(() => {
        qrScanner.clear();
        qrScanner = null;
      })
      .catch(console.error);
  }

  if (modal) {
    modal.classList.add("hidden");
  }
}

function onQrScanSuccess(decodedText) {

  console.log("QR =", decodedText);

  if (qrScanner) {
    qrScanner.stop();
  }

  /*
    ตัวอย่าง QR

    https://prod-ea-factory.pages.dev/login?dept=blow&token=BLOW001
  */

  window.location.href = decodedText;
}

// ฟังก์ชันสำหรับเจนภาพ QR Code แผนกอัตโนมัติจากฐานข้อมูล
// 🔄 ฟังก์ชันสลับเปลี่ยนภาพ QR Code ตามแผนกที่พี่เลือก (ดึงค่า Token จากฐานข้อมูล Supabase จริง)

// ฟังก์ชันสำหรับเจนภาพ QR Code แผนกอัตโนมัติจากฐานข้อมูล
async function generateDeptQrOnScreen(deptCode) {
  const currentClient = window.supabaseClient || window.sb;
  if (!currentClient) return;

  // วิ่งไปดึง Token ล่าสุดของแผนกจากตารางใน Supabase ที่พี่ส่งมา
  const { data, error } = await currentClient
    .from('department_qr_tokens')
    .select('token')
    .eq('department_code', deptCode)
    .eq('status', 'active')
    .single();

  if (data && data.token) {
    // ผูกลิงก์ระบบของโรงงานเข้ากับรหัส Token
    const targetUrl = `https://ea-factory.pvt.com/login2.html?token=${data.token}`;
    
    // สั่งเปลี่ยนรูปภาพบนหน้าเว็บให้เป็น QR Code ลิงก์นั้นทันที
    const qrImageElement = document.getElementById("dept-qr-image");
    if (qrImageElement) {
      qrImageElement.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(targetUrl)}`;
    }
  }
}

async function updateDeptQrCode() {
  const selector = document.getElementById("deptQrSelector");
  const qrArea = document.getElementById("qrArea");
  const qrImage = document.getElementById("generatedDeptQr");
  const qrLabel = document.getElementById("qrLabelText");

  if (!selector || !selector.value) {
    if (qrArea) qrArea.classList.add("hidden");
    return;
  }

  const selectedDept = selector.value;
  const deptText = selector.options[selector.selectedIndex].text;
  
  const currentClient = window.supabaseClient || window.sb;
  let token = selectedDept; 

  if (currentClient) {
    try {
      const { data, error } = await currentClient
        .from('department_qr_tokens')
        .select('token')
        .eq('department_code', selectedDept)
        .eq('status', 'active')
        .limit(1);

      if (data && data.length > 0) {
        token = data[0].token;
      }
    } catch (err) {
      console.warn("⚠️ คิวรี่ Token ไม่สำเร็จ ใช้แผนสำรองสร้าง QR ตรงๆ");
    }
  }

  // 🔗 ประกอบ URL: แก้ไขให้วิ่งเข้าไฟล์หลักที่พนักงานใช้ล็อกอิน (เช่น login.html) 
  // และพ่วง Token ตัวจริงเพื่อส่งไปประมวลผลต่อฝั่งพนักงานสแกนครับ
  const currentDomain = window.location.origin; 
  const targetUrl = `${currentDomain}/login.html?token=${token}`;

  // 🖼️ ยิงสร้างภาพ QR Code ชิ้นงาน
  if (qrImage && qrArea && qrLabel) {
    qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(targetUrl)}`;
    qrLabel.innerHTML = `<span class="material-symbols-outlined" style="vertical-align: middle; margin-right: 5px; color: #4caf8a;">track_changes</span> ป้าย QR Code ประจำ: ${deptText}`;
    qrArea.classList.remove("hidden");
  }
}

  // 🔗 ประกอบ URL ปลายทางที่พนักงานจะวิ่งไปหน้าฟอร์มกรอกข้อมูลหลังจากสแกนสำเร็จ
  // (เปลี่ยนคำว่า yourdomain.com เป็นชื่อโดเมนเว็บจริงของโรงงานพี่ได้เลยครับ)
  const currentDomain = window.location.origin; 
  const targetUrl = `${currentDomain}/login2.html?token=${token}`;

  // 🖼️ ยิงเข้า API เพื่อเสกรูป QR Code ออกมาแบบสดๆ
 // ✅ แก้ไขใหม่ในไฟล์ /auth/login.js ให้เป็นแบบนี้ครับ:
if (qrImage && qrArea && qrLabel) {
  qrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(targetUrl)}`;
  
  // เปลี่ยนมาใช้ .innerHTML และใส่โค้ดไอคอน Google แทนอิโมจิเดิม
  qrLabel.innerHTML = `<span class="material-symbols-outlined" style="vertical-align: middle; margin-right: 5px; color: #4caf8a;">track_changes</span> ป้าย QR Code ประจำ: ${deptText}`;
  
  qrArea.classList.remove("hidden");
}
// ผูกฟังก์ชันเข้ากับ window เผื่อหน้า HTML เรียกหา
window.updateDeptQrCode = updateDeptQrCode;