// =========================================================
// EA FACTORY - LOADING SERVICE
// Splash + Loading Overlay แบบไฟล์เดียว พร้อม อนิเมชันไฮเทค
// =========================================================

(function () {

  // =========================================================
  // CSS
  // =========================================================

  const STYLE_ID = "ea-loading-service-style";

  function injectStyles() {

    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");

    style.id = STYLE_ID;

    style.textContent = `

      /* =========================
         SPLASH SCREEN
      ========================= */

      #splash-screen {
        position: fixed !important;
        inset: 0 !important;
        z-index: 999999 !important;

        display: grid !important;
        place-items: center !important;

        margin: 0 !important;
        padding: 20px !important;
        box-sizing: border-box !important;

        background:
          radial-gradient(
            circle at 50% 35%,
            rgba(37, 99, 235, 0.18),
            transparent 55%
          ),
          radial-gradient(
            circle at 80% 80%,
            rgba(99, 102, 241, 0.12),
            transparent 45%
          ),
          linear-gradient(
            135deg,
            #f8fafc 0%,
            #eff6ff 50%,
            #e0f2fe 100%
          ) !important;

        opacity: 1;
        visibility: visible;

        transition:
          opacity 0.45s cubic-bezier(0.4, 0, 0.2, 1),
          visibility 0.45s cubic-bezier(0.4, 0, 0.2, 1);
        overflow: hidden !important;
      }

      #splash-screen.ea-splash-hide {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* Ambient Floating Particle Background */
      #splash-screen .ea-splash-bg-glow {
        position: absolute;
        width: 320px;
        height: 320px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(59, 130, 246, 0.25) 0%, rgba(37, 99, 235, 0) 70%);
        animation: eaBgPulse 4s ease-in-out infinite alternate;
        pointer-events: none;
      }

      /* =========================
         SPLASH CARD
      ========================= */

      #splash-screen .ea-splash-card {
        position: relative !important;
        z-index: 2 !important;

        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;

        width: 380px !important;
        max-width: 90vw !important;
        height: auto !important;

        margin: 0 !important;
        padding: 24px !important;
        box-sizing: border-box !important;

        text-align: center !important;
        background: transparent !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;

        border: none !important;
        box-shadow: none !important;

        animation: eaCardPopIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }

      /* =========================
         LOGO WRAPPER & ANIMATION (Obsolete because logo is inside loader now)
      ========================= */

      #splash-screen .ea-splash-logo-wrap {
        display: none !important;
      }

      #splash-screen .ea-splash-logo {
        display: block !important;
        width: 74px !important;
        height: 74px !important;
        max-width: 74px !important;
        max-height: 74px !important;
        object-fit: contain !important;
        position: absolute !important;
        z-index: 5 !important;

        filter: drop-shadow(0 10px 15px rgba(30, 58, 138, 0.18)) !important;
        animation: eaLogoFloat 3s ease-in-out infinite !important;
      }

      #splash-screen .ea-splash-logo-glow {
        position: absolute !important;
        width: 80px !important;
        height: 80px !important;
        border-radius: 50% !important;
        background: radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, transparent 70%) !important;
        filter: blur(10px) !important;
        animation: eaGlowPulse 2.5s ease-in-out infinite alternate !important;
        z-index: 4 !important;
      }

      /* =========================
         TEXT & SHIMMER TITLE
      ========================= */

      #splash-screen .ea-splash-title {
        display: block !important;
        margin: 18px 0 4px !important;
        padding: 0 !important;

        font-size: 26px !important;
        line-height: 1.3 !important;
        font-weight: 800 !important;
        letter-spacing: 0.05em !important;

        background: linear-gradient(
          90deg,
          #1e3a8a 0%,
          #2563eb 25%,
          #60a5fa 50%,
          #2563eb 75%,
          #1e3a8a 100%
        ) !important;
        background-size: 200% auto !important;
        -webkit-background-clip: text !important;
        -webkit-text-fill-color: transparent !important;

        animation: eaTextShimmer 3.5s linear infinite !important;
        text-align: center !important;
      }

      #splash-screen .ea-splash-text {
        display: block !important;
        margin: 0 !important;
        padding: 0 !important;

        font-size: 14.5px !important;
        line-height: 1.5 !important;
        font-weight: 600 !important;
        color: #475569 !important;

        text-align: center !important;
      }

      /* =========================
         FUTURISTIC ORBIT LOADER
      ========================= */

      #splash-screen .ea-splash-loader {
        position: relative !important;
        width: 130px !important;
        height: 130px !important;
        margin-top: 15px !important;
        margin-bottom: 20px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }

      #splash-screen .ea-orbit-ring {
        position: absolute !important;
        box-sizing: border-box !important;
        border-radius: 50% !important;
      }

      #splash-screen .ea-orbit-ring.ring-1 {
        width: 100% !important;
        height: 100% !important;
        border: 3px solid transparent !important;
        border-top-color: #1e3a8a !important;
        border-right-color: #2563eb !important;
        animation: eaRotateCW 1.4s cubic-bezier(0.5, 0.1, 0.5, 0.9) infinite !important;
      }

      #splash-screen .ea-orbit-ring.ring-2 {
        width: 78% !important;
        height: 78% !important;
        border: 2.5px solid transparent !important;
        border-bottom-color: #3b82f6 !important;
        border-left-color: #60a5fa !important;
        animation: eaRotateCCW 1.05s cubic-bezier(0.5, 0.1, 0.5, 0.9) infinite !important;
      }

      #splash-screen .ea-orbit-core {
        display: none !important;
      }


      /* =========================
         LOADING OVERLAY
      ========================= */

      #ea-loading-overlay {
        position: fixed !important;
        inset: 0 !important;
        z-index: 1000000 !important;

        display: grid !important;
        place-items: center !important;

        padding: 20px !important;
        box-sizing: border-box !important;

        background: rgba(15, 23, 42, 0.45) !important;
        backdrop-filter: blur(8px) !important;
        -webkit-backdrop-filter: blur(8px) !important;

        opacity: 1;
        visibility: visible;
        transition: opacity 0.25s ease, visibility 0.25s ease;
      }

      #ea-loading-overlay.ea-loading-hidden {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }

      /* =========================
         LOADING BOX (HIGH-TECH MODAL)
      ========================= */

      #ea-loading-overlay .ea-loading-box {
        position: relative !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;

        width: 320px !important;
        max-width: 90vw !important;

        padding: 32px 24px 26px !important;
        box-sizing: border-box !important;

        text-align: center !important;
        background: #ffffff !important;

        border: 1px solid rgba(226, 232, 240, 0.9) !important;
        border-radius: 24px !important;

        box-shadow:
          0 25px 60px -15px rgba(15, 23, 42, 0.28),
          0 0 30px rgba(37, 99, 235, 0.12) !important;

        animation: eaModalSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        overflow: hidden !important;
      }

      /* =========================
         FUTURISTIC SPINNER
      ========================= */

      #ea-loading-overlay .ea-loading-spinner-wrap {
        position: relative !important;
        width: 60px !important;
        height: 60px !important;
        margin-bottom: 18px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
      }

      #ea-loading-overlay .ea-spinner-outer {
        position: absolute !important;
        inset: 0 !important;
        border: 3px solid #e2e8f0 !important;
        border-top-color: #1e3a8a !important;
        border-right-color: #2563eb !important;
        border-radius: 50% !important;
        animation: eaRotateCW 0.95s linear infinite !important;
      }

      #ea-loading-overlay .ea-spinner-inner {
        position: absolute !important;
        inset: 9px !important;
        border: 2.5px solid transparent !important;
        border-bottom-color: #3b82f6 !important;
        border-left-color: #60a5fa !important;
        border-radius: 50% !important;
        animation: eaRotateCCW 0.75s linear infinite !important;
      }

      #ea-loading-overlay .ea-spinner-core {
        width: 12px !important;
        height: 12px !important;
        background: linear-gradient(135deg, #2563eb, #3b82f6) !important;
        border-radius: 50% !important;
        box-shadow: 0 0 12px rgba(37, 99, 235, 0.6) !important;
        animation: eaCorePulse 1s ease-in-out infinite alternate !important;
      }

      #ea-loading-overlay .ea-loading-title {
        margin: 0 !important;
        padding: 0 !important;

        font-size: 18px !important;
        line-height: 1.35 !important;
        font-weight: 700 !important;
        color: #0f172a !important;
      }

      #ea-loading-overlay .ea-loading-text {
        margin: 6px 0 0 !important;
        padding: 0 !important;

        font-size: 13.5px !important;
        line-height: 1.5 !important;
        color: #64748b !important;
      }

      /* Glowing Progress Line at Bottom */
      #ea-loading-overlay .ea-loading-bar-wrap {
        width: 100% !important;
        height: 3.5px !important;
        background: #f1f5f9 !important;
        border-radius: 99px !important;
        margin-top: 22px !important;
        overflow: hidden !important;
        position: relative !important;
      }

      #ea-loading-overlay .ea-loading-bar-glow {
        position: absolute !important;
        top: 0 !important;
        left: -50% !important;
        width: 50% !important;
        height: 100% !important;
        background: linear-gradient(
          90deg,
          transparent,
          #2563eb,
          #60a5fa,
          transparent
        ) !important;
        border-radius: 99px !important;
        animation: eaBarScan 1.4s ease-in-out infinite !important;
      }


      /* =========================
         KEYFRAME ANIMATIONS
      ========================= */

      @keyframes eaCardPopIn {
        0% {
          opacity: 0;
          transform: scale(0.9) translateY(12px);
        }
        100% {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      @keyframes eaModalSlideIn {
        0% {
          opacity: 0;
          transform: scale(0.92) translateY(15px);
        }
        100% {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      @keyframes eaLogoFloat {
        0%, 100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-6px);
        }
      }

      @keyframes eaGlowPulse {
        0% {
          opacity: 0.3;
          transform: scale(0.9);
        }
        100% {
          opacity: 0.8;
          transform: scale(1.15);
        }
      }

      @keyframes eaTextShimmer {
        0% {
          background-position: 0% center;
        }
        100% {
          background-position: 200% center;
        }
      }

      @keyframes eaRotateCW {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }

      @keyframes eaRotateCCW {
        0% {
          transform: rotate(360deg);
        }
        100% {
          transform: rotate(0deg);
        }
      }

      @keyframes eaCorePulse {
        0% {
          transform: scale(0.75);
          opacity: 0.6;
        }
        100% {
          transform: scale(1.25);
          opacity: 1;
        }
      }

      @keyframes eaBgPulse {
        0% {
          transform: scale(0.8) translate(-10px, -10px);
          opacity: 0.5;
        }
        100% {
          transform: scale(1.2) translate(10px, 10px);
          opacity: 0.9;
        }
      }

      @keyframes eaBarScan {
        0% {
          left: -50%;
        }
        100% {
          left: 100%;
        }
      }

      /* =========================
         MOBILE OPTIMIZATION
      ========================= */

      @media (max-width: 600px) {

        #splash-screen .ea-splash-card {
          padding: 20px !important;
          border-radius: 0 !important;
        }

        #splash-screen .ea-splash-loader {
          width: 110px !important;
          height: 110px !important;
        }

        #splash-screen .ea-splash-logo {
          width: 64px !important;
          height: 64px !important;
          max-width: 64px !important;
          max-height: 64px !important;
        }

        #splash-screen .ea-splash-logo-glow {
          width: 68px !important;
          height: 68px !important;
        }

        #splash-screen .ea-splash-title {
          font-size: 21px !important;
        }

        #splash-screen .ea-splash-text {
          font-size: 13px !important;
        }

        #ea-loading-overlay .ea-loading-box {
          padding: 26px 20px 22px !important;
          border-radius: 20px !important;
        }

      }

    `;

    document.head.appendChild(style);
  }


  // =========================================================
  // CREATE UI
  // =========================================================

  function createLoadingUI() {

    injectStyles();

    // Splash
    const skipSplash = sessionStorage.getItem("skipLoginSplash") === "1";

    if (skipSplash) {
      sessionStorage.removeItem("skipLoginSplash");
    }

    if (!skipSplash && !document.getElementById("splash-screen")) {

      document.body.insertAdjacentHTML(
        "afterbegin",
        `
          <div id="splash-screen">
            <div class="ea-splash-bg-glow"></div>

            <div class="ea-splash-card">

              <div class="ea-splash-loader">
                <div class="ea-orbit-ring ring-1"></div>
                <div class="ea-orbit-ring ring-2"></div>
                <img
                  src="/icons/Logo_Apps3.png?v=3"
                  class="ea-splash-logo"
                  alt="EA Factory Logo"
                />
                <div class="ea-splash-logo-glow"></div>
              </div>

              <div class="ea-splash-title">
                PVT FACTORY
              </div>

              <div class="ea-splash-text">
                ศูนย์รวมข้อมูลและระบบงาน
              </div>

            </div>

          </div>
        `
      );

    }


    // Overlay
    if (!document.getElementById("ea-loading-overlay")) {

      document.body.insertAdjacentHTML(
        "beforeend",
        `
          <div
            id="ea-loading-overlay"
            class="ea-loading-hidden"
          >

            <div class="ea-loading-box">

              <div class="ea-loading-spinner-wrap">
                <div class="ea-spinner-outer"></div>
                <div class="ea-spinner-inner"></div>
                <div class="ea-spinner-core"></div>
              </div>

              <div
                id="ea-loading-title"
                class="ea-loading-title"
              >
                กำลังโหลดข้อมูล
              </div>

              <div
                id="ea-loading-text"
                class="ea-loading-text"
              >
                ระบบกำลังดึงข้อมูลล่าสุด
              </div>

              <div class="ea-loading-bar-wrap">
                <div class="ea-loading-bar-glow"></div>
              </div>

            </div>

          </div>
        `
      );

    }

  }


  // =========================================================
  // INITIALIZE
  // =========================================================

  function init() {

    createLoadingUI();

  }


  if (document.readyState === "loading") {

    document.addEventListener(
      "DOMContentLoaded",
      init,
      { once: true }
    );

  } else {

    init();

  }


  // =========================================================
  // SERVICE
  // =========================================================

  window.LoadingService = {

    show(
      title = "กำลังโหลดข้อมูล",
      text = "ระบบกำลังดึงข้อมูลล่าสุด"
    ) {

      createLoadingUI();

      // Check both ea-loading-overlay and login-overlay
      const overlay =
        document.getElementById("ea-loading-overlay") ||
        document.getElementById("login-overlay");

      const titleEl =
        document.getElementById("ea-loading-title") ||
        overlay?.querySelector("h3");

      const textEl =
        document.getElementById("ea-loading-text") ||
        overlay?.querySelector("p");

      if (titleEl) {
        titleEl.textContent = title;
      }

      if (textEl) {
        textEl.textContent = text;
      }

      if (overlay) {
        overlay.classList.remove("ea-loading-hidden");
        overlay.classList.remove("hidden");
      }

    },


    hide() {

      const overlay =
        document.getElementById("ea-loading-overlay") ||
        document.getElementById("login-overlay");

      if (overlay) {
        overlay.classList.add("ea-loading-hidden");
        overlay.classList.add("hidden");
      }

    },


    hideSplash(delay = 800) {

      setTimeout(() => {

        const splash =
          document.getElementById(
            "splash-screen"
          );

        if (!splash) return;

        splash.classList.add("ea-splash-hide");
        splash.classList.add("hide");

        setTimeout(() => {

          try {
            splash.remove();
          } catch (e) {
            splash.style.display = "none";
          }

        }, 450);

      }, delay);

    }

  };

  // Legacy global helpers mapping
  window.showLoginOverlay = function(title = "กำลังเข้าสู่ระบบ...", text = "กรุณารอสักครู่") {
    window.LoadingService.show(title, text);
  };

  window.hideLoginOverlay = function() {
    window.LoadingService.hide();
  };

  window.hideSplash = function(delay = 800) {
    window.LoadingService.hideSplash(delay);
  };


  // =========================================================
  // PAGE READY
  // =========================================================

  window.addEventListener(
    "load",
    () => {

      window.LoadingService
        ?.hideSplash();

    },
    { once: true }
  );

})();
