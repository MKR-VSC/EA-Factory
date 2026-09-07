/* ======================================================
   PVT&T FACTORY - Drag & Drop Widget State Manager
   ระบบจัดการจัดเรียงการ์ด KPI / Widget แบบลากและวาง (Drag & Drop)
   พร้อมบันทึกตำแหน่งลง LocalStorage แยกตาม Dashboard
   ====================================================== */
(function () {
  const STORAGE_PREFIX = "pvtt_widget_order_v1_";

  // Simple State Store for Drag and Drop
  const DragDropStateManager = {
    draggedElement: null,
    draggedContainer: null,
    touchDragClone: null,
    touchCurrentTarget: null,
    touchItem: null,
    touchStartY: 0,
    touchStartX: 0,
    isTouchDragging: false,

    // Get order from LocalStorage
    getOrder(dashboardKey) {
      try {
        const data = localStorage.getItem(STORAGE_PREFIX + dashboardKey);
        return data ? JSON.parse(data) : null;
      } catch (e) {
        console.warn("[DragDropStateManager] Failed to parse order:", e);
        return null;
      }
    },

    // Save order to LocalStorage
    saveOrder(dashboardKey, orderArray) {
      try {
        localStorage.setItem(STORAGE_PREFIX + dashboardKey, JSON.stringify(orderArray));
      } catch (e) {
        console.warn("[DragDropStateManager] Failed to save order:", e);
      }
    },

    // Reset order
    resetOrder(dashboardKey) {
      try {
        localStorage.removeItem(STORAGE_PREFIX + dashboardKey);
      } catch (e) {
        console.warn("[DragDropStateManager] Failed to reset order:", e);
      }
    }
  };

  function injectStyles() {
    if (document.getElementById("widget-drag-drop-styles")) return;
    const style = document.createElement("style");
    style.id = "widget-drag-drop-styles";
    style.textContent = `
      /* Drag & Drop Controls & Handles */
      .widget-grid-header-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
        gap: 12px;
        flex-wrap: wrap;
      }

      .widget-grid-title {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 15px;
        font-weight: 800;
        color: #1e293b;
        letter-spacing: -0.01em;
      }

      .widget-grid-actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .widget-reorder-hint {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 12px;
        font-weight: 600;
        color: #64748b;
        background: rgba(241, 245, 249, 0.9);
        border: 1px solid rgba(203, 213, 225, 0.7);
        padding: 4px 10px;
        border-radius: 999px;
        user-select: none;
      }

      .widget-reset-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        font-weight: 700;
        color: #0284c7;
        background: rgba(2, 132, 199, 0.08);
        border: 1px solid rgba(2, 132, 199, 0.22);
        padding: 5px 11px;
        border-radius: 999px;
        cursor: pointer;
        transition: all 0.18s ease;
      }

      .widget-reset-btn:hover {
        background: rgba(2, 132, 199, 0.16);
        color: #0369a1;
      }

      /* Draggable Widget Items */
      [data-draggable-widget="true"] {
        cursor: grab;
        position: relative;
        transition: transform 0.2s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s ease, opacity 0.2s ease;
        touch-action: pan-y;
      }

      [data-draggable-widget="true"]:hover {
        box-shadow: 0 10px 24px -6px rgba(0, 0, 0, 0.08), 0 4px 10px -2px rgba(0, 0, 0, 0.04);
      }

      /* Drag handle icon */
      .widget-drag-handle {
        position: absolute;
        top: 10px;
        right: 12px;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #94a3b8;
        border-radius: 6px;
        cursor: grab;
        opacity: 0.6;
        transition: all 0.15s ease;
        z-index: 5;
      }

      [data-draggable-widget="true"]:hover .widget-drag-handle {
        opacity: 1;
        color: #0284c7;
        background: rgba(2, 132, 199, 0.08);
      }

      /* Dragging state */
      [data-draggable-widget="true"].is-dragging {
        opacity: 0.45;
        cursor: grabbing !important;
        transform: scale(0.97);
        border: 2px dashed #0284c7 !important;
        box-shadow: none !important;
      }

      /* Drop indicator / Target hover */
      [data-draggable-widget="true"].drag-over {
        transform: translateY(-4px);
        box-shadow: 0 14px 28px -4px rgba(2, 132, 199, 0.25) !important;
        outline: 2px solid #0284c7 !important;
        outline-offset: 2px;
      }

      /* Drop target placeholder */
      .widget-drop-indicator {
        border: 2px dashed #38bdf8;
        border-radius: 18px;
        background: rgba(56, 189, 248, 0.06);
        min-height: 140px;
        transition: all 0.15s ease;
      }

      /* Touch dragging avatar */
      .touch-drag-avatar {
        position: fixed;
        pointer-events: none;
        z-index: 999999;
        opacity: 0.9;
        box-shadow: 0 20px 35px -5px rgba(0, 0, 0, 0.3), 0 0 0 2px #0284c7;
        border-radius: 18px;
        transform: scale(1.03);
        transition: transform 0.05s linear;
      }
    `;
    document.head.appendChild(style);
  }

  // Setup Drag & Drop for a given container (e.g. .metric-grid or .summary-grid)
  function setupDraggableGrid(container, dashboardKey) {
    if (!container || container.getAttribute("data-dnd-initialized") === "true") return;
    container.setAttribute("data-dnd-initialized", "true");
    container.setAttribute("data-dashboard-key", dashboardKey);

    const items = Array.from(container.children);
    if (!items.length) return;

    // Assign unique widget IDs if missing
    items.forEach((item, index) => {
      if (!item.getAttribute("data-widget-id")) {
        const id = item.id || `widget_${dashboardKey}_${index}`;
        item.setAttribute("data-widget-id", id);
      }
      item.setAttribute("data-draggable-widget", "true");
      item.setAttribute("draggable", "true");

      // Add drag handle icon if not present
      if (!item.querySelector(".widget-drag-handle")) {
        const handle = document.createElement("div");
        handle.className = "widget-drag-handle";
        handle.title = "คลิกลากเพื่อจัดเรียงตำแหน่ง";
        handle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 3H11V5H9V3ZM13 3H15V5H13V3ZM9 7H11V9H9V7ZM13 7H15V9H13V7ZM9 11H11V13H9V11ZM13 11H15V13H13V11ZM9 15H11V17H9V15ZM13 15H15V17H13V15ZM9 19H11V21H9V19ZM13 19H15V21H13V19Z"/></svg>`;
        item.appendChild(handle);
      }
    });

    // Reorder according to saved order in StateManager
    applySavedOrder(container, dashboardKey);

    // Add Desktop HTML5 Drag & Drop listeners
    items.forEach((item) => {
      item.addEventListener("dragstart", handleDragStart);
      item.addEventListener("dragover", handleDragOver);
      item.addEventListener("dragenter", handleDragEnter);
      item.addEventListener("dragleave", handleDragLeave);
      item.addEventListener("drop", handleDrop);
      item.addEventListener("dragend", handleDragEnd);

      // Mobile Touch Drag Support
      setupTouchDrag(item, container, dashboardKey);
    });
  }

  function applySavedOrder(container, dashboardKey) {
    const savedOrder = DragDropStateManager.getOrder(dashboardKey);
    if (!savedOrder || !Array.isArray(savedOrder)) return;

    const currentItemsMap = new Map();
    Array.from(container.children).forEach((child) => {
      const widgetId = child.getAttribute("data-widget-id");
      if (widgetId) {
        currentItemsMap.set(widgetId, child);
      }
    });

    savedOrder.forEach((widgetId) => {
      const el = currentItemsMap.get(widgetId);
      if (el) {
        container.appendChild(el);
      }
    });
  }

  function saveCurrentOrder(container) {
    const dashboardKey = container.getAttribute("data-dashboard-key");
    if (!dashboardKey) return;

    const currentOrder = Array.from(container.children)
      .map((child) => child.getAttribute("data-widget-id"))
      .filter(Boolean);

    DragDropStateManager.saveOrder(dashboardKey, currentOrder);
  }

  /* HTML5 Drag Event Handlers */
  function handleDragStart(e) {
    DragDropStateManager.draggedElement = this;
    DragDropStateManager.draggedContainer = this.parentElement;
    this.classList.add("is-dragging");

    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", this.getAttribute("data-widget-id") || "");
    }
  }

  function handleDragOver(e) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    return false;
  }

  function handleDragEnter(e) {
    e.preventDefault();
    if (this !== DragDropStateManager.draggedElement) {
      this.classList.add("drag-over");
    }
  }

  function handleDragLeave() {
    this.classList.remove("drag-over");
  }

  function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();
    this.classList.remove("drag-over");

    const dragged = DragDropStateManager.draggedElement;
    if (dragged && dragged !== this && this.parentElement === dragged.parentElement) {
      const container = this.parentElement;
      const allChildren = Array.from(container.children);
      const draggedIndex = allChildren.indexOf(dragged);
      const targetIndex = allChildren.indexOf(this);

      if (draggedIndex < targetIndex) {
        container.insertBefore(dragged, this.nextSibling);
      } else {
        container.insertBefore(dragged, this);
      }

      saveCurrentOrder(container);
    }
    return false;
  }

  function handleDragEnd() {
    this.classList.remove("is-dragging");
    document.querySelectorAll("[data-draggable-widget]").forEach((el) => {
      el.classList.remove("drag-over");
      el.classList.remove("is-dragging");
    });
    DragDropStateManager.draggedElement = null;
    DragDropStateManager.draggedContainer = null;
  }

  /* Touch Drag and Drop for Tablets & Phones */
  function setupTouchDrag(item, container, dashboardKey) {
    let longPressTimer = null;

    item.addEventListener("touchstart", (e) => {
      const touch = e.touches[0];
      DragDropStateManager.touchStartX = touch.clientX;
      DragDropStateManager.touchStartY = touch.clientY;
      DragDropStateManager.touchItem = item;

      // Handle long press or grab handle
      const isHandle = e.target.closest(".widget-drag-handle");
      if (isHandle) {
        startTouchDrag(item, touch);
        e.preventDefault();
      } else {
        longPressTimer = setTimeout(() => {
          startTouchDrag(item, touch);
        }, 320);
      }
    }, { passive: false });

    item.addEventListener("touchmove", (e) => {
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - DragDropStateManager.touchStartX);
      const deltaY = Math.abs(touch.clientY - DragDropStateManager.touchStartY);

      if (!DragDropStateManager.isTouchDragging) {
        if (deltaX > 10 || deltaY > 10) {
          clearTimeout(longPressTimer);
        }
        return;
      }

      e.preventDefault();
      updateTouchAvatarPosition(touch.clientX, touch.clientY);

      // Find drop target under touch
      const elemBelow = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!elemBelow) return;

      const targetCard = elemBelow.closest("[data-draggable-widget='true']");
      if (targetCard && targetCard !== item && targetCard.parentElement === container) {
        document.querySelectorAll("[data-draggable-widget]").forEach((c) => c.classList.remove("drag-over"));
        targetCard.classList.add("drag-over");
        DragDropStateManager.touchCurrentTarget = targetCard;
      }
    }, { passive: false });

    item.addEventListener("touchend", () => {
      clearTimeout(longPressTimer);
      if (DragDropStateManager.isTouchDragging) {
        endTouchDrag(container);
      }
    });

    item.addEventListener("touchcancel", () => {
      clearTimeout(longPressTimer);
      if (DragDropStateManager.isTouchDragging) {
        endTouchDrag(container);
      }
    });
  }

  function startTouchDrag(item, touch) {
    DragDropStateManager.isTouchDragging = true;
    item.classList.add("is-dragging");

    // Create avatar clone
    const rect = item.getBoundingClientRect();
    const clone = item.cloneNode(true);
    clone.classList.add("touch-drag-avatar");
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.left = `${touch.clientX - rect.width / 2}px`;
    clone.style.top = `${touch.clientY - rect.height / 2}px`;
    document.body.appendChild(clone);
    DragDropStateManager.touchDragClone = clone;

    if (navigator.vibrate) {
      navigator.vibrate(30);
    }
  }

  function updateTouchAvatarPosition(x, y) {
    const clone = DragDropStateManager.touchDragClone;
    if (clone) {
      const width = parseFloat(clone.style.width);
      const height = parseFloat(clone.style.height);
      clone.style.left = `${x - width / 2}px`;
      clone.style.top = `${y - height / 2}px`;
    }
  }

  function endTouchDrag(container) {
    DragDropStateManager.isTouchDragging = false;
    const item = DragDropStateManager.touchItem;
    const target = DragDropStateManager.touchCurrentTarget;

    if (DragDropStateManager.touchDragClone) {
      DragDropStateManager.touchDragClone.remove();
      DragDropStateManager.touchDragClone = null;
    }

    if (item) {
      item.classList.remove("is-dragging");
    }

    document.querySelectorAll("[data-draggable-widget]").forEach((c) => c.classList.remove("drag-over"));

    if (item && target && item !== target && item.parentElement === container) {
      const allChildren = Array.from(container.children);
      const itemIndex = allChildren.indexOf(item);
      const targetIndex = allChildren.indexOf(target);

      if (itemIndex < targetIndex) {
        container.insertBefore(item, target.nextSibling);
      } else {
        container.insertBefore(item, target);
      }

      saveCurrentOrder(container);
    }

    DragDropStateManager.touchCurrentTarget = null;
    DragDropStateManager.touchItem = null;
  }

  // Header controls injector (Hint + Reset button)
  function insertWidgetGridHeader(container, titleText, dashboardKey) {
    if (!container || container.previousElementSibling?.classList?.contains("widget-grid-header-row")) return;

    const header = document.createElement("div");
    header.className = "widget-grid-header-row";
    header.innerHTML = `
      <div class="widget-grid-title">
        <span class="material-symbols-outlined" style="color: #0284c7; font-size: 20px;">drag_indicator</span>
        <span>${titleText}</span>
      </div>
      <div class="widget-grid-actions">
        <span class="widget-reorder-hint">
          <span class="material-symbols-outlined" style="font-size: 14px;">touch_app</span>
          ลากเพื่อสลับตำแหน่ง
        </span>
        <button type="button" class="widget-reset-btn" title="คืนค่าลำดับเริ่มต้น">
          <span class="material-symbols-outlined" style="font-size: 15px;">restart_alt</span>
          รีเซ็ตตำแหน่ง
        </button>
      </div>
    `;

    header.querySelector(".widget-reset-btn").addEventListener("click", () => {
      DragDropStateManager.resetOrder(dashboardKey);
      window.location.reload();
    });

    container.parentNode.insertBefore(header, container);
  }

  // Auto initialize on DOM ready
  function init() {
    injectStyles();

    // 1. Executive Dashboard metric grid
    const execMetricGrid = document.querySelector(".metric-grid");
    if (execMetricGrid) {
      insertWidgetGridHeader(execMetricGrid, "KPI Dashboard Cards", "exec_kpi_cards");
      setupDraggableGrid(execMetricGrid, "exec_kpi_cards");
    }

    // 2. Supervisor Dashboard summary grid
    const supervisorSummaryGrid = document.querySelector(".summary-grid");
    if (supervisorSummaryGrid) {
      insertWidgetGridHeader(supervisorSummaryGrid, "สรุปภาพรวม KPI ประจำแผนก", "supervisor_kpi_cards");
      setupDraggableGrid(supervisorSummaryGrid, "supervisor_kpi_cards");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Expose globally
  window.DragDropStateManager = DragDropStateManager;
  window.setupDraggableGrid = setupDraggableGrid;
})();
