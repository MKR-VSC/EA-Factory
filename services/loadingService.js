// =========================================================
// LOADING SERVICE
// สร้าง Splash + Loading Overlay กลางระบบ
// =========================================================

(function () {
  document.addEventListener("DOMContentLoaded", () => {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `
      <div id="splash-screen">
        <div class="splash-card">
          <img src="/icons/logo_192.png" class="splash-logo" alt="EA Factory Logo" />
          <h2>EA Factory</h2>
          <p>ศูนย์รวมข้อมูลและระบบงาน</p>
          <div class="splash-dots">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>

      <div id="login-overlay" class="hidden">
        <div class="overlay-box">
          <div class="overlay-ring"></div>
          <h3 id="loading-title">กำลังโหลดข้อมูล</h3>
          <p id="loading-text">ระบบกำลังดึงข้อมูลล่าสุด</p>
        </div>
      </div>
      `
    );
  });

  window.LoadingService = {
    show(title = "กำลังโหลดข้อมูล", text = "ระบบกำลังดึงข้อมูลล่าสุด") {
      document.getElementById("loading-title").textContent = title;
      document.getElementById("loading-text").textContent = text;
      document.getElementById("login-overlay")?.classList.remove("hidden");
    },

    hide() {
      document.getElementById("login-overlay")?.classList.add("hidden");
    },

    hideSplash(delay = 1200) {
      setTimeout(() => {
        document.getElementById("splash-screen")?.classList.add("hide");
        document.querySelector(".app-shell")?.classList.add("app-ready");
      }, delay);
    },
  };

  window.addEventListener("load", () => {
    LoadingService.hideSplash();
  });
})();