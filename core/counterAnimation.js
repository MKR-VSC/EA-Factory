/* ======================================================
   EA Factory - KPI Metric Card Counter Animation Engine
   ทำหน้าที่สร้าง Animation ตัวเลขค่อยๆ นับขึ้น (Count-Up Animation)
   เมื่อโหลดหน้าเว็บ หรือเมื่อได้รับข้อมูลใหม่
   ====================================================== */
(function () {
  // Inject CSS styles for counter update pop / glow effect
  function injectCounterStyles() {
    if (document.getElementById("counter-animation-styles")) return;
    const style = document.createElement("style");
    style.id = "counter-animation-styles";
    style.textContent = `
      .counter-animating {
        display: inline-block;
        transition: transform 0.15s ease, color 0.2s ease;
      }
      .counter-pop {
        animation: counterPop 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
      @keyframes counterPop {
        0% { transform: scale(1); }
        50% { transform: scale(1.08); }
        100% { transform: scale(1); }
      }
    `;
    document.head.appendChild(style);
  }

  // Active animation frame store
  const activeAnimations = new WeakMap();

  /**
   * Parse numeric string and return structural parts
   * Example: "1,234.50 kg" -> { val: 1234.5, decimals: 2, prefix: "", suffix: " kg", hasCommas: true }
   */
  function parseValueParts(str) {
    if (typeof str === "number") {
      return {
        val: str,
        decimals: Number.isInteger(str) ? 0 : (str.toString().split(".")[1] || "").length,
        prefix: "",
        suffix: "",
        hasCommas: true
      };
    }

    if (!str || typeof str !== "string") {
      return null;
    }

    const trimmed = str.trim();
    // Match first float or integer in string
    const match = trimmed.match(/(-?[\d,]+(?:\.\d+)?)/);
    if (!match) return null;

    const rawNumStr = match[0];
    const numStrNoCommas = rawNumStr.replace(/,/g, "");
    const val = parseFloat(numStrNoCommas);
    if (isNaN(val)) return null;

    const hasCommas = rawNumStr.includes(",");
    const decimalMatch = numStrNoCommas.match(/\.(\d+)/);
    const decimals = decimalMatch ? decimalMatch[1].length : 0;

    const matchIndex = trimmed.indexOf(rawNumStr);
    const prefix = trimmed.slice(0, matchIndex);
    const suffix = trimmed.slice(matchIndex + rawNumStr.length);

    return { val, decimals, prefix, suffix, hasCommas };
  }

  /**
   * Format number back into localized string
   */
  function formatNumberPart(num, decimals, hasCommas) {
    const fixedStr = num.toFixed(decimals);
    const parts = fixedStr.split(".");
    if (hasCommas) {
      parts[0] = parseInt(parts[0], 10).toLocaleString("th-TH");
    }
    return parts.join(".");
  }

  // Easing function: Cubic Out
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  /**
   * Main Animate Counter Function
   * @param {HTMLElement|string} target - Element or Element ID
   * @param {string|number} newValue - The target value to animate to
   * @param {object} options - Duration, callback, etc.
   */
  function animateCounter(target, newValue, options = {}) {
    injectCounterStyles();

    const elem = typeof target === "string" ? document.getElementById(target) : target;
    if (!elem) return;

    const duration = options.duration || 900; // ms
    const targetParts = parseValueParts(newValue);

    // If target is not numeric (e.g. "-" or "เป่าพลาสติก" or "..."), display directly
    if (!targetParts) {
      elem.textContent = newValue;
      return;
    }

    // Cancel existing animation on this element if any
    if (activeAnimations.has(elem)) {
      cancelAnimationFrame(activeAnimations.get(elem));
      activeAnimations.delete(elem);
    }

    // Determine starting numeric value
    const currentText = elem.textContent || "0";
    const currentParts = parseValueParts(currentText);
    const startVal = currentParts ? currentParts.val : 0;
    const endVal = targetParts.val;

    // If values are identical, set text directly
    if (Math.abs(startVal - endVal) < 0.0001) {
      elem.textContent = targetParts.prefix + formatNumberPart(endVal, targetParts.decimals, targetParts.hasCommas) + targetParts.suffix;
      return;
    }

    const startTime = performance.now();
    elem.classList.add("counter-animating");

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);

      const currentNum = startVal + (endVal - startVal) * easedProgress;
      const formattedNum = formatNumberPart(currentNum, targetParts.decimals, targetParts.hasCommas);

      elem.textContent = targetParts.prefix + formattedNum + targetParts.suffix;

      if (progress < 1) {
        const handle = requestAnimationFrame(step);
        activeAnimations.set(elem, handle);
      } else {
        // Animation completed
        elem.textContent = targetParts.prefix + formatNumberPart(endVal, targetParts.decimals, targetParts.hasCommas) + targetParts.suffix;
        elem.classList.remove("counter-animating");
        elem.classList.add("counter-pop");
        setTimeout(() => elem.classList.remove("counter-pop"), 350);
        activeAnimations.delete(elem);
        if (typeof options.onComplete === "function") options.onComplete();
      }
    }

    const handle = requestAnimationFrame(step);
    activeAnimations.set(elem, handle);
  }

  /**
   * Helper function to wrap setText for easy counter animation
   */
  function setTextAnimated(id, value, duration) {
    const el = document.getElementById(id);
    if (!el) return;

    // If element is inside a metric card / summary card or is a known counter element, animate it
    const isCounterTarget =
      el.closest(".metric-card") ||
      el.closest(".summary-card") ||
      el.closest(".user-stat-card") ||
      el.closest(".info-card") ||
      el.hasAttribute("data-counter") ||
      el.tagName === "STRONG" ||
      /^cnt-|^sum-|^dash-|^stat-|^total|^waste|^wastePercent|^topProblem|^topMachine/.test(id);

    if (isCounterTarget) {
      animateCounter(el, value, { duration: duration || 850 });
    } else {
      el.textContent = value;
    }
  }

  // Scan and trigger animation for static values on initial load
  function initCardCounters() {
    injectCounterStyles();
    const selectors = [
      ".metric-card strong",
      ".summary-card strong",
      ".user-stat-card strong",
      ".info-card strong",
      "[data-counter]"
    ];

    document.querySelectorAll(selectors.join(",")).forEach((elem) => {
      const val = elem.textContent;
      if (val && val !== "0" && val !== "..." && val !== "-") {
        animateCounter(elem, val, { duration: 1000 });
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCardCounters);
  } else {
    initCardCounters();
  }

  // Export to window
  window.animateCounter = animateCounter;
  window.setTextAnimated = setTextAnimated;
  window.initCardCounters = initCardCounters;
})();
