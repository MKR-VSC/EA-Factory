// =========================================================
// PVT&T FACTORY - LOADING SERVICE
// หน้าเปิดแอป (Splash) + หน้าต่าง "กำลังโหลด" แบบเดียวกันทั้งแอป
// หน้าตาทั้งหมดอยู่ใน /css/splash.css
// =========================================================

(function () {
  const SPLASH_CSS = "/css/splash.css";
  const LOGO = "/icons/Logo_Apps3.png?v=3";
  const SESSION_KEY = "pvtSplashSeen";

  // เปิดหน้าแรกของรอบการใช้งาน → เล่นแอนิเมชันเต็ม
  // เปลี่ยนหน้าภายในแอปครั้งต่อ ๆ ไป → แสดงสั้น ๆ ไม่ให้รอนาน
  const MIN_FIRST_MS = 1150;
  const MIN_NEXT_MS = 450;

  // ---------------------------------------------------------
  // CSS: ใส่ลิงก์ splash.css ให้ถ้าหน้านั้นยังไม่มี
  // ---------------------------------------------------------
  function ensureStyles() {
    const has = [...document.querySelectorAll('link[rel="stylesheet"]')].some((l) =>
      /\/css\/splash\.css/.test(l.getAttribute("href") || ""),
    );
    if (has) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = SPLASH_CSS;
    document.head.appendChild(link);
  }

  // ---------------------------------------------------------
  // MARKUP (ชุดเดียวกับที่ฝังไว้ในหน้า HTML)
  // ---------------------------------------------------------
  function ringSvg(id, cls) {
    return `
      <svg class="${cls}" viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ff8a3d" />
            <stop offset="0.55" stop-color="#f26a1b" />
            <stop offset="1" stop-color="#1e3a8a" />
          </linearGradient>
        </defs>
        <circle class="track" cx="60" cy="60" r="54" />
        <circle class="arc" cx="60" cy="60" r="54" />
      </svg>`;
  }

  function splashHtml(sub) {
    return `
      <div id="splash-screen" class="pvt-splash" role="status" aria-label="กำลังเปิดแอป">
        <div class="pvt-splash-mark" aria-hidden="true">
          <span class="pvt-splash-glow"></span>
          ${ringSvg("pvtSplashRing", "pvt-splash-ring")}
          <img class="pvt-splash-logo" src="${LOGO}" alt="" />
        </div>
        <div class="pvt-splash-title">PVT&amp;T Factory</div>
        <div class="pvt-splash-sub">${sub}</div>
      </div>`;
  }

  function loaderInnerHtml(title, text) {
    return `
      <div class="pvt-loader-card">
        <div class="pvt-loader-mark" aria-hidden="true">
          ${ringSvg("pvtLoaderRing", "pvt-loader-ring")}
          <img class="pvt-loader-logo" src="${LOGO}" alt="" />
        </div>
        <h3 id="ea-loading-title" class="pvt-loader-title">${title}</h3>
        <p id="ea-loading-text" class="pvt-loader-text">${text}</p>
      </div>`;
  }

  // ---------------------------------------------------------
  // CREATE UI
  // ---------------------------------------------------------
  function createLoadingUI() {
    ensureStyles();

    // Splash: หน้าไหนยังไม่ได้ฝังไว้ ให้ใส่ให้ (กรณีปกติฝังไว้ใน HTML แล้วเพื่อให้ขึ้นทันที)
    const skipSplash = sessionStorage.getItem("skipLoginSplash") === "1";
    if (skipSplash) sessionStorage.removeItem("skipLoginSplash");

    if (!skipSplash && !document.getElementById("splash-screen") && !window.__pvtSplashDone) {
      document.body.insertAdjacentHTML("afterbegin", splashHtml("กำลังเปิดระบบ"));
    }

    // หน้าต่างกำลังโหลด
    if (!document.getElementById("ea-loading-overlay")) {
      document.body.insertAdjacentHTML(
        "beforeend",
        `<div id="ea-loading-overlay" class="pvt-loader ea-loading-hidden" role="status" aria-live="polite">
          ${loaderInnerHtml("กำลังโหลดข้อมูล", "ระบบกำลังดึงข้อมูลล่าสุด")}
        </div>`,
      );
    }
  }

  function init() {
    createLoadingUI();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  // ---------------------------------------------------------
  // SERVICE
  // ---------------------------------------------------------
  function getOverlay() {
    // ใช้หน้าต่างของ LoadingService เป็นหลัก (หน้าตาเดียวกันทุกหน้า)
    return document.getElementById("ea-loading-overlay") || document.getElementById("login-overlay");
  }

  window.LoadingService = {
    show(title = "กำลังโหลดข้อมูล", text = "ระบบกำลังดึงข้อมูลล่าสุด") {
      createLoadingUI();
      const overlay = getOverlay();
      if (!overlay) return;
      const titleEl = overlay.querySelector("h3");
      const textEl = overlay.querySelector("p");
      if (titleEl) titleEl.textContent = title;
      if (textEl) textEl.textContent = text;
      overlay.classList.remove("ea-loading-hidden", "hidden");
    },

    hide() {
      const overlay = getOverlay();
      if (overlay) overlay.classList.add("ea-loading-hidden", "hidden");
    },

    hideSplash(delay = 0) {
      const splashEl = document.getElementById("splash-screen");
      if (!splashEl) return;

      let seen = false;
      try {
        seen = sessionStorage.getItem(SESSION_KEY) === "1";
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch (_) {}

      const minMs = seen ? MIN_NEXT_MS : MIN_FIRST_MS;
      const elapsed = window.performance ? performance.now() : 0;
      const wait = Math.max(delay, minMs - elapsed, 0);

      setTimeout(() => {
        const splash = document.getElementById("splash-screen");
        if (!splash) return;
        splash.classList.add("ea-splash-hide", "hide");
        window.__pvtSplashDone = true;
        setTimeout(() => {
          try {
            splash.remove();
          } catch (e) {
            splash.style.display = "none";
          }
        }, 560); // รอให้จางหายครบก่อนเอาออก
      }, wait);
    },
  };

  // ฟังก์ชันเดิมที่บางหน้ายังเรียกใช้
  window.showLoginOverlay =
    window.showLoginOverlay ||
    function (title = "กำลังเข้าสู่ระบบ...", text = "กรุณารอสักครู่") {
      window.LoadingService.show(title, text);
    };

  window.hideLoginOverlay =
    window.hideLoginOverlay ||
    function () {
      window.LoadingService.hide();
    };

  window.hideSplash = function (delay = 0) {
    window.LoadingService.hideSplash(delay);
  };

  // หน้าโหลดเสร็จ → ซ่อนหน้าเปิดแอป
  window.addEventListener(
    "load",
    () => {
      window.LoadingService?.hideSplash();
    },
    { once: true },
  );
})();