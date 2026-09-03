/* ======================================================
   authGuard.js - EA Factory Auth Guard
   ใช้เช็ค Supabase Auth + โหลด profile ปัจจุบัน
====================================================== */

const AUTH_LOGIN_PAGE = "/login.html";
let CURRENT_USER = null;

async function getCurrentAuthUser() {
  if (!window.supabaseClient?.auth) return null;

  const { data, error } = await window.supabaseClient.auth.getUser();

  if (error || !data?.user) return null;

  return data.user;
}

async function getCurrentProfile() {
  const authUser = await getCurrentAuthUser();

  if (!authUser) return null;

  const { data: profile, error } = await window.supabaseClient
    .from("profiles")
    .select(`
      id,
      username,
      email,
      full_name,
      display_name,
      department,
      department_code,
      role,
      status,
      is_system_owner
    `)
    .eq("id", authUser.id)
    .eq("status", "active")
    .maybeSingle();

  if (error || !profile) return null;

  return profile;
}

async function requireLogin(allowedRoles = []) {
  const profile = await getCurrentProfile();

  if (!profile) {
    clearLocalLogin();
    window.location.href = AUTH_LOGIN_PAGE;
    return null;
  }

  const role = String(profile.role || "staff").toLowerCase();
  const allowed = (allowedRoles || []).map((r) => String(r).toLowerCase());

  if (allowed.length && !allowed.includes(role)) {
    alert("คุณไม่มีสิทธิ์เข้าใช้งานหน้านี้");
    window.location.href = AUTH_LOGIN_PAGE;
    return null;
  }

  saveProfileSession(profile);
CURRENT_USER = profile;

  return profile;
}

function clearLocalLogin() {
  localStorage.removeItem("loginType");
  localStorage.removeItem("activeUserId");
  localStorage.removeItem("activeUser");
  localStorage.removeItem("activeName");
  localStorage.removeItem("activeRole");
  localStorage.removeItem("activeDept");
  localStorage.removeItem("activeDeptName");
  sessionStorage.clear();
}

async function logoutAndRedirect() {
  try {
    if (window.supabaseClient?.auth) {
      await Promise.race([
        window.supabaseClient.auth.signOut(),
        new Promise((res) => setTimeout(res, 800)),
      ]);
    }
  } catch (e) {
    console.warn("Supabase signOut error:", e);
  } finally {
    clearLocalLogin();
    window.location.href = AUTH_LOGIN_PAGE;
  }
}


function saveProfileSession(profile, loginType = "supabase_auth") {
  if (!profile) return;

  const role = window.ROLE_CONFIG
    ? ROLE_CONFIG.normalizeRole(profile.role)
    : String(profile.role || "staff").toLowerCase();

  localStorage.setItem("loginType", loginType);
  localStorage.setItem("activeUserId", profile.id || "");
  localStorage.setItem("activeUser", profile.username || "");
  localStorage.setItem(
    "activeName",
    profile.full_name || profile.display_name || profile.username || ""
  );
  localStorage.setItem(
    "activeDept",
    (profile.department_code || profile.department || "").toLowerCase()
  );
  localStorage.setItem(
    "activeDeptName",
    profile.department || profile.department_code || ""
  );
  localStorage.setItem("activeRole", role);
}

async function loadCurrentUser() {
  const profile = await getCurrentProfile();

  if (!profile) {
    CURRENT_USER = null;
    return null;
  }

  CURRENT_USER = profile;
  saveProfileSession(profile);

  return profile;
}

function getCurrentUser() {
  return CURRENT_USER;
}

window.AUTH_GUARD = {
   getCurrentAuthUser,
  getCurrentProfile,
  loadCurrentUser,
  getCurrentUser,
  requireLogin,
  clearLocalLogin,
  logoutAndRedirect,
  saveProfileSession,
};