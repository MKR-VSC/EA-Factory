// =========================================================
// EA FACTORY - LOADING SERVICE
// Splash + Loading Overlay แบบไฟล์เดียว
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
         SPLASH
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
            circle at top,
            rgba(37, 99, 235, 0.12),
            transparent 40%
          ),
          linear-gradient(
            135deg,
            #eff6ff,
            #ffffff
          ) !important;

        opacity: 1;
        visibility: visible;

        transition:
          opacity 0.35s ease,
          visibility 0.35s ease;
      }


      #splash-screen.ea-splash-hide {
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
      }


      /* =========================
         SPLASH CARD
      ========================= */

      #splash-screen .ea-splash-card {
        display: flex !important;

        flex-direction: column !important;

        align-items: center !important;
        justify-content: center !important;

        width: 360px !important;
        max-width: 90vw !important;

        height: auto !important;

        margin: 0 !important;
        padding: 0 !important;

        box-sizing: border-box !important;

        text-align: center !important;

        background: transparent !important;

        border: 0 !important;
        border-radius: 0 !important;

        box-shadow: none !important;
      }


      /* =========================
         LOGO
      ========================= */

      #splash-screen .ea-splash-logo {
        display: block !important;

        width: 180px !important;
        height: auto !important;

        min-width: 0 !important;
        min-height: 0 !important;

        max-width: 180px !important;
        max-height: none !important;

        aspect-ratio: auto !important;

        object-fit: contain !important;
        object-position: center !important;

        flex: none !important;

        margin: 0 auto !important;
        padding: 0 !important;

        border: 0 !important;
        border-radius: 0 !important;

        box-shadow: none !important;
      }


      /* =========================
         TEXT
      ========================= */

      #splash-screen .ea-splash-title {
        display: block !important;

        margin: 16px 0 4px !important;
        padding: 0 !important;

        font-size: 22px !important;
        line-height: 1.4 !important;

        font-weight: 700 !important;

        color: #0f172a !important;

        text-align: center !important;
      }


      #splash-screen .ea-splash-text {
        display: block !important;

        margin: 0 !important;
        padding: 0 !important;

        font-size: 14px !important;
        line-height: 1.6 !important;

        color: #64748b !important;

        text-align: center !important;
      }


      /* =========================
         DOTS
      ========================= */

      #splash-screen .ea-splash-dots {
        display: flex !important;

        align-items: center !important;
        justify-content: center !important;

        gap: 8px !important;

        margin-top: 18px !important;
      }


      #splash-screen .ea-splash-dot {
        display: block !important;

        width: 9px !important;
        height: 9px !important;

        min-width: 9px !important;
        min-height: 9px !important;

        flex: 0 0 9px !important;

        margin: 0 !important;
        padding: 0 !important;

        border-radius: 50% !important;

        background: #1E3A8A !important;

        animation:
          eaLoadingDot 1s infinite ease-in-out;
      }


      #splash-screen .ea-splash-dot:nth-child(2) {
        animation-delay: 0.15s;
      }


      #splash-screen .ea-splash-dot:nth-child(3) {
        animation-delay: 0.3s;
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

        background:
          rgba(15, 23, 42, 0.42) !important;

        backdrop-filter: blur(5px);
        -webkit-backdrop-filter: blur(5px);
      }


      #ea-loading-overlay.ea-loading-hidden {
        display: none !important;
      }


      /* =========================
         LOADING BOX
      ========================= */

      #ea-loading-overlay .ea-loading-box {
        display: block !important;

        width: 320px !important;
        max-width: 90vw !important;

        height: auto !important;

        margin: 0 !important;
        padding: 30px 24px !important;

        box-sizing: border-box !important;

        text-align: center !important;

        background: #ffffff !important;

        border: 0 !important;
        border-radius: 22px !important;

        box-shadow:
          0 25px 70px
          rgba(15, 23, 42, 0.24) !important;
      }


      /* =========================
         RING
      ========================= */

      #ea-loading-overlay .ea-loading-ring {
        display: block !important;

        width: 52px !important;
        height: 52px !important;

        box-sizing: border-box !important;

        margin: 0 auto 16px !important;

        border:
          5px solid #dbeafe !important;

        border-top-color:
          #1E3A8A !important;

        border-radius:
          50% !important;

        animation:
          eaLoadingSpin
          0.85s linear infinite;
      }


      #ea-loading-overlay .ea-loading-title {
        margin: 0 !important;
        padding: 0 !important;

        font-size: 18px !important;
        line-height: 1.4 !important;

        font-weight: 700 !important;

        color: #0f172a !important;
      }


      #ea-loading-overlay .ea-loading-text {
        margin: 7px 0 0 !important;
        padding: 0 !important;

        font-size: 14px !important;
        line-height: 1.6 !important;

        color: #64748b !important;
      }


      /* =========================
         ANIMATION
      ========================= */

      @keyframes eaLoadingDot {

        0%,
        80%,
        100% {
          transform: translateY(0);
          opacity: 0.4;
        }

        40% {
          transform: translateY(-7px);
          opacity: 1;
        }

      }


      @keyframes eaLoadingSpin {

        to {
          transform: rotate(360deg);
        }

      }


      /* =========================
         MOBILE
      ========================= */

      @media (max-width: 600px) {

        #splash-screen .ea-splash-logo {
          width: 150px !important;
          max-width: 150px !important;
        }

        #splash-screen .ea-splash-title {
          font-size: 20px !important;
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
    const skipSplash =
  sessionStorage.getItem("skipLoginSplash") === "1";

if (skipSplash) {
  sessionStorage.removeItem("skipLoginSplash");
}

if (
  !skipSplash &&
  !document.getElementById("splash-screen")
) {

      document.body.insertAdjacentHTML(
        "afterbegin",
        `
          <div id="splash-screen">

            <div class="ea-splash-card">

              <img
                src="/icons/LOGOWPA.png"
                class="ea-splash-logo"
                alt="EA Factory Logo"
              />

              <div class="ea-splash-title">
                PVT FACTORY
              </div>

              <div class="ea-splash-text">
                ศูนย์รวมข้อมูลและระบบงาน
              </div>

              <div class="ea-splash-dots">
                <span class="ea-splash-dot"></span>
                <span class="ea-splash-dot"></span>
                <span class="ea-splash-dot"></span>
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

              <div class="ea-loading-ring"></div>

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

      const overlay =
        document.getElementById(
          "ea-loading-overlay"
        );

      const titleEl =
        document.getElementById(
          "ea-loading-title"
        );

      const textEl =
        document.getElementById(
          "ea-loading-text"
        );


      if (titleEl) {
        titleEl.textContent = title;
      }

      if (textEl) {
        textEl.textContent = text;
      }

      overlay?.classList.remove(
        "ea-loading-hidden"
      );

    },


    hide() {

      document
        .getElementById("ea-loading-overlay")
        ?.classList.add(
          "ea-loading-hidden"
        );

    },


    hideSplash(delay = 800) {

      setTimeout(() => {

        const splash =
          document.getElementById(
            "splash-screen"
          );

        if (!splash) return;

        splash.classList.add(
          "ea-splash-hide"
        );


        setTimeout(() => {

          splash.remove();

        }, 400);

      }, delay);

    }

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