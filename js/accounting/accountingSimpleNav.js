/* ======================================================
   accountingSimpleNav.js — เมนูชุดเดียวของหน้ากลุ่มเมนูซ้ายสีน้ำเงิน
   (index.html, accounting-panel, production-entry, daily-report,
    loss-settings, dept-groups, factory-settings)

   - เมนูทุกหน้าสร้างจากรายการ MENU ด้านล่างที่เดียว → ลำดับ/ชื่อ/ไอคอน เหมือนกันทุกหน้า
     (เนื้อหาเดิมใน <nav class="acc-side"> และ <nav class="acc-tabbar"> ถูกแทนที่ตอนเปิดหน้า)
   - แสดงตามสิทธิ์ (roles) · เมนูของหน้าปัจจุบันเป็นแถบเน้น
   - คอมพิวเตอร์: เมนูซ้าย · จอเล็ก: แถบล่าง + ปุ่ม "เมนู" เปิดเมนูเต็มแบบลิ้นชัก
   - ปุ่ม data-nav (data / dash / summary / pending) ทำงานในหน้าบัญชี
     ถ้าอยู่หน้าอื่นจะเปลี่ยนไปหน้าบัญชี (#dashboard, #summary, #pending)
   เพิ่ม/ย้ายเมนู: แก้ที่ MENU / TABS เท่านั้น
====================================================== */
(function () {
  "use strict";

  const readRole = () => String(localStorage.getItem("activeRole") || "").toLowerCase().trim();
  let role = readRole();

  const ACC = ["admin", "accounting", "management"];
  const EXEC = ["admin", "management", "manager", "executive"];
  const REPORT = ["admin", "accounting", "management", "manager", "executive", "supervisor"];

  const ICON = {
    home: "M4 11l8-7 8 7v9H4z",
    report: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7",
    data: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5",
    pending: "M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z",
    entry: "M4 5h16v14H4zM4 10h16M9 10v9M15 10v9",
    summary: "M4 5h16M4 10h16M4 15h10M4 20h7",
    chart: "M4 20h16M7 16v-5M12 16V7M17 16v-8",
    loss: "M4 6h10M4 12h10M4 18h10M17 5l3 3-3 3M20 16h-3",
    groups: "M3 6h7v5H3zM14 6h7v5h-7zM8 15h8v5H8zM6.5 11v2h11v-2M12 13v2",
    sliders: "M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4",
    check: "M9 11l3 3 8-8M20 12v8H4V4h11",
    shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
    logout: "M10 4H5v16h5M14 8l4 4-4 4M18 12H9",
    menu: "M4 6h16M4 12h16M4 18h16",
  };

  // ---- เมนูหลัก (ลำดับนี้ใช้ทุกหน้า) ----
  const MENU = [
    {
      title: "ภาพรวม",
      items: [
        { label: "Dashboard ผู้บริหาร", icon: "home", href: "/index.html", roles: EXEC },
        { label: "รายงานประจำวัน", icon: "report", href: "/pages/daily-report.html", roles: REPORT },
      ],
    },
    {
      title: "งานบัญชี",
      items: [
        { label: "ข้อมูลของเสีย", icon: "data", nav: "data", roles: ACC },
        { label: "รายการรอตรวจ", icon: "pending", nav: "pending", roles: ACC },
        { label: "กรอกยอดผลิตทั้งใบ", icon: "entry", href: "/pages/production-entry.html", roles: ACC },
        { label: "สรุปผลรวม", icon: "summary", nav: "summary", roles: ACC },
        { label: "Dashboard ของเสีย", icon: "chart", nav: "dash", roles: ACC },
      ],
    },
    {
      title: "ตั้งค่า",
      items: [
        { label: "อาการเสีย & ประเภท", icon: "loss", href: "/pages/loss-settings.html", roles: ACC },
        { label: "กลุ่มแผนก", icon: "groups", href: "/pages/dept-groups.html", roles: ACC },
        { label: "ตั้งค่าเกณฑ์ของเสีย", icon: "sliders", href: "/pages/factory-settings.html", roles: ["admin", "accounting"] },
      ],
    },
    {
      title: "หน้าอื่น",
      items: [
        { label: "ตรวจสอบรายวัน", icon: "check", href: "/pages/supervisor-daily-review.html", roles: ["supervisor", "admin"] },
        { label: "หน้าแอดมิน", icon: "shield", href: "/pages/admin-panel.html", roles: ["admin"] },
      ],
    },
  ];

  // ---- แถบล่างบนจอเล็ก (ที่เหลืออยู่ในปุ่ม "เมนู") ----
  const TABS = [
    { label: "ภาพรวม", icon: "home", href: "/index.html", roles: EXEC },
    { label: "ข้อมูล", icon: "data", nav: "data", roles: ACC },
    { label: "รายงาน", icon: "report", href: "/pages/daily-report.html", roles: REPORT },
    { label: "ตรวจสอบ", icon: "check", href: "/pages/supervisor-daily-review.html", roles: ["supervisor"] },
  ];

  // ใช้ร่วมกับหน้าอื่น — หน้าที่ไม่มีตารางบัญชีจะเปลี่ยนไปหน้าบัญชีแทน
  const isAccountingPage = () => Boolean(document.getElementById("accountingBody"));
  const ACCOUNTING_PAGE = "/pages/accounting-panel.html";
  const HASH_OF = { data: "", dash: "#dashboard", summary: "#summary", pending: "#pending" };

  const allowed = (item) => !item.roles || item.roles.includes(role);
  const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[name] || ICON.data}" /></svg>`;
  const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

  function currentPath() {
    const p = location.pathname.replace(/\/+$/, "");
    return p === "" || p === "/" ? "/index.html" : p;
  }

  function isCurrent(item) {
    if (item.href) return currentPath().endsWith(item.href);
    // เมนู data-nav เน้นได้เฉพาะในหน้าบัญชี (เริ่มต้นที่ "ข้อมูลของเสีย")
    return isAccountingPage() && item.nav === "data";
  }

  function itemHtml(item, cls) {
    const on = isCurrent(item);
    const attrs = `class="${cls}${on ? " is-active" : ""}"${on ? ' aria-current="page"' : ""} title="${esc(item.label)}" aria-label="${esc(item.label)}"`;
    const label = cls.includes("fm-tab") ? `<span class="fm-tab-label">${esc(item.label)}</span>` : `<span>${esc(item.label)}</span>`;
    return item.href
      ? `<a ${attrs} href="${item.href}">${svg(item.icon)}${label}</a>`
      : `<button type="button" ${attrs} data-nav="${item.nav}">${svg(item.icon)}${label}</button>`;
  }

  function renderSide() {
    const side = document.querySelector(".acc-side");
    if (!side) return;
    side.setAttribute("aria-label", "เมนู");
    side.id = side.id || "accSideMenu";
    const groups = MENU.map((g) => {
      const items = g.items.filter(allowed);
      if (!items.length) return "";
      return `<div class="acc-side-group"><span class="acc-side-title">${esc(g.title)}</span>${items
        .map((it) => itemHtml(it, "acc-side-item"))
        .join("")}</div>`;
    }).join("");
    side.innerHTML = `${groups}<button type="button" class="acc-side-item acc-side-logout" data-logout title="ออกจากระบบ" aria-label="ออกจากระบบ">${svg("logout")}<span>ออกจากระบบ</span></button>`;
  }

  function renderTabs() {
    const bar = document.querySelector(".acc-tabbar");
    if (!bar) return;
    const tabs = TABS.filter(allowed).map((t) => itemHtml(t, "fm-tab"));
    tabs.push(
      `<button type="button" class="fm-tab" data-menu-toggle aria-expanded="false" aria-controls="${document.querySelector(".acc-side")?.id || ""}">${svg("menu")}<span class="fm-tab-label">เมนู</span></button>`,
    );
    bar.innerHTML = tabs.join("");
    bar.style.gridTemplateColumns = `repeat(${tabs.length}, 1fr)`;
  }

  // ---- ลิ้นชักเมนูบนจอเล็ก ----
  function setDrawer(open) {
    document.body.classList.toggle("acc-menu-open", open);
    document.querySelectorAll("[data-menu-toggle]").forEach((b) => b.setAttribute("aria-expanded", String(open)));
    let shade = document.querySelector(".acc-menu-shade");
    if (open && !shade) {
      shade = document.createElement("div");
      shade.className = "acc-menu-shade";
      shade.addEventListener("click", () => setDrawer(false));
      document.body.appendChild(shade);
    }
    if (open) document.querySelector(".acc-side .acc-side-item")?.focus();
  }

  function logout() {
    // ใช้ฟังก์ชันออกจากระบบของหน้านั้นถ้ามี (บางหน้าล้างข้อมูลเพิ่ม) ไม่งั้นใช้ของกลาง
    const pageLogout = window.logoutAccounting || window.logoutSettings || window.handleDashboardLogout;
    if (typeof pageLogout === "function") return pageLogout();
    if (window.AUTH_GUARD?.logoutAndRedirect) return window.AUTH_GUARD.logoutAndRedirect();
    localStorage.removeItem("activeUser");
    localStorage.removeItem("activeRole");
    location.replace("/login.html");
  }

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
    renderSide();
    renderTabs();

    document.addEventListener("click", (e) => {
      const navBtn = e.target.closest("button[data-nav]");
      if (navBtn) {
        setDrawer(false);
        const id = navBtn.dataset.nav;
        if (!isAccountingPage()) {
          window.location.href = ACCOUNTING_PAGE + (HASH_OF[id] || "");
          return;
        }
        actions[id]?.();
        return;
      }
      if (e.target.closest("[data-logout]")) return logout();
      if (e.target.closest("[data-menu-toggle]")) return setDrawer(!document.body.classList.contains("acc-menu-open"));
      if (e.target.closest(".acc-side a")) setDrawer(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.body.classList.contains("acc-menu-open")) setDrawer(false);
    });

    const name = localStorage.getItem("activeName") || localStorage.getItem("activeUser");
    const nameEl = document.getElementById("accUserName");
    if (name && nameEl) nameEl.textContent = name;

    if (isAccountingPage()) handleHash();

    // สิทธิ์ยังไม่มีในเครื่อง (เช่น ล้างข้อมูลเบราว์เซอร์แต่ยังล็อกอินอยู่) — รอ authGuard บันทึกให้แล้ววาดเมนูใหม่
    if (!role) {
      const started = Date.now();
      const timer = setInterval(() => {
        role = readRole();
        if (role || Date.now() - started > 8000) {
          clearInterval(timer);
          if (role) refresh();
        }
      }, 300);
    }
  }

  function refresh() {
    const activeNav = document.querySelector(".acc-side [data-nav].is-active")?.dataset.nav;
    renderSide();
    renderTabs();
    if (activeNav) setActive(activeNav);
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

  window.AccountingNav = { setActive, setView: (v) => actions[v === "dashboard" ? "dash" : "data"](), openMenu: () => setDrawer(true), refresh };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
