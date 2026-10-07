/* ======================================================
   appShell.js — ทำให้หน้าที่ใช้บนมือถือ/แท็บเล็ตเป็นหลัก
   ทำงานและหน้าตาคล้ายแอปมือถือ

   - แถบหัวกะทัดรัดติดด้านบน (ชื่อหน้า + ผู้ใช้ + ปุ่มลัด)
   - แถบเมนูด้านล่าง (tab bar) หรือแถบปุ่มหลัก (action bar) ให้นิ้วโป้งกดถึง
   - ใช้ฟังก์ชัน/ปุ่มเดิมของหน้าทั้งหมด (ไม่เปลี่ยน logic เดิม)
   - เปิดใช้อัตโนมัติเฉพาะจอมือถือ/แท็บเล็ต — บน PC หน้าตาเหมือนเดิม
====================================================== */
(function () {
  "use strict";

  const THEME_KEY = "pvtAppTheme";
  const THEMES = [
    { id: "navy", label: "น้ำเงิน PVT", primary: "#1e3a8a", accent: "#ea580c" },
    { id: "ocean", label: "ฟ้าทะเล", primary: "#0369a1", accent: "#d97706" },
    { id: "green", label: "เขียวโรงงาน", primary: "#047857", accent: "#ea580c" },
    { id: "orange", label: "ส้มพลังงาน", primary: "#c2410c", accent: "#1e3a8a" },
    { id: "purple", label: "ม่วง", primary: "#6d28d9", accent: "#ea580c" },
    { id: "slate", label: "เทาเข้ม", primary: "#334155", accent: "#ea580c" },
  ];

  function readTheme() {
    try {
      const v = localStorage.getItem(THEME_KEY);
      return THEMES.some((t) => t.id === v) ? v : "navy";
    } catch (_) {
      return "navy";
    }
  }

  // หน้า Login ใช้สีแบรนด์ PVT&T คงที่ (ทุกคนเห็นหน้าเดียวกัน) ไม่เปลี่ยนตามธีม
  const IS_LOGIN = /\/login(\.html)?$/.test(location.pathname);

  function applyTheme(id) {
    const theme = THEMES.find((t) => t.id === id) || THEMES[0];
    if (IS_LOGIN) return theme;
    if (theme.id === "navy") document.documentElement.removeAttribute("data-app-theme");
    else document.documentElement.setAttribute("data-app-theme", theme.id);
    // สีแถบสถานะของมือถือให้ตรงธีม
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", theme.primary));
    return theme;
  }

  // ใช้ธีมทันทีตอนโหลด (สคริปต์อยู่ใน <head> จึงไม่เห็นสีเดิมกระพริบ)
  applyTheme(readTheme());

  const APP_QUERY = "(max-width: 1024px), (pointer: coarse) and (max-width: 1366px)";

  const $ = (sel) => document.querySelector(sel);
  const textOf = (sel) => {
    const el = $(sel);
    return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "";
  };
  const call = (name, ...args) => {
    if (typeof window[name] === "function") return window[name](...args);
    console.warn("[appShell] ไม่พบฟังก์ชัน", name);
    return undefined;
  };
  const clickEl = (sel) => {
    const el = $(sel);
    if (el) el.click();
  };
  const cleanLabel = (value) =>
    String(value || "")
      .replace(/^[^:：]*[:：]\s*/, "")
      .trim();

  const TAB_REVIEW = {
    icon: "fact_check",
    label: "ตรวจรายวัน",
    href: "/pages/supervisor-daily-review.html",
  };
  const TAB_DASHBOARD = {
    icon: "monitoring",
    label: "Dashboard",
    href: "/pages/supervisor-dashboard.html",
  };

  // เลื่อนไปที่การ์ด "รายการที่บันทึกลงระบบแล้ว" (เผื่อระยะแถบด้านบน)
  const scrollToHistory = () => {
    const body = document.getElementById("sentReportBody");
    const card = body && body.closest("section");
    if (!card) return;
    const bar = document.querySelector(".app-topbar");
    card.style.scrollMarginTop = (bar ? bar.offsetHeight : 64) + 12 + "px";
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const TAB_HISTORY = {
    icon: "history",
    label: "ประวัติ",
  };

  const PAGES = {
    "form-department": {
      title: "บันทึกของเสีย",
      subtitle: () => {
        const name = textOf("#display-username");
        const dept = cleanLabel(textOf("#dept-badge-text"));
        return [name && name !== "ยังไม่ได้ระบุชื่อ" ? name : "", dept]
          .filter(Boolean)
          .join(" · ");
      },
      online: () => !/offline/i.test(textOf("#network-status-text")),
      watch: ["#display-username", "#dept-badge-text", "#network-status-text"],
      leading: { icon: "arrow_back", label: "ย้อนกลับ", action: () => history.back() },
      hide: [".app-hero", ".form-actions"],
      tabs: [
        {
          icon: "cleaning_services",
          label: "ล้างข้อมูล",
          action: () => call("resetFormWithConfirm"),
        },
        {
          icon: "qr_code_scanner",
          label: "สแกน QR",
          href: "/login.html#scan",
        },
        {
          icon: "save",
          label: "บันทึก",
          center: true,
          variant: "save",
          mirrorDisabled: ".btn-submit",
          action: () => {
            const form = document.getElementById("department-waste-form");
            const submit = form && form.querySelector(".btn-submit");
            if (!form) return;
            if (typeof form.requestSubmit === "function") form.requestSubmit(submit || undefined);
            else if (submit) submit.click();
          },
        },
        {
          icon: "badge",
          label: "ผู้บันทึก",
          action: () => call("openStaffNameModal", true),
        },
        { icon: "logout", label: "ออก", action: () => call("handleLogout") },
      ],
    },

    "supervisor-daily-review": {
      title: "ตรวจสอบรายวัน",
      subtitle: () =>
        [textOf("#userName"), cleanLabel(textOf("#userDept"))]
          .filter((v) => v && v !== "-")
          .join(" · "),
      watch: ["#userName", "#userDept"],
      trailing: [{ icon: "refresh", label: "รีเฟรช", action: () => call("loadRecords") }],
      hide: [".supervisor-hero"],
      tabs: [
        { ...TAB_REVIEW, active: true },
        TAB_DASHBOARD,
        {
          icon: "qr_code_scanner",
          label: "สแกน QR",
          href: "/pages/supervisor-dashboard.html#scan",
          center: true,
        },
        { ...TAB_HISTORY, action: scrollToHistory },
        { icon: "logout", label: "ออก", action: () => call("logoutNow") },
      ],
      onReady: () => {
        // มาจากปุ่ม "ประวัติ" ของหน้า Dashboard → เลื่อนลงไปที่รายการที่บันทึกแล้ว
        if (location.hash === "#history") {
          history.replaceState(null, "", location.pathname + location.search);
          setTimeout(scrollToHistory, 900);
        }
      },
    },

    "supervisor-dashboard": {
      title: "Dashboard ของเสีย",
      subtitle: () =>
        [textOf("#userName"), cleanLabel(textOf("#userDept"))]
          .filter((v) => v && v !== "-")
          .join(" · "),
      watch: ["#userName", "#userDept"],
      hide: [".dashboard-hero", ".floating-scan-qr-btn"],
      tabs: [
        TAB_REVIEW,
        { ...TAB_DASHBOARD, active: true },
        {
          icon: "qr_code_scanner",
          label: "สแกน QR",
          center: true,
          action: () => clickEl("#btn-floating-scan-qr"),
        },
        { ...TAB_HISTORY, href: "/pages/supervisor-daily-review.html#history" },
        { icon: "logout", label: "ออก", action: () => call("logout") },
      ],
      onReady: () => {
        // มาจากปุ่ม "สแกน QR" ของหน้าอื่น → เปิดกล้องทันที
        if (location.hash === "#scan") {
          history.replaceState(null, "", location.pathname + location.search);
          setTimeout(() => clickEl("#btn-floating-scan-qr"), 600);
        }
      },
    },

    // หน้าเต็มจอแบบแอป ไม่มีแถบเมนู
    login: {
      onReady: () => {
        if (location.hash === "#scan") {
          history.replaceState(null, "", location.pathname + location.search);
          setTimeout(() => call("showQrScanner"), 400);
        }
      },
    },
    "qr-success": {},
  };

  const pageKey = (location.pathname.split("/").pop() || "login.html").replace(/\.html$/, "") || "login";
  const config = PAGES[pageKey];
  if (!config) return;

  const mq = window.matchMedia(APP_QUERY);
  let built = false;
  let topbar = null;

  function iconSpan(name) {
    const span = document.createElement("span");
    span.className = "material-symbols-outlined";
    span.setAttribute("aria-hidden", "true");
    span.textContent = name;
    return span;
  }

  function makeButton(item, className) {
    const el = document.createElement(item.href ? "a" : "button");
    el.className = className;
    if (item.href) {
      el.href = item.href;
    } else {
      el.type = "button";
      el.addEventListener("click", (e) => {
        e.preventDefault();
        item.action && item.action();
      });
    }
    el.setAttribute("aria-label", item.label);
    el.title = item.label;
    el.appendChild(iconSpan(item.icon));
    return el;
  }

  // ปุ่มในแถบล่างแสดงสถานะ "กำลังบันทึก" ตามปุ่มเดิมของฟอร์ม (กันกดซ้ำ)
  function mirrorDisabled(el, selector) {
    const src = $(selector);
    if (!src) return;
    const sync = () => {
      el.disabled = Boolean(src.disabled);
      el.classList.toggle("is-busy", Boolean(src.disabled));
      el.setAttribute("aria-busy", src.disabled ? "true" : "false");
    };
    new MutationObserver(sync).observe(src, { attributes: true, attributeFilter: ["disabled"] });
    sync();
  }

  function openThemePicker() {
    if (document.querySelector(".app-theme-sheet")) return;
    const current = readTheme();
    const sheet = document.createElement("div");
    sheet.className = "app-theme-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-label", "เลือกธีมสี");
    sheet.innerHTML = `
      <div class="app-theme-panel">
        <h3>ธีมสี</h3>
        <p>เลือกสีของแอปบนเครื่องนี้</p>
        <div class="app-theme-grid" role="radiogroup">
          ${THEMES.map(
            (t) => `
            <button type="button" class="app-theme-option" role="radio" data-theme="${t.id}"
              aria-checked="${t.id === current}" style="--swatch-primary:${t.primary};--swatch-accent:${t.accent}">
              <span class="app-theme-swatch" aria-hidden="true"></span>
              <span>${t.label}</span>
            </button>`,
          ).join("")}
        </div>
        <button type="button" class="app-theme-close">เสร็จสิ้น</button>
      </div>`;

    const close = () => sheet.remove();
    sheet.addEventListener("click", (e) => {
      if (e.target === sheet || e.target.closest(".app-theme-close")) return close();
      const opt = e.target.closest(".app-theme-option");
      if (!opt) return;
      const id = opt.dataset.theme;
      try {
        localStorage.setItem(THEME_KEY, id);
      } catch (_) {}
      applyTheme(id);
      sheet.querySelectorAll(".app-theme-option").forEach((b) =>
        b.setAttribute("aria-checked", String(b === opt)),
      );
    });
    document.addEventListener(
      "keydown",
      function onKey(e) {
        if (e.key === "Escape") {
          close();
          document.removeEventListener("keydown", onKey);
        }
      },
    );
    document.body.appendChild(sheet);
    const checked = sheet.querySelector('[aria-checked="true"]');
    if (checked) checked.focus();
  }

  function buildTopbar() {
    const bar = document.createElement("header");
    bar.className = "app-topbar";
    bar.setAttribute("role", "banner");

    if (config.leading) {
      bar.appendChild(makeButton(config.leading, "app-icon-btn app-topbar-leading"));
    } else {
      const logo = document.createElement("img");
      logo.className = "app-topbar-logo";
      logo.src = "/icons/Logo_Apps3.png?v=3";
      logo.alt = "PVT&T FACTORY";
      bar.appendChild(logo);
    }

    const titles = document.createElement("div");
    titles.className = "app-topbar-titles";
    const h = document.createElement("div");
    h.className = "app-topbar-title";
    h.textContent = config.title;
    const sub = document.createElement("div");
    sub.className = "app-topbar-subtitle";
    titles.append(h, sub);
    bar.appendChild(titles);

    if (config.online) {
      const dot = document.createElement("span");
      dot.className = "app-online-dot";
      bar.appendChild(dot);
    }

    (config.trailing || []).forEach((item) =>
      bar.appendChild(makeButton(item, "app-icon-btn")),
    );

    bar.appendChild(
      makeButton({ icon: "palette", label: "ธีมสี", action: openThemePicker }, "app-icon-btn app-theme-btn"),
    );

    document.body.prepend(bar);
    return bar;
  }

  function refreshTopbar() {
    if (!topbar) return;
    const sub = topbar.querySelector(".app-topbar-subtitle");
    const value = config.subtitle ? config.subtitle() : "";
    sub.textContent = value;
    sub.hidden = !value;
    const dot = topbar.querySelector(".app-online-dot");
    if (dot && config.online) {
      const online = config.online();
      dot.classList.toggle("is-offline", !online);
      dot.title = online ? "ออนไลน์" : "ออฟไลน์";
    }
  }

  function buildTabbar() {
    const nav = document.createElement("nav");
    nav.className = "app-tabbar";
    nav.setAttribute("aria-label", "เมนูหลัก");
    config.tabs.forEach((item) => {
      const el = makeButton(
        item,
        "app-tab" +
          (item.active ? " is-active" : "") +
          (item.center ? " is-center" : "") +
          (item.variant ? " is-" + item.variant : ""),
      );
      if (item.mirrorDisabled) mirrorDisabled(el, item.mirrorDisabled);
      if (item.active) el.setAttribute("aria-current", "page");
      const label = document.createElement("span");
      label.className = "app-tab-label";
      label.textContent = item.label;
      el.appendChild(label);
      nav.appendChild(el);
    });
    document.body.appendChild(nav);
    document.body.classList.add("has-app-tabbar");
  }

  function buildActionbar() {
    const bar = document.createElement("div");
    bar.className = "app-actionbar";
    config.actionbar.forEach((item) => {
      const el = makeButton(item, "app-action-btn is-" + (item.variant || "primary"));
      const label = document.createElement("span");
      label.textContent = item.label;
      el.appendChild(label);
      bar.appendChild(el);

      if (item.mirrorDisabled) mirrorDisabled(el, item.mirrorDisabled);
    });
    document.body.appendChild(bar);
    document.body.classList.add("has-app-actionbar");
  }

  function build() {
    if (built) return;
    built = true;

    (config.hide || []).forEach((sel) =>
      document.querySelectorAll(sel).forEach((el) => el.classList.add("app-hidden")),
    );

    if (config.title) {
      topbar = buildTopbar();
      document.body.classList.add("has-app-topbar");
      refreshTopbar();
      (config.watch || []).forEach((sel) => {
        const el = $(sel);
        if (el) new MutationObserver(refreshTopbar).observe(el, { childList: true, characterData: true, subtree: true });
      });
      window.addEventListener("online", refreshTopbar);
      window.addEventListener("offline", refreshTopbar);

      let ticking = false;
      window.addEventListener(
        "scroll",
        () => {
          if (ticking) return;
          ticking = true;
          requestAnimationFrame(() => {
            topbar.classList.toggle("is-scrolled", window.scrollY > 4);
            ticking = false;
          });
        },
        { passive: true },
      );
    }

    if (config.tabs) buildTabbar();
    if (config.actionbar) buildActionbar();
    if (config.onReady) config.onReady();
  }

  function apply() {
    const on = mq.matches;
    document.documentElement.classList.toggle("app-mode", on);
    if (on) build();
    else if (!built && pageKey === "login" && config.onReady) {
      built = true;
      config.onReady();
    }
  }

  function init() {
    // ป้าย DEV (เฉพาะเว็บทดสอบ) ไม่ให้ทับปุ่มบนแถบหัว
    setTimeout(() => {
      document.querySelectorAll("body > div").forEach((el) => {
        if (el.textContent.trim() === "🧪 DEV" && el.style.position === "fixed") el.classList.add("app-dev-badge");
      });
    }, 0);

    apply();
    if (mq.addEventListener) mq.addEventListener("change", apply);
    else if (mq.addListener) mq.addListener(apply);
  }

  // ให้หน้ารู้ทันทีว่าเป็นโหมดแอป (กันหน้ากระพริบก่อน DOM โหลด)
  document.documentElement.classList.toggle("app-mode", mq.matches);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.APP_SHELL = { refresh: refreshTopbar, openThemePicker, applyTheme, themes: THEMES };
})();