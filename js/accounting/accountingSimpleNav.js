/* ======================================================
   accountingSimpleNav.js — เมนูหน้าบัญชีแบบเรียบ (pages/accounting-panel.html)
   - คอมพิวเตอร์: เมนูซ้าย (.acc-side) · จอเล็ก: แถบไอคอนด้านล่าง (.acc-tabbar)
   - ปุ่มที่มี data-nav: data / dash / summary / pending
   - รองรับลิงก์จากหน้าอื่น: #dashboard, #summary, #pending
   (หน้า factory-settings ยังใช้ core/accountingNav.js แบบเดิม)
====================================================== */
(function () {
  "use strict";

  const role = String(localStorage.getItem("activeRole") || "").toLowerCase().trim();

  // ใช้ร่วมกับหน้า "ตั้งค่าเกณฑ์" (factory-settings) — หน้านั้นไม่มีตารางบัญชี จึงเปลี่ยนหน้าแทน
  const isAccountingPage = () => Boolean(document.getElementById("accountingBody"));
  const ACCOUNTING_PAGE = "/pages/accounting-panel.html";
  const HASH_OF = { data: "", dash: "#dashboard", summary: "#summary", pending: "#pending" };

  function setActive(id) {
    document.querySelectorAll("[data-nav]").forEach((el) => {
      const on = el.dataset.nav === id;
      el.classList.toggle("is-active", on);
      if (on) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
  }

  function setView(view) {
    if (typeof window.showAccountingView === "function") window.showAccountingView(view);
  }

  function scrollToId(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const bar = document.querySelector(".acc-top");
    const top = el.getBoundingClientRect().top + window.scrollY - (bar ? bar.offsetHeight : 0) - 12;
    window.scrollTo({ top, behavior: "smooth" });
  }

  const actions = {
    data() {
      setView("list");
      setActive("data");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    dash() {
      setView("dashboard");
      setActive("dash");
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    summary() {
      setView("list");
      setActive("summary");
      scrollToId("accSummary");
    },
    pending() {
      setView("list");
      setActive("pending");
      const sel = document.getElementById("filterStatus");
      if (sel && sel.value !== "sent_accounting") {
        sel.value = "sent_accounting";
        if (typeof window.applyFilters === "function") window.applyFilters();
      }
      scrollToId("accList");
    },
  };

  function bind() {
    // ชื่อเมนูเป็น tooltip (โน้ตบุ๊กแสดงแค่ไอคอน)
    document.querySelectorAll(".acc-side-item").forEach((el) => {
      if (!el.title) el.title = el.textContent.trim();
      if (!el.getAttribute("aria-label")) el.setAttribute("aria-label", el.textContent.trim());
    });

    document.querySelectorAll("button[data-nav]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const id = btn.dataset.nav;
        if (!isAccountingPage()) {
          window.location.href = ACCOUNTING_PAGE + (HASH_OF[id] || "");
          return;
        }
        actions[id]?.();
      }),
    );

    // เมนู "ไปหน้าอื่น" แสดงตามสิทธิ์
    let anyOther = false;
    document.querySelectorAll("[data-role-only]").forEach((el) => {
      const ok = el.dataset.roleOnly.split(/\s+/).includes(role);
      el.hidden = !ok;
      if (el.closest("#accSideOther")) anyOther = anyOther || ok;
    });
    const other = document.getElementById("accSideOther");
    if (other) other.hidden = !anyOther;

    const name = localStorage.getItem("activeName") || localStorage.getItem("activeUser");
    const nameEl = document.getElementById("accUserName");
    if (name && nameEl) nameEl.textContent = name;

    if (isAccountingPage()) handleHash();
  }

  function handleHash() {
    const h = location.hash;
    if (!["#dashboard", "#summary", "#pending"].includes(h)) return;
    history.replaceState(null, "", location.pathname + location.search);
    if (h === "#dashboard") return setTimeout(actions.dash, 300);

    if (h === "#pending") {
      const sel = document.getElementById("filterStatus");
      if (sel) sel.value = "sent_accounting";
    }
    // รอให้ตารางโหลดเสร็จก่อนเลื่อน
    const started = Date.now();
    const timer = setInterval(() => {
      const loading = /กำลังโหลด/.test(document.querySelector("#accountingBody td.empty")?.textContent || "");
      if (!loading || Date.now() - started > 6000) {
        clearInterval(timer);
        h === "#pending" ? actions.pending() : actions.summary();
      }
    }, 250);
  }

  window.AccountingNav = { setActive, setView: (v) => actions[v === "dashboard" ? "dash" : "data"]() };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
