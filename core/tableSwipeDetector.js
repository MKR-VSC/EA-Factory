/* ======================================================
   EA Factory - Table Horizontal Swipe & Drag Detector
   ช่วยให้การเลื่อนตารางข้อมูลบนมือถือและคอมพิวเตอร์ทำได้ง่าย ลื่นไหล
   โดยไม่ต้องเล็งแถบ Scrollbar
   ====================================================== */
(function () {
  function injectStyles() {
    if (document.getElementById("table-swipe-styles")) return;
    const style = document.createElement("style");
    style.id = "table-swipe-styles";
    style.textContent = `
      /* Table Scroll Container Enhancements */
      .table-scroll,
      .supervisor-table-scroll,
      .table-card,
      .table-responsive,
      .table-container,
      .settings-table-wrapper,
      [data-swipeable-table] {
        position: relative;
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-x pan-y;
        scrollbar-width: thin;
      }

      .table-scroll.is-draggable,
      .supervisor-table-scroll.is-draggable,
      .table-card.is-draggable,
      .table-container.is-draggable,
      .settings-table-wrapper.is-draggable {
        cursor: grab;
      }

      .table-scroll.is-dragging,
      .supervisor-table-scroll.is-dragging,
      .table-card.is-dragging,
      .table-container.is-dragging,
      .settings-table-wrapper.is-dragging {
        cursor: grabbing !important;
        user-select: none !important;
        -webkit-user-select: none !important;
      }

      /* Mobile Swipe Hint Badge */
      .table-swipe-hint {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        margin-bottom: 8px;
        background: rgba(30, 58, 138, 0.08);
        border: 1px solid rgba(30, 58, 138, 0.18);
        border-radius: 20px;
        color: #1e3a8a;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.2px;
        pointer-events: none;
        transition: opacity 0.3s ease, transform 0.3s ease;
        animation: pulseSwipeHint 2s infinite ease-in-out;
      }

      .table-swipe-hint.fade-out {
        opacity: 0;
        transform: translateY(-4px);
      }

      @keyframes pulseSwipeHint {
        0%, 100% { transform: translateX(0); }
        50% { transform: translateX(4px); }
      }
    `;
    document.head.appendChild(style);
  }

  const processedContainers = new WeakSet();

  function makeContainerSwipeable(container) {
    if (!container || processedContainers.has(container)) return;

    // Verify if container holds a table or has scroll classes
    const isTableWrapper =
      container.classList.contains("table-scroll") ||
      container.classList.contains("supervisor-table-scroll") ||
      container.classList.contains("table-card") ||
      container.classList.contains("table-responsive") ||
      container.classList.contains("table-container") ||
      container.classList.contains("settings-table-wrapper") ||
      container.hasAttribute("data-swipeable-table") ||
      (container.tagName === "DIV" && container.querySelector("table"));

    if (!isTableWrapper) return;

    processedContainers.add(container);

    let isDown = false;
    let startX = 0;
    let startY = 0;
    let initialScrollLeft = 0;
    let isSwipingHorizontal = false;
    let isMoving = false;
    let velocity = 0;
    let lastX = 0;
    let lastTime = 0;
    let animFrame = null;

    function updateState() {
      const maxScroll = container.scrollWidth - container.clientWidth;
      if (maxScroll > 5) {
        container.classList.add("is-draggable");

        // Show swipe hint badge on mobile screens if not shown yet
        if (window.innerWidth <= 900 && !container.hasAttribute("data-hint-shown")) {
          showSwipeHint(container);
        }
      } else {
        container.classList.remove("is-draggable");
      }
    }

    function showSwipeHint(elem) {
      if (elem.querySelector(".table-swipe-hint") || elem.previousElementSibling?.classList.contains("table-swipe-hint")) return;
      elem.setAttribute("data-hint-shown", "true");
      const hint = document.createElement("div");
      hint.className = "table-swipe-hint";
      hint.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;">swipe</span> <span>ปัดซ้าย-ขวาเพื่อดูข้อมูลเพิ่มเติม</span>`;

      if (elem.parentNode) {
        elem.parentNode.insertBefore(hint, elem);
      }

      const autoHide = setTimeout(() => {
        hint.classList.add("fade-out");
        setTimeout(() => hint.remove(), 300);
      }, 4000);

      const onScrollOnce = () => {
        clearTimeout(autoHide);
        hint.classList.add("fade-out");
        setTimeout(() => hint.remove(), 300);
        elem.removeEventListener("scroll", onScrollOnce);
      };
      elem.addEventListener("scroll", onScrollOnce, { passive: true });
    }

    // Touch Event Handlers for Mobile Swipe
    container.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 1) return;
        isDown = true;
        isSwipingHorizontal = false;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        lastX = startX;
        lastTime = Date.now();
        initialScrollLeft = container.scrollLeft;
        velocity = 0;
        if (animFrame) cancelAnimationFrame(animFrame);
      },
      { passive: true }
    );

    container.addEventListener(
      "touchmove",
      (e) => {
        if (!isDown || e.touches.length !== 1) return;
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const deltaX = startX - currentX;
        const deltaY = startY - currentY;

        // Detect direction on initial movement threshold
        if (!isSwipingHorizontal && (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6)) {
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            isSwipingHorizontal = true;
          } else {
            isDown = false; // Allow native vertical scroll
            return;
          }
        }

        if (isSwipingHorizontal) {
          const now = Date.now();
          const dt = now - lastTime;
          if (dt > 0) {
            velocity = (lastX - currentX) / dt;
          }
          lastX = currentX;
          lastTime = now;

          container.scrollLeft = initialScrollLeft + deltaX;
          updateState();
        }
      },
      { passive: true }
    );

    const endTouch = () => {
      if (!isDown) return;
      isDown = false;
      if (isSwipingHorizontal && Math.abs(velocity) > 0.15) {
        let currentVelocity = velocity * 12;
        function momentumStep() {
          if (Math.abs(currentVelocity) < 0.5) return;
          container.scrollLeft += currentVelocity;
          currentVelocity *= 0.90;
          updateState();
          animFrame = requestAnimationFrame(momentumStep);
        }
        momentumStep();
      }
      isSwipingHorizontal = false;
    };

    container.addEventListener("touchend", endTouch, { passive: true });
    container.addEventListener("touchcancel", endTouch, { passive: true });

    // Mouse Drag Handlers for Desktop / Touch Laptop
    container.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const target = e.target;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "BUTTON" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "A" ||
        target.closest("button") ||
        target.closest("a")
      ) {
        return;
      }

      isDown = true;
      isMoving = false;
      container.classList.add("is-dragging");
      startX = e.pageX - container.offsetLeft;
      initialScrollLeft = container.scrollLeft;
    });

    container.addEventListener("mouseleave", () => {
      if (!isDown) return;
      isDown = false;
      container.classList.remove("is-dragging");
    });

    container.addEventListener("mouseup", () => {
      if (!isDown) return;
      isDown = false;
      container.classList.remove("is-dragging");
    });

    container.addEventListener("mousemove", (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - container.offsetLeft;
      const walk = (x - startX) * 1.5;
      if (Math.abs(walk) > 4) {
        isMoving = true;
      }
      container.scrollLeft = initialScrollLeft - walk;
      updateState();
    });

    container.addEventListener(
      "click",
      (e) => {
        if (isMoving) {
          e.preventDefault();
          e.stopPropagation();
          isMoving = false;
        }
      },
      true
    );

    container.addEventListener("scroll", updateState, { passive: true });
    setTimeout(updateState, 150);
  }

  function scanAndInitTables() {
    injectStyles();
    const selectors = [
      ".table-scroll",
      ".supervisor-table-scroll",
      ".table-card",
      ".table-responsive",
      ".table-container",
      ".settings-table-wrapper",
      "[data-swipeable-table]"
    ];

    document.querySelectorAll(selectors.join(",")).forEach((elem) => {
      makeContainerSwipeable(elem);
    });

    document.querySelectorAll("table").forEach((table) => {
      const parent = table.parentElement;
      if (parent && parent !== document.body) {
        makeContainerSwipeable(parent);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scanAndInitTables);
  } else {
    scanAndInitTables();
  }

  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const m of mutations) {
      if (m.addedNodes.length > 0) {
        shouldScan = true;
        break;
      }
    }
    if (shouldScan) {
      scanAndInitTables();
    }
  });

  window.addEventListener("load", () => {
    scanAndInitTables();
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  });

  window.addEventListener("resize", scanAndInitTables);

  window.TableSwipeDetector = {
    init: scanAndInitTables,
    makeSwipeable: makeContainerSwipeable
  };
})();
