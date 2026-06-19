// ======================================================
// auth.js
// ใช้สำหรับ Login / Protect Page / Logout
// ต้องโหลด supabaseClient.js และ roleConfig.js ก่อนไฟล์นี้
// ======================================================

if (typeof supabaseClient === "undefined") {
  console.error("❌ supabaseClient ไม่พร้อมใช้งาน");
}

if (typeof ROLE_CONFIG === "undefined") {
  console.error("❌ ROLE_CONFIG ไม่พร้อมใช้งาน");
}

// ======================================================
// HELPER
// ======================================================

function normalizeRole(role) {
  return ROLE_CONFIG.normalizeRole(role);
}

function getDefaultPage(role) {
  return ROLE_CONFIG.getDefaultPage(role);
}

// ======================================================
// LOGIN SECTION
// ======================================================

const loginForm = document.getElementById("loginForm");

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const msg = document.getElementById("message");

    try {
      msg.innerText = "กำลังเข้าสู่ระบบ...";
      msg.style.color = "#666";

      const { data, error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password,
        });

      if (error) {
        msg.innerText = "เข้าสู่ระบบไม่สำเร็จ: " + error.message;
        msg.style.color = "red";
        return;
      }

      const { data: profile, error: profileError } =
        await supabaseClient
          .from("profiles")
          .select("id, email, display_name, role, status, department_code")
          .eq("id", data.user.id)
          .single();

      if (profileError || !profile) {
        await supabaseClient.auth.signOut();
        msg.innerText = "ไม่พบข้อมูลผู้ใช้ในตาราง profiles";
        msg.style.color = "red";
        return;
      }

      if (String(profile.status || "").toLowerCase() !== "active") {
        await supabaseClient.auth.signOut();
        msg.innerText = "บัญชีของคุณถูกระงับการใช้งาน";
        msg.style.color = "red";
        return;
      }

      localStorage.setItem("ea_profile", JSON.stringify(profile));

      const destination = getDefaultPage(profile.role);

      msg.innerText = "เข้าสู่ระบบสำเร็จ!";
      msg.style.color = "green";

      setTimeout(() => {
        window.location.href = destination;
      }, 500);
    } catch (error) {
      console.error("❌ Unexpected login error:", error);
      msg.innerText = "เกิดข้อผิดพลาดในการเข้าสู่ระบบ";
      msg.style.color = "red";
    }
  });
}

// ======================================================
// PROTECT PAGE BY ROLE
// ======================================================

async function protectPage(allowedRoles = []) {
  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabaseClient.auth.getSession();

    if (sessionError || !session) {
      window.location.href = "/pages/auth/login.html";
      return;
    }

    const { data: profile, error: profileError } =
      await supabaseClient
        .from("profiles")
        .select("id, email, display_name, role, status, department_code")
        .eq("id", session.user.id)
        .single();

    if (profileError || !profile) {
      await supabaseClient.auth.signOut();
      window.location.href = "/pages/auth/login.html";
      return;
    }

    if (String(profile.status || "").toLowerCase() !== "active") {
      await supabaseClient.auth.signOut();
      alert("บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อ Admin");
      window.location.href = "/pages/auth/login.html";
      return;
    }

    localStorage.setItem("ea_profile", JSON.stringify(profile));

    const userRole = normalizeRole(profile.role);

    const allowed = allowedRoles.map(normalizeRole);

    if (allowed.length > 0 && !allowed.includes(userRole)) {
      window.location.href = getDefaultPage(userRole);
      return;
    }

    if (typeof initUserService === "function") {
      await initUserService();
    }
  } catch (error) {
    console.error("❌ protectPage error:", error);
    window.location.href = "/pages/auth/login.html";
  }
}

// ======================================================
// CHECK AUTH STATUS
// ======================================================

async function checkAuthStatus() {
  try {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();

    return !!session;
  } catch (error) {
    console.error("❌ checkAuthStatus error:", error);
    return false;
  }
}

// ======================================================
// LOGOUT
// ======================================================

async function logout() {
  await supabaseClient.auth.signOut();
  localStorage.removeItem("ea_profile");
  window.location.href = "/pages/auth/login.html";
}

// ======================================================
// EXPORT TO GLOBAL
// ======================================================

window.protectPage = protectPage;
window.checkAuthStatus = checkAuthStatus;
window.logout = logout;