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

  const skipSplash =
    sessionStorage.getItem("skipLoginSplash") === "1";

  if (skipSplash) {

    sessionStorage.removeItem("skipLoginSplash");

    const splash = document.getElementById("splash-screen");

    if (splash) {
      splash.style.display = "none";
    }

  } else {

    hideSplash();

  }

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
  // ใช้จังหวะเดียวกันทั้งแอป (services/loadingService.js):
  // เปิดแอปครั้งแรกเล่นแอนิเมชันเต็ม, เปลี่ยนหน้าครั้งต่อไปแสดงสั้น ๆ
  if (window.LoadingService?.hideSplash) {
    window.LoadingService.hideSplash();
    return;
  }
  setTimeout(() => {
    const splash = document.getElementById("splash-screen");
    if (splash) splash.classList.add("hide");
  }, 1150);
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

class LoginError extends Error {}

// status ว่าง / null ถือว่าใช้งานได้ (ข้อมูลเก่าบางแถวไม่มีค่า) — ปิดเฉพาะที่ระบุไว้ชัดเจน
function isInactiveStatus(status) {
  const s = String(status || "").trim().toLowerCase();
  return s !== "" && s !== "active";
}

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

    // 1) หา email จาก username
    //    - escape อักขระ _ และ % (ใน ilike เป็น wildcard ทำให้เจอหลายแถวแล้วหาไม่เจอ)
    //    - ถ้าเจอหลายแถว เลือกแถวที่ชื่อตรงกันพอดีก่อน
    const usernamePattern = usernameInput.replace(/[\\%_]/g, (c) => "\\" + c);
    let userProfile = null;
    try {
      const res = await sb
        .from("profiles")
        .select("id, email, username, status")
        .ilike("username", usernamePattern)
        .limit(5);
      const rows = Array.isArray(res.data) ? res.data : [];
      userProfile =
        rows.find((r) => String(r.username || "") === usernameInput) ||
        rows.find((r) => String(r.username || "").toUpperCase() === usernameInput) ||
        rows[0] ||
        null;
      if (res.error) console.warn("Profile lookup error:", res.error);
    } catch (e) {
      console.warn("Profile query error:", e);
    }

    if (userProfile && isInactiveStatus(userProfile.status)) {
      throw new LoginError("บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ");
    }

    // ลองอีเมลใน profiles ก่อน แล้วค่อยลองรูปแบบ username@pvt.local
    const candidateEmails = [
      String(userProfile?.email || "").trim().toLowerCase(),
      `${usernameInput.toLowerCase()}@pvt.local`,
    ].filter((v, i, arr) => v && arr.indexOf(v) === i);

    // 2) ตรวจรหัสผ่านกับ Supabase Auth — ถ้าไม่ผ่านต้องหยุด (ห้ามเข้าแบบไม่ตรวจรหัส)
    let authData = null;
    let authError = null;
    for (const email of candidateEmails) {
      const res = await sb.auth.signInWithPassword({
        email,
        password: passwordInput,
      });
      authData = res.data;
      authError = res.error;
      if (!authError && authData?.user) break;
      console.warn("Sign-in failed for", email, authError?.message);
    }

    if (authError || !authData?.user) {
      const msg = String(authError?.message || "");
      if (/email not confirmed/i.test(msg)) {
        throw new LoginError("บัญชียังไม่ได้ยืนยันอีเมล กรุณาให้ผู้ดูแลระบบเปิดใช้งานบัญชี");
      }
      if (/fetch|network/i.test(msg)) {
        throw new LoginError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต");
      }
      throw new LoginError(
        userProfile
          ? "รหัสผ่านไม่ถูกต้อง หรือบัญชีนี้ยังไม่มีในระบบ Login (Supabase Auth) — ให้ผู้ดูแลระบบตั้งรหัสผ่านใหม่ในหน้า Admin"
          : "ไม่พบ Username นี้ หรือรหัสผ่านไม่ถูกต้อง",
      );
    }

    // 3) โหลด profile ของบัญชีที่ล็อกอินสำเร็จ
    const { data: profile, error: profileError } = await sb
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
          status,
          is_system_owner
        `,
      )
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError || !profile || isInactiveStatus(profile.status)) {
      try {
        await sb.auth.signOut();
      } catch (_) {}
      if (profileError) {
        throw new LoginError("อ่านข้อมูลผู้ใช้ไม่ได้: " + profileError.message);
      }
      if (!profile) {
        throw new LoginError(
          "รหัสผ่านถูกต้อง แต่ไม่พบข้อมูลผู้ใช้ในตาราง profiles ที่ id ตรงกับบัญชี Login — กรุณาติดต่อผู้ดูแลระบบ",
        );
      }
      throw new LoginError("บัญชีนี้ถูกปิดใช้งาน กรุณาติดต่อผู้ดูแลระบบ");
    }

    if (rememberMeChecked) {
      localStorage.setItem("rememberedUser", usernameInput);
    } else {
      localStorage.removeItem("rememberedUser");
    }

    AUTH_GUARD.saveProfileSession(profile, "supabase_auth");

    console.log("=== AUTH LOGIN SUCCESS ===");
    console.log("ROLE =", profile.role);
    console.log("DEPT =", profile.department_code);

    redirectByRole(profile.role || "staff");
  } catch (err) {
    console.error("Login Error:", err);
    alert(
      err instanceof LoginError
        ? err.message
        : "เข้าสู่ระบบไม่สำเร็จ: " + (err?.message || err),
    );
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
  const userRole = selected.dataset.role || "staff";

  AUTH_GUARD.saveProfileSession(
    {
      id: select.value,
      username: selected.dataset.username || "",
      full_name: selected.dataset.fullName || "",
      display_name: selected.dataset.fullName || "",
      department_code:
        selected.dataset.department || localStorage.getItem("qrDept") || "",
      department:
        selected.dataset.departmentName ||
        localStorage.getItem("qrDeptName") ||
        "",
      role: userRole,
      status: "active",
    },
    "qr",
  );

  redirectByRole(userRole || "staff");
}

/* ======================================================
   SAVE SESSION
====================================================== */

/* ======================================================
   REDIRECT BY ROLE
====================================================== */

function redirectByRole(role) {
  if (!window.ROLE_CONFIG) {
    console.error("❌ ROLE_CONFIG ไม่พร้อมใช้งาน");
    window.location.href = "/pages/form-department.html";
    return;
  }

  const targetPage = ROLE_CONFIG.getDefaultPage(role);
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
  window.location.href =
    "https://ea-factory-2sx.pages.dev/pages/form-department.html?dept=SHEET";
}

let qrScanner = null;

/* ======================================================
   QR SCANNER
====================================================== */

function showQrScanner() {
  const modal = document.getElementById("qrScannerModal");

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
      onQrScanSuccess,
    )
    .catch((err) => {
      console.warn("Camera start failed, showing fallback UI:", err);
      
      const qrReader = document.getElementById("qr-reader");
      if (qrReader) {
        qrReader.innerHTML = `
          <div style="padding: 24px 16px; text-align: center; color: #f1f5f9; background: #1e293b; border-radius: 12px; display: flex; flex-direction: column; align-items: center; gap: 12px;">
            <span class="material-symbols-outlined" style="font-size: 48px; color: #94a3b8;">no_photography</span>
            <div style="font-size: 15px; font-weight: 600; color: #e2e8f0;">ไม่พบกล้อง หรือสิทธิ์กล้องถูกปฏิเสธ</div>
            <p style="font-size: 13px; color: #94a3b8; margin: 0; line-height: 1.4;">อุปกรณ์ของคุณไม่มีกล้อง หรือเบราว์เซอร์ไม่ได้รับอนุญาตให้ใช้กล้อง คุณสามารถอัปโหลดรูปภาพ QR หรือใช้วิธีอื่นๆ ได้</p>
            
            <button type="button" id="btn-upload-qr-fallback" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 8px; font-size: 13px; padding: 10px 16px; border-radius: 8px; width: 100%; justify-content: center; font-weight: 600; background: #3b82f6; border: none; color: white; cursor: pointer;">
              <span class="material-symbols-outlined" style="font-size: 18px;">upload_file</span>
              อัปโหลดรูปภาพ QR
            </button>
            <input type="file" id="qr-file-input-fallback" accept="image/*" style="display: none;" />
            
            <div style="width: 100%; border-top: 1px solid #334155; margin: 8px 0;"></div>
            
            <a href="/login.html" style="font-size: 13px; color: #3b82f6; text-decoration: none; font-weight: 600;">กลับหน้าล็อกอินแบบปกติ</a>
          </div>
        `;
        
        const uploadBtn = document.getElementById("btn-upload-qr-fallback");
        const fileInput = document.getElementById("qr-file-input-fallback");
        
        if (uploadBtn && fileInput) {
          uploadBtn.addEventListener("click", () => fileInput.click());
          fileInput.addEventListener("change", (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            window.LoadingService?.show("กำลังสแกนรูปภาพ", "กรุณารอสักครู่...");
            
            const fileReaderQr = new Html5Qrcode("qr-reader");
            fileReaderQr.scanFile(file, true)
              .then((decodedText) => {
                window.LoadingService?.hide();
                onQrScanSuccess(decodedText);
              })
              .catch((scanErr) => {
                window.LoadingService?.hide();
                console.warn("Scan file error:", scanErr);
                alert("สแกนภาพ QR ไม่สำเร็จ! กรุณาตรวจสอบว่าในรูปภาพมีรหัส QR Code ที่ชัดเจน");
              });
          });
        }
      }
    });
}

function closeQrScanner() {
  const modal = document.getElementById("qrScannerModal");

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

  // สั่นสั้น ๆ ให้รู้ว่าสแกนติดแล้ว (มือถือที่รองรับ)
  try {
    navigator.vibrate && navigator.vibrate(60);
  } catch (_) {}

  if (qrScanner) {
    qrScanner.stop();
  }

  /*
    ตัวอย่าง QR

    https://prod-ea-factory.pages.dev/login?dept=blow&token=BLOW001
  */

  let target = null;
  try {
    target = new URL(String(decodedText || "").trim(), window.location.origin);
  } catch (_) {
    target = null;
  }

  if (!target || !["http:", "https:"].includes(target.protocol)) {
    alert("QR Code นี้ไม่ใช่ลิงก์เข้าสู่ระบบที่ถูกต้อง");
    return;
  }

  window.location.href = target.href;
}