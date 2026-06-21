// ======================================================
// ROLE CONFIGURATION
// src/core/roleConfig.js
// ======================================================

/**
 * 🎯 รายชื่อ Role ที่รองรับ
 */
export const ROLES = {
  ADMIN: "admin",
  MANAGEMENT: "management",
  ACCOUNTING: "accounting",
  SUPERVISOR: "supervisor",
  STAFF: "staff",
};

/**
 * 🎯 ชื่อแสดงผลภาษาไทย
 */
export const ROLE_LABELS = {
  admin: "ผู้ดูแลระบบ",
  management: "ผู้บริหาร",
  accounting: "ฝ่ายบัญชี",
  supervisor: "หัวหน้างาน",
  staff: "พนักงาน",
};

/**
 * 🎯 หน้าแรกของแต่ละ Role
 */
export const ROLE_HOME_PAGES = {
  admin: "/pages/admin-panel.html",
  management: "/pages/index.html",
  accounting: "/pages/accounting-panel.html",
  supervisor: "/pages/form-department.html",
  staff: "/pages/form-department.html",
};

/**
 * 🎯 Normalize Role
 */
export function normalizeRole(role) {
  return String(role || "")
    .toLowerCase()
    .trim();
}

/**
 * 🎯 ตรวจสอบ Role ถูกต้องหรือไม่
 */
export function isValidRole(role) {
  return Object.values(ROLES).includes(normalizeRole(role));
}

/**
 * 🎯 คืนชื่อภาษาไทย
 */
export function getRoleLabel(role) {
  const currentRole = normalizeRole(role);

  return (
    ROLE_LABELS[currentRole] ||
    ROLE_LABELS.staff
  );
}

/**
 * 🎯 คืนหน้าแรกตาม Role
 */
export function getHomePage(role) {
  const currentRole = normalizeRole(role);

  return (
    ROLE_HOME_PAGES[currentRole] ||
    ROLE_HOME_PAGES.staff
  );
}

/**
 * 🎯 กลุ่มผู้บริหาร
 */
export function isManagement(role) {
  const currentRole = normalizeRole(role);

  return [
    ROLES.ADMIN,
    ROLES.MANAGEMENT,
  ].includes(currentRole);
}

/**
 * 🎯 กลุ่มอนุมัติ
 */
export function canApprove(role) {
  const currentRole = normalizeRole(role);

  return [
    ROLES.ADMIN,
    ROLES.MANAGEMENT,
    ROLES.SUPERVISOR,
  ].includes(currentRole);
}

/**
 * 🎯 กลุ่มดูรายงานทั้งหมด
 */
export function canViewAllReports(role) {
  const currentRole = normalizeRole(role);

  return [
    ROLES.ADMIN,
    ROLES.MANAGEMENT,
    ROLES.ACCOUNTING,
  ].includes(currentRole);
}

/**
 * 🎯 กลุ่มจัดการ User
 */
export function canManageUsers(role) {
  const currentRole = normalizeRole(role);

  return currentRole === ROLES.ADMIN;
}

/**
 * 🎯 กลุ่มจัดการข้อมูลต้นทุน
 */
export function canManageCost(role) {
  const currentRole = normalizeRole(role);

  return [
    ROLES.ADMIN,
    ROLES.ACCOUNTING,
  ].includes(currentRole);
}

/**
 * 🎯 กลุ่มกรอกข้อมูลของเสีย
 */
export function canCreateWasteReport(role) {
  const currentRole = normalizeRole(role);

  return [
    ROLES.ADMIN,
    ROLES.SUPERVISOR,
    ROLES.STAFF,
  ].includes(currentRole);
}