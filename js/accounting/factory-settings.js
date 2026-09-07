/* ======================================================
   FACTORY SETTINGS - GO LIVE UI v2.0
   แผงควบคุมการตั้งค่าเกณฑ์ % Waste รายแผนก
   รองรับ Real-time Validation, Search Filter, Preset Template
   ====================================================== */

const DEPARTMENT_TABLE = "master_departments";
const ALLOW_ROLES = ["admin", "accounting"];

/* แผนกที่ไม่เกี่ยวกับการผลิต ไม่ต้องแสดงในหน้านี้ */
const EXCLUDE_DEPARTMENT_CODES = [
  "IT_SUPPORT",
  "IT_SUPORT",
  "ACCOUNTING",
  "MANAGEMENT",
  "ADMIN",
  "PRINT",
];

const DEPT_COLORS = {
  BLOW: "#0284c7",   // Sky Blue
  PIPE: "#10b981",   // Emerald
  SHEET: "#f59e0b",  // Amber
  MONO: "#8b5cf6",   // Purple
  TAPE: "#ec4899",   // Pink
  PRINT: "#3b82f6",  // Blue
  DRILL: "#6366f1",  // Indigo
  GARBAGE: "#64748b",// Slate
  SLAN: "#14b8a6",   // Teal
};

const state = {
  supabase: null,
  departments: [],
  originalData: {}, // Map code -> { max, warning } for dirty check
  searchQuery: "",
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!protectSettingsPage()) return;

  state.supabase = window.supabaseClient || window.supabase || null;

  if (!state.supabase) {
    showAlert("ไม่พบ Supabase Client กรุณาตรวจสอบการเชื่อมต่อ");
    renderEmpty("ไม่พบ Supabase Client");
    return;
  }

  initUserInfo();
  bindEvents();
  await loadDepartments();
});

function protectSettingsPage() {
  const activeUser = localStorage.getItem("activeUser");
  const activeRole = String(localStorage.getItem("activeRole") || "").toLowerCase();

  if (!activeUser || !ALLOW_ROLES.includes(activeRole)) {
    alert("คุณไม่มีสิทธิ์เข้าใช้งานหน้านี้ (เฉพาะ Admin / Accounting)");
    window.location.replace("/login.html");
    return false;
  }

  return true;
}

function initUserInfo() {
  const userName = localStorage.getItem("activeName") || localStorage.getItem("activeUser") || "ผู้ใช้งาน";
  const role = String(localStorage.getItem("activeRole") || "").toLowerCase();
  
  const roleLabels = {
    admin: "ผู้ดูแลระบบ (Admin)",
    accounting: "ฝ่ายบัญชี (Accounting)",
    management: "ผู้บริหาร",
  };

  const nameEl = document.getElementById("lbl-active-user");
  const roleEl = document.getElementById("lbl-active-role");

  if (nameEl) nameEl.textContent = userName;
  if (roleEl) roleEl.textContent = roleLabels[role] || role || "เจ้าหน้าที่";
}

function bindEvents() {
  // Action buttons
  document.getElementById("btn-refresh")?.addEventListener("click", () => loadDepartments(true));
  document.getElementById("btn-save")?.addEventListener("click", saveSettings);
  document.getElementById("btn-save-inline")?.addEventListener("click", saveSettings);
  document.getElementById("btn-reset")?.addEventListener("click", resetToLoadedBaseline);
  document.getElementById("btn-discard-changes")?.addEventListener("click", resetToLoadedBaseline);
  document.getElementById("btn-logout")?.addEventListener("click", logoutSettings);

  // Search filter
  const searchInput = document.getElementById("input-search-dept");
  const clearBtn = document.getElementById("btn-clear-search");

  searchInput?.addEventListener("input", (e) => {
    state.searchQuery = e.target.value.trim().toLowerCase();
    if (clearBtn) clearBtn.hidden = !state.searchQuery;
    filterAndRenderTable();
  });

  clearBtn?.addEventListener("click", () => {
    if (searchInput) {
      searchInput.value = "";
      state.searchQuery = "";
      clearBtn.hidden = true;
      searchInput.focus();
      filterAndRenderTable();
    }
  });

  // Preset template button
  document.getElementById("btn-apply-standard")?.addEventListener("click", applyStandardPreset);
}

async function loadDepartments(isManualRefresh = false) {
  hideAlert();

  const btn = document.getElementById("btn-refresh");
  if (btn) {
    btn.disabled = true;
    btn.classList.add("loading");
  }

  if (isManualRefresh) {
    showToast("กำลังดึงข้อมูลเกณฑ์ล่าสุด...", "info");
  }

  try {
    const { data, error } = await state.supabase
      .from(DEPARTMENT_TABLE)
      .select(`
        department_code,
        department_name,
        sort_order,
        is_active,
        max_waste_percent,
        warning_percent
      `)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) throw error;

    state.departments = (Array.isArray(data) ? data : []).filter((dept) => {
      const code = normalizeCode(dept.department_code);
      return !EXCLUDE_DEPARTMENT_CODES.includes(code);
    });

    // Save baseline for dirty check
    state.originalData = {};
    state.departments.forEach((dept) => {
      const code = normalizeCode(dept.department_code);
      state.originalData[code] = {
        max: toNumber(dept.max_waste_percent || 1),
        warning: toNumber(dept.warning_percent || 0.7),
      };
    });

    // Update active depts counter
    const countEl = document.getElementById("active-depts-count");
    if (countEl) countEl.textContent = `${state.departments.length} แผนกการผลิต`;

    // Update sync time
    const syncEl = document.getElementById("lbl-last-sync");
    if (syncEl) {
      syncEl.textContent = `อัปเดตล่าสุด: ${new Date().toLocaleTimeString("th-TH")}`;
    }

    setDirtyState(false);
    filterAndRenderTable();

    if (isManualRefresh) {
      showToast("โหลดข้อมูลสำเร็จ", "success");
    }
  } catch (err) {
    console.error(err);
    showAlert(`โหลดข้อมูลไม่สำเร็จ: ${err.message || err}`);
    showToast(`เกิดข้อผิดพลาด: ${err.message || err}`, "error");
    renderEmpty("โหลดข้อมูลไม่สำเร็จ");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove("loading");
    }
  }
}

function filterAndRenderTable() {
  let list = state.departments;

  if (state.searchQuery) {
    list = list.filter((dept) => {
      const code = (dept.department_code || "").toLowerCase();
      const name = (dept.department_name || "").toLowerCase();
      return code.includes(state.searchQuery) || name.includes(state.searchQuery);
    });
  }

  renderTable(list);
}

function renderTable(rows) {
  const tbody = document.getElementById("settings-table-body");
  if (!tbody) return;

  if (!rows.length) {
    renderEmpty(state.searchQuery ? "ไม่พบแผนกที่ตรงกับคำค้นหา" : "ยังไม่มีข้อมูลแผนกผลิต");
    return;
  }

  tbody.innerHTML = rows
    .map((dept, index) => {
      const code = normalizeCode(dept.department_code || "");
      const name = dept.department_name || code || "-";
      const max = toNumber(dept.max_waste_percent ?? 1);
      const warning = toNumber(dept.warning_percent ?? 0.7);
      const active = dept.is_active !== false;
      const deptColor = DEPT_COLORS[code] || "#0284c7";

      const isInvalid = warning > max;

      return `
        <tr data-code="${escapeAttr(code)}" class="${isInvalid ? "row-invalid" : ""}">
          <td class="order-cell">${index + 1}</td>
          <td>
            <div class="dept-cell-modern">
              <span class="dept-color-tag" style="background-color: ${deptColor};"></span>
              <div class="dept-name-block">
                <span class="dept-name-text">${escapeHtml(name)}</span>
                <span class="dept-code-tag">${escapeHtml(code)}</span>
              </div>
            </div>
          </td>
          <td class="text-right">
            <div class="percent-input-group">
              <input
                class="input-percent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value="${escapeAttr(max)}"
                data-field="max_waste_percent"
                aria-label="เกณฑ์ไม่เกินของ ${escapeAttr(name)}"
              />
              <span class="input-unit">%</span>
            </div>
          </td>
          <td class="text-right">
            <div class="percent-input-group input-warning">
              <input
                class="input-percent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                value="${escapeAttr(warning)}"
                data-field="warning_percent"
                aria-label="ค่าเตือนของ ${escapeAttr(name)}"
              />
              <span class="input-unit">%</span>
            </div>
          </td>
          <td>
            <div class="threshold-preview" id="gauge-${escapeAttr(code)}">
              ${renderGaugeHTML(warning, max)}
            </div>
          </td>
          <td class="text-center">
            <span class="status-pill ${active ? "status-active" : "status-inactive"}">
              <span class="status-dot"></span>
              ${active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
            </span>
          </td>
        </tr>
      `;
    })
    .join("");

  bindRowInputListeners();
}

function renderGaugeHTML(warning, max) {
  const isInvalid = warning > max;
  if (isInvalid) {
    return `<span style="font-size: 11px; font-weight: 700; color: #ef4444; display: flex; align-items: center; gap: 4px;">
      <span class="material-symbols-outlined" style="font-size: 14px;">error</span>
      ค่าเตือนเกินเกณฑ์สูงสุด
    </span>`;
  }

  // Calculate proportional widths (capped visually)
  const maxRef = Math.max(max * 1.3, 1.5);
  const safePct = Math.min(100, Math.max(5, (warning / maxRef) * 100));
  const warnPct = Math.min(100 - safePct, Math.max(5, ((max - warning) / maxRef) * 100));

  return `
    <div class="threshold-gauge-bar" title="ปกติ: 0% - ${warning}%, เตือน: ${warning}% - ${max}%, เกินเกณฑ์: > ${max}%">
      <div class="gauge-safe" style="width: ${safePct.toFixed(1)}%;"></div>
      <div class="gauge-warn" style="width: ${warnPct.toFixed(1)}%;"></div>
      <div class="gauge-danger"></div>
    </div>
    <div class="threshold-labels">
      <span>เตือน: ${warning.toFixed(2)}%</span>
      <span>เกณฑ์: ${max.toFixed(2)}%</span>
    </div>
  `;
}

function bindRowInputListeners() {
  const rows = document.querySelectorAll("#settings-table-body tr[data-code]");

  rows.forEach((row) => {
    const inputs = row.querySelectorAll(".input-percent");
    inputs.forEach((input) => {
      input.addEventListener("input", () => {
        validateRow(row);
        checkGlobalDirtyState();
      });
    });
  });
}

function validateRow(row) {
  const code = row.dataset.code;
  const max = getInputNumber(row, "max_waste_percent");
  const warning = getInputNumber(row, "warning_percent");

  const gaugeEl = document.getElementById(`gauge-${code}`);
  const isInvalid = warning > max;

  if (isInvalid) {
    row.classList.add("row-invalid");
  } else {
    row.classList.remove("row-invalid");
  }

  if (gaugeEl) {
    gaugeEl.innerHTML = renderGaugeHTML(warning, max);
  }

  validateAllRows();
}

function validateAllRows() {
  const rows = Array.from(document.querySelectorAll("#settings-table-body tr[data-code]"));
  let hasError = false;

  for (const row of rows) {
    const max = getInputNumber(row, "max_waste_percent");
    const warning = getInputNumber(row, "warning_percent");
    if (warning > max) {
      hasError = true;
      break;
    }
  }

  const saveBtn = document.getElementById("btn-save");
  const saveInlineBtn = document.getElementById("btn-save-inline");

  if (saveBtn) saveBtn.disabled = hasError;
  if (saveInlineBtn) saveInlineBtn.disabled = hasError;

  return !hasError;
}

function checkGlobalDirtyState() {
  const rows = Array.from(document.querySelectorAll("#settings-table-body tr[data-code]"));
  let isDirty = false;

  for (const row of rows) {
    const code = normalizeCode(row.dataset.code);
    const max = getInputNumber(row, "max_waste_percent");
    const warning = getInputNumber(row, "warning_percent");

    const baseline = state.originalData[code];
    if (baseline) {
      if (baseline.max !== max || baseline.warning !== warning) {
        isDirty = true;
        break;
      }
    }
  }

  setDirtyState(isDirty);
}

function setDirtyState(isDirty) {
  const banner = document.getElementById("unsaved-banner");
  if (banner) banner.hidden = !isDirty;

  const saveBtn = document.getElementById("btn-save");
  if (saveBtn) {
    if (isDirty) {
      saveBtn.classList.add("pulse");
    } else {
      saveBtn.classList.remove("pulse");
    }
  }
}

function resetToLoadedBaseline() {
  state.departments.forEach((dept) => {
    const code = normalizeCode(dept.department_code);
    const baseline = state.originalData[code];
    if (baseline) {
      dept.max_waste_percent = baseline.max;
      dept.warning_percent = baseline.warning;
    }
  });

  filterAndRenderTable();
  setDirtyState(false);
  showToast("คืนค่าเริ่มต้นเรียบร้อยแล้ว", "info");
}

function applyStandardPreset() {
  const confirmed = confirm("ต้องการปรับทุกแผนกเป็นเกณฑ์มาตรฐานโรงงาน (เกณฑ์สูงสุด 1.00% / ค่าเตือน 0.70%) ใช่หรือไม่?");
  if (!confirmed) return;

  const rows = document.querySelectorAll("#settings-table-body tr[data-code]");
  rows.forEach((row) => {
    const maxInput = row.querySelector('[data-field="max_waste_percent"]');
    const warnInput = row.querySelector('[data-field="warning_percent"]');
    if (maxInput) maxInput.value = "1.00";
    if (warnInput) warnInput.value = "0.70";
    validateRow(row);
  });

  checkGlobalDirtyState();
  showToast("ปรับใช้เกณฑ์มาตรฐาน 1.0% / 0.7% ทุกแผนกแล้ว (อย่าลืมกดบันทึก)", "success");
}

async function saveSettings() {
  hideAlert();

  if (!validateAllRows()) {
    showAlert("ไม่สามารถบันทึกได้: มีบางแผนกที่ค่าเตือนมากกว่าเกณฑ์สูงสุด");
    showToast("กรุณาแก้ไขข้อผิดพลาดก่อนบันทึก", "error");
    return;
  }

  const btn = document.getElementById("btn-save");
  const saveInlineBtn = document.getElementById("btn-save-inline");

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined spin">hourglass_top</span> กำลังบันทึก...`;
  }
  if (saveInlineBtn) saveInlineBtn.disabled = true;

  try {
    const rows = Array.from(document.querySelectorAll("#settings-table-body tr[data-code]"));
    let updatedCount = 0;

    for (const row of rows) {
      const code = row.dataset.code;
      const maxWaste = getInputNumber(row, "max_waste_percent");
      const warning = getInputNumber(row, "warning_percent");

      if (!code) continue;

      if (warning > maxWaste) {
        throw new Error(`ค่าเตือนของแผนก ${code} (${warning}%) ต้องไม่มากกว่าเกณฑ์สูงสุด (${maxWaste}%)`);
      }

      const { error } = await state.supabase
        .from(DEPARTMENT_TABLE)
        .update({
          max_waste_percent: maxWaste,
          warning_percent: warning,
        })
        .eq("department_code", code);

      if (error) throw error;
      updatedCount++;
    }

    showToast(`บันทึกเกณฑ์ของเสียสำเร็จ (${updatedCount} แผนก)`, "success");
    await loadDepartments();
  } catch (err) {
    console.error(err);
    showAlert(`บันทึกไม่สำเร็จ: ${err.message || err}`);
    showToast(`บันทึกไม่สำเร็จ: ${err.message || err}`, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span class="material-symbols-outlined">save</span> <span>บันทึกการตั้งค่า</span>`;
    }
    if (saveInlineBtn) saveInlineBtn.disabled = false;
  }
}

async function logoutSettings() {
  try {
    if (window.AUTH_GUARD?.logoutAndRedirect) {
      await AUTH_GUARD.logoutAndRedirect();
      return;
    }

    if (state.supabase?.auth?.signOut) {
      await Promise.race([
        state.supabase.auth.signOut(),
        new Promise((res) => setTimeout(res, 800)),
      ]);
    }
  } catch (err) {
    console.warn("Supabase signOut warning:", err);
  } finally {
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace("/login.html");
  }
}

function renderEmpty(message) {
  const tbody = document.getElementById("settings-table-body");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="6" class="tb-empty">
        <span class="material-symbols-outlined" style="font-size: 32px; color: #94a3b8; display: block; margin: 0 auto 8px;">sentiment_dissatisfied</span>
        ${escapeHtml(message)}
      </td>
    </tr>
  `;
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function getInputNumber(parent, field) {
  const value = parent.querySelector(`[data-field="${field}"]`)?.value;
  return toNumber(value);
}

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function showAlert(message, type = "error") {
  const box = document.getElementById("alert-box");
  if (!box) return;

  box.textContent = message;
  box.className = type === "success" ? "alert-box success" : "alert-box";
  box.hidden = false;
}

function hideAlert() {
  const box = document.getElementById("alert-box");
  if (box) box.hidden = true;
}

function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const icons = {
    success: "check_circle",
    error: "error",
    info: "info",
  };

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="material-symbols-outlined toast-icon">${icons[type] || "info"}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.loadDepartments = loadDepartments;
window.saveSettings = saveSettings;
window.logoutSettings = logoutSettings;
