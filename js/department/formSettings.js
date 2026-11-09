/* ======================================================
   formSettings.js — ตั้งค่าตัวอักษร (ฟอนต์ + ขนาด) ของหน้าบันทึกของเสีย
   - เก็บในเครื่องนี้ (localStorage) แต่ละเครื่องตั้งไม่เหมือนกันได้
   - ค่าเริ่มต้น = ฟอนต์ในเครื่อง (เร็วที่สุด ไม่ต้องโหลดอะไรเพิ่ม)
   - ฟอนต์อื่นโหลดจาก Google Fonts "เฉพาะตอนเลือกใช้" เท่านั้น
   โหลดไฟล์นี้ใน <head> เพื่อให้ใช้ฟอนต์ที่ตั้งไว้ตั้งแต่ก่อนหน้าแสดง (ไม่กระพริบ)
====================================================== */
(function () {
  "use strict";

  const KEY = "pvtFormTextSettings";
  const SYSTEM_STACK = 'system-ui, -apple-system, "Segoe UI", "Noto Sans Thai", "Leelawadee UI", Tahoma, sans-serif';

  const FONTS = [
    { id: "system", label: "ฟอนต์ในเครื่อง", note: "เร็วที่สุด" },
    { id: "sarabun", label: "Sarabun", family: "Sarabun" },
    { id: "noto", label: "Noto Sans Thai", family: "Noto Sans Thai" },
    { id: "plex", label: "IBM Plex Sans Thai", family: "IBM Plex Sans Thai" },
    { id: "prompt", label: "Prompt", family: "Prompt" },
    { id: "kanit", label: "Kanit", family: "Kanit" },
  ];

  const SIZES = [
    { id: "normal", label: "ปกติ", scale: 1 },
    { id: "large", label: "ใหญ่", scale: 1.12 },
    { id: "xlarge", label: "ใหญ่มาก", scale: 1.25 },
  ];

  function read() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || "{}");
      return {
        font: FONTS.some((f) => f.id === v.font) ? v.font : "system",
        size: SIZES.some((s) => s.id === v.size) ? v.size : "normal",
      };
    } catch (_) {
      return { font: "system", size: "normal" };
    }
  }

  function save(settings) {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch (_) {}
  }

  function loadFont(font) {
    if (!font.family) return;
    const id = "pvt-font-" + font.id;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=" +
      encodeURIComponent(font.family).replace(/%20/g, "+") +
      ":wght@400;600;700&display=swap";
    document.head.appendChild(link);
  }

  function apply(settings) {
    const font = FONTS.find((f) => f.id === settings.font) || FONTS[0];
    const size = SIZES.find((s) => s.id === settings.size) || SIZES[0];
    loadFont(font);
    const root = document.documentElement.style;
    root.setProperty("--font", font.family ? `"${font.family}", ${SYSTEM_STACK}` : SYSTEM_STACK);
    root.setProperty("--fs", String(size.scale));
  }

  let current = read();
  apply(current);

  function render(sheet) {
    sheet.querySelectorAll("[data-font]").forEach((btn) =>
      btn.setAttribute("aria-checked", String(btn.dataset.font === current.font)),
    );
    sheet.querySelectorAll("[data-size]").forEach((btn) =>
      btn.setAttribute("aria-checked", String(btn.dataset.size === current.size)),
    );
  }

  function open() {
    if (document.getElementById("text-settings-sheet")) return;

    const sheet = document.createElement("div");
    sheet.id = "text-settings-sheet";
    sheet.className = "fm-sheet";
    sheet.innerHTML = `
      <div class="fm-sheet-panel fm-settings" role="dialog" aria-modal="true" aria-label="ตั้งค่าตัวอักษร">
        <h3>ตั้งค่าตัวอักษร</h3>

        <p class="fm-settings-label">ขนาดตัวอักษร</p>
        <div class="fm-seg" role="radiogroup" aria-label="ขนาดตัวอักษร">
          ${SIZES.map((s) => `<button type="button" role="radio" data-size="${s.id}">${s.label}</button>`).join("")}
        </div>

        <p class="fm-settings-label">ฟอนต์</p>
        <div class="fm-font-list" role="radiogroup" aria-label="ฟอนต์">
          ${FONTS.map(
            (f) => `
            <button type="button" role="radio" data-font="${f.id}">
              <span>${f.label}</span>
              ${f.note ? `<small>${f.note}</small>` : ""}
            </button>`,
          ).join("")}
        </div>
        <p class="fm-settings-hint">ฟอนต์อื่นต้องใช้อินเทอร์เน็ตตอนโหลดครั้งแรก · ตั้งค่าเฉพาะเครื่องนี้</p>

        <button type="button" class="fm-btn fm-btn-primary fm-settings-done">เสร็จสิ้น</button>
      </div>`;

    const close = () => {
      sheet.remove();
      document.removeEventListener("keydown", onKey);
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };

    sheet.addEventListener("click", (e) => {
      if (e.target === sheet || e.target.closest(".fm-settings-done")) return close();
      const fontBtn = e.target.closest("[data-font]");
      const sizeBtn = e.target.closest("[data-size]");
      if (!fontBtn && !sizeBtn) return;
      if (fontBtn) current = { ...current, font: fontBtn.dataset.font };
      if (sizeBtn) current = { ...current, size: sizeBtn.dataset.size };
      save(current);
      apply(current);
      render(sheet);
    });
    document.addEventListener("keydown", onKey);

    document.body.appendChild(sheet);
    render(sheet);
    sheet.querySelector('[aria-checked="true"]')?.focus();
  }

  window.FORM_SETTINGS = { open, apply, fonts: FONTS, sizes: SIZES };
})();
