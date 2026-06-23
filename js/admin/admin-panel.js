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

const ROLE_OPTIONS = [
  "staff",
  "supervisor",
  "accounting",
  "management",
  "admin",
];
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

  const activeUserId =
    localStorage.getItem("activeUserId");

  if (!activeUserId) {
    window.location.href = LOGIN_PAGE;
    return false;
  }

  return true;
}

// =========================================================
// LOGOUT
// =========================================================

async function logout() {

  // แสดง Popup ยืนยัน
  const ok = await showConfirm(
    "ต้องการออกจากระบบใช่ไหม?",
    "ออกจากระบบ"
  );

  // ถ้ากดยกเลิก
  if (!ok) return;

  try {

    // Logout Supabase
    if (window.supabaseClient?.auth) {
      await window.supabaseClient.auth.signOut();
    }

    // ล้างข้อมูล Login
    localStorage.removeItem("loginType");
    localStorage.removeItem("activeUserId");
    localStorage.removeItem("activeUser");
    localStorage.removeItem("activeName");
    localStorage.removeItem("activeRole");
    localStorage.removeItem("activeDept");
    localStorage.removeItem("activeDeptName");

    sessionStorage.clear();

    // กลับหน้า Login
    window.location.href = LOGIN_PAGE;

  } catch (err) {

    console.error(err);

    showAlert(
      "ออกจากระบบไม่สำเร็จ"
    );
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

  await loadUsers();

  const currentUserId = localStorage.getItem("activeUserId");

  const currentUser = state.users.find((user) => {
    return String(user.id) === String(currentUserId);
  });

  if (!currentUser?.is_system_owner) {
    alert("คุณไม่มีสิทธิ์เข้าใช้งานหน้า Admin Panel");
    window.location.href = "/index.html";
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

  document
    .getElementById("search-input")
    ?.addEventListener("input", renderReports);
  document
    .getElementById("status-filter")
    ?.addEventListener("change", renderReports);

  document
    .getElementById("btn-add-dept")
    ?.addEventListener("click", addDepartment);
  document.getElementById("btn-add-shift")?.addEventListener("click", addShift);
  document
    .getElementById("btn-add-machine")
    ?.addEventListener("click", addMachine);
  document
    .getElementById("btn-add-problem")
    ?.addEventListener("click", addProblem);
  document
    .getElementById("master-dept-filter")
    ?.addEventListener("change", () => {
      renderMachines();
      renderProblems();
    });

  document.getElementById("btn-add-user")?.addEventListener("click", addUser);
  document
    .getElementById("user-search-input")
    ?.addEventListener("input", renderUsers);
  document
    .getElementById("user-status-filter")
    ?.addEventListener("change", renderUsers);

  document.getElementById("btnLogout")?.addEventListener("click", logout);
  document.getElementById("btn-logout")?.addEventListener("click", logout);

  document
    .getElementById("btn-close-edit-user")
    ?.addEventListener("click", closeEditUserModal);

  document
    .getElementById("btn-cancel-edit-user")
    ?.addEventListener("click", closeEditUserModal);

  document
    .getElementById("btn-save-edit-user")
    ?.addEventListener("click", saveEditUser);

  document
    .getElementById("edit-user-modal")
    ?.addEventListener("click", (event) => {
      if (event.target.id === "edit-user-modal") {
        closeEditUserModal();
      }
    });

  /*
    QR รายเครื่อง
    -------------------------------------------------------
    ใช้สำหรับหน้า Admin เท่านั้น
    - เมื่อเลือกแผนก ระบบจะแสดงเครื่องจักรของแผนกนั้น
    - Admin สามารถคัดลอกลิงก์ / เปิด QR / พิมพ์ QR ทั้งแผนกได้
  */
  document
    .getElementById("machine-qr-dept-filter")
    ?.addEventListener("change", renderMachineQrList);

  document
    .getElementById("btn-print-machine-qr")
    ?.addEventListener("click", printMachineQrByDepartment);

  document
    .getElementById("btn-refresh-machine-qr")
    ?.addEventListener("click", renderMachineQrList);
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
  if (section === "activity-logs") {
  loadActivityLogs();
}
}

/* =========================================================
   LOAD DATA
========================================================= */

async function loadAll() {
  hideAlert();

  LoadingService?.show(
    "กำลังโหลดข้อมูล",
    "ระบบกำลังดึงข้อมูลล่าสุด"
  );

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
    setText(
      "last-update",
      `อัปเดตล่าสุด: ${new Date().toLocaleString("th-TH")}`,
    );

    addLog("INFO", "โหลดข้อมูลสำเร็จ");
  } catch (err) {
    console.error(err);
    setText("status-api", "พบข้อผิดพลาด");
    setText("status-latency", "-- ms");
    showAlert(err.message || String(err));
    addLog("ERROR", err.message || String(err));
  } finally {
    LoadingService?.hide();

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
  const department = await selectFirstAvailableTable(
    MASTER_TABLES.departments,
    "*",
    {
      orderColumn: "sort_order",
      ascending: true,
      optional: true,
    },
  );

  const machine = await selectFirstAvailableTable(MASTER_TABLES.machines, "*", {
    orderColumn: "sort_order",
    ascending: true,
    optional: true,
  });

  const problem = await selectFirstAvailableTable(MASTER_TABLES.problems, "*", {
    orderColumn: "sort_order",
    ascending: true,
    optional: true,
  });

  const shift = await selectFirstAvailableTable(MASTER_TABLES.shifts, "*", {
    orderColumn: "sort_order",
    ascending: true,
    optional: true,
  });

  state.departmentTable = department.table;
  state.machineTable = machine.table;
  state.problemTable = problem.table;
  state.shiftTable = shift.table;

  state.departments = department.rows.length
    ? department.rows
    : DEFAULT_DEPARTMENTS;
  state.machines = machine.rows;
  state.problems = problem.rows;
  state.shifts = shift.rows.length ? shift.rows : DEFAULT_SHIFTS;

  renderDepartments();
  renderDepartmentFilter();
  renderUserDepartmentOptions();
  renderShifts();
  renderMachines();
  renderProblems();

  /*
    หลังจากโหลด Master Data เสร็จ
    ให้รีเฟรชตัวเลือกและรายการ QR รายเครื่องด้วย
    เพื่อให้หน้า QR ใช้ข้อมูลเครื่องจักรชุดเดียวกับหน้า Master Data
  */
  renderMachineQrDepartmentOptions();
  renderDepartmentQrList();
  renderMachineQrList();
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
  is_system_owner,
  created_at
`)
    .order("username", { ascending: true });

  if (error) {
    throw new Error(`โหลดข้อมูลผู้ใช้งานไม่สำเร็จ: ${error.message}`);
  }

  state.users = Array.isArray(data) ? data : [];
  renderUsers();
}

async function selectFirstAvailableTable(
  tableNames,
  columns = "*",
  options = {},
) {
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

      // ถ้าตารางสำรองยังไม่มี sort_order ให้ลองโหลดแบบไม่เรียงลำดับอีกครั้ง
      if (options.orderColumn === "sort_order") {
        const retry = await state.supabase.from(table).select(columns);
        if (!retry.error) {
          return {
            table,
            rows: sortRowsByOrder(Array.isArray(retry.data) ? retry.data : []),
          };
        }
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
    `ไม่พบตารางข้อมูลที่ใช้งานได้: ${tableNames.join(" / ")} (${lastError?.message || "unknown error"})`,
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
          <td>
  ${escapeHtml(
    getDepartmentName(row.department || row.department_code || row.dept),
  )}
</td>
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
    }),
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
    showAlert(
      "ยังไม่พบตาราง master_departments หรือ pvt_departments ใน Supabase",
    );
    return;
  }

  const payload = createDepartmentPayload(state.departmentTable, code, name);

  const { error } = await state.supabase
    .from(state.departmentTable)
    .insert(payload);

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
      sort_order: getNextSortOrder(state.departments),
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
    list.innerHTML =
      `<li><span class="muted">ยังไม่มีข้อมูลแผนก</span></li>`;
    return;
  }

  list.innerHTML = state.departments
    .map((row) => {
      const code = getDeptCode(row);
      const name = getDeptName(row);
      const id = row.id;
      const sortOrder = row.sort_order || 0;

      return `
        <li class="master-item">
          <span>
            <strong>${escapeHtml(code)}</strong>
            <small>${escapeHtml(name)}</small>
            <small class="muted">
              ลำดับ : ${sortOrder}
            </small>
          </span>

          ${
            id && state.departmentTable
              ? `
                <div class="master-actions">

                  <button
                    type="button"
                    class="btn btn-secondary"
                    onclick="editDepartment('${escapeAttr(id)}')"
                  >
                    <span class="material-symbols-outlined">edit</span>
                  </button>

                  <button
                    type="button"
                    class="btn btn-warning"
                    onclick="editDepartmentOrder('${escapeAttr(id)}', ${sortOrder})"
                  >
                    <span class="material-symbols-outlined">sort</span>
                  </button>

                  <button
                    type="button"
                    class="btn btn-danger"
                    onclick="deleteDepartment('${escapeAttr(id)}')"
                  >
                    <span class="material-symbols-outlined">delete</span>
                  </button>

                </div>
              `
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

function renderUserDepartmentOptions() {
  const selectIds = ["user-department", "edit-department"];

  selectIds.forEach((id) => {
    const select = document.getElementById(id);
    if (!select || select.tagName !== "SELECT") return;

    const currentValue = normalizeDept(select.value);

    const options = state.departments
      .map((dept) => {
        const code = getDeptCode(dept);
        const name = getDeptName(dept);
        return `<option value="${escapeAttr(code)}">${escapeHtml(name)} (${escapeHtml(code)})</option>`;
      })
      .join("");

    select.innerHTML = `<option value="">-- เลือกแผนก --</option>${options}`;

    if (currentValue) {
      select.value = currentValue;
    }
  });
}

async function deleteDepartment(id) {
  await deleteMasterItem(state.departmentTable, id, loadMasters);
}



async function editDepartment(id) {
  const row = state.departments.find(
    (item) => String(item.id) === String(id)
  );

  if (!row) return;

  const currentCode = getDeptCode(row);
  const currentName = getDeptName(row);

  const newCode = prompt(
    "รหัสแผนก",
    currentCode
  );

  if (newCode === null) return;

  const newName = prompt(
    "ชื่อแผนก",
    currentName
  );

  if (newName === null) return;

  const { error } = await state.supabase
    .from(state.departmentTable)
    .update({
      department_code: newCode.trim().toUpperCase(),
      department_name: newName.trim(),
    })
    .eq("id", id);

  if (error) {
    showAlert(error.message);
    return;
  }

  await loadMasters();
}

async function editDepartmentOrder(
  id,
  currentOrder
) {
  const value = prompt(
    "ลำดับการแสดงผล",
    currentOrder || 0
  );

  if (value === null) return;

  const order = Number(value);

  if (!Number.isFinite(order)) {
    alert("กรุณาใส่ตัวเลข");
    return;
  }

  const { error } = await state.supabase
    .from(state.departmentTable)
    .update({
      sort_order: order,
    })
    .eq("id", id);

  if (error) {
    showAlert(error.message);
    return;
  }

  await loadMasters();
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
      sort_order: getNextSortOrder(state.shifts),
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

  list.innerHTML = sortRowsByOrder(state.shifts)
    .map((row) => {
      const name = row.shift_name || row.name || "-";
      const time = row.shift_time || row.time || "";
      const id = row.id;
      const sortOrder = row.sort_order || 0;

      return `
        <li class="master-item">
          <span>
            <strong>${escapeHtml(name)}</strong>
            ${time ? `<small>${escapeHtml(time)}</small>` : ""}
            <small class="muted">ลำดับ : ${sortOrder}</small>
          </span>

          ${
            id && state.shiftTable
              ? `
                <div class="master-actions">
                  <button type="button" class="btn btn-secondary" onclick="editShift('${escapeAttr(id)}')">
                    <span class="material-symbols-outlined">edit</span>
                  </button>
                  <button type="button" class="btn btn-warning" onclick="editShiftOrder('${escapeAttr(id)}', ${sortOrder})">
                    <span class="material-symbols-outlined">sort</span>
                  </button>
                  <button type="button" class="btn btn-danger" onclick="deleteShift('${escapeAttr(id)}')">
                    <span class="material-symbols-outlined">delete</span>
                  </button>
                </div>
              `
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

async function editShift(id) {
  const row = state.shifts.find((item) => String(item.id) === String(id));
  if (!row || !state.shiftTable) return;

  const currentName = row.shift_name || row.name || "";
  const currentTime = row.shift_time || row.time || "";

  const newName = prompt("ชื่อกะ", currentName);
  if (newName === null) return;
  if (!newName.trim()) {
    showAlert("กรุณากรอกชื่อกะ");
    return;
  }

  const newTime = prompt("เวลา / หมายเหตุ (ไม่บังคับ)", currentTime);
  if (newTime === null) return;

  const payload =
    state.shiftTable === "master_shifts"
      ? { shift_name: newName.trim(), shift_time: newTime.trim() }
      : { shift_name: newName.trim(), shift_time: newTime.trim() };

  await updateMasterItem(state.shiftTable, id, payload, loadMasters);
}

async function editShiftOrder(id, currentOrder) {
  if (!state.shiftTable) return;
  await editSortOrder(state.shiftTable, id, currentOrder, loadMasters);
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

async function addDepartmentMasterItem({
  inputId,
  type,
  currentTable,
  tableList,
  reloadFn,
}) {
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

  if (table?.startsWith("master_")) {
    const sourceRows = type === "machine" ? state.machines : state.problems;
    payload.sort_order = getNextSortOrder(
      sourceRows.filter((row) => {
        const dept = row.department_code || row.department || row.dept || "";
        return normalizeDept(dept) === normalizeDept(department);
      }),
    );
  }

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
  renderDepartmentFilteredList(
    "machine-list",
    state.machines,
    deleteMachine,
    "machine",
  );
}

function renderProblems() {
  renderDepartmentFilteredList(
    "problem-list",
    state.problems,
    deleteProblem,
    "problem",
  );
}

function renderDepartmentFilteredList(elementId, rows, onDelete, type) {
  const list = document.getElementById(elementId);
  if (!list) return;

  const selectedDept = getValue("master-dept-filter");

  if (!selectedDept) {
    list.innerHTML = `<li><span class="muted">กรุณาเลือกแผนกก่อน</span></li>`;
    return;
  }

  const filtered = sortRowsByOrder(
    rows.filter((row) => {
      const dept = row.department_code || row.department || row.dept || "";
      return normalizeDept(dept) === normalizeDept(selectedDept);
    }),
  );

  if (!filtered.length) {
    list.innerHTML = `<li><span class="muted">ยังไม่มีข้อมูลในแผนกนี้</span></li>`;
    return;
  }

  list.innerHTML = "";

  filtered.forEach((row) => {
    const li = document.createElement("li");
    li.className = "master-item";

    const name = getMasterItemName(row, type);
    const department = row.department_code || row.department || row.dept || selectedDept;
    const sortOrder = row.sort_order || 0;

    const info = document.createElement("span");
    info.innerHTML = `
      <strong>${escapeHtml(name)}</strong>
      <small>${escapeHtml(getDepartmentName(department))} (${escapeHtml(normalizeDept(department))})</small>
      <small class="muted">ลำดับ : ${escapeHtml(sortOrder)}</small>
    `;

    const actions = document.createElement("div");
    actions.className = "master-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-secondary";
    editBtn.innerHTML = '<span class="material-symbols-outlined">edit</span>';
    editBtn.title = "แก้ไขชื่อ";
    editBtn.addEventListener("click", () => editMasterName(row, type));

    const orderBtn = document.createElement("button");
    orderBtn.type = "button";
    orderBtn.className = "btn btn-warning";
    orderBtn.innerHTML = '<span class="material-symbols-outlined">sort</span>';
    orderBtn.title = "แก้ไขลำดับ";
    orderBtn.addEventListener("click", () => editMasterOrder(row, type));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-danger";
    deleteBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
    deleteBtn.title = "ลบ";
    deleteBtn.addEventListener("click", () => onDelete(row.id));

    actions.appendChild(editBtn);
    actions.appendChild(orderBtn);

    /*
      ปุ่ม QR แสดงเฉพาะรายการเครื่องจักร
      เพื่อให้ Admin เปิด QR ของเครื่องนั้นได้ทันทีจากหน้า Master Data
    */
    if (type === "machine") {
      const qrBtn = document.createElement("button");
      qrBtn.type = "button";
      qrBtn.className = "btn btn-primary";
      qrBtn.innerHTML = '<span class="material-symbols-outlined">qr_code</span> QR';
      qrBtn.title = "สร้าง QR เครื่องนี้";
      qrBtn.addEventListener("click", () => {
        openMachineQrByRow(row);
      });
      actions.appendChild(qrBtn);
    }

    actions.appendChild(deleteBtn);

    li.appendChild(info);
    li.appendChild(actions);
    list.appendChild(li);
  });
}

function getMasterItemName(row, type) {
  if (type === "machine") {
    return row.machine_no || row.machine_name || row.name || "-";
  }

  if (type === "problem") {
    return row.problem_type || row.problem_name || row.reason_name || row.name || "-";
  }

  return row.name || "-";
}

function getMasterNameColumn(table, type) {
  if (type === "machine") {
    if (table === "master_machines") return "machine_no";
    if (table === "pvt_machines") return "machine_name";
  }

  if (type === "problem") {
    if (table === "master_problems") return "problem_type";
    if (table === "pvt_problem_types") return "problem_name";
  }

  return "name";
}

function getMasterTableByType(type) {
  return type === "machine" ? state.machineTable : state.problemTable;
}

async function editMasterName(row, type) {
  const table = getMasterTableByType(type);
  const column = getMasterNameColumn(table, type);

  if (!table || !row?.id) return;

  const currentName = getMasterItemName(row, type);
  const label = type === "machine" ? "ชื่อเครื่องจักร" : "ชื่ออาการเสีย";

  const newName = prompt(label, currentName);

  if (newName === null) return;

  if (!newName.trim()) {
    showAlert(`กรุณากรอก${label}`);
    return;
  }

  await updateMasterItem(table, row.id, { [column]: newName.trim() }, loadMasters);
}

async function editMasterOrder(row, type) {
  const table = getMasterTableByType(type);

  if (!table || !row?.id) return;

  await editSortOrder(table, row.id, row.sort_order || 0, loadMasters);
}

async function deleteMachine(id) {
  await deleteMasterItem(state.machineTable, id, loadMasters);
}

async function deleteProblem(id) {
  await deleteMasterItem(state.problemTable, id, loadMasters);
}

async function deleteMasterItem(table, id, reloadFn) {
  if (!table || !id) return;

 

  const ok = await showConfirm(
  "ต้องการลบรายการนี้ใช่ไหม?",
  "ลบข้อมูล"
);

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
      const displayName = escapeHtml(
        user.display_name || user.full_name || "-",
      );
      const department = escapeHtml(
        getDepartmentName(user.department || user.department_code),
      );
      const role = String(user.role || "staff").toLowerCase();
      const status = String(user.status || "active").toLowerCase();

      return `
        <tr>
          <td><strong>${username}</strong></td>
          <td>${displayName}</td>
          <td>${department}</td>
          <td>
            <select data-user-role="${userId}" onchange="updateUserRole('${userId}', this.value)">
              ${ROLE_OPTIONS.map(
                (r) => `
                <option value="${r}" ${r === role ? "selected" : ""}>${r}</option>
              `,
              ).join("")}
            </select>
          </td>
          <td>
            <select data-user-status="${userId}" onchange="updateUserStatus('${userId}', this.value)">
              ${STATUS_OPTIONS.map(
                (s) => `
                <option value="${s}" ${s === status ? "selected" : ""}>${s}</option>
              `,
              ).join("")}
            </select>
          </td>
         <td class="action-buttons">
        <button
  type="button"
  class="btn btn-warning"
  onclick="openEditUserModal('${userId}')"
>
  <span class="material-symbols-outlined">edit</span> แก้ไข
</button>

        <button
          type="button"
          class="btn btn-danger"
          onclick="deleteUser('${userId}')"
        >
          <span class="material-symbols-outlined">delete</span> ลบ
        </button>
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

  const { data: duplicateUsers, error: duplicateError } = await state.supabase
    .from(PROFILE_TABLE)
    .select("id")
    .ilike("username", username)
    .limit(1);

  if (duplicateError) {
    showAlert(`ตรวจสอบ Username ไม่สำเร็จ: ${duplicateError.message}`);
    addLog("ERROR", duplicateError.message);
    return;
  }

  if (duplicateUsers?.length) {
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

  const ok = await showConfirm(
  "ต้องการลบ User นี้ใช่ไหม?",
  "ลบผู้ใช้งาน"
);

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

async function editUser(userId) {
  const user = state.users.find((u) => u.id === userId);

  if (!user) {
    alert("ไม่พบข้อมูลผู้ใช้งาน");
    return;
  }

  const displayName = prompt("ชื่อแสดงผล", user.display_name || "");

  if (displayName === null) return;

  const department = prompt(
    "แผนก",
    user.department || user.department_code || "",
  );

  if (department === null) return;

  const role = prompt(
    "Role (staff/supervisor/accounting/management/admin)",
    user.role || "staff",
  );

  if (role === null) return;

  const password = prompt("Password ใหม่ (เว้นว่างหากไม่เปลี่ยน)", "");

  const payload = {
    display_name: displayName,
    full_name: displayName,
    department,
    department_code: department,
    role,
  };

  if (password.trim()) {
    payload.password = password.trim();
  }

  const { error } = await state.supabase
    .from(PROFILE_TABLE)
    .update(payload)
    .eq("id", userId);

  if (error) {
    showAlert(`แก้ไข User ไม่สำเร็จ : ${error.message}`);
    return;
  }

  addLog("INFO", `แก้ไข User ${user.username}`);

  await loadUsers();
}

function openEditUserModal(userId) {
  const user = state.users.find((item) => String(item.id) === String(userId));

  if (!user) {
    showAlert("ไม่พบข้อมูลผู้ใช้งาน");
    return;
  }

  setValue("edit-user-id", user.id);
  setValue("edit-username", user.username || "");
  setValue("edit-display-name", user.display_name || user.full_name || "");
  setValue("edit-department", user.department || user.department_code || "");
  setValue("edit-role", String(user.role || "staff").toLowerCase());
  setValue("edit-status", String(user.status || "active").toLowerCase());
  setValue("edit-password", "");

  const modal = document.getElementById("edit-user-modal");
  if (modal) modal.hidden = false;
}

function closeEditUserModal() {
  const modal = document.getElementById("edit-user-modal");
  if (modal) modal.hidden = true;
}

async function saveEditUser() {
  const userId = getValue("edit-user-id");
  const username = getValue("edit-username").toUpperCase();
  const displayName = getValue("edit-display-name");
  const department = getValue("edit-department").toUpperCase();
  const role = getValue("edit-role") || "staff";
  const status = getValue("edit-status") || "active";
  const password = getValue("edit-password");

  if (!userId) {
    showAlert("ไม่พบรหัส User");
    return;
  }

  if (!username) {
    showAlert("กรุณากรอก Username");
    return;
  }

  const duplicate = state.users.some((user) => {
    return (
      String(user.id) !== String(userId) &&
      String(user.username || "").toUpperCase() === username
    );
  });

  if (duplicate) {
    showAlert(`Username ${username} มีอยู่แล้ว`);
    return;
  }

  const payload = {
    username,
    display_name: displayName || username,
    full_name: displayName || username,
    department: department || "",
    department_code: department || "",
    role,
    status,
    email: `${username.toLowerCase()}@pvt.local`,
  };

  if (password) {
    payload.password = password;
  }

  const btn = document.getElementById("btn-save-edit-user");
  if (btn) btn.disabled = true;

  const { error } = await state.supabase
    .from(PROFILE_TABLE)
    .update(payload)
    .eq("id", userId);

  if (btn) btn.disabled = false;

  if (error) {
    showAlert(`แก้ไข User ไม่สำเร็จ: ${error.message}`);
    addLog("ERROR", error.message);
    return;
  }

  closeEditUserModal();
  addLog("INFO", `แก้ไข User สำเร็จ: ${username}`);
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
   QR MANAGEMENT - DEPARTMENT / MACHINE
   ---------------------------------------------------------
   ส่วนนี้ใช้สร้างลิงก์ QR ให้ Admin
   มี 2 แบบ:
   1) QR แผนก      -> /pages/form-department.html?dept=blow
   2) QR รายเครื่อง -> /pages/form-department.html?dept=blow&machine=F1

   หมายเหตุ:
   - หน้า form-department.js ที่แก้ก่อนหน้านี้จะอ่านค่า dept/machine จาก URL
   - ถ้ามี machine ระบบจะเลือกเครื่องให้อัตโนมัติ
========================================================= */

const FORM_DEPARTMENT_PATH = "/pages/form-department.html";

/*
  getQrDepartments()
  ---------------------------------------------------------
  คืนค่ารายชื่อแผนกจาก Master Data ที่โหลดจาก Supabase
  ถ้าฐานข้อมูลยังว่าง จะใช้ DEFAULT_DEPARTMENTS แทน
*/
function getQrDepartments() {
  const rows = state.departments?.length ? state.departments : DEFAULT_DEPARTMENTS;

  return rows
    .map((row) => {
      const code = normalizeDept(getDeptCode(row) || row.code);
      const name = getDeptName(row) || code;

      if (!code) return null;

      return {
        code,
        name,
      };
    })
    .filter(Boolean);
}

/*
  buildDepartmentFormUrl()
  ---------------------------------------------------------
  สร้าง URL สำหรับฟอร์มพนักงาน
  รับ deptCode เป็นรหัสแผนก เช่น BLOW / PIPE
  รับ machineName เฉพาะกรณี QR รายเครื่อง เช่น F1 / PIPE-01
*/
function buildDepartmentFormUrl(deptCode, machineName = "") {
  const origin = window.location.origin;
  const dept = String(deptCode || "").trim().toLowerCase();
  const machine = String(machineName || "").trim();

  const url = new URL(`${origin}${FORM_DEPARTMENT_PATH}`);

  if (dept) {
    url.searchParams.set("dept", dept);
  }

  if (machine) {
    url.searchParams.set("machine", machine);
  }

  return url.toString();
}

/*
  buildQuickChartQrUrl()
  ---------------------------------------------------------
  ใช้บริการ quickchart.io สร้าง QR จาก URL
  เหมาะกับการเปิดรูป QR เพื่อดาวน์โหลด/พิมพ์
*/
function buildQuickChartQrUrl(url, size = 500) {
  return `https://quickchart.io/qr?size=${size}&text=${encodeURIComponent(url)}`;
}

/*
  renderDepartmentQrList()
  ---------------------------------------------------------
  แสดง QR แผนกทั้งหมด
  ใช้สำหรับติดที่บั๊กเกตของเสีย หรือจุดรวมของแผนก
*/
function renderDepartmentQrList() {
  const box = document.getElementById("department-qr-list");
  if (!box) return;

  const departments = getQrDepartments();

  if (!departments.length) {
    box.innerHTML = `<div class="qr-empty">ยังไม่มีข้อมูลแผนก</div>`;
    return;
  }

  box.innerHTML = departments
    .map((dept) => {
      const fullUrl = buildDepartmentFormUrl(dept.code);

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
            onclick="copyQrLink('${escapeAttr(fullUrl)}')"
          >
            คัดลอกลิงก์
          </button>

          <button
            class="btn btn-primary"
            type="button"
            onclick="openQrImage('${escapeAttr(fullUrl)}')"
          >
            สร้าง QR
          </button>
        </div>
      </article>
    `;
    })
    .join("");
}

/*
  renderMachineQrDepartmentOptions()
  ---------------------------------------------------------
  เติม dropdown เลือกแผนกในหน้า QR รายเครื่อง
*/
function renderMachineQrDepartmentOptions() {
  const select = document.getElementById("machine-qr-dept-filter");
  if (!select) return;

  const currentValue = normalizeDept(select.value);
  const departments = getQrDepartments();

  select.innerHTML =
    `<option value="">-- เลือกแผนกเพื่อสร้าง QR รายเครื่อง --</option>` +
    departments
      .map((dept) => {
        return `<option value="${escapeAttr(dept.code)}">${escapeHtml(dept.name)} (${escapeHtml(dept.code)})</option>`;
      })
      .join("");

  if (currentValue) {
    select.value = currentValue;
  }
}

/*
  getMachinesByDepartment()
  ---------------------------------------------------------
  ดึงรายการเครื่องจักรของแผนกที่เลือกจาก state.machines
  รองรับทั้ง master_machines และ pvt_machines
*/
function getMachinesByDepartment(deptCode) {
  const dept = normalizeDept(deptCode);

  return sortRowsByOrder(
    (state.machines || []).filter((row) => {
      const rowDept = normalizeDept(row.department_code || row.department || row.dept || "");
      return rowDept === dept;
    }),
  );
}

/*
  renderMachineQrList()
  ---------------------------------------------------------
  แสดง QR รายเครื่องตามแผนกที่เลือก
*/
function renderMachineQrList() {
  const list = document.getElementById("machine-qr-list");
  const countEl = document.getElementById("machine-qr-count");
  const deptSelect = document.getElementById("machine-qr-dept-filter");

  if (!list) return;

  const selectedDept = normalizeDept(deptSelect?.value || "");

  if (!selectedDept) {
    list.innerHTML = `
      <div class="qr-empty">
        กรุณาเลือกแผนกก่อน ระบบจะแสดง QR รายเครื่องให้ค่ะ
      </div>
    `;
    if (countEl) countEl.textContent = "0 เครื่อง";
    return;
  }

  const machines = getMachinesByDepartment(selectedDept);

  if (countEl) {
    countEl.textContent = `${machines.length.toLocaleString("th-TH")} เครื่อง`;
  }

  if (!machines.length) {
    list.innerHTML = `
      <div class="qr-empty">
        ยังไม่มีเครื่องจักรในแผนกนี้ กรุณาเพิ่มเครื่องในเมนู Master Data ก่อน
      </div>
    `;
    return;
  }

  list.innerHTML = machines
    .map((row) => {
      const machineName = getMasterItemName(row, "machine");
      const fullUrl = buildDepartmentFormUrl(selectedDept, machineName);

      return `
        <article class="qr-machine-card">
          <div class="qr-preview">
            <img
              src="${escapeAttr(buildQuickChartQrUrl(fullUrl, 220))}"
              alt="QR ${escapeAttr(machineName)}"
              loading="lazy"
            />
          </div>

          <div class="qr-machine-info">
            <strong>${escapeHtml(machineName)}</strong>
            <span>${escapeHtml(getDepartmentName(selectedDept))} (${escapeHtml(selectedDept)})</span>
            <small>${escapeHtml(fullUrl)}</small>
          </div>

          <div class="qr-machine-actions">
            <button
              class="btn btn-secondary"
              type="button"
              onclick="copyQrLink('${escapeAttr(fullUrl)}')"
            >
              คัดลอกลิงก์
            </button>

            <button
              class="btn btn-primary"
              type="button"
              onclick="openQrImage('${escapeAttr(fullUrl)}')"
            >
              เปิด QR
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

/*
  openMachineQrByRow()
  ---------------------------------------------------------
  ใช้กับปุ่ม QR ในรายการเครื่องจักรหน้า Master Data
*/
function openMachineQrByRow(row) {
  if (!row) return;

  const dept = normalizeDept(row.department_code || row.department || row.dept || getValue("master-dept-filter"));
  const machineName = getMasterItemName(row, "machine");

  if (!dept || !machineName) {
    showAlert("ไม่พบแผนกหรือชื่อเครื่องจักรสำหรับสร้าง QR");
    return;
  }

  const fullUrl = buildDepartmentFormUrl(dept, machineName);
  openQrImage(fullUrl);
}

/*
  copyQrLink()
  ---------------------------------------------------------
  คัดลอกลิงก์ QR ไปยัง clipboard
*/
async function copyQrLink(url) {
  if (!url) return;

  try {
    await navigator.clipboard.writeText(url);
    alert("คัดลอกลิงก์แล้วค่ะ");
    addLog("INFO", `คัดลอกลิงก์ QR: ${url}`);
  } catch (err) {
    prompt("คัดลอกลิงก์นี้:", url);
  }
}

/*
  openQrImage()
  ---------------------------------------------------------
  เปิดรูป QR ขนาดใหญ่ในแท็บใหม่
*/
function openQrImage(url) {
  if (!url) return;

  window.open(buildQuickChartQrUrl(url, 500), "_blank", "noopener,noreferrer");
  addLog("INFO", `เปิด QR Code: ${url}`);
}

/*
  printMachineQrByDepartment()
  ---------------------------------------------------------
  เปิดหน้าพิมพ์ QR รายเครื่องของแผนกที่เลือก
  เหมาะสำหรับพิมพ์ A4 แล้วตัดแปะหน้าเครื่อง
*/
function printMachineQrByDepartment() {
  const selectedDept = normalizeDept(getValue("machine-qr-dept-filter"));

  if (!selectedDept) {
    showAlert("กรุณาเลือกแผนกก่อนพิมพ์ QR รายเครื่อง");
    return;
  }

  const machines = getMachinesByDepartment(selectedDept);

  if (!machines.length) {
    showAlert("ยังไม่มีเครื่องจักรในแผนกนี้");
    return;
  }

  const deptName = getDepartmentName(selectedDept);
  const cardsHtml = machines
    .map((row) => {
      const machineName = getMasterItemName(row, "machine");
      const fullUrl = buildDepartmentFormUrl(selectedDept, machineName);
      const qrUrl = buildQuickChartQrUrl(fullUrl, 260);

      return `
        <article class="print-qr-card">
          <h2>${escapeHtml(machineName)}</h2>
          <p>${escapeHtml(deptName)} (${escapeHtml(selectedDept)})</p>
          <img src="${escapeAttr(qrUrl)}" alt="QR ${escapeAttr(machineName)}" />
          <small>${escapeHtml(fullUrl)}</small>
        </article>
      `;
    })
    .join("");

  const printWindow = window.open("", "_blank", "noopener,noreferrer");

  if (!printWindow) {
    showAlert("เบราว์เซอร์บล็อกหน้าต่างพิมพ์ กรุณาอนุญาต Popup ก่อนค่ะ");
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html lang="th">
      <head>
        <meta charset="UTF-8" />
        <title>พิมพ์ QR รายเครื่อง - ${escapeHtml(deptName)}</title>
        <style>
          body {
            margin: 0;
            padding: 18px;
            font-family: "Kanit", "Noto Sans Thai", Arial, sans-serif;
            color: #0f172a;
          }

          .print-head {
            margin-bottom: 16px;
            text-align: center;
          }

          .print-head h1 {
            margin: 0;
            font-size: 24px;
          }

          .print-head p {
            margin: 6px 0 0;
            color: #475569;
          }

          .print-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 14px;
          }

          .print-qr-card {
            border: 2px solid #0f172a;
            border-radius: 14px;
            padding: 14px;
            text-align: center;
            break-inside: avoid;
          }

          .print-qr-card h2 {
            margin: 0;
            font-size: 30px;
            letter-spacing: 0.04em;
          }

          .print-qr-card p {
            margin: 4px 0 10px;
            font-size: 17px;
            font-weight: 700;
          }

          .print-qr-card img {
            width: 180px;
            height: 180px;
            object-fit: contain;
          }

          .print-qr-card small {
            display: block;
            margin-top: 8px;
            word-break: break-all;
            font-size: 10px;
            color: #64748b;
          }

          @media print {
            body {
              padding: 8mm;
            }

            .print-qr-card {
              page-break-inside: avoid;
            }
          }
        </style>
      </head>

      <body>
        <div class="print-head">
          <h1>QR รายเครื่อง</h1>
          <p>${escapeHtml(deptName)} (${escapeHtml(selectedDept)})</p>
        </div>

        <div class="print-grid">
          ${cardsHtml}
        </div>

        <script>
          window.addEventListener("load", () => {
            setTimeout(() => window.print(), 500);
          });
        <\/script>
      </body>
    </html>
  `);

  printWindow.document.close();
}

/*
  ฟังก์ชันชื่อเดิม
  ---------------------------------------------------------
  เก็บไว้เพื่อไม่ให้ปุ่ม/โค้ดเก่าที่เคยเรียก copyDepartmentLink()
  หรือ openDepartmentQr() พัง
*/
async function copyDepartmentLink(url) {
  return copyQrLink(url);
}

function openDepartmentQr(url) {
  return openQrImage(url);
}

/* =========================================================
   HELPERS
========================================================= */

function getDeptCode(row) {
  return String(
    row.department_code || row.dept_code || row.code || "",
  ).toUpperCase();
}

function getDeptName(row) {
  return row.department_name || row.dept_name || row.name || getDeptCode(row);
}


function getDepartmentName(value) {
  const code = normalizeDept(value);

  const dept = (state.departments || []).find((row) => {
    return normalizeDept(getDeptCode(row) || row.code) === code;
  });

  if (dept) {
    return getDeptName(dept);
  }

  const fallback = DEFAULT_DEPARTMENTS.find((row) => {
    return normalizeDept(row.code) === code;
  });

  return fallback?.name || value || "-";
}

function normalizeDept(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function sortRowsByOrder(rows) {
  return [...rows].sort((a, b) => {
    const orderA = Number(a.sort_order ?? 999999);
    const orderB = Number(b.sort_order ?? 999999);

    if (orderA !== orderB) return orderA - orderB;

    const nameA = String(
      a.department_code ||
        a.dept_code ||
        a.machine_no ||
        a.machine_name ||
        a.problem_type ||
        a.problem_name ||
        a.shift_name ||
        a.name ||
        "",
    );

    const nameB = String(
      b.department_code ||
        b.dept_code ||
        b.machine_no ||
        b.machine_name ||
        b.problem_type ||
        b.problem_name ||
        b.shift_name ||
        b.name ||
        "",
    );

    return nameA.localeCompare(nameB, "th");
  });
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




function getNextSortOrder(rows) {
  const maxOrder = rows.reduce((max, row) => {
    const value = Number(row.sort_order || 0);
    return Number.isFinite(value) && value > max ? value : max;
  }, 0);

  return maxOrder + 10;
}

async function updateMasterItem(table, id, payload, reloadFn) {
  if (!table || !id) return;

  const { error } = await state.supabase
    .from(table)
    .update(payload)
    .eq("id", id);

  if (error) {
    showAlert(`แก้ไขข้อมูลไม่สำเร็จ: ${error.message}`);
    addLog("ERROR", error.message);
    return;
  }

  addLog("INFO", `แก้ไขข้อมูลจาก ${table} สำเร็จ`);
  await reloadFn();
}


async function editSortOrder(table, id, currentSort, reloadFn) {
  const value = prompt("ใส่ลำดับใหม่ เช่น 1, 2, 3", currentSort || 0);
  if (value === null) return;

  const sortOrder = Number(value);

  if (!Number.isFinite(sortOrder)) {
    showAlert("กรุณาใส่ตัวเลขลำดับให้ถูกต้อง");
    return;
  }

  await updateMasterItem(table, id, { sort_order: sortOrder }, reloadFn);
}





async function loadActivityLogs() {
  const tbody = document.getElementById("activity-log-body");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="9" class="tb-empty">กำลังโหลดข้อมูล...</td>
    </tr>
  `;

  try {
    const { data, error } = await state.supabase
      .from("user_activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    if (!data || data.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" class="tb-empty">ยังไม่มีประวัติการใช้งาน</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = data
      .map((row) => {
        return `
          <tr>
            <td>${escapeHtml(formatDate(row.created_at))}</td>
            <td>${escapeHtml(row.display_name || row.username || "-")}</td>
            <td>${escapeHtml(row.role || "-")}</td>
            <td>${escapeHtml(row.department_code || "-")}</td>
            <td>${escapeHtml(row.action || "-")}</td>
            <td>${escapeHtml(row.page_path || "-")}</td>
            <td>${escapeHtml(row.device_type || "-")}</td>
            <td>${escapeHtml(row.browser || "-")}</td>
            <td>${escapeHtml(row.note || "-")}</td>
          </tr>
        `;
      })
      .join("");
  } catch (err) {
    console.error("โหลด Activity Logs ไม่สำเร็จ:", err);

    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="tb-empty">
          โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(err.message || err)}
        </td>
      </tr>
    `;
  }
}



/* =========================================================
   GLOBAL
========================================================= */

window.loadAdminPanel = loadAll;
window.logout = logout;

window.updateUserRole = updateUserRole;
window.updateUserStatus = updateUserStatus;
window.editUser = editUser;
window.deleteUser = deleteUser;

window.deleteDepartment = deleteDepartment;
window.deleteShift = deleteShift;
window.deleteMachine = deleteMachine;
window.deleteProblem = deleteProblem;

window.copyDepartmentLink = copyDepartmentLink;
window.openDepartmentQr = openDepartmentQr;
window.copyQrLink = copyQrLink;
window.openQrImage = openQrImage;
window.renderMachineQrList = renderMachineQrList;
window.printMachineQrByDepartment = printMachineQrByDepartment;
window.openMachineQrByRow = openMachineQrByRow;

window.openEditUserModal = openEditUserModal;
window.closeEditUserModal = closeEditUserModal;
window.saveEditUser = saveEditUser;
window.editDepartment = editDepartment;
window.editDepartmentOrder = editDepartmentOrder;
window.editMasterName = editMasterName;
window.editMasterOrder = editMasterOrder;
window.editShift = editShift;
window.editShiftOrder = editShiftOrder;
window.loadActivityLogs = loadActivityLogs;