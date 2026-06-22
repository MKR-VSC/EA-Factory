// ======================================================
// SHIFT CONFIG
// ใช้กลางทั้งระบบ Daily Defect
// เวลาเข้าออก กะ 
// ======================================================

window.SHIFTS = [
  {
    code: "MORNING",
    name: "กะเช้า",
  },
  {
    code: "AFTERNOON",
    name: "กะบ่าย",
  },
  {
    code: "NIGHT",
    name: "กะดึก",
  },
//   {
//     code: "OT",
//     name: "OT",
//   },
  {
    code: "SUNDAY",
    name: "วันอาทิตย์",
  },
];

window.getShiftList = function () {
  return window.SHIFTS;
};

window.getShiftByCode = function (code) {
  return window.SHIFTS.find(
    (item) => item.code === String(code || "").toUpperCase()
  );
};