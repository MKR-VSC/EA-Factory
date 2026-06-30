// ======================================================
// activityLogger.js
// ใช้บันทึกประวัติการใช้งานระบบ
// ======================================================

function getDeviceType() {
  const width = window.innerWidth;

  if (width <= 768) return "mobile";
  if (width <= 1024) return "tablet";
  return "desktop";
}

function getBrowserName() {
  const ua = navigator.userAgent;

  if (ua.includes("Edg")) return "Microsoft Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari")) return "Safari";

  return "Unknown";
}

async function logActivity(action, options = {}) {
  try {
    const client = window.supabaseClient || window.supabase;

    if (!client) return;

    const payload = {
      user_id: localStorage.getItem("activeUserId") || "",
      username: localStorage.getItem("activeUser") || "",
      display_name: localStorage.getItem("activeName") || "",
      role: localStorage.getItem("activeRole") || "",
      department_code: localStorage.getItem("activeDept") || "",

      login_type: localStorage.getItem("loginType") || "",
      action,
      page_path: window.location.pathname,
      page_title: document.title || "",

      device_type: getDeviceType(),
      browser: getBrowserName(),
      platform: navigator.platform || "",
      screen_size: `${window.innerWidth}x${window.innerHeight}`,
      user_agent: navigator.userAgent || "",

      note: options.note || "",
      ref_table: options.ref_table || "",
      ref_id: options.ref_id || "",
    };

    await client.from("user_activity_logs").insert([payload]);
  } catch (err) {
    console.warn("บันทึก Activity Log ไม่สำเร็จ:", err);
  }
}

window.logActivity = logActivity;