// ======================================================
// ROLE CONFIGURATION
// src/core/roleConfig.js
// ใช้แบบ script ธรรมดา ไม่ใช้ export/import
// ======================================================

/**
 * 🎯 รายชื่อ Role ที่ระบบรองรับ
 *
 * หมายเหตุสำคัญ:
 * Role = สิทธิ์ของผู้ใช้
 * Department = แผนกของผู้ใช้
 *
 * ห้ามแยก role เป็น staff_blow / staff_pipe
 * ให้ใช้ role = staff และ department_code = BLOW / PIPE แทน
 */
const ROLES = {
  ADMIN: "admin",
  MANAGEMENT: "management",
  ACCOUNTING: "accounting",
  SUPERVISOR: "supervisor",
  STAFF: "staff",
};

/**
 * 🎯 ชื่อ Role ภาษาไทย
 */
const ROLE_LABELS = {
  admin: "ผู้ดูแลระบบ",
  management: "ผู้บริหาร",
  accounting: "ฝ่ายบัญชี",
  supervisor: "หัวหน้างาน",
  staff: "พนักงาน",
};

/**
 * 🎯 หน้าแรกของแต่ละ Role
 *
 * admin      → หน้าแอดมิน
 * accounting → หน้าบัญชี
 * management → Dashboard
 * supervisor → ฟอร์มแผนก
 * staff      → ฟอร์มแผนก
 *
 * แผนกไม่ได้กำหนดตรงนี้
 * แผนกจะถูกเก็บใน localStorage.activeDept ตอน Login
 */
const ROLE_HOME_PAGES = {
  admin: "/pages/admin-panel.html",
  management: "/index.html",
  accounting: "/pages/accounting-panel.html",
  supervisor: "/pages/form-department.html",
  staff: "/pages/form-department.html",
};

/**
 * 🎯 รายชื่อแผนกที่ระบบรองรับ
 * ใช้เป็นตัวกลางร่วมกับ QR / Login / Master Data
 */
const DEPARTMENTS = {
  BLOW: {
    code: "BLOW",
    name: "เป่าถุง",
  },
  PIPE: {
    code: "PIPE",
    name: "ท่อ",
  },
  SHEET: {
    code: "SHEET",
    name: "ตัดผืน",
  },
  MONO: {
    code: "MONO",
    name: "โมโน",
  },
  TAPE: {
    code: "TAPE",
    name: "เทป / สแลน",
  },
  CUTTING: {
    code: "CUTTING",
    name: "ตัดเจาะ",
  },
};

/**
 * 🎯 แปลง Role ให้เป็นรูปแบบมาตรฐาน
 */
function normalizeRole(role) {
  return String(role || "").toLowerCase().trim();
}

/**
 * 🎯 แปลงรหัสแผนกให้เป็นรูปแบบมาตรฐาน
 */
function normalizeDept(dept) {
  return String(dept || "").toUpperCase().trim();
}

/**
 * 🎯 ตรวจสอบ Role ถูกต้องหรือไม่
 */
function isValidRole(role) {
  return Object.values(ROLES).includes(normalizeRole(role));
}

/**
 * 🎯 ตรวจสอบรหัสแผนกว่ามีในระบบหรือไม่
 */
function isValidDept(dept) {
  return Boolean(DEPARTMENTS[normalizeDept(dept)]);
}

/**
 * 🎯 คืนชื่อ Role ภาษาไทย
 */
function getRoleLabel(role) {
  const currentRole = normalizeRole(role);
  return ROLE_LABELS[currentRole] || ROLE_LABELS.staff;
}

/**
 * 🎯 คืนข้อมูลแผนก
 */
function getDepartment(dept) {
  const currentDept = normalizeDept(dept);

  return (
    DEPARTMENTS[currentDept] || {
      code: currentDept || "",
      name: currentDept || "ไม่ระบุแผนก",
    }
  );
}

/**
 * 🎯 คืนชื่อแผนกภาษาไทย
 */
function getDepartmentName(dept) {
  return getDepartment(dept).name;
}

/**
 * 🎯 คืนหน้าแรกตาม Role
 */
function getHomePage(role) {
  const currentRole = normalizeRole(role);
  return ROLE_HOME_PAGES[currentRole] || ROLE_HOME_PAGES.staff;
}

/**
 * 🎯 กลุ่มผู้บริหาร
 */
function isManagement(role) {
  const currentRole = normalizeRole(role);
  return [ROLES.ADMIN, ROLES.MANAGEMENT].includes(currentRole);
}

/**
 * 🎯 กลุ่มอนุมัติ
 */
function canApprove(role) {
  const currentRole = normalizeRole(role);

  return [ROLES.ADMIN, ROLES.MANAGEMENT, ROLES.SUPERVISOR].includes(
    currentRole,
  );
}

/**
 * 🎯 กลุ่มดูรายงานทั้งหมด
 */
function canViewAllReports(role) {
  const currentRole = normalizeRole(role);

  return [ROLES.ADMIN, ROLES.MANAGEMENT, ROLES.ACCOUNTING].includes(
    currentRole,
  );
}

/**
 * 🎯 กลุ่มจัดการ User
 */
function canManageUsers(role) {
  return normalizeRole(role) === ROLES.ADMIN;
}

/**
 * 🎯 กลุ่มจัดการข้อมูลต้นทุน
 */
function canManageCost(role) {
  const currentRole = normalizeRole(role);

  return [ROLES.ADMIN, ROLES.ACCOUNTING].includes(currentRole);
}

/**
 * 🎯 กลุ่มกรอกข้อมูลของเสีย
 *
 * admin / supervisor / staff สามารถกรอกได้
 * แต่แผนกจะถูกล็อกจาก activeDept หรือ QR
 */
function canCreateWasteReport(role) {
  const currentRole = normalizeRole(role);

  return [ROLES.ADMIN, ROLES.SUPERVISOR, ROLES.STAFF].includes(currentRole);
}

/**
 * 🎯 ตรวจว่าผู้ใช้นี้ควรเข้าหน้าฟอร์มแผนกหรือไม่
 */
function shouldGoToDepartmentForm(role) {
  const currentRole = normalizeRole(role);

  return [ROLES.SUPERVISOR, ROLES.STAFF].includes(currentRole);
}

/**
 * 🎯 ตรวจว่าผู้ใช้นี้เป็น Admin หรือไม่
 */
function isAdmin(role) {
  return normalizeRole(role) === ROLES.ADMIN;
}

/**
 * 🎯 ตรวจว่าผู้ใช้นี้เป็นบัญชีหรือไม่
 */
function isAccounting(role) {
  return normalizeRole(role) === ROLES.ACCOUNTING;
}

/**
 * 🎯 ให้ไฟล์อื่นเรียกใช้ผ่าน window.ROLE_CONFIG
 */
window.ROLE_CONFIG = {
  ROLES,
  ROLE_LABELS,
  ROLE_HOME_PAGES,
  DEPARTMENTS,

  normalizeRole,
  normalizeDept,

  isValidRole,
  isValidDept,

  getRoleLabel,
  getDepartment,
  getDepartmentName,

  getHomePage,

  // login.js เรียกชื่อนี้
  getDefaultPage: getHomePage,

  isAdmin,
  isAccounting,
  isManagement,

  canApprove,
  canViewAllReports,
  canManageUsers,
  canManageCost,
  canCreateWasteReport,
  shouldGoToDepartmentForm,
};