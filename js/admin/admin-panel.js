/* =========================================================
   ADMIN PANEL - DAILY WASTE REPORTS
   Dashboard + Master Data + User / Role Management + QR
========================================================= */

const REPORT_TABLE = "daily_waste_reports";
const PROFILE_TABLE = "profiles";

/*
  MASTER_TABLES
  ---------------------------------------------------------
  โค้ดจะพยายามหาตารางที่มีอยู่จริงใน Supabase ให้เอง
  เช่น ถ้ามี master_machines ก็ใช้ master_machines
  ถ้าไม่มีแต่มี pvt_machines ก็ใช้ pvt_machines
*/
const MASTER_TABLES = {
  departments: ["master_departments", "pvt_departments"],
  machines: ["master_machines", "pvt_machines"],
  problems: ["master_problems", "pvt_problem_types"],
  shifts: ["master_shifts", "pvt_work_shifts"],
};

const LOGIN_PAGE = "/login.html";

const ROLE_OPTIONS = ["staff", "supervisor", "accounting", "management", "admin"];
const STATUS_OPTIONS = ["active", "inactive"];

/* =========================================================
   FALLBACK MASTER DATA
   ---------------------------------------------------------
   ถ้าฐานข้อมูลยังไม่มีตาราง Master Data
   ระบบจะแสดงรายการเริ่มต้นจากตรงนี้ก่อน
   เพื่อให้หน้า Admin ไม่ว่างและเข้าใจโครงสร้างได้ง่าย
========================================================= */

const DEFAULT_DEPARTMENTS = [
  { code: "BLOW", name: "เป่าถุง" },
  { code: "PIPE", name: "ท่อ" },
  { code: "SHEET", name: "ตัดผืน" },
  { code: "MONO", name: "โมโน" },
  { code: "TAPE", name: "เทป / สแลน" },
  { code: "CUTTING", name: "ตัดเจาะ" },
];

const DEFAULT_SHIFTS = [
  { name: "กะ A (กลางวัน)", time: "08:00 - 17:00" },
  { name: "กะ B (กลางคืน/OT)", time: "18:00 - 20:00" },
];

/* =========================================================
   DEPARTMENT QR CONFIG
========================================================= */

const DEPARTMENT_QR_LIST = [
  {
    name: "เป่าถุง",
    code: "BLOW",
    path: "/pages/department-form.html?dept=BLOW",
  },
  {
    name: "ท่อ",
    code: "PIPE",
    path: "/pages/department-form.html?dept=PIPE",
  },
  {
    name: "ตัดผืน",
    code: "SHEET",
    path: "/pages/department-form.html?dept=SHEET",
  },
];

/* =========================================================
   STATE
========================================================= */

const state = {
  supabase: null,
  reports: [],
  users: [],

  departmentTable: null,
  machineTable: null,
  problemTable: null,
  shiftTable: null,

  departments: [],
  machines: [],
  problems: [],
  shifts: [],
};

document.addEventListener("DOMContentLoaded", () => {
  if (!protectAdminPage()) return;
  initAdminPanel();
});

/* =========================================================
   AUTH
========================================================= */

function protectAdminPage() {
  const user = localStorage.getItem("activeUser");
  const role = String(localStorage.getItem("activeRole") || "").toLowerCase();

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

    localStorage.removeItem("loginType");
    localStorage.removeItem("activeUserId");
    localStorage.removeItem("activeUser");
    localStorage.removeItem("activeName");
    localStorage.removeItem("activeRole");
    localStorage.removeItem("activeDept");
    localStorage.removeItem("activeDeptName");

    sessionStorage.clear();
    window.location.href = LOGIN_PAGE;
  } catch (err) {
    console.error("Logout error:", err);
    alert("ออกจากระบบไม่สำเร็จ");
  }
}

/* =========================================================
   INIT
========================================================= */

async function initAdminPanel() {
  bindEvents();

  state.supabase = window.supabaseClient || window.supabase || null;

  if (!state.supabase) {
    showAlert("ไม่พบ Supabase Client กรุณาตรวจสอบไฟล์ /core/supabaseClient.js");
    setText("status-api", "เชื่อมต่อไม่ได้");
    addLog("ERROR", "ไม่พบ window.supabaseClient");
    renderEmptyTable("tb", 7, "ไม่พบ Supabase Client");
    return;
  }

  renderDepartmentQrList();

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

  document.getElementById("btn-add-dept")?.addEventListener("click", addDepartment);
  document.getElementById("btn-add-shift")?.addEventListener("click", addShift);
  document.getElementById("btn-add-machine")?.addEventListener("click", addMachine);
  document.getElementById("btn-add-problem")?.addEventListener("click", addProblem);
  document.getElementById("master-dept-filter")?.addEventListener("change", () => {
    renderMachines();
    renderProblems();
  });

  document.getElementById("btn-add-user")?.addEventListener("click", addUser);
  document.getElementById("user-search-input")?.addEventListener("input", renderUsers);
  document.getElementById("user-status-filter")?.addEventListener("change", renderUsers);

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
    await loadUsers();

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
  const department = await selectFirstAvailableTable(MASTER_TABLES.departments, "*", {
    orderColumn: "id",
    ascending: true,
    optional: true,
  });

  const machine = await selectFirstAvailableTable(MASTER_TABLES.machines, "*", {
    orderColumn: "id",
    ascending: true,
    optional: true,
  });

  const problem = await selectFirstAvailableTable(MASTER_TABLES.problems, "*", {
    orderColumn: "id",
    ascending: true,
    optional: true,
  });

  const shift = await selectFirstAvailableTable(MASTER_TABLES.shifts, "*", {
    orderColumn: "id",
    ascending: true,
    optional: true,
  });

  state.departmentTable = department.table;
  state.machineTable = machine.table;
  state.problemTable = problem.table;
  state.shiftTable = shift.table;

  state.departments = department.rows.length ? department.rows : DEFAULT_DEPARTMENTS;
  state.machines = machine.rows;
  state.problems = problem.rows;
  state.shifts = shift.rows.length ? shift.rows : DEFAULT_SHIFTS;

  renderDepartments();
  renderDepartmentFilter();
  renderShifts();
  renderMachines();
  renderProblems();
}

async function loadUsers() {
  const { data, error } = await state.supabase
    .from(PROFILE_TABLE)
    .select(`
      id,
      username,
      password,
      role,
      department,
      department_code,
      display_name,
      full_name,
      email,
      status,
      created_at
    `)
    .order("username", { ascending: true });

  if (error) {
    throw new Error(`โหลดข้อมูลผู้ใช้งานไม่สำเร็จ: ${error.message}`);
  }

  state.users = Array.isArray(data) ? data : [];
  renderUsers();
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
   REPORTS
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
      row.machine,
      row.problem_type,
      row.problem_detail,
      row.reason_detail,
      row.detail,
      row.corrective_action,
      row.forecast_note,
      row.note,
      row.reported_by,
      row.reporter_name,
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
          <td>${escapeHtml(formatDate(row.incident_datetime || row.report_date || row.date_time || row.created_at))}</td>
          <td>${escapeHtml(row.department || row.department_code || row.dept || "-")}</td>
          <td>${escapeHtml(row.machine_no || row.machine || "-")}</td>
          <td>${escapeHtml(row.problem_type || row.problem_detail || row.reason_detail || row.detail || "-")}</td>
          <td>${escapeHtml(formatWasteWeight(row))}</td>
          <td>${escapeHtml(row.reported_by || row.reporter_name || row.created_by || "-")}</td>
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
   MASTER DATA - DEPARTMENT
========================================================= */

async function addDepartment() {
  const code = getValue("dept-code-input").toUpperCase();
  const name = getValue("dept-name-input");

  if (!code || !name) {
    showAlert("กรุณากรอกรหัสแผนกและชื่อแผนก");
    return;
  }

  if (!state.departmentTable) {
    showAlert("ยังไม่พบตาราง master_departments หรือ pvt_departments ใน Supabase");
    return;
  }

  const payload = createDepartmentPayload(state.departmentTable, code, name);

  const { error } = await state.supabase.from(state.departmentTable).insert(payload);

  if (error) {
    showAlert(`เพิ่มแผนกไม่สำเร็จ: ${error.message}`);
    addLog("ERROR", error.message);
    return;
  }

  setValue("dept-code-input", "");
  setValue("dept-name-input", "");

  addLog("INFO", `เพิ่มแผนก ${code} - ${name}`);
  await loadMasters();
}

function createDepartmentPayload(table, code, name) {
  if (table === "master_departments") {
    return {
      department_code: code,
      department_name: name,
      is_active: true,
    };
  }

  if (table === "pvt_departments") {
    return {
      dept_code: code,
      dept_name: name,
    };
  }

  return { code, name };
}

function renderDepartments() {
  const list = document.getElementById("dept-list");
  if (!list) return;

  if (!state.departments.length) {
    list.innerHTML = `<li><span class="muted">ยังไม่มีข้อมูลแผนก</span></li>`;
    return;
  }

  list.innerHTML = state.departments
    .map((row) => {
      const code = getDeptCode(row);
      const name = getDeptName(row);
      const id = row.id;

      return `
        <li>
          <span>
            <strong>${escapeHtml(code)}</strong>
            <small>${escapeHtml(name)}</small>
          </span>
          ${
            id && state.departmentTable
              ? `<button type="button" onclick="deleteDepartment('${escapeAttr(id)}')">ลบ</button>`
              : `<small class="muted">ค่าเริ่มต้น</small>`
          }
        </li>
      `;
    })
    .join("");
}

function renderDepartmentFilter() {
  const select = document.getElementById("master-dept-filter");
  if (!select) return;

  const current = select.value;

  const options = state.departments
    .map((dept) => {
      const code = getDeptCode(dept);
      const name = getDeptName(dept);
      return `<option value="${escapeAttr(code)}">${escapeHtml(name)} (${escapeHtml(code)})</option>`;
    })
    .join("");

  select.innerHTML = `<option value="">-- เลือกแผนก --</option>${options}`;

  if (current) {
    select.value = current;
  }
}

async function deleteDepartment(id) {
  await deleteMasterItem(state.departmentTable, id, loadMasters);
}

/* =========================================================
   MASTER DATA - SHIFT
========================================================= */

async function addShift() {
  const name = getValue("shift-name-input");
  const time = getValue("shift-time-input");

  if (!name) {
    showAlert("กรุณากรอกชื่อกะ");
    return;
  }

  if (!state.shiftTable) {
    showAlert("ยังไม่พบตาราง master_shifts หรือ pvt_work_shifts ใน Supabase");
    return;
  }

  const payload = createShiftPayload(state.shiftTable, name, time);

  const { error } = await state.supabase.from(state.shiftTable).insert(payload);

  if (error) {
    showAlert(`เพิ่มกะไม่สำเร็จ: ${error.message}`);
    addLog("ERROR", error.message);
    return;
  }

  setValue("shift-name-input", "");
  setValue("shift-time-input", "");

  addLog("INFO", `เพิ่มกะ: ${name}`);
  await loadMasters();
}

function createShiftPayload(table, name, time) {
  if (table === "master_shifts") {
    return {
      shift_name: name,
      shift_time: time,
      is_active: true,
    };
  }

  if (table === "pvt_work_shifts") {
    return {
      shift_name: name,
      shift_time: time,
    };
  }

  return { name, time };
}

function renderShifts() {
  const list = document.getElementById("shift-list");
  if (!list) return;

  if (!state.shifts.length) {
    list.innerHTML = `<li><span class="muted">ยังไม่มีข้อมูลกะ</span></li>`;
    return;
  }

  list.innerHTML = state.shifts
    .map((row) => {
      const name = row.shift_name || row.name || "-";
      const time = row.shift_time || row.time || "";
      const id = row.id;

      return `
        <li>
          <span>
            <strong>${escapeHtml(name)}</strong>
            ${time ? `<small>${escapeHtml(time)}</small>` : ""}
          </span>
          ${
            id && state.shiftTable
              ? `<button type="button" onclick="deleteShift('${escapeAttr(id)}')">ลบ</button>`
              : `<small class="muted">ค่าเริ่มต้น</small>`
          }
        </li>
      `;
    })
    .join("");
}

async function deleteShift(id) {
  await deleteMasterItem(state.shiftTable, id, loadMasters);
}

/* =========================================================
   MASTER DATA - MACHINES / PROBLEMS
========================================================= */

async function addMachine() {
  await addDepartmentMasterItem({
    inputId: "machine-input",
    type: "machine",
    currentTable: state.machineTable,
    tableList: MASTER_TABLES.machines,
    reloadFn: loadMasters,
  });
}

async function addProblem() {
  await addDepartmentMasterItem({
    inputId: "problem-input",
    type: "problem",
    currentTable: state.problemTable,
    tableList: MASTER_TABLES.problems,
    reloadFn: loadMasters,
  });
}

async function addDepartmentMasterItem({ inputId, type, currentTable, tableList, reloadFn }) {
  const input = document.getElementById(inputId);
  const name = input?.value.trim();
  const department = getValue("master-dept-filter");

  if (!department) {
    showAlert("กรุณาเลือกแผนกก่อนเพิ่มข้อมูล");
    return;
  }

  if (!name) {
    showAlert("กรุณากรอกข้อมูลก่อนกดเพิ่ม");
    return;
  }

  let table = currentTable;

  if (!table) {
    const found = await selectFirstAvailableTable(tableList, "*", {
      optional: true,
    });
    table = found.table;
  }

  if (!table) {
    showAlert(`ยังไม่พบตารางสำหรับ ${type}`);
    return;
  }

  const payload =
    type === "machine"
      ? createMachinePayload(table, name, department)
      : createProblemPayload(table, name, department);

  const { error } = await state.supabase.from(table).insert(payload);

  if (error) {
    showAlert(`เพิ่มข้อมูลไม่สำเร็จ: ${error.message}`);
    addLog("ERROR", error.message);
    return;
  }

  input.value = "";
  addLog("INFO", `เพิ่ม ${type}: ${name} / ${department}`);
  await reloadFn();
}

function createMachinePayload(table, name, department) {
  if (table === "master_machines") {
    return {
      machine_no: name,
      department,
      department_code: department,
      is_active: true,
    };
  }

  if (table === "pvt_machines") {
    return {
      machine_name: name,
      department,
      department_code: department,
    };
  }

  return { name, department };
}

function createProblemPayload(table, name, department) {
  if (table === "master_problems") {
    return {
      problem_type: name,
      department,
      department_code: department,
      is_active: true,
    };
  }

  if (table === "pvt_problem_types") {
    return {
      problem_name: name,
      department,
      department_code: department,
    };
  }

  return { name, department };
}

function renderMachines() {
  renderDepartmentFilteredList("machine-list", state.machines, deleteMachine, "machine");
}

function renderProblems() {
  renderDepartmentFilteredList("problem-list", state.problems, deleteProblem, "problem");
}

function renderDepartmentFilteredList(elementId, rows, onDelete, type) {
  const list = document.getElementById(elementId);
  if (!list) return;

  const selectedDept = getValue("master-dept-filter");

  if (!selectedDept) {
    list.innerHTML = `<li><span class="muted">กรุณาเลือกแผนกก่อน</span></li>`;
    return;
  }

  const filtered = rows.filter((row) => {
    const dept = row.department_code || row.department || row.dept || "";
    return normalizeDept(dept) === normalizeDept(selectedDept);
  });

  if (!filtered.length) {
    list.innerHTML = `<li><span class="muted">ยังไม่มีข้อมูลในแผนกนี้</span></li>`;
    return;
  }

  list.innerHTML = "";

  filtered.forEach((row) => {
    const li = document.createElement("li");

    const name =
      row.name ||
      row.machine_no ||
      row.machine_name ||
      row.problem_type ||
      row.problem_name ||
      row.reason_name ||
      "-";

    const department = row.department_code || row.department || row.dept || selectedDept;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "ลบ";
    btn.addEventListener("click", () => onDelete(row.id));

    li.innerHTML = `
      <span>
        <strong>${escapeHtml(name)}</strong>
        <small>${escapeHtml(department)} / ${escapeHtml(type)}</small>
      </span>
    `;

    li.appendChild(btn);
    list.appendChild(li);
  });
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

  addLog("INFO", `ลบข้อมูลจาก ${table} สำเร็จ`);
  await reloadFn();
}

/* =========================================================
   USER / ROLE MANAGEMENT
========================================================= */

function renderUsers() {
  const tbody = document.getElementById("user-table-body");
  if (!tbody) return;

  const keyword = getValue("user-search-input").toLowerCase();
  const statusFilter = getValue("user-status-filter") || "all";

  const rows = state.users.filter((user) => {
    const status = String(user.status || "active").toLowerCase();

    const text = [
      user.username,
      user.display_name,
      user.full_name,
      user.department,
      user.department_code,
      user.email,
      user.role,
      user.status,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchKeyword = !keyword || text.includes(keyword);
    const matchStatus = statusFilter === "all" || status === statusFilter;

    return matchKeyword && matchStatus;
  });

  if (!rows.length) {
    renderEmptyTable("user-table-body", 6, "ไม่พบข้อมูลผู้ใช้งาน");
    return;
  }

  tbody.innerHTML = rows
    .map((user) => {
      const userId = escapeHtml(user.id);
      const username = escapeHtml(user.username || "-");
      const displayName = escapeHtml(user.display_name || user.full_name || "-");
      const department = escapeHtml(user.department || user.department_code || "-");
      const role = String(user.role || "staff").toLowerCase();
      const status = String(user.status || "active").toLowerCase();

      return `
        <tr>
          <td><strong>${username}</strong></td>
          <td>${displayName}</td>
          <td>${department}</td>
          <td>
            <select data-user-role="${userId}" onchange="updateUserRole('${userId}', this.value)">
              ${ROLE_OPTIONS.map((r) => `
                <option value="${r}" ${r === role ? "selected" : ""}>${r}</option>
              `).join("")}
            </select>
          </td>
          <td>
            <select data-user-status="${userId}" onchange="updateUserStatus('${userId}', this.value)">
              ${STATUS_OPTIONS.map((s) => `
                <option value="${s}" ${s === status ? "selected" : ""}>${s}</option>
              `).join("")}
            </select>
          </td>
          <td>
            <button type="button" onclick="deleteUser('${userId}')">ลบ</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

async function addUser() {
  const username = getValue("user-username").toUpperCase();
  const password = getValue("user-password");
  const displayName = getValue("user-display-name");
  const department = getValue("user-department").toUpperCase();
  const role = getValue("user-role") || "staff";

  if (!username || !password) {
    showAlert("กรุณากรอก Username และ Password");
    return;
  }

  const exists = state.users.some((u) => {
    return String(u.username || "").toUpperCase() === username;
  });

  if (exists) {
    showAlert(`Username ${username} มีอยู่แล้ว`);
    return;
  }

  const payload = {
    id: createUuid(),
    username,
    password,
    role,
    status: "active",
    display_name: displayName || username,
    full_name: displayName || username,
    department: department || "",
    department_code: department || "",
    email: `${username.toLowerCase()}@pvt.local`,
  };

  const { error } = await state.supabase.from(PROFILE_TABLE).insert(payload);

  if (error) {
    showAlert(`เพิ่ม User ไม่สำเร็จ: ${error.message}`);
    addLog("ERROR", error.message);
    return;
  }

  clearUserForm();
  addLog("INFO", `เพิ่ม User: ${username}`);
  await loadUsers();
}

async function updateUserRole(userId, role) {
  if (!userId || !role) return;

  const { error } = await state.supabase
    .from(PROFILE_TABLE)
    .update({ role })
    .eq("id", userId);

  if (error) {
    showAlert(`เปลี่ยน Role ไม่สำเร็จ: ${error.message}`);
    addLog("ERROR", error.message);
    await loadUsers();
    return;
  }

  addLog("INFO", `เปลี่ยน Role สำเร็จ`);
  await loadUsers();
}

async function updateUserStatus(userId, status) {
  if (!userId || !status) return;

  const { error } = await state.supabase
    .from(PROFILE_TABLE)
    .update({ status })
    .eq("id", userId);

  if (error) {
    showAlert(`เปลี่ยน Status ไม่สำเร็จ: ${error.message}`);
    addLog("ERROR", error.message);
    await loadUsers();
    return;
  }

  addLog("INFO", `เปลี่ยน Status สำเร็จ`);
  await loadUsers();
}

async function deleteUser(userId) {
  if (!userId) return;

  const currentUserId = localStorage.getItem("activeUserId");

  if (userId === currentUserId) {
    showAlert("ไม่สามารถลบ User ที่กำลัง Login อยู่ได้");
    return;
  }

  const ok = confirm("ต้องการลบ User นี้ใช่ไหม?");
  if (!ok) return;

  const { error } = await state.supabase
    .from(PROFILE_TABLE)
    .delete()
    .eq("id", userId);

  if (error) {
    showAlert(`ลบ User ไม่สำเร็จ: ${error.message}`);
    addLog("ERROR", error.message);
    return;
  }

  addLog("INFO", "ลบ User สำเร็จ");
  await loadUsers();
}

function clearUserForm() {
  setValue("user-username", "");
  setValue("user-password", "");
  setValue("user-display-name", "");
  setValue("user-department", "");
  setValue("user-role", "staff");
}

/* =========================================================
   DEPARTMENT QR MANAGEMENT
========================================================= */

function renderDepartmentQrList() {
  const box = document.getElementById("department-qr-list");
  if (!box) return;

  const origin = window.location.origin;

  box.innerHTML = DEPARTMENT_QR_LIST.map((dept) => {
    const fullUrl = `${origin}${dept.path}`;

    return `
      <article class="qr-dept-card">
        <div class="qr-dept-info">
          <strong>${escapeHtml(dept.name)} (${escapeHtml(dept.code)})</strong>
          <small>${escapeHtml(fullUrl)}</small>
        </div>

        <div class="qr-dept-actions">
          <button
            class="btn btn-secondary"
            type="button"
            onclick="copyDepartmentLink('${escapeAttr(fullUrl)}')"
          >
            คัดลอกลิงก์
          </button>

          <button
            class="btn btn-primary"
            type="button"
            onclick="openDepartmentQr('${escapeAttr(fullUrl)}')"
          >
            สร้าง QR
          </button>
        </div>
      </article>
    `;
  }).join("");
}

async function copyDepartmentLink(url) {
  if (!url) return;

  try {
    await navigator.clipboard.writeText(url);
    alert("คัดลอกลิงก์แล้วค่ะ");
    addLog("INFO", `คัดลอกลิงก์ QR: ${url}`);
  } catch (err) {
    prompt("คัดลอกลิงก์นี้:", url);
  }
}

function openDepartmentQr(url) {
  if (!url) return;

  const qrUrl =
    "https://quickchart.io/qr?size=500&text=" + encodeURIComponent(url);

  window.open(qrUrl, "_blank", "noopener,noreferrer");
  addLog("INFO", `เปิด QR Code: ${url}`);
}

/* =========================================================
   HELPERS
========================================================= */

function getDeptCode(row) {
  return String(row.department_code || row.dept_code || row.code || "").toUpperCase();
}

function getDeptName(row) {
  return row.department_name || row.dept_name || row.name || getDeptCode(row);
}

function normalizeDept(value) {
  return String(value || "").trim().toUpperCase();
}

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

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function showAlert(message) {
  const box = document.getElementById("alert-box");
  if (!box) return;

  box.textContent = message;
  box.hidden = false;
}

function hideAlert() {
  const box = document.getElementById("alert-box");
  if (box) box.hidden = true;
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

function escapeAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createUuid() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* =========================================================
   GLOBAL
========================================================= */

window.loadAdminPanel = loadAll;
window.logout = logout;

window.updateUserRole = updateUserRole;
window.updateUserStatus = updateUserStatus;
window.deleteUser = deleteUser;

window.deleteDepartment = deleteDepartment;
window.deleteShift = deleteShift;
window.deleteMachine = deleteMachine;
window.deleteProblem = deleteProblem;

window.copyDepartmentLink = copyDepartmentLink;
window.openDepartmentQr = openDepartmentQr;
