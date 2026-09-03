/* ======================================================
   EA Factory - Header Auto-Refresh Widget Module
   ทำหน้าที่สร้างสวิตช์เปิด/ปิด Auto-Refresh ข้อมูลใน Header ทุก 5 นาที
   พร้อมระบบนับถอยหลัง (Countdown Timer) และจดจำสถานะใน LocalStorage
   ====================================================== */

(function () {
  const DEFAULT_INTERVAL_SECONDS = 300; // 5 นาที = 300 วินาที
  const STORAGE_KEY = "ea_auto_refresh_enabled";

  let countdownTimer = null;
  let remainingSeconds = DEFAULT_INTERVAL_SECONDS;
  let isEnabled = true;
  let currentRefreshFn = null;

  // Inject CSS Styles for Auto-Refresh Toggle Widget
  function injectStyles() {
    if (document.getElementById("auto-refresh-styles")) return;
    const style = document.createElement("style");
    style.id = "auto-refresh-styles";
    style.textContent = `
      .auto-refresh-widget {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        padding: 5px 12px;
        border-radius: 9999px;
        font-size: 0.8125rem;
        font-weight: 600;
        color: #334155;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        user-select: none;
        transition: all 0.2s ease;
        height: 38px;
        box-sizing: border-box;
      }
      .auto-refresh-widget:hover {
        border-color: #94a3b8;
        box-shadow: 0 2px 6px rgba(0,0,0,0.08);
      }
      .auto-refresh-label {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        white-space: nowrap;
        cursor: pointer;
        font-size: 12px;
        color: #475569;
        font-weight: 600;
        margin: 0;
      }
      .auto-refresh-icon {
        font-size: 16px !important;
        color: #64748b;
        transition: transform 0.3s ease, color 0.2s ease;
      }
      .auto-refresh-widget.active .auto-refresh-icon {
        color: #16a34a;
      }
      .auto-refresh-widget.refreshing .auto-refresh-icon {
        animation: spinRefresh 0.8s linear infinite;
        color: #2563eb;
      }
      @keyframes spinRefresh {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      /* Modern Toggle Switch */
      .auto-refresh-switch {
        position: relative;
        display: inline-block;
        width: 36px;
        height: 20px;
        flex-shrink: 0;
        margin: 0;
        margin-left: auto;
      }
      .auto-refresh-switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      .auto-refresh-slider {
        position: absolute;
        cursor: pointer;
        top: 0; left: 0; right: 0; bottom: 0;
        background-color: #cbd5e1;
        transition: .25s ease;
        border-radius: 20px;
      }
      .auto-refresh-slider:before {
        position: absolute;
        content: "";
        height: 14px;
        width: 14px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        transition: .25s ease;
        border-radius: 50%;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      }
      input:checked + .auto-refresh-slider {
        background-color: #16a34a;
      }
      input:focus + .auto-refresh-slider {
        box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.25);
      }
      input:checked + .auto-refresh-slider:before {
        transform: translateX(16px);
      }
      .auto-refresh-timer {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 44px;
        padding: 2px 6px;
        border-radius: 6px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 0.75rem;
        font-weight: 700;
        background: #f1f5f9;
        color: #64748b;
        transition: background 0.2s, color 0.2s;
      }
      .auto-refresh-widget.active .auto-refresh-timer {
        background: #dcfce7;
        color: #15803d;
      }
    `;
    document.head.appendChild(style);
  }

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  function detectRefreshFunction() {
    if (typeof window.loadAndProcessDashboardData === "function") return window.loadAndProcessDashboardData;
    if (typeof window.loadDashboard === "function") return window.loadDashboard;
    if (typeof window.loadRecords === "function") return window.loadRecords;
    if (typeof window.loadPageData === "function") return window.loadPageData;
    if (typeof window.loadAccountingData === "function") return window.loadAccountingData;
    if (typeof window.loadAdminPanel === "function") return window.loadAdminPanel;
    return null;
  }

  function triggerRefresh() {
    const fn = currentRefreshFn || detectRefreshFunction();
    if (!fn) return;

    const widget = document.getElementById("auto-refresh-widget-el");
    if (widget) widget.classList.add("refreshing");

    try {
      const res = fn();
      if (res && typeof res.then === "function") {
        res.finally(() => {
          setTimeout(() => {
            if (widget) widget.classList.remove("refreshing");
          }, 600);
        });
      } else {
        setTimeout(() => {
          if (widget) widget.classList.remove("refreshing");
        }, 600);
      }
    } catch (err) {
      console.error("Auto refresh error:", err);
      if (widget) widget.classList.remove("refreshing");
    }
  }

  function startCountdown() {
    stopCountdown();
    remainingSeconds = DEFAULT_INTERVAL_SECONDS;
    updateUI();

    countdownTimer = setInterval(() => {
      remainingSeconds--;
      if (remainingSeconds <= 0) {
        remainingSeconds = DEFAULT_INTERVAL_SECONDS;
        updateUI();
        triggerRefresh();
      } else {
        updateUI();
      }
    }, 1000);
  }

  function stopCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

  function resetTimer() {
    if (isEnabled) {
      remainingSeconds = DEFAULT_INTERVAL_SECONDS;
      updateUI();
    }
  }

  function updateUI() {
    const widget = document.getElementById("auto-refresh-widget-el");
    const checkbox = document.getElementById("auto-refresh-checkbox");
    const timerText = document.getElementById("auto-refresh-timer-text");

    if (!widget || !checkbox || !timerText) return;

    checkbox.checked = isEnabled;

    if (isEnabled) {
      widget.classList.add("active");
      timerText.textContent = formatTime(remainingSeconds);
    } else {
      widget.classList.remove("active");
      timerText.textContent = "ปิด";
    }
  }

  function toggleAutoRefresh(enabled) {
    isEnabled = enabled;
    localStorage.setItem(STORAGE_KEY, isEnabled ? "true" : "false");

    if (isEnabled) {
      startCountdown();
    } else {
      stopCountdown();
    }
    updateUI();
  }

  function createWidgetHTML() {
    return `
      <div id="auto-refresh-widget-el" class="auto-refresh-widget" title="เปิด/ปิดการรีเฟรชข้อมูลอัตโนมัติทุก 5 นาที">
        <label class="auto-refresh-label" for="auto-refresh-checkbox">
          <span class="material-symbols-outlined auto-refresh-icon">sync</span>
          <span>รีเฟรช 5 นาที</span>
        </label>
        <span id="auto-refresh-timer-text" class="auto-refresh-timer">05:00</span>
        <label class="auto-refresh-switch">
          <input type="checkbox" id="auto-refresh-checkbox">
          <span class="auto-refresh-slider"></span>
        </label>
      </div>
    `;
  }

  function mountWidget(customSelector, customFn) {
    injectStyles();

    if (customFn) currentRefreshFn = customFn;

    // Check saved state (Default: true / enabled if not explicitly turned off)
    const savedState = localStorage.getItem(STORAGE_KEY);
    isEnabled = savedState === "false" ? false : true;

    // Find mount point
    let container = customSelector ? document.querySelector(customSelector) : null;

    if (!container) {
      container =
        document.getElementById("auto-refresh-container") ||
        document.querySelector(".header-actions") ||
        document.querySelector(".workspace-actions") ||
        document.querySelector("header .actions") ||
        document.querySelector(".header-col-right .header-actions");
    }

    if (!container) return;

    // Check if already mounted
    if (document.getElementById("auto-refresh-widget-el")) return;

    // Insert widget into container
    const tempDiv = document.createElement("div");
    tempDiv.style.display = "inline-flex";
    tempDiv.innerHTML = createWidgetHTML();
    const widgetEl = tempDiv.firstElementChild;

    // Insert before first button or prepend
    const firstBtn = container.querySelector("button, a.btn");
    if (firstBtn) {
      container.insertBefore(widgetEl, firstBtn);
    } else {
      container.appendChild(widgetEl);
    }

    // Attach event listeners
    const checkbox = document.getElementById("auto-refresh-checkbox");
    if (checkbox) {
      checkbox.addEventListener("change", (e) => {
        toggleAutoRefresh(e.target.checked);
      });
    }

    // Hook manual refresh buttons to reset timer when manually clicked
    document.querySelectorAll("button, a").forEach((btn) => {
      const onclickAttr = btn.getAttribute("onclick") || "";
      const btnId = btn.id || "";
      if (
        onclickAttr.includes("load") ||
        onclickAttr.includes("refresh") ||
        btnId.includes("refresh")
      ) {
        btn.addEventListener("click", () => {
          resetTimer();
        });
      }
    });

    // Start timer if enabled
    if (isEnabled) {
      startCountdown();
    } else {
      updateUI();
    }
  }

  // Auto initialize when DOM is ready
  function autoInit() {
    setTimeout(() => {
      mountWidget();
    }, 300);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }

  // Export module API
  window.initAutoRefresh = mountWidget;
  window.toggleAutoRefresh = toggleAutoRefresh;
  window.resetAutoRefreshTimer = resetTimer;
})();
