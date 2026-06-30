// ======================================================
// DEPARTMENT CONFIG
// ใช้กลางทั้งระบบ Daily Defect
// แสดงแผนกภาษาไทยทั้งระบบ
// ======================================================

window.DEPARTMENTS = window.DEPARTMENTS || {
  BLOW: {
    code: "BLOW",
    name: "เป่าถุง",
    path: "/pages/form-department.html?dept=BLOW",
  },
  PIPE: {
    code: "PIPE",
    name: "ท่อ",
    path: "/pages/form-department.html?dept=PIPE",
  },
  SHEET: {
    code: "SHEET",
    name: "ตัดผืน",
    path: "/pages/form-department.html?dept=SHEET",
  },
  MONO: {
    code: "MONO",
    name: "โมโน",
    path: "/pages/form-department.html?dept=MONO",
  },
  TAPE: {
    code: "TAPE",
    name: "เทปน้ำพุ่ง",
    path: "/pages/form-department.html?dept=TAPE",
  },
  PRINT: {
    code: "PRINT",
    name: "เป่าฟิล์ม",
    path: "/pages/form-department.html?dept=PRINT",
  },
  DRILL: {
    code: "DRILL",
    name: "ตัดเจาะ",
    path: "/pages/form-department.html?dept=DRILL",
  },
  GARBAGE: {
    code: "GARBAGE",
    name: "ถุงขยะ",
    path: "/pages/form-department.html?dept=GARBAGE",
  },
  SLAN: {
    code: "SLAN",
    name: "สแลน",
    // color: "#2563eb",
    // icon: "air",
    path: "/pages/form-department.html?dept=SLAN",
  },
};

window.normalizeDepartmentCode = function (value) {
  return String(value || "").trim().toUpperCase();
};

window.getDepartmentName = function (value) {
  const code = window.normalizeDepartmentCode(value);
  return window.DEPARTMENTS[code]?.name || value || "-";
};

window.getDepartmentPath = function (value) {
  const code = window.normalizeDepartmentCode(value);
  return (
    window.DEPARTMENTS[code]?.path ||
    `/pages/form-department.html?dept=${code}`
  );
};

window.getDepartmentList = function () {
  return Object.values(window.DEPARTMENTS);
};


