/* ======================================================
   FACTORY SETTINGS
   ใช้สำหรับบัญชีตั้งค่าเกณฑ์ % Waste รายแผนก
   Admin / Accounting เท่านั้น
====================================================== */

const DEPARTMENT_TABLE = "departments";
const ALLOW_ROLES = ["admin", "accounting"];

const state = {
  supabase: null,
  departments: [],
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!protectSettingsPage()) return;

  state.supabase = window.supabaseClient || window.supabase || null;

  if (!state.supabase) {
    showAlert("ไม่พบ Supabase Client กรุณาตรวจสอบ /core/supabaseClient.js");
    renderEmpty("ไม่พบ Supabase Client");
    return;
  }

  bindEvents();
  await loadDepartments();
});

function protectSettingsPage() {
  const activeUser = localStorage.getItem("activeUser");
  const activeRole = String(localStorage.getItem("activeRole") || "").toLowerCase();

  if (!activeUser || !ALLOW_ROLES.includes(activeRole)) {
    alert("คุณไม่มีสิทธิ์เข้าใช้งานหน้านี้");
    window.location.href = "/login.html";
    return false;
  }

  return true;
}

function bindEvents() {
  document.getElementById("btn-refresh")?.addEventListener("click", loadDepartments);
  document.getElementById("btn-save")?.addEventListener("click", saveSettings);
}

async function loadDepartments() {
  hideAlert();

  const btn = document.getElementById("btn-refresh");
  if (btn) btn.disabled = true;

  try {
    const { data, error } = await state.supabase
      .from(DEPARTMENT_TABLE)
      .select("code, name_th, sort_order, is_active, max_waste_percent, warning_percent")
      .order("sort_order", { ascending: true });

    if (error) throw error;

    state.departments = Array.isArray(data) ? data : [];
    renderTable(state.departments);
  } catch (err) {
    console.error(err);
    showAlert(`โหลดข้อมูลไม่สำเร็จ: ${err.message || err}`);
    renderEmpty("โหลดข้อมูลไม่สำเร็จ");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderTable(rows) {
  const tbody = document.getElementById("settings-table-body");
  if (!tbody) return;

  if (!rows.length) {
    renderEmpty("ยังไม่มีข้อมูลแผนก");
    return;
  }

  tbody.innerHTML = rows
    .map((dept, index) => {
      const code = dept.code || "";
      const name = dept.name_th || code || "-";
      const max = toNumber(dept.max_waste_percent || 3);
      const warning = toNumber(dept.warning_percent || 0);
      const active = dept.is_active !== false;

      return `
        <tr data-code="${escapeAttr(code)}">
          <td>${index + 1}</td>
          <td>
            <strong>${escapeHtml(name)}</strong>
            <div class="muted">${escapeHtml(code)}</div>
          </td>
          <td class="text-right">
            <input
              class="input-percent"
              type="number"
              step="0.01"
              min="0"
              value="${escapeAttr(max)}"
              data-field="max_waste_percent"
            />
          </td>
          <td class="text-right">
            <input
              class="input-percent"
              type="number"
              step="0.01"
              min="0"
              value="${escapeAttr(warning)}"
              data-field="warning_percent"
            />
          </td>
          <td>
            <span class="status-pill ${active ? "status-active" : "status-inactive"}">
              ${active ? "เปิดใช้งาน" : "ปิดใช้งาน"}
            </span>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderEmpty(message) {
  const tbody = document.getElementById("settings-table-body");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="5" class="tb-empty">${escapeHtml(message)}</td>
    </tr>
  `;
}

async function saveSettings() {
  hideAlert();

  const btn = document.getElementById("btn-save");
  if (btn) btn.disabled = true;

  try {
    const rows = Array.from(document.querySelectorAll("#settings-table-body tr[data-code]"));

    for (const row of rows) {
      const code = row.dataset.code;
      const maxWaste = getInputNumber(row, "max_waste_percent");
      const warning = getInputNumber(row, "warning_percent");

      if (!code) continue;

      if (warning > maxWaste) {
        throw new Error(`ค่าเตือนของแผนก ${code} ต้องไม่มากกว่าเกณฑ์สูงสุด`);
      }

      const { error } = await state.supabase
        .from(DEPARTMENT_TABLE)
        .update({
          max_waste_percent: maxWaste,
          warning_percent: warning,
        })
        .eq("code", code);

      if (error) throw error;
    }

    showAlert("บันทึกการตั้งค่าเรียบร้อยแล้ว", "success");
    await loadDepartments();
  } catch (err) {
    console.error(err);
    showAlert(`บันทึกไม่สำเร็จ: ${err.message || err}`);
  } finally {
    if (btn) btn.disabled = false;
  }
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