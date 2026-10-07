/* ======================================================
   responsiveTables.js
   ใส่ชื่อคอลัมน์ (data-label) ให้ทุกช่องของตารางที่มี data-rt="cards"
   เพื่อให้ css/responsive.css แสดงเป็น "การ์ด" บนมือถือได้
   - รองรับแถวที่ JS สร้างใหม่ภายหลัง (MutationObserver)
   - ไม่เปลี่ยนข้อมูลหรือการทำงานของตารางเดิม
====================================================== */
(function () {
  "use strict";

  function headerLabels(table) {
    const headRow = table.tHead && table.tHead.rows[table.tHead.rows.length - 1];
    if (!headRow) return [];
    const labels = [];
    Array.from(headRow.cells).forEach((th) => {
      const text = (th.innerText || th.textContent || "").replace(/\s+/g, " ").trim();
      const span = th.colSpan || 1;
      for (let i = 0; i < span; i += 1) labels.push(text);
    });
    return labels;
  }

  function labelRows(table) {
    const labels = headerLabels(table);
    if (!labels.length) return;

    Array.from(table.tBodies).forEach((tbody) => {
      Array.from(tbody.rows).forEach((tr) => {
        const cells = Array.from(tr.cells);
        // แถวรายละเอียด/แถวว่างที่ใช้ colspan ไม่ต้องใส่ป้าย
        if (cells.length === 1 && cells[0].colSpan > 1) return;

        let col = 0;
        cells.forEach((td) => {
          const label = labels[col] || "";
          col += td.colSpan || 1;
          if (td.colSpan > 1) return;

          if (label) {
            if (td.getAttribute("data-label") !== label) td.setAttribute("data-label", label);
            td.classList.remove("rt-corner");
          } else {
            td.removeAttribute("data-label");
            td.classList.add("rt-corner");
          }

          const isActions =
            /จัดการ|การจัดการ|action/i.test(label) ||
            td.querySelector(":scope > .row-actions, :scope > .actions, :scope > .action-buttons");
          td.classList.toggle("rt-actions", Boolean(isActions));
        });
      });
    });
  }

  function watch(table) {
    if (table.__rtWatched) return;
    table.__rtWatched = true;
    labelRows(table);

    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        labelRows(table);
      });
    });
    observer.observe(table, { childList: true, subtree: true });
  }

  function init() {
    document.querySelectorAll('table[data-rt="cards"]').forEach(watch);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.RESPONSIVE_TABLES = { refresh: init, label: labelRows };
})();
