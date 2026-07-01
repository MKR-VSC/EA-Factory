/* ======================================================
   EA Factory Common Helpers
   ใช้ร่วมกันทุกหน้า เพื่อให้รหัสแผนก / สถานะ / format ไปแนวทางเดียวกัน
   หมายเหตุ: ไฟล์นี้ไม่แตะ Theme เดิมของแต่ละหน้า
====================================================== */
(function () {
  const DEPARTMENT_ALIASES = {
    pipe: "PIPE",
    "ท่อ": "PIPE",
    "แผนกท่อ": "PIPE",

    mono: "MONO",
    "โมโน": "MONO",
    "แผนกโมโน": "MONO",

    blow: "BLOW",
    bag_blow: "BLOW",
    "เป่าถุง": "BLOW",
    "แผนกเป่าถุง": "BLOW",

    blown_film: "BLOWN_FILM",
    print: "BLOWN_FILM",
    film: "BLOWN_FILM",
    "เป่าฟิล์ม": "BLOWN_FILM",
    "เป่าพิล์ม": "BLOWN_FILM",
    "ม้วนพิมพ์": "BLOWN_FILM",
    "แผนกเป่าฟิล์ม": "BLOWN_FILM",

    sheet: "SHEET_CUTTING",
    sheet_cutting: "SHEET_CUTTING",
    "ตัดผืน": "SHEET_CUTTING",
    "แผ่นหล่อ": "SHEET_CUTTING",
    "แผนกแผ่นหล่อ": "SHEET_CUTTING",
    "แผนกแผ่นหล่อ/ตัดผืน": "SHEET_CUTTING",

    cut_punch: "CUT_PUNCH",
    cutting: "CUT_PUNCH",
    drill: "CUT_PUNCH",
    "ตัดเจาะ": "CUT_PUNCH",
    "เจาะรู": "CUT_PUNCH",
    "แผนกตัดเจาะ": "CUT_PUNCH",

    garbage: "GARBAGE_BAG_CUT",
    garbage_bag_cut: "GARBAGE_BAG_CUT",
    "ถุงขยะ": "GARBAGE_BAG_CUT",
    "ตัดถุงขยะ": "GARBAGE_BAG_CUT",
    "แผนกถุงขยะ": "GARBAGE_BAG_CUT",

    rain_tape: "RAIN_TAPE",
    tape: "RAIN_TAPE",
    "เทป": "RAIN_TAPE",
    "เทปน้ำพุ่ง": "RAIN_TAPE",
    "เป่าเทปน้ำพุ่ง": "RAIN_TAPE",
    "เทปสายฝน": "RAIN_TAPE",
    "เทปพัน": "RAIN_TAPE",
    "แผนกเทปพัน": "RAIN_TAPE",
    "แผนกเทปพัน/เทปน้ำพุ่ง": "RAIN_TAPE",

    rain_tape_cut_punch: "RAIN_TAPE_CUT_PUNCH",
    "ตัดเทปน้ำพุ่ง": "RAIN_TAPE_CUT_PUNCH",
    "ตัดเทปน้ำพุง": "RAIN_TAPE_CUT_PUNCH",
    "ตัดและเจาะเทปน้ำพุ่ง": "RAIN_TAPE_CUT_PUNCH",

    shade_net: "SHADE_NET",
    "สแลน": "SHADE_NET",
    "ตาข่ายกรองแสง": "SHADE_NET",
    "แผนกสแลน": "SHADE_NET",
  };

  const STATUS_LABELS = {
    pending_supervisor: "รอตรวจสอบ",
    sent_accounting: "ส่งบัญชีแล้ว",
    accounting_checked: "บัญชีตรวจแล้ว",
    pending: "รอตรวจสอบ",
    resolved: "ส่งบัญชีแล้ว",
    checked: "บัญชีตรวจแล้ว",
    approved: "ตรวจสอบแล้ว",
    rejected: "ไม่ผ่าน",
  };

  function normalizeDepartmentCode(value) {
    const raw = String(value || "").trim();
    const key = raw.toLowerCase();
    return DEPARTMENT_ALIASES[key] || raw.toUpperCase().replace(/[\s-]+/g, "_");
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function toNumber(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function formatNumber(value, min = 2, max = 2) {
    return toNumber(value).toLocaleString("th-TH", {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    });
  }

  function formatPercent(value) {
    return `${formatNumber(value, 2, 2)}%`;
  }

  function calcWastePercent(waste, production) {
    const p = toNumber(production);
    return p > 0 ? (toNumber(waste) / p) * 100 : 0;
  }

  function safeText(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeAttr(value) {
    return safeText(value).replaceAll("`", "&#096;");
  }

  function getStatusLabel(status) {
    const key = normalizeText(status);
    return STATUS_LABELS[key] || status || "-";
  }

  window.EA_COMMON = {
    DEPARTMENT_ALIASES,
    STATUS_LABELS,
    normalizeDepartmentCode,
    normalizeDept: normalizeDepartmentCode,
    normalizeText,
    toNumber,
    formatNumber,
    formatPercent,
    calcWastePercent,
    safeText,
    safeAttr,
    getStatusLabel,
  };
})();
