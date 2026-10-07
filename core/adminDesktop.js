/* ======================================================
   adminDesktop.js — ปรับหน้า Admin ให้เหมาะกับการใช้งานบน PC
   - แบ่งหน้าตารางยาว (25 / 50 / 100 / ทั้งหมด) ใช้กับ <table data-pager="25">
     ทำงานกับแถวที่ JS เดิมสร้างขึ้น (MutationObserver) โดยไม่แก้ logic เดิม
   - คีย์ลัด:  /  = ไปที่ช่องค้นหาของหน้าที่เปิดอยู่
               ← / → = หน้าก่อน / ถัดไป ของตารางในหน้าที่เปิดอยู่
   - บนมือถือแสดงแถบแนะนำให้ใช้บน PC (ปิดได้)
====================================================== */
(function () {
  "use strict";

  const SIZES = [25, 50, 100, 0]; // 0 = ทั้งหมด
  const pagers = [];

  function dataRows(tbody) {
    return Array.from(tbody.rows).filter((tr) => {
      const cells = tr.cells;
      // แถวข้อความว่าง/กำลังโหลด (colspan เดียว) ไม่นับ
      return !(cells.length === 1 && cells[0].colSpan > 1);
    });
  }

  function createPager(table) {
    const tbody = table.tBodies[0];
    if (!tbody || table.__pager) return;

    const state = {
      page: 1,
      size: Number(table.dataset.pager) || 25,
      table,
      tbody,
      lastCount: -1,
    };
    table.__pager = state;

    const bar = document.createElement("div");
    bar.className = "admin-pager";
    bar.innerHTML = `
      <div class="admin-pager-info" aria-live="polite"></div>
      <div class="admin-pager-controls">
        <label class="admin-pager-size">
          <span>แสดง</span>
          <select aria-label="จำนวนแถวต่อหน้า">
            ${SIZES.map((n) => `<option value="${n}">${n ? n + " แถว" : "ทั้งหมด"}</option>`).join("")}
          </select>
        </label>
        <button type="button" class="admin-pager-btn" data-go="first" title="หน้าแรก" aria-label="หน้าแรก">
          <span class="material-symbols-outlined">first_page</span>
        </button>
        <button type="button" class="admin-pager-btn" data-go="prev" title="หน้าก่อน (←)" aria-label="หน้าก่อน">
          <span class="material-symbols-outlined">chevron_left</span>
        </button>
        <span class="admin-pager-page"></span>
        <button type="button" class="admin-pager-btn" data-go="next" title="หน้าถัดไป (→)" aria-label="หน้าถัดไป">
          <span class="material-symbols-outlined">chevron_right</span>
        </button>
        <button type="button" class="admin-pager-btn" data-go="last" title="หน้าสุดท้าย" aria-label="หน้าสุดท้าย">
          <span class="material-symbols-outlined">last_page</span>
        </button>
      </div>`;

    const anchor = table.closest(".table-scroll") || table;
    anchor.insertAdjacentElement("afterend", bar);
    state.bar = bar;
    state.scrollBox = table.closest(".table-scroll");

    const select = bar.querySelector("select");
    select.value = String(state.size);
    select.addEventListener("change", () => {
      state.size = Number(select.value);
      state.page = 1;
      render(state);
    });

    bar.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-go]");
      if (!btn || btn.disabled) return;
      go(state, btn.dataset.go);
    });

    new MutationObserver(() => {
      const count = dataRows(tbody).length;
      // ข้อมูลชุดใหม่ (โหลดใหม่/ค้นหา/กรอง) → กลับไปหน้าแรก
      if (count !== state.lastCount) state.page = 1;
      render(state);
    }).observe(tbody, { childList: true });

    pagers.push(state);
    render(state);
  }

  function pageCount(state, total) {
    return state.size ? Math.max(1, Math.ceil(total / state.size)) : 1;
  }

  function go(state, where) {
    const total = dataRows(state.tbody).length;
    const pages = pageCount(state, total);
    if (where === "first") state.page = 1;
    else if (where === "prev") state.page = Math.max(1, state.page - 1);
    else if (where === "next") state.page = Math.min(pages, state.page + 1);
    else if (where === "last") state.page = pages;
    render(state);
    if (state.scrollBox) state.scrollBox.scrollTop = 0;
    const top = state.table.getBoundingClientRect().top;
    if (top < 0) state.table.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function render(state) {
    const rows = dataRows(state.tbody);
    const total = rows.length;
    state.lastCount = total;
    const pages = pageCount(state, total);
    if (state.page > pages) state.page = pages;

    const start = state.size ? (state.page - 1) * state.size : 0;
    const end = state.size ? start + state.size : total;
    rows.forEach((tr, i) => tr.classList.toggle("pager-hidden", i < start || i >= end));

    const bar = state.bar;
    bar.hidden = total === 0;
    bar.querySelector(".admin-pager-info").textContent = total
      ? `แสดง ${start + 1}–${Math.min(end, total)} จาก ${total.toLocaleString("th-TH")} รายการ`
      : "";
    bar.querySelector(".admin-pager-page").textContent = `หน้า ${state.page} / ${pages}`;
    bar.querySelector('[data-go="first"]').disabled = state.page <= 1;
    bar.querySelector('[data-go="prev"]').disabled = state.page <= 1;
    bar.querySelector('[data-go="next"]').disabled = state.page >= pages;
    bar.querySelector('[data-go="last"]').disabled = state.page >= pages;
    bar.classList.toggle("is-single-page", pages <= 1);
  }

  function activeSection() {
    return document.querySelector(".page-section.active") || document;
  }

  function isTyping(el) {
    return el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName));
  }

  function bindShortcuts() {
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector(".modal-overlay:not([hidden])")) return;

      if (e.key === "/" && !isTyping(e.target)) {
        const input = activeSection().querySelector('input[type="search"]');
        if (input) {
          e.preventDefault();
          input.focus();
          input.select();
        }
        return;
      }

      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !isTyping(e.target)) {
        const table = activeSection().querySelector("table[data-pager]");
        if (table && table.__pager) {
          e.preventDefault();
          go(table.__pager, e.key === "ArrowLeft" ? "prev" : "next");
        }
      }
    });
  }

  function mobileNotice() {
    const KEY = "adminDesktopNoticeClosed";
    let closed = false;
    try {
      closed = sessionStorage.getItem(KEY) === "1";
    } catch (_) {}
    if (closed) return;

    const note = document.createElement("div");
    note.className = "admin-desktop-notice";
    note.innerHTML = `
      <span class="material-symbols-outlined" aria-hidden="true">desktop_windows</span>
      <span>หน้าผู้ดูแลระบบออกแบบสำหรับคอมพิวเตอร์ แนะนำให้ใช้งานบน PC / โน้ตบุ๊ก</span>
      <button type="button" aria-label="ปิดข้อความแนะนำ">
        <span class="material-symbols-outlined">close</span>
      </button>`;
    note.querySelector("button").addEventListener("click", () => {
      note.remove();
      try {
        sessionStorage.setItem(KEY, "1");
      } catch (_) {}
    });
    const host = document.querySelector(".workspace-header") || document.querySelector("main") || document.body;
    host.insertAdjacentElement("beforebegin", note);
  }

  function init() {
    document.querySelectorAll("table[data-pager]").forEach(createPager);
    document.querySelectorAll('.page-section input[type="search"]').forEach((input) => {
      if (!input.title) input.title = "คีย์ลัด: กด / เพื่อค้นหา";
    });
    bindShortcuts();
    mobileNotice();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
