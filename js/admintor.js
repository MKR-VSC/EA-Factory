/* =========================================================
   ADMIN PANEL - DAILY WASTE REPORTS
   ใช้งานจริงกับ Supabase + Logout
========================================================= */

const REPORT_TABLE = "daily_waste_reports";

const MASTER_TABLES = {
  machines: ["master_machines", "machines"],
  problems: ["master_problems", "problems"],
};

const LOGIN_PAGE = "/login.html";

const state = {
  supabase: null,
  reports: [],
  machineTable: null,
  problemTable: null,
  machines: [],
  problems: [],
};

document.addEventListener("DOMContentLoaded", () => {
  if (!protectAdminPage()) return;
  initAdminPanel();
});

/* =========================================================
   AUTH / PROTECT PAGE / LOGOUT
========================================================= */

function protectAdminPage() {
  const user = localStorage.getItem("activeUser");
  const role = localStorage.getItem("activeRole");

  const allowRoles = ["admin", "management", "accounting", "supervisor"];

  if (!user || !allowRoles.includes(role)) {
    window.location.href = LOGIN_PAGE;
    return false;
  }

  return true;
}

async function logout() {
  const ok = confirm("ต้องการออกจากระบบใช่ไหม?");
  if (!ok) return;

  try {
    if (window.supabaseClient?.auth) {
      await window.supabaseClient.auth.signOut();
    }

    localStorage.removeItem("activeUser");
    localStorage.removeItem("activeName");
    localStorage.removeItem("activeRole");
    localStorage.removeItem("activeDept");

    sessionStorage.clear();

    window.location.href = LOGIN_PAGE;
  } catch (err) {
    console.error("Logout error:", err);
    alert("ออกจากระบบไม่สำเร็จ");
  }
}

function setCurrentUserLabel() {
  const el = document.getElementById("currentUser");
  if (!el) return;

  el.textContent =
    localStorage.getItem("activeName") ||
    localStorage.getItem("activeUser") ||
    "-";
}

/* =========================================================
   INIT
========================================================= */

async function initAdminPanel() {
  bindEvents();
  setCurrentUserLabel();

  state.supabase = window.supabaseClient || window.supabase || null;

  if (!state.supabase) {
    showAlert("ไม่พบ Supabase Client กรุณาตรวจสอบไฟล์ /js/core/supabaseClient.js");
    setText("status-api", "เชื่อมต่อไม่ได้");
    addLog("ERROR", "ไม่พบ window.supabaseClient");
    renderEmptyTable("tb", 7, "ไม่พบ Supabase Client");
    return;
  }

  await loadAll();
}

function bindEvents() {
  document.querySelectorAll(".sidebar-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const section = btn.dataset.section;
      if (section) showSection(section, btn);
    });
  });

  document.getElementById("btn-refresh")?.addEventListener("click", loadAll);
  document.getElementById("search-input")?.addEventListener("input", renderReports);
  document.getElementById("status-filter")?.addEventListener("change", renderReports);

  document.getElementById("btn-add-machine")?.addEventListener("click", addMachine);
  document.getElementById("btn-add-problem")?.addEventListener("click", addProblem);

  document.getElementById("btnLogout")?.addEventListener("click", logout);
  document.getElementById("btn-logout")?.addEventListener("click", logout);
}

function showSection(section, activeBtn) {
  document.querySelectorAll(".sidebar-item").forEach((btn) => {
    btn.classList.remove("active");
  });

  activeBtn?.classList.add("active");

  document.querySelectorAll(".page-section").forEach((el) => {
    el.classList.remove("active");
  });

  document.getElementById(`section-${section}`)?.classList.add("active");
}

/* =========================================================
   LOAD DATA
========================================================= */

async function loadAll() {
  hideAlert();

  const btn = document.getElementById("btn-refresh");
  if (btn) btn.disabled = true;

  const start = performance.now();

  try {
    await loadReports();
    await loadMasters();

    const latency = Math.round(performance.now() - start);

    setText("status-api", "เชื่อมต่อได้");
    setText("status-latency", `${latency} ms`);
    setText("last-update", `อัปเดตล่าสุด: ${new Date().toLocaleString("th-TH")}`);

    addLog("INFO", "โหลดข้อมูลสำเร็จ");
  } catch (err) {
    console.error(err);

    setText("status-api", "พบข้อผิดพลาด");
    setText("status-latency", "-- ms");

    showAlert(err.message || String(err));
    addLog("ERROR", err.message || String(err));
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function loadReports() {
  const { data, error } = await state.supabase
    .from(REPORT_TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    throw new Error(`โหลดข้อมูล ${REPORT_TABLE} ไม่สำเร็จ: ${error.message}`);
  }

  state.reports = Array.isArray(data) ? data : [];

  renderReports();
  updateSummary();
}

async function loadMasters() {
  const machine = await selectFirstAvailableTable(MASTER_TABLES.machines, "*", {
    orderColumn: "name",
    ascending: true,
    optional: true,
  });

  const problem = await selectFirstAvailableTable(MASTER_TABLES.problems, "*", {
    orderColumn: "name",
    ascending: true,
    optional: true,
  });

  state.machineTable = machine.table;
  state.problemTable = problem.table;
  state.machines = machine.rows;
  state.problems = problem.rows;

  renderMasterList("machine-list", state.machines, deleteMachine);
  renderMasterList("problem-list", state.problems, deleteProblem);
}

async function selectFirstAvailableTable(tableNames, columns = "*", options = {}) {
  let lastError = null;

  for (const table of tableNames) {
    try {
      let query = state.supabase.from(table).select(columns);

      if (options.orderColumn) {
        query = query.order(options.orderColumn, {
          ascending: options.ascending ?? true,
        });
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (!error) {
        return {
          table,
          rows: Array.isArray(data) ? data : [],
        };
      }

      lastError = error;
    } catch (err) {
      lastError = err;
    }
  }

  if (options.optional) {
    return {
      table: null,
      rows: [],
    };
  }

  throw new Error(
    `ไม่พบตารางข้อมูลที่ใช้งานได้: ${tableNames.join(" / ")} (${lastError?.message || "unknown error"})`
  );
}

/* =========================================================
   RENDER REPORTS
========================================================= */

function renderReports() {
  const keyword = getValue("search-input").toLowerCase();
  const statusFilter = getValue("status-filter") || "all";

  const rows = state.reports.filter((row) => {
    const status = normalizeStatus(row.status || "pending");

    const text = [
      row.department,
      row.department_code,
      row.product_name,
      row.machine_no,
      row.problem_type,
      row.reason_detail,
      row.detail,
      row.corrective_action,
      row.forecast_note,
      row.note,
      row.reported_by,
      row.created_by,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchKeyword = !keyword || text.includes(keyword);
    const matchStatus = statusFilter === "all" || status === statusFilter;

    return matchKeyword && matchStatus;
  });

  const tbody = document.getElementById("tb");
  if (!tbody) return;

  if (!rows.length) {
    renderEmptyTable("tb", 7, "ไม่พบข้อมูลตามเงื่อนไข");
    return;
  }

  tbody.innerHTML = rows
    .map((row) => {
      const status = normalizeStatus(row.status || "pending");

      return `
        <tr>
          <td>${escapeHtml(formatDate(row.incident_datetime || row.report_date || row.created_at))}</td>
          <td>${escapeHtml(row.department || row.department_code || "-")}</td>
          <td>${escapeHtml(row.machine_no || "-")}</td>
          <td>${escapeHtml(row.problem_type || row.reason_detail || "-")}</td>
          <td>${escapeHtml(formatWasteWeight(row))}</td>
          <td>${escapeHtml(row.reported_by || row.created_by || "-")}</td>
          <td>
            <span class="status-pill status-${status}">
              ${escapeHtml(statusText(status))}
            </span>
          </td>
        </tr>
      `;
    })
    .join("");
}

function updateSummary() {
  const rows = state.reports;

  const pending = rows.filter((row) => {
    return normalizeStatus(row.status || "pending") === "pending";
  }).length;

  const totalWeight = rows.reduce((sum, row) => {
    return sum + getWasteWeight(row);
  }, 0);

  setText("dash-total-count", rows.length.toLocaleString("th-TH"));
  setText("dash-pending-count", pending.toLocaleString("th-TH"));
  setText(
    "dash-total-weight",
    totalWeight.toLocaleString("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/* =========================================================
   MASTER MACHINE / PROBLEM
========================================================= */

async function addMachine() {
  await addMasterItem(
    "machine-input",
    "machine",
    state.machineTable,
    MASTER_TABLES.machines,
    loadMasters
  );
}

async function addProblem() {
  await addMasterItem(
    "problem-input",
    "problem",
    state.problemTable,
    MASTER_TABLES.problems,
    loadMasters
  );
}

async function addMasterItem(inputId, type, currentTable, tableList, reloadFn) {
  const input = document.getElementById(inputId);
  const name = input?.value.trim();

  if (!name) return;

  let table = currentTable;

  if (!table) {
    const found = await selectFirstAvailableTable(tableList, "*", {
      optional: true,
    });

    table = found.table;
  }

  if (!table) {
    showAlert(`ยังไม่พบตารางสำหรับ ${type} ให้สร้างตาราง ${tableList[0]} ก่อน`);
    return;
  }

  const { error } = await state.supabase.from(table).insert({
    name,
    status: "active",
  });

  if (error) {
    showAlert(`เพิ่มข้อมูลไม่สำเร็จ: ${error.message}`);
    addLog("ERROR", error.message);
    return;
  }

  input.value = "";

  addLog("INFO", `เพิ่ม ${type}: ${name}`);

  await reloadFn();
}

async function deleteMachine(id) {
  await deleteMasterItem(state.machineTable, id, loadMasters);
}

async function deleteProblem(id) {
  await deleteMasterItem(state.problemTable, id, loadMasters);
}

async function deleteMasterItem(table, id, reloadFn) {
  if (!table || !id) return;

  const ok = confirm("ต้องการลบรายการนี้ใช่ไหม?");
  if (!ok) return;

  const { error } = await state.supabase.from(table).delete().eq("id", id);

  if (error) {
    showAlert(`ลบข้อมูลไม่สำเร็จ: ${error.message}`);
    addLog("ERROR", error.message);
    return;
  }

  await reloadFn();
}

function renderMasterList(elementId, rows, onDelete) {
  const list = document.getElementById(elementId);
  if (!list) return;

  if (!rows.length) {
    list.innerHTML = `
      <li>
        <span class="muted">ยังไม่มีข้อมูล หรือยังไม่ได้สร้างตาราง Master</span>
      </li>
    `;
    return;
  }

  list.innerHTML = "";

  rows.forEach((row) => {
    const li = document.createElement("li");

    const name =
      row.name ||
      row.machine_name ||
      row.problem_name ||
      row.machine_no ||
      "-";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "ลบ";
    btn.addEventListener("click", () => onDelete(row.id));

    li.innerHTML = `<span>${escapeHtml(name)}</span>`;
    li.appendChild(btn);

    list.appendChild(li);
  });
}

/* =========================================================
   FORMAT / HELPERS
========================================================= */

function normalizeStatus(value) {
  const status = String(value || "").toLowerCase();

  if (
    [
      "approved",
      "checked",
      "done",
      "completed",
      "ตรวจสอบแล้ว",
      "อนุมัติ",
      "complete",
    ].includes(status)
  ) {
    return "approved";
  }

  if (
    [
      "rejected",
      "reject",
      "cancelled",
      "ไม่ผ่าน",
      "ไม่อนุมัติ",
      "ยกเลิก",
    ].includes(status)
  ) {
    return "rejected";
  }

  return "pending";
}

function statusText(status) {
  return (
    {
      pending: "รอตรวจสอบ",
      approved: "ตรวจสอบแล้ว",
      rejected: "ไม่ผ่าน",
    }[status] || status
  );
}

function getWasteWeight(row) {
  return toNumber(row.waste_weight_kg || row.waste_qty || 0);
}

function formatWasteWeight(row) {
  const n = getWasteWeight(row);
  return n ? `${n.toFixed(2)} กก.` : "-";
}

function addLog(type, message) {
  const tbody = document.getElementById("log-table-body");
  if (!tbody) return;

  if (tbody.querySelector(".tb-empty")) {
    tbody.innerHTML = "";
  }

  const row = document.createElement("tr");

  row.innerHTML = `
    <td>${escapeHtml(new Date().toLocaleString("th-TH"))}</td>
    <td>${escapeHtml(type)}</td>
    <td>${escapeHtml(message)}</td>
  `;

  tbody.prepend(row);
}

function renderEmptyTable(tbodyId, colspan, message) {
  const tbody = document.getElementById(tbodyId);

  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="${colspan}" class="tb-empty">
        ${escapeHtml(message)}
      </td>
    </tr>
  `;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function getValue(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function showAlert(message) {
  const box = document.getElementById("alert-box");

  if (!box) return;

  box.textContent = message;
  box.hidden = false;
}

function hideAlert() {
  const box = document.getElementById("alert-box");

  if (box) {
    box.hidden = true;
  }
}

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatDate(value) {
  if (!value) return "-";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return value;
  }

  return d.toLocaleString("th-TH");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* =========================================================
   GLOBAL
========================================================= */

window.loadAdminPanel = loadAll;
window.logout = logout;