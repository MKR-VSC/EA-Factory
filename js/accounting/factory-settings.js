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
  currentTab: "departments",
  machines: [],
  problems: [],
  selectedMachineDept: "",
  selectedProblemDept: "",
  selectedMachineWasteDept: "",
  machineWasteData: {},
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
  initTabs();
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

  // Machine and Problem add events
  document.getElementById("btn-add-machine")?.addEventListener("click", handleAddMachine);
  document.getElementById("btn-add-problem")?.addEventListener("click", handleAddProblem);

  // Machine waste standards batch preset and save all
  document.getElementById("btn-apply-batch-machine")?.addEventListener("click", handleApplyBatchMachinePreset);
  document.getElementById("btn-save-all-machine-waste")?.addEventListener("click", handleSaveAllMachineWaste);
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
  const confirmed = confirm("ต้องการปรับทุกแผนกเป็นเกณฑ์มาตรฐานโรงงาน (เกณฑ์สูงสุด 2.00% / ค่าเตือน 1.50%) ใช่หรือไม่?");
  if (!confirmed) return;

  const rows = document.querySelectorAll("#settings-table-body tr[data-code]");
  rows.forEach((row) => {
    const maxInput = row.querySelector('[data-field="max_waste_percent"]');
    const warnInput = row.querySelector('[data-field="warning_percent"]');
    if (maxInput) maxInput.value = "2.00";
    if (warnInput) warnInput.value = "1.50";
    validateRow(row);
  });

  checkGlobalDirtyState();
  showToast("ปรับใช้เกณฑ์มาตรฐาน 2.0% / 1.5% ทุกแผนกแล้ว (อย่าลืมกดบันทึก)", "success");
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

/* ======================================================
   TABS & EXTENDED FACTORY Master MANAGEMENT
   ====================================================== */
function initTabs() {
  const tabs = document.querySelectorAll("#settings-tabs-nav .tab-btn");
  tabs.forEach(tab => {
    tab.addEventListener("click", async () => {
      const targetTab = tab.dataset.tab;
      
      // Update active tab button style
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      // Show / hide tab content views
      document.querySelectorAll(".tab-content-view").forEach(view => {
        view.hidden = true;
      });
      const targetView = document.getElementById(`tab-view-${targetTab}`);
      if (targetView) targetView.hidden = false;

      state.currentTab = targetTab;

      // Load tab-specific data
      if (targetTab === "departments") {
        await loadDepartments();
      } else if (targetTab === "machine-waste") {
        await initMachineWasteTab();
      } else if (targetTab === "machines") {
        await initMachinesTab();
      } else if (targetTab === "problems") {
        await initProblemsTab();
      }
    });
  });
}

async function initMachinesTab() {
  const dropdown = document.getElementById("machine-filter-dept");
  if (!dropdown) return;

  // Make sure we have departments loaded first
  if (state.departments.length === 0) {
    await loadDepartments();
  }

  // Populate department dropdown
  if (dropdown.options.length <= 1 || dropdown.value === "") {
    dropdown.innerHTML = state.departments.map(dept => {
      const code = normalizeCode(dept.department_code);
      const name = dept.department_name || code;
      return `<option value="${escapeAttr(code)}">${escapeHtml(name)} (${escapeHtml(code)})</option>`;
    }).join("");
    
    // Listen to change
    dropdown.addEventListener("change", (e) => {
      state.selectedMachineDept = e.target.value;
      loadMachines();
    });
  }

  if (!state.selectedMachineDept && dropdown.value) {
    state.selectedMachineDept = dropdown.value;
  }

  await loadMachines();
}

async function loadMachines() {
  const tbody = document.getElementById("machines-table-body");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px;"><div class="spinner" style="margin: 0 auto 10px;"></div>กำลังโหลดเครื่องจักร...</td></tr>`;

  try {
    const { data, error } = await state.supabase
      .from("master_machines")
      .select("*")
      .eq("department", state.selectedMachineDept.toLowerCase())
      .order("sort_order", { ascending: true })
      .order("machine_no", { ascending: true });

    if (error) throw error;

    state.machines = data || [];
    const countEl = document.getElementById("lbl-machines-count");
    if (countEl) countEl.textContent = `${state.machines.length} เครื่องจักร`;

    if (state.machines.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 32px; color: #64748b; font-style: italic;">ยังไม่มีเครื่องจักรในแผนกนี้</td></tr>`;
      return;
    }

    tbody.innerHTML = state.machines.map((mac, idx) => {
      const active = mac.is_active !== false;
      return `
        <tr>
          <td style="text-align: center; font-weight: 700; color: var(--text-muted);">${idx + 1}</td>
          <td><span class="dept-code-tag">${escapeHtml(String(mac.department).toUpperCase())}</span></td>
          <td style="font-weight: 700; color: var(--text);">${escapeHtml(mac.machine_no)}</td>
          <td>
            <input type="number" class="config-input-text inline-sort-input" data-id="${mac.id}" value="${mac.sort_order || 0}" style="width: 70px; height: 32px;" />
          </td>
          <td style="text-align: center;">
            <label class="switch">
              <input type="checkbox" class="toggle-machine-active" data-id="${mac.id}" ${active ? "checked" : ""} />
              <span class="slider"></span>
            </label>
          </td>
          <td style="text-align: center;">
            <button type="button" class="btn-icon-danger btn-delete-machine" data-id="${mac.id}" data-name="${escapeAttr(mac.machine_no)}">
              <span class="material-symbols-outlined">delete</span>
            </button>
          </td>
        </tr>
      `;
    }).join("");

    bindMachinesListEvents();
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--red); font-weight: bold;">โหลดข้อมูลล้มเหลว: ${escapeHtml(err.message || err)}</td></tr>`;
  }
}

function bindMachinesListEvents() {
  // Toggle active status
  document.querySelectorAll(".toggle-machine-active").forEach(chk => {
    chk.addEventListener("change", async (e) => {
      const id = e.target.dataset.id;
      const isChecked = e.target.checked;
      try {
        const { error } = await state.supabase
          .from("master_machines")
          .update({ is_active: isChecked })
          .eq("id", id);
        if (error) throw error;
        showToast(`อัปเดตสถานะสำเร็จ`, "success");
      } catch (err) {
        console.error(err);
        showToast(`อัปเดตไม่สำเร็จ: ${err.message || err}`, "error");
        e.target.checked = !isChecked; // revert
      }
    });
  });

  // Inline Sort Order input updates
  document.querySelectorAll(".inline-sort-input").forEach(input => {
    input.addEventListener("change", async (e) => {
      const id = e.target.dataset.id;
      const val = parseInt(e.target.value) || 0;
      try {
        const { error } = await state.supabase
          .from("master_machines")
          .update({ sort_order: val })
          .eq("id", id);
        if (error) throw error;
        showToast(`อัปเดตลำดับเรียบร้อย`, "success");
      } catch (err) {
        console.error(err);
        showToast(`อัปเดตลำดับไม่สำเร็จ: ${err.message || err}`, "error");
      }
    });
  });

  // Delete machine
  document.querySelectorAll(".btn-delete-machine").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      const confirmed = confirm(`คุณต้องการลบเครื่องจักร "${name}" ใช่หรือไม่?`);
      if (!confirmed) return;

      try {
        const { error } = await state.supabase
          .from("master_machines")
          .delete()
          .eq("id", id);
        if (error) throw error;
        showToast(`ลบเครื่องจักรเรียบร้อยแล้ว`, "success");
        await loadMachines();
      } catch (err) {
        console.error(err);
        showToast(`ลบไม่สำเร็จ: ${err.message || err}`, "error");
      }
    });
  });
}

async function handleAddMachine() {
  const machineNoEl = document.getElementById("new-machine-no");
  const sortEl = document.getElementById("new-machine-sort");
  if (!machineNoEl) return;

  const machineNo = machineNoEl.value.trim();
  const sortOrder = parseInt(sortEl?.value) || 0;

  if (!machineNo) {
    showToast("กรุณากรอกรหัสหรือชื่อเครื่องจักร", "error");
    return;
  }

  const btn = document.getElementById("btn-add-machine");
  if (btn) btn.disabled = true;

  try {
    const { error } = await state.supabase
      .from("master_machines")
      .insert({
        machine_no: machineNo,
        department: state.selectedMachineDept.toLowerCase(),
        sort_order: sortOrder,
        is_active: true
      });

    if (error) throw error;

    showToast(`เพิ่มเครื่องจักร "${machineNo}" สำเร็จ`, "success");
    machineNoEl.value = "";
    if (sortEl) sortEl.value = "0";
    await loadMachines();
  } catch (err) {
    console.error(err);
    showToast(`เพิ่มเครื่องจักรไม่สำเร็จ: ${err.message || err}`, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function initProblemsTab() {
  const dropdown = document.getElementById("problem-filter-dept");
  if (!dropdown) return;

  // Make sure we have departments loaded first
  if (state.departments.length === 0) {
    await loadDepartments();
  }

  // Populate department dropdown
  if (dropdown.options.length <= 1 || dropdown.value === "") {
    dropdown.innerHTML = state.departments.map(dept => {
      const code = normalizeCode(dept.department_code);
      const name = dept.department_name || code;
      return `<option value="${escapeAttr(code)}">${escapeHtml(name)} (${escapeHtml(code)})</option>`;
    }).join("");
    
    // Listen to change
    dropdown.addEventListener("change", (e) => {
      state.selectedProblemDept = e.target.value;
      loadProblems();
    });
  }

  if (!state.selectedProblemDept && dropdown.value) {
    state.selectedProblemDept = dropdown.value;
  }

  await loadProblems();
}

async function loadProblems() {
  const tbody = document.getElementById("problems-table-body");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px;"><div class="spinner" style="margin: 0 auto 10px;"></div>กำลังโหลดรายการหัวข้อปัญหา...</td></tr>`;

  try {
    const { data, error } = await state.supabase
      .from("master_problems")
      .select("*")
      .eq("department", state.selectedProblemDept.toLowerCase())
      .order("sort_order", { ascending: true })
      .order("problem_type", { ascending: true });

    if (error) throw error;

    state.problems = data || [];
    const countEl = document.getElementById("lbl-problems-count");
    if (countEl) countEl.textContent = `${state.problems.length} รายการปัญหา`;

    if (state.problems.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 32px; color: #64748b; font-style: italic;">ยังไม่มีรายการปัญหาในแผนกนี้</td></tr>`;
      return;
    }

    tbody.innerHTML = state.problems.map((prob, idx) => {
      const active = prob.is_active !== false;
      return `
        <tr>
          <td style="text-align: center; font-weight: 700; color: var(--text-muted);">${idx + 1}</td>
          <td><span class="dept-code-tag">${escapeHtml(String(prob.department).toUpperCase())}</span></td>
          <td style="font-weight: 700; color: var(--text);">${escapeHtml(prob.problem_type)}</td>
          <td>
            <input type="number" class="config-input-text inline-prob-sort-input" data-id="${prob.id}" value="${prob.sort_order || 0}" style="width: 70px; height: 32px;" />
          </td>
          <td style="text-align: center;">
            <label class="switch">
              <input type="checkbox" class="toggle-prob-active" data-id="${prob.id}" ${active ? "checked" : ""} />
              <span class="slider"></span>
            </label>
          </td>
          <td style="text-align: center;">
            <button type="button" class="btn-icon-danger btn-delete-prob" data-id="${prob.id}" data-name="${escapeAttr(prob.problem_type)}">
              <span class="material-symbols-outlined">delete</span>
            </button>
          </td>
        </tr>
      `;
    }).join("");

    bindProblemsListEvents();
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px; color: var(--red); font-weight: bold;">โหลดข้อมูลล้มเหลว: ${escapeHtml(err.message || err)}</td></tr>`;
  }
}

function bindProblemsListEvents() {
  // Toggle active status
  document.querySelectorAll(".toggle-prob-active").forEach(chk => {
    chk.addEventListener("change", async (e) => {
      const id = e.target.dataset.id;
      const isChecked = e.target.checked;
      try {
        const { error } = await state.supabase
          .from("master_problems")
          .update({ is_active: isChecked })
          .eq("id", id);
        if (error) throw error;
        showToast(`อัปเดตสถานะสำเร็จ`, "success");
      } catch (err) {
        console.error(err);
        showToast(`อัปเดตไม่สำเร็จ: ${err.message || err}`, "error");
        e.target.checked = !isChecked; // revert
      }
    });
  });

  // Inline Sort Order input updates
  document.querySelectorAll(".inline-prob-sort-input").forEach(input => {
    input.addEventListener("change", async (e) => {
      const id = e.target.dataset.id;
      const val = parseInt(e.target.value) || 0;
      try {
        const { error } = await state.supabase
          .from("master_problems")
          .update({ sort_order: val })
          .eq("id", id);
        if (error) throw error;
        showToast(`อัปเดตลำดับเรียบร้อย`, "success");
      } catch (err) {
        console.error(err);
        showToast(`อัปเดตลำดับไม่สำเร็จ: ${err.message || err}`, "error");
      }
    });
  });

  // Delete problem
  document.querySelectorAll(".btn-delete-prob").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      const confirmed = confirm(`คุณต้องการลบข้อหัวปัญหา "${name}" ใช่หรือไม่?`);
      if (!confirmed) return;

      try {
        const { error } = await state.supabase
          .from("master_problems")
          .delete()
          .eq("id", id);
        if (error) throw error;
        showToast(`ลบหัวข้อปัญหาเรียบร้อยแล้ว`, "success");
        await loadProblems();
      } catch (err) {
        console.error(err);
        showToast(`ลบไม่สำเร็จ: ${err.message || err}`, "error");
      }
    });
  });
}

async function handleAddProblem() {
  const problemTypeEl = document.getElementById("new-problem-type");
  const sortEl = document.getElementById("new-problem-sort");
  if (!problemTypeEl) return;

  const problemType = problemTypeEl.value.trim();
  const sortOrder = parseInt(sortEl?.value) || 0;

  if (!problemType) {
    showToast("กรุณากรอกหัวข้อประเภทปัญหา", "error");
    return;
  }

  const btn = document.getElementById("btn-add-problem");
  if (btn) btn.disabled = true;

  try {
    const { error } = await state.supabase
      .from("master_problems")
      .insert({
        problem_type: problemType,
        department: state.selectedProblemDept.toLowerCase(),
        sort_order: sortOrder,
        is_active: true
      });

    if (error) throw error;

    showToast(`เพิ่มประเภทปัญหา "${problemType}" สำเร็จ`, "success");
    problemTypeEl.value = "";
    if (sortEl) sortEl.value = "0";
    await loadProblems();
  } catch (err) {
    console.error(err);
    showToast(`เพิ่มประเภทปัญหาไม่สำเร็จ: ${err.message || err}`, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* ======================================================
   MACHINE WASTE STANDARDS CONTROLLER (Per Machine % / Month / Day)
   ====================================================== */
async function initMachineWasteTab() {
  const dropdown = document.getElementById("machine-waste-filter-dept");
  if (!dropdown) return;

  if (state.departments.length === 0) {
    await loadDepartments();
  }

  // Populate department dropdown
  if (dropdown.options.length <= 1 || dropdown.value === "") {
    dropdown.innerHTML = state.departments.map(dept => {
      const code = normalizeCode(dept.department_code);
      const name = dept.department_name || code;
      return `<option value="${escapeAttr(code)}">${escapeHtml(name)} (${escapeHtml(code)})</option>`;
    }).join("");

    dropdown.addEventListener("change", (e) => {
      state.selectedMachineWasteDept = e.target.value;
      loadMachineWasteStandards();
    });
  }

  if (!state.selectedMachineWasteDept && dropdown.value) {
    state.selectedMachineWasteDept = dropdown.value;
  }

  await loadMachineWasteStandards();
}

async function loadMachineWasteStandards() {
  const tbody = document.getElementById("machine-waste-table-body");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px;"><div class="spinner" style="margin: 0 auto 10px;"></div>กำลังโหลดเกณฑ์ของเสียรายเครื่องจักร...</td></tr>`;

  try {
    const deptCode = (state.selectedMachineWasteDept || "blow").toLowerCase();
    
    // Find department baseline standard
    const currentDeptObj = state.departments.find(d => normalizeCode(d.department_code) === deptCode);
    const deptMax = Number(currentDeptObj?.max_waste_percent || 2.0);
    const deptWarn = Number(currentDeptObj?.warning_percent || 1.5);

    // Fetch machines belonging to this department
    const { data: machines, error } = await state.supabase
      .from("master_machines")
      .select("*")
      .eq("department", deptCode)
      .order("sort_order", { ascending: true })
      .order("machine_no", { ascending: true });

    if (error) throw error;

    if (!machines || machines.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 32px; color: #64748b; font-style: italic;">ไม่พบเครื่องจักรในแผนกนี้ (สามารถเพิ่มเครื่องจักรได้ที่แท็บ "จัดการเครื่องจักรรายแผนก")</td></tr>`;
      return;
    }

    // Get machine standards from WasteStandardService
    const allCustomStandards = window.WasteStandardService?.getAllMachineStandards() || {};

    tbody.innerHTML = machines.map((mac, idx) => {
      const cleanMachineNo = String(mac.machine_no).trim().toUpperCase();
      const customKey = `${deptCode}__${cleanMachineNo}`;
      const customConfig = allCustomStandards[customKey];

      const isCustom = Boolean(customConfig && customConfig.is_custom);
      const maxVal = isCustom ? Number(customConfig.max_waste_percent) : deptMax;
      const warnVal = isCustom ? Number(customConfig.warning_percent) : deptWarn;

      return `
        <tr data-machine="${escapeAttr(cleanMachineNo)}" data-dept="${escapeAttr(deptCode)}" class="machine-waste-row">
          <td style="text-align: center; font-weight: 700; color: var(--text-muted);">${idx + 1}</td>
          <td>
            <div style="font-weight: 800; color: var(--text); font-size: 14.5px;">${escapeHtml(mac.machine_no)}</div>
            ${mac.is_active === false ? '<small style="color:var(--red); font-size:11px;">(ปิดใช้งาน)</small>' : ''}
          </td>
          <td>
            <span class="dept-code-tag">${escapeHtml(deptCode.toUpperCase())}</span>
          </td>
          <td style="text-align: right;">
            <div class="machine-target-input-group">
              <input
                type="number"
                step="0.05"
                min="0"
                max="100"
                class="machine-target-input input-machine-max"
                value="${maxVal.toFixed(2)}"
                data-machine="${escapeAttr(cleanMachineNo)}"
              />
              <span style="font-size: 13px; font-weight: 600; color: #64748b;">%</span>
            </div>
          </td>
          <td style="text-align: right;">
            <div class="machine-target-input-group">
              <input
                type="number"
                step="0.05"
                min="0"
                max="100"
                class="machine-target-input input-machine-warn"
                value="${warnVal.toFixed(2)}"
                data-machine="${escapeAttr(cleanMachineNo)}"
              />
              <span style="font-size: 13px; font-weight: 600; color: #64748b;">%</span>
            </div>
          </td>
          <td style="text-align: center;">
            <button
              type="button"
              class="btn-toggle-mode badge-mode ${isCustom ? 'badge-mode-custom' : 'badge-mode-inherit'}"
              data-machine="${escapeAttr(cleanMachineNo)}"
              title="คลิกเพื่อสลับระหว่าง กำหนดเฉพาะเครื่อง / ใช้ตามเกณฑ์แผนก"
            >
              <span class="material-symbols-outlined" style="font-size:14px;">${isCustom ? 'tune' : 'account_tree'}</span>
              <span>${isCustom ? 'เฉพาะเครื่อง' : 'ตามเกณฑ์แผนก'}</span>
            </button>
          </td>
          <td style="text-align: center;" class="cell-range-preview">
            <span class="range-pill range-pill-green">
              <span>กำลังคำนวณ...</span>
            </span>
          </td>
          <td style="text-align: center;">
            <button
              type="button"
              class="btn btn-light btn-save-machine-row"
              data-machine="${escapeAttr(cleanMachineNo)}"
              style="min-height: 32px; padding: 0 10px; font-size: 12px; border-radius: 6px;"
              title="บันทึกเกณฑ์เฉพาะเครื่องนี้"
            >
              <span class="material-symbols-outlined" style="font-size: 16px;">save</span>
              <span>บันทึก</span>
            </button>
          </td>
        </tr>
      `;
    }).join("");

    bindMachineWasteRowEvents(deptMax, deptWarn);
  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--red); font-weight: bold;">โหลดเกณฑ์รายเครื่องล้มเหลว: ${escapeHtml(err.message || err)}</td></tr>`;
  }
}

function bindMachineWasteRowEvents(deptMax, deptWarn) {
  const rows = document.querySelectorAll(".machine-waste-row");
  
  rows.forEach(row => {
    const machineNo = row.dataset.machine;
    const maxInput = row.querySelector(".input-machine-max");
    const warnInput = row.querySelector(".input-machine-warn");
    const modeBtn = row.querySelector(".btn-toggle-mode");
    const previewCell = row.querySelector(".cell-range-preview");
    const saveBtn = row.querySelector(".btn-save-machine-row");

    const updatePreview = () => {
      const max = parseFloat(maxInput?.value) || 0;
      const warn = parseFloat(warnInput?.value) || 0;

      if (warn > max) {
        warnInput.style.borderColor = "var(--red)";
        previewCell.innerHTML = `<span class="range-pill range-pill-red"><span class="material-symbols-outlined" style="font-size:14px;">warning</span><span>ค่าเตือนต้อง ≤ เกณฑ์สูงสุด</span></span>`;
      } else {
        warnInput.style.borderColor = "";
        previewCell.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:2px; align-items:center;">
            <span class="range-pill range-pill-green" style="font-size:11px;">🟢 ปลอดภัย &lt; ${warn.toFixed(2)}%</span>
            <span class="range-pill range-pill-yellow" style="font-size:11px;">🟠 เฝ้าระวัง ${warn.toFixed(2)} - ${max.toFixed(2)}%</span>
            <span class="range-pill range-pill-red" style="font-size:11px;">🔴 เกินเกณฑ์ &gt; ${max.toFixed(2)}%</span>
          </div>
        `;
      }
    };

    updatePreview();

    maxInput?.addEventListener("input", () => {
      if (modeBtn && !modeBtn.classList.contains("badge-mode-custom")) {
        modeBtn.className = "btn-toggle-mode badge-mode badge-mode-custom";
        modeBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;">tune</span><span>เฉพาะเครื่อง</span>`;
      }
      updatePreview();
    });

    warnInput?.addEventListener("input", () => {
      if (modeBtn && !modeBtn.classList.contains("badge-mode-custom")) {
        modeBtn.className = "btn-toggle-mode badge-mode badge-mode-custom";
        modeBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;">tune</span><span>เฉพาะเครื่อง</span>`;
      }
      updatePreview();
    });

    modeBtn?.addEventListener("click", () => {
      const isCurrentlyCustom = modeBtn.classList.contains("badge-mode-custom");
      if (isCurrentlyCustom) {
        modeBtn.className = "btn-toggle-mode badge-mode badge-mode-inherit";
        modeBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;">account_tree</span><span>ตามเกณฑ์แผนก</span>`;
        if (maxInput) maxInput.value = deptMax.toFixed(2);
        if (warnInput) warnInput.value = deptWarn.toFixed(2);
      } else {
        modeBtn.className = "btn-toggle-mode badge-mode badge-mode-custom";
        modeBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;">tune</span><span>เฉพาะเครื่อง</span>`;
      }
      updatePreview();
    });

    saveBtn?.addEventListener("click", async () => {
      const deptCode = (state.selectedMachineWasteDept || "blow").toLowerCase();
      const max = parseFloat(maxInput?.value) || 0;
      const warn = parseFloat(warnInput?.value) || 0;
      const isCustom = modeBtn.classList.contains("badge-mode-custom");

      if (warn > max) {
        showToast("ค่าเตือนเฝ้าระวังต้องน้อยกว่าหรือเท่ากับเกณฑ์สูงสุด", "error");
        return;
      }

      await window.WasteStandardService?.saveMachineStandard(deptCode, machineNo, {
        max_waste_percent: max,
        warning_percent: warn,
        monthly_target_percent: max,
        isInherited: !isCustom
      });

      showToast(`บันทึกเกณฑ์ของเสียสำหรับเครื่อง ${machineNo} (${max.toFixed(2)}%) เรียบร้อย`, "success");
    });
  });
}

function handleApplyBatchMachinePreset() {
  const batchMaxEl = document.getElementById("batch-machine-max");
  const batchWarnEl = document.getElementById("batch-machine-warn");

  const batchMax = parseFloat(batchMaxEl?.value);
  const batchWarn = parseFloat(batchWarnEl?.value);

  if (isNaN(batchMax) || isNaN(batchWarn)) {
    showToast("กรุณากรอกตัวเลขเกณฑ์ % ที่ถูกต้อง", "error");
    return;
  }

  if (batchWarn > batchMax) {
    showToast("ค่าเตือนเฝ้าระวังต้องไม่มากกว่าเกณฑ์สูงสุด", "error");
    return;
  }

  const rows = document.querySelectorAll(".machine-waste-row");
  if (rows.length === 0) return;

  const confirmed = confirm(`ต้องการปรับเกณฑ์ทุกเครื่องในแผนกเป็น: สูงสุด ${batchMax.toFixed(2)}% / เตือน ${batchWarn.toFixed(2)}% ต่อเดือน ใช่หรือไม่?`);
  if (!confirmed) return;

  rows.forEach(row => {
    const maxInput = row.querySelector(".input-machine-max");
    const warnInput = row.querySelector(".input-machine-warn");
    const modeBtn = row.querySelector(".btn-toggle-mode");

    if (maxInput) maxInput.value = batchMax.toFixed(2);
    if (warnInput) warnInput.value = batchWarn.toFixed(2);

    if (modeBtn) {
      modeBtn.className = "btn-toggle-mode badge-mode badge-mode-custom";
      modeBtn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;">tune</span><span>เฉพาะเครื่อง</span>`;
    }

    maxInput?.dispatchEvent(new Event("input"));
  });

  showToast(`ปรับค่าทุกเครื่องในแผนกเป็น ${batchMax.toFixed(2)}% เรียบร้อยแล้ว (กดบันทึกทั้งหมดเพื่อยืนยัน)`, "success");
}

async function handleSaveAllMachineWaste() {
  const rows = document.querySelectorAll(".machine-waste-row");
  if (rows.length === 0) {
    showToast("ไม่มีเครื่องจักรให้บันทึก", "info");
    return;
  }

  const deptCode = (state.selectedMachineWasteDept || "blow").toLowerCase();
  const machineConfigs = {};
  let hasError = false;

  rows.forEach(row => {
    const machineNo = row.dataset.machine;
    const maxInput = row.querySelector(".input-machine-max");
    const warnInput = row.querySelector(".input-machine-warn");
    const modeBtn = row.querySelector(".btn-toggle-mode");

    const max = parseFloat(maxInput?.value) || 0;
    const warn = parseFloat(warnInput?.value) || 0;
    const isCustom = modeBtn?.classList.contains("badge-mode-custom");

    if (warn > max) {
      hasError = true;
    }

    machineConfigs[machineNo] = {
      max_waste_percent: max,
      warning_percent: warn,
      monthly_target_percent: max,
      isInherited: !isCustom
    };
  });

  if (hasError) {
    showToast("ไม่สามารถบันทึกได้: มีบางเครื่องที่ค่าเตือนมากกว่าเกณฑ์สูงสุด", "error");
    return;
  }

  const btn = document.getElementById("btn-save-all-machine-waste");
  if (btn) btn.disabled = true;

  try {
    await window.WasteStandardService?.saveAllMachineStandardsForDept(deptCode, machineConfigs);
    showToast(`บันทึกการตั้งค่าเกณฑ์ของเสียรายเครื่องจักรทุกเครื่องในแผนก ${deptCode.toUpperCase()} เรียบร้อยแล้ว!`, "success");
    await loadMachineWasteStandards();
  } catch (err) {
    console.error(err);
    showToast(`บันทึกล้มเหลว: ${err.message || err}`, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

