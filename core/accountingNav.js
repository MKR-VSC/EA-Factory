/* ==========================================================
   accountingNav.js — แถบเมนูของฝ่ายบัญชี
   ใช้ร่วมกันใน accounting-panel.html และ factory-settings.html

   - PC / Notebook : แถบไอคอนแคบด้านซ้าย (72px) ชี้เมาส์/กด Tab แล้วกางออกเป็นชื่อเมนู
                     กางทับเนื้อหา ไม่ดันตารางให้แคบลง
   - มือถือ / แท็บเล็ต : แถบเมนูด้านล่าง 5 ปุ่ม
   ปุ่มซ้ำบนหัวหน้า (ตั้งค่า / ย้อนกลับ / ออกจากระบบ) จะถูกซ่อน เพราะย้ายมาอยู่ในเมนูนี้แล้ว
   ========================================================== */
(function () {
  "use strict";

  const PAGE_ACCOUNTING = "/pages/accounting-panel.html";
  const PAGE_SETTINGS = "/pages/factory-settings.html";

  const path = location.pathname;
  const isAccounting = /accounting-panel(\.html)?$/.test(path);
  const isSettings = /factory-settings(\.html)?$/.test(path);
  if (!isAccounting && !isSettings) return;

  const role = String(localStorage.getItem("activeRole") || "").toLowerCase().trim();

  /* ---------- การทำงานของแต่ละเมนู ---------- */
  function scrollToEl(el) {
    if (!el) return;
    const header = document.querySelector(".acc-topbar-full");
    const offset = header && getComputedStyle(header).position === "sticky" ? header.offsetHeight : 0;
    const top = el.getBoundingClientRect().top + window.scrollY - offset - 12;
    window.scrollTo({ top, behavior: "smooth" });
  }

  function summarySection() {
    return document.getElementById("summaryDeptBody")?.closest("section");
  }

  function listSection() {
    return document.getElementById("accountingBody")?.closest("section");
  }

  // สลับมุมมองในหน้าบัญชี: "list" = รายการบัญชี, "dashboard" = Dashboard ของเสีย
  function setView(view) {
    if (typeof window.showAccountingView === "function") window.showAccountingView(view);
    setActive(view === "dashboard" ? "dash" : "data");
  }

  function setActive(id) {
    document.querySelectorAll(".acc-rail-item[data-nav], .acc-tab[data-nav]").forEach((el) => {
      const on = el.dataset.nav === id;
      el.classList.toggle("is-active", on);
      if (on) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    });
  }

  function goDashboard() {
    if (!isAccounting) return (location.href = `${PAGE_ACCOUNTING}#dashboard`);
    setView("dashboard");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goSummary() {
    if (!isAccounting) return (location.href = `${PAGE_ACCOUNTING}#summary`);
    setView("list");
    scrollToEl(summarySection());
  }

  function goPending() {
    if (!isAccounting) return (location.href = `${PAGE_ACCOUNTING}#pending`);
    setView("list");
    const sel = document.getElementById("filterStatus");
    if (sel && sel.value !== "sent_accounting") {
      sel.value = "sent_accounting";
      if (typeof window.applyFilters === "function") window.applyFilters();
    }
    scrollToEl(listSection());
  }

  function goData() {
    if (!isAccounting) return (location.href = PAGE_ACCOUNTING);
    setView("list");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function logout() {
    if (typeof window.logoutAccounting === "function") return window.logoutAccounting();
    if (typeof window.logoutSettings === "function") return window.logoutSettings();
    // ล้างข้อมูลเข้าสู่ระบบ แต่เก็บรายการที่รอส่ง (บันทึกตอนเน็ตหลุด) และธีมสีไว้
    const keepKeys = ["pvtOfflineQueue", "pvtOfflineFailed", "pvtAppTheme"];
    const kept = keepKeys.map((k) => [k, localStorage.getItem(k)]);
    localStorage.clear();
    kept.forEach(([k, v]) => v !== null && localStorage.setItem(k, v));
    sessionStorage.clear();
    location.replace("/login.html");
  }

  function callIfExists(name) {
    if (typeof window[name] === "function") window[name]();
  }

  /* ---------- รายการเมนู ---------- */
  const MAIN = [
    { id: "data", icon: "receipt_long", label: "ข้อมูลของเสีย", short: "ข้อมูล", active: isAccounting, action: goData },
    { id: "dash", icon: "insights", label: "Dashboard ของเสีย", short: "Dashboard", action: goDashboard },
    { id: "summary", icon: "summarize", label: "สรุปผลรวม", short: "สรุป", action: goSummary },
    { id: "pending", icon: "pending_actions", label: "รายการรอตรวจ", short: "รอตรวจ", action: goPending },
    { id: "settings", icon: "tune", label: "ตั้งค่าเกณฑ์ของเสีย", short: "ตั้งค่า", active: isSettings, href: PAGE_SETTINGS },
  ];

  const REPORT = isAccounting
    ? [
        { id: "excel", icon: "table_view", label: "ส่งออก Excel", action: () => callIfExists("exportAccountingExcel") },
        { id: "pdf", icon: "picture_as_pdf", label: "ออกรายงาน PDF", action: () => callIfExists("exportAccountingSummaryPDF") },
        { id: "print", icon: "print", label: "พิมพ์รายงาน", action: () => callIfExists("printAccountingSummary") },
      ]
    : [];

  // ผู้บริหาร/แอดมินเข้า Dashboard ได้ แอดมินเข้าหน้าแอดมินได้
  const OTHER = [];
  if (["admin", "management", "manager", "executive"].includes(role)) {
    OTHER.push({ id: "dashboard", icon: "monitoring", label: "Dashboard", href: "/index.html" });
  }
  if (role === "admin") {
    OTHER.push({ id: "admin", icon: "admin_panel_settings", label: "หน้าแอดมิน", href: "/pages/admin-panel.html" });
  }

  // มือถือ: 5 ปุ่ม สมมาตร
  const MOBILE = [
    MAIN[0], // ข้อมูล
    MAIN[1], // Dashboard
    MAIN[3], // รอตรวจ
    MAIN[4], // ตั้งค่า
    { id: "logout", icon: "logout", label: "ออก", action: logout },
  ];

  /* ---------- สร้าง DOM ---------- */
  function makeItem(item, cls, useShort = false) {
    const el = document.createElement(item.href ? "a" : "button");
    el.className = cls + (item.active ? " is-active" : "");
    el.dataset.nav = item.id;
    if (item.href) el.href = item.href;
    else el.type = "button";
    if (item.active) el.setAttribute("aria-current", "page");
    el.innerHTML =
      `<span class="material-symbols-outlined" aria-hidden="true">${item.icon}</span>` +
      `<span class="acc-nav-label">${useShort && item.short ? item.short : item.label}</span>`;
    el.title = item.label;
    if (item.action) {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        item.action();
        // ปิดเมนูที่กางอยู่หลังเลือก (เผื่อเปิดด้วยแป้นพิมพ์/แตะ)
        el.blur();
      });
    }
    return el;
  }

  function group(title, items) {
    if (!items.length) return null;
    const wrap = document.createElement("div");
    wrap.className = "acc-rail-group";
    if (title) {
      const t = document.createElement("div");
      t.className = "acc-rail-title";
      t.textContent = title;
      wrap.appendChild(t);
    }
    items.forEach((it) => wrap.appendChild(makeItem(it, "acc-rail-item")));
    return wrap;
  }

  function buildRail() {
    const rail = document.createElement("nav");
    rail.className = "acc-rail";
    rail.setAttribute("aria-label", "เมนูฝ่ายบัญชี");

    const brand = document.createElement("a");
    brand.className = "acc-rail-brand";
    brand.href = PAGE_ACCOUNTING;
    brand.innerHTML =
      `<img src="/icons/Logo_Apps3.png?v=3" alt="" />` +
      `<span class="acc-nav-label"><strong>PVT&amp;T</strong><small>ฝ่ายบัญชี</small></span>`;
    rail.appendChild(brand);

    const menu = document.createElement("div");
    menu.className = "acc-rail-menu";
    [group("เมนูหลัก", MAIN), group("รายงาน", REPORT), group("ไปหน้าอื่น", OTHER)]
      .filter(Boolean)
      .forEach((g) => menu.appendChild(g));
    rail.appendChild(menu);

    const out = makeItem({ id: "logout", icon: "logout", label: "ออกจากระบบ", action: logout }, "acc-rail-item acc-rail-logout");
    rail.appendChild(out);
    return rail;
  }

  function buildTabbar() {
    const bar = document.createElement("nav");
    bar.className = "acc-tabbar";
    bar.setAttribute("aria-label", "เมนูฝ่ายบัญชี");
    MOBILE.forEach((it) => bar.appendChild(makeItem(it, "acc-tab", true)));
    return bar;
  }

  // ซ่อนปุ่มบนหัวหน้าที่ย้ายมาอยู่ในเมนูแล้ว
  function hideDuplicates() {
    const sel = isAccounting
      ? ['.topbar a[href*="factory-settings"]', '.topbar a[href="/index.html"]', ".topbar .btn.logout"]
      : ["#btn-back", "#btn-logout"];
    sel.forEach((s) => document.querySelectorAll(s).forEach((el) => el.classList.add("acc-nav-moved")));
  }

  function handleHash() {
    if (!isAccounting) return;
    const h = location.hash;
    if (h === "#dashboard") {
      history.replaceState(null, "", location.pathname + location.search);
      setView("dashboard");
      return;
    }
    if (h !== "#summary" && h !== "#pending") return;
    history.replaceState(null, "", location.pathname + location.search);
    if (h === "#pending") {
      const sel = document.getElementById("filterStatus");
      if (sel) sel.value = "sent_accounting"; // ใช้ตอนโหลดข้อมูลครั้งแรก
    }
    // รอให้ตารางโหลดเสร็จก่อนเลื่อน
    const started = Date.now();
    const timer = setInterval(() => {
      const ready = !document.querySelector("#accountingBody td.empty") ||
        !/กำลังโหลด/.test(document.querySelector("#accountingBody td.empty")?.textContent || "");
      if (ready || Date.now() - started > 6000) {
        clearInterval(timer);
        h === "#pending" ? goPending() : goSummary();
      }
    }, 250);
  }

  window.AccountingNav = { setActive, setView };

  // หน้าบัญชี: ย้ายส่วนหัวออกมานอกกรอบเนื้อหา ให้เป็นแถบยาวเต็มความกว้าง (ไม่ใช่การ์ด)
  function makeFullWidthHeader() {
    if (!isAccounting) return;
    const header = document.querySelector("main.page > header.topbar");
    const page = header?.parentElement;
    if (!header || !page) return;
    header.classList.add("acc-topbar-full");
    page.parentNode.insertBefore(header, page);
  }

  function mount() {
    makeFullWidthHeader();
    document.documentElement.classList.add("has-acc-nav");
    document.body.appendChild(buildRail());
    document.body.appendChild(buildTabbar());
    hideDuplicates();
    handleHash();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();