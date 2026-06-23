// ======================================================
// supervisor-daily-review.js
// หน้าให้หัวหน้าตรวจสอบข้อมูลของเสียรายวัน
//
// เพิ่มรอบนี้:
// - ประวัติเริ่มต้นเป็นสัปดาห์ปัจจุบัน จันทร์-อาทิตย์
// - เลือกช่วงวันที่ประวัติย้อนหลังได้เอง
// - ปุ่มสัปดาห์นี้ / 7 วันย้อนหลัง
// - ตารางประวัติโหลดจาก report_date ระหว่าง historyStartDate-historyEndDate
// ======================================================

let currentProfile = null;
let currentRecords = [];

const STATUS = {
  PENDING: "pending",
  RESOLVED: "resolved",
};

document.addEventListener("DOMContentLoaded", async () => {
  await initPage();
});

// ======================================================
// INIT
// ======================================================

async function initPage() {
  const today = getLocalDateString(new Date());

  const filterDate = document.getElementById("filterDate");
  const filterStatus = document.getElementById("filterStatus");

  if (filterDate) filterDate.value = today;
  if (filterStatus) filterStatus.value = STATUS.PENDING;

  // ตั้งช่วงประวัติเริ่มต้นเป็นจันทร์-อาทิตย์ของสัปดาห์ปัจจุบัน
  initHistoryWeekRange();

  currentProfile = getLocalProfile();

  if (!currentProfile) {
    alert("ไม่พบข้อมูลผู้ใช้งาน กรุณา Login ใหม่");
    window.location.href = "/login.html";
    return;
  }

  renderLoginUserInfo();

  const allowedRoles = ["admin", "management", "supervisor", "manager"];

  if (!allowedRoles.includes(currentProfile.role)) {
    alert("สิทธิ์การเข้าถึงล้มเหลว: เฉพาะหัวหน้างานหรือผู้ดูแลระบบ");
    window.location.href = "/login.html";
    return;
  }

  if (!canSeeAllDepartments() && !currentProfile.department_code) {
    alert("User นี้ยังไม่ได้กำหนดแผนก กรุณาไปเพิ่ม department_code ในหน้า Admin");
    return;
  }

  await loadRecords();
}

// ======================================================
// DATE HELPERS
// ======================================================

function getLocalDateString(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function initHistoryWeekRange() {
  const range = getThisWeekMondayToSunday();

  setValue("historyStartDate", range.start);
  setValue("historyEndDate", range.end);
}

function getThisWeekMondayToSunday() {
  const today = new Date();

  // JS: Sunday=0, Monday=1
  // ต้องการให้ Monday เป็นวันเริ่ม
  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    start: getLocalDateString(monday),
    end: getLocalDateString(sunday),
  };
}

function setHistoryRangeThisWeek() {
  initHistoryWeekRange();
  loadHistory();
}

function setHistoryRangeLast7Days() {
  const today = new Date();

  const start = new Date(today);
  start.setDate(today.getDate() - 6);

  setValue("historyStartDate", getLocalDateString(start));
  setValue("historyEndDate", getLocalDateString(today));

  loadHistory();
}

// ======================================================
// PROFILE / ROLE
// ======================================================

function getLocalProfile() {
  const role = localStorage.getItem("activeRole");

  if (!role) return null;

  return {
    id: localStorage.getItem("activeUserId") || "",
    username: localStorage.getItem("activeUser") || "",
    display_name: localStorage.getItem("activeName") || "",
    department_code: normalizeDept(localStorage.getItem("activeDept") || ""),
    department_name: localStorage.getItem("activeDeptName") || "",
    role: String(role).toLowerCase().trim(),
  };
}

function canSeeAllDepartments() {
  return ["admin", "management"].includes(currentProfile.role);
}

function applyDepartmentFilter(query) {
  if (canSeeAllDepartments()) return query;

  return query.eq("department_code", currentProfile.department_code);
}

function renderLoginUserInfo() {
  setText(
    "userName",
    currentProfile.display_name || currentProfile.username || "-"
  );

  setText(
    "userDept",
    canSeeAllDepartments()
      ? "เห็นข้อมูลทุกแผนก"
      : currentProfile.department_name || currentProfile.department_code || "-"
  );
}

// ======================================================
// LOAD RECORDS
// รายการด้านบนใช้วันที่เดียว + สถานะเดียว
// ======================================================

async function loadRecords() {
  const list = document.getElementById("recordList");

  if (!list) return;

  list.innerHTML = `<p class="empty">กำลังโหลดข้อมูล...</p>`;

  const filterDate = document.getElementById("filterDate")?.value;
  const filterStatus =
    document.getElementById("filterStatus")?.value || STATUS.PENDING;

  if (!filterDate) {
    list.innerHTML = `<p class="empty">กรุณาเลือกวันที่</p>`;
    return;
  }

  try {
    await loadSummary(filterDate);

    let query = supabaseClient
      .from("daily_waste_reports")
      .select("*")
      .eq("report_date", filterDate)
      .order("created_at", { ascending: false });

    if (filterStatus !== "all") {
      query = query.eq("status", filterStatus);
    }

    query = applyDepartmentFilter(query);

    const { data, error } = await query;

    if (error) throw error;

    currentRecords = Array.isArray(data) ? data : [];

    if (currentRecords.length === 0) {
      list.innerHTML = `<p class="empty">ไม่พบข้อมูลรายการของเสีย</p>`;
    } else {
      list.innerHTML = currentRecords.map(renderRecordCard).join("");
    }

    await loadHistory();
  } catch (error) {
    console.error("โหลดข้อมูลไม่สำเร็จ:", error);
    list.innerHTML = `<p class="empty">โหลดข้อมูลไม่สำเร็จ: ${safeText(error.message)}</p>`;
  }
}

// ======================================================
// SUMMARY KPI
// KPI ยังอิงวันที่ด้านบน filterDate
// ======================================================

async function loadSummary(reportDate) {
  try {
    let query = supabaseClient
      .from("daily_waste_reports")
      .select("status, machine_no, waste_weight_kg, waste_qty")
      .eq("report_date", reportDate);

    query = applyDepartmentFilter(query);

    const { data, error } = await query;

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];

    const pending = rows.filter((x) => x.status === STATUS.PENDING).length;
    const totalWaste = rows.reduce((sum, row) => sum + getWasteValue(row), 0);

    const machineWasteMap = {};

    rows.forEach((row) => {
      const machine = row.machine_no || "ไม่ระบุเครื่อง";
      machineWasteMap[machine] =
        (machineWasteMap[machine] || 0) + getWasteValue(row);
    });

    const topMachine = Object.entries(machineWasteMap).sort(
      (a, b) => b[1] - a[1],
    )[0];

    setText("countPending", pending.toLocaleString("th-TH"));
    setText("todayWaste", `${formatNumber(totalWaste)} kg`);

    if (topMachine) {
      setText("topMachineToday", topMachine[0]);
      setText("topMachineTodaySub", `${formatNumber(topMachine[1])} kg`);
    } else {
      setText("topMachineToday", "-");
      setText("topMachineTodaySub", "-");
    }
  } catch (error) {
    console.error("โหลดสรุปไม่สำเร็จ:", error);
  }
}

// ======================================================
// HISTORY
// ประวัติใช้ช่วงวันที่แยกจากรายการประจำวัน
// ======================================================

async function loadHistory() {
  const tbody = document.getElementById("historyTableBody");
  if (!tbody) return;

  const startDate = getValue("historyStartDate");
  const endDate = getValue("historyEndDate");

  if (!startDate || !endDate) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="empty-cell">กรุณาเลือกช่วงวันที่ประวัติ</td>
      </tr>
    `;
    setText("historySummary", "กรุณาเลือกช่วงวันที่ประวัติ");
    return;
  }

  if (startDate > endDate) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="empty-cell">
          วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด
        </td>
      </tr>
    `;
    setText("historySummary", "ช่วงวันที่ไม่ถูกต้อง");
    return;
  }

  tbody.innerHTML = `
    <tr>
      <td colspan="10" class="empty-cell">กำลังโหลดประวัติ...</td>
    </tr>
  `;

  setText("historySummary", "กำลังโหลดสรุปประวัติ...");

  try {
    let query = supabaseClient
      .from("daily_waste_reports")
      .select("*")
      .gte("report_date", startDate)
      .lte("report_date", endDate)
      .eq("status", STATUS.RESOLVED)
      .order("report_date", { ascending: false })
      .order("checked_at", { ascending: false });

    query = applyDepartmentFilter(query);

    const { data, error } = await query;

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];

    renderHistorySummary(rows, startDate, endDate);
    renderHistoryTable(rows);
  } catch (error) {
    console.error("โหลดประวัติไม่สำเร็จ:", error);

    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="empty-cell">
          โหลดประวัติไม่สำเร็จ: ${safeText(error.message)}
        </td>
      </tr>
    `;

    setText("historySummary", "โหลดประวัติไม่สำเร็จ");
  }
}

function renderHistorySummary(rows, startDate, endDate) {
  const totalWaste = rows.reduce((sum, row) => sum + getWasteValue(row), 0);
  const totalRecords = rows.length;

  const machineWasteMap = {};

  rows.forEach((row) => {
    const machine = row.machine_no || "ไม่ระบุเครื่อง";
    machineWasteMap[machine] =
      (machineWasteMap[machine] || 0) + getWasteValue(row);
  });

  const topMachine = Object.entries(machineWasteMap).sort(
    (a, b) => b[1] - a[1],
  )[0];

  const topMachineText = topMachine
    ? ` | เครื่องสูงสุด: ${topMachine[0]} (${formatNumber(topMachine[1])} kg)`
    : "";

  setText(
    "historySummary",
    `ช่วง ${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)} | ตรวจแล้ว ${formatNumber(totalRecords)} รายการ | ของเสีย ${formatNumber(totalWaste)} kg${topMachineText}`,
  );
}

function renderHistoryTable(rows) {
  const tbody = document.getElementById("historyTableBody");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="empty-cell">
          ยังไม่มีประวัติการตรวจสอบในช่วงวันที่เลือก
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows
    .map((row) => {
      return `
        <tr>
          <td>${safeText(formatDisplayDate(row.report_date || "-"))}</td>
          <td>${safeText(row.department_code || "-")}</td>
          <td>${safeText(row.shift || row.work_shift || "-")}</td>
          <td>${safeText(row.machine_no || "-")}</td>
          <td>${safeText(row.problem_type || "-")}</td>
          <td>${formatNumber(getWasteValue(row))} kg</td>
          <td>${safeText(row.reported_by || "-")}</td>
          <td>${safeText(row.checked_by_name || row.checked_by || "-")}</td>
          <td>${safeText(formatDateTime(row.checked_at))}</td>
          <td>${safeText(row.supervisor_note || "-")}</td>
        </tr>
      `;
    })
    .join("");
}

// ======================================================
// RECORD CARD
// ======================================================

function renderRecordCard(record) {
  const isPending = record.status === STATUS.PENDING;
  const isResolved = record.status === STATUS.RESOLVED;

  return `
    <article class="record-card">
      <div class="record-top">
        <div>
          <div class="record-title">
            แผนก: ${safeText(record.department_code || "-")}
          </div>

          <div class="record-meta">
            วันที่: ${safeText(record.report_date || "-")}
            | กะ: ${safeText(record.shift || record.work_shift || "-")}
            | เครื่องจักร: ${safeText(record.machine_no || "-")}
          </div>
        </div>

        <div class="record-meta">
          ผู้กรอก: ${safeText(record.reported_by || "-")}
        </div>
      </div>

      <div class="record-detail">
        <div class="detail-box">
          <span>ปัญหา</span>
          <strong>${safeText(record.problem_type || "-")}</strong>
        </div>

        <div class="detail-box">
          <span>รายละเอียด</span>
          <strong>${safeText(record.detail || record.note || "-")}</strong>
        </div>

        <div class="detail-box">
          <span>น้ำหนักของเสีย</span>
          <strong>${formatNumber(getWasteValue(record))} kg</strong>
        </div>

        <div class="detail-box">
          <span>สถานะ</span>
          <strong>${getStatusLabel(record.status)}</strong>
        </div>
      </div>

      <div class="note-box">
        <label for="note-${record.id}">หมายเหตุหัวหน้า</label>
        <textarea
          id="note-${record.id}"
          rows="2"
          placeholder="ใส่หมายเหตุถ้ามี"
          ${isResolved ? "disabled" : ""}
        >${safeText(record.supervisor_note || "")}</textarea>
      </div>

      <div class="action-row">
        ${
          isPending
            ? `
              <button class="btn warning" type="button" onclick="openEditModal('${safeAttr(record.id)}')">
                ✏️ แก้ไข
              </button>

              <button class="btn success" type="button" onclick="approveRecord('${safeAttr(record.id)}')">
                ✅ ตรวจแล้ว / ส่งบัญชี
              </button>

              <button class="btn danger" type="button" onclick="deleteRecord('${safeAttr(record.id)}')">
                🗑 ลบ
              </button>
            `
            : ""
        }

        ${
          isResolved
            ? `
              <span class="record-meta">รายการนี้ส่งบัญชีแล้ว</span>

              <button class="btn warning" type="button" onclick="openEditModal('${safeAttr(record.id)}')">
                ✏️ แก้ไข
              </button>

              <button class="btn danger" type="button" onclick="deleteRecord('${safeAttr(record.id)}')">
                🗑 ลบ
              </button>
            `
            : ""
        }
      </div>
    </article>
  `;
}

// ======================================================
// EDIT RECORD
// ======================================================

function openEditModal(id) {
  const record = currentRecords.find((item) => String(item.id) === String(id));

  if (!record) {
    alert("ไม่พบรายการที่ต้องการแก้ไข");
    return;
  }

  setValue("editRecordId", record.id);
  setValue("editShift", record.shift || record.work_shift || "");
  setValue("editMachineNo", record.machine_no || "");
  setValue("editProblemType", record.problem_type || "");
  setValue("editWasteWeight", getWasteValue(record));
  setValue("editDetail", record.detail || record.note || "");
  setValue("editSupervisorNote", record.supervisor_note || "");

  const modal = document.getElementById("editRecordModal");
  if (modal) modal.hidden = false;
}

function closeEditModal() {
  const modal = document.getElementById("editRecordModal");
  if (modal) modal.hidden = true;
}

async function saveEditRecord() {
  const id = getValue("editRecordId");

  if (!id) {
    alert("ไม่พบรหัสรายการ");
    return;
  }

  const shift = getValue("editShift");
  const machineNo = getValue("editMachineNo");
  const problemType = getValue("editProblemType");
  const wasteWeight = Number(getValue("editWasteWeight") || 0);
  const detail = getValue("editDetail");
  const supervisorNote = getValue("editSupervisorNote");

  if (!machineNo) {
    alert("กรุณาระบุเครื่องจักร");
    return;
  }

  if (!problemType) {
    alert("กรุณาระบุปัญหา");
    return;
  }

  if (!Number.isFinite(wasteWeight) || wasteWeight < 0) {
    alert("กรุณาระบุน้ำหนักของเสียให้ถูกต้อง");
    return;
  }

  try {
    let query = supabaseClient
      .from("daily_waste_reports")
      .update({
        shift,
        work_shift: shift,
        machine_no: machineNo,
        problem_type: problemType,
        reason_detail: problemType,
        waste_weight_kg: wasteWeight,
        waste_qty: wasteWeight,
        total_qty: wasteWeight,
        detail,
        note: detail,
        supervisor_note: supervisorNote,
        checked_by: currentProfile.id || null,
        checked_by_name: currentProfile.display_name || currentProfile.username,
        checked_at: new Date().toISOString(),
      })
      .eq("id", id);

    query = applyDepartmentFilter(query);

    const { error } = await query;

    if (error) throw error;

    closeEditModal();
    alert("แก้ไขข้อมูลเรียบร้อยแล้ว");
    await loadRecords();
  } catch (error) {
    console.error("แก้ไขไม่สำเร็จ:", error);
    alert("แก้ไขไม่สำเร็จ: " + error.message);
  }
}

// ======================================================
// APPROVE / SEND ACCOUNTING
// ======================================================

async function approveRecord(id) {
  const confirmApprove = confirm("ยืนยันตรวจแล้ว และส่งข้อมูลให้บัญชีใช่ไหม?");
  if (!confirmApprove) return;

  const note = document.getElementById(`note-${id}`)?.value || "";

  try {
    let query = supabaseClient
      .from("daily_waste_reports")
      .update({
        status: STATUS.RESOLVED,
        checked_by: currentProfile.id || null,
        checked_by_name: currentProfile.display_name || currentProfile.username,
        checked_at: new Date().toISOString(),
        supervisor_note: note,
      })
      .eq("id", id);

    query = applyDepartmentFilter(query);

    const { error } = await query;

    if (error) throw error;

    alert("ส่งข้อมูลให้บัญชีเรียบร้อยแล้ว");
    await loadRecords();
  } catch (error) {
    console.error("ส่งบัญชีไม่สำเร็จ:", error);
    alert("ส่งบัญชีไม่สำเร็จ: " + error.message);
  }
}

// ======================================================
// DELETE
// ======================================================

async function deleteRecord(id) {
  const confirmDelete = confirm(
    "ต้องการลบรายการนี้ใช่ไหม?\n\nใช้เฉพาะกรณีข้อมูลกรอกผิดจริง และไม่ต้องการส่งบัญชี",
  );

  if (!confirmDelete) return;

  try {
    let query = supabaseClient
      .from("daily_waste_reports")
      .delete()
      .eq("id", id);

    query = applyDepartmentFilter(query);

    const { error } = await query;

    if (error) throw error;

    alert("ลบรายการเรียบร้อยแล้ว");
    await loadRecords();
  } catch (error) {
    console.error("ลบรายการไม่สำเร็จ:", error);
    alert("ลบรายการไม่สำเร็จ: " + error.message);
  }
}

// ======================================================
// HELPERS
// ======================================================

function getStatusLabel(status) {
  const labels = {
    pending: "รอตรวจสอบ",
    resolved: "ส่งบัญชีแล้ว",
  };

  return labels[status] || status || "-";
}

function getWasteValue(row) {
  return Number(row.waste_weight_kg || row.waste_qty || 0) || 0;
}

function normalizeDept(value) {
  return String(value || "").trim().toLowerCase();
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function getValue(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    maximumFractionDigits: 2,
  });
}

function formatDisplayDate(value) {
  if (!value || value === "-") return "-";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("th-TH");
}

function safeText(value) {
  if (value === null || value === undefined) return "";

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeAttr(value) {
  return safeText(value).replaceAll("`", "&#096;");
}

// ======================================================
// LOGOUT
// ======================================================

function logout() {
  const confirmLogout = confirm("ต้องการออกจากระบบใช่ไหม?");
  if (!confirmLogout) return;

  localStorage.removeItem("loginType");
  localStorage.removeItem("activeUserId");
  localStorage.removeItem("activeUser");
  localStorage.removeItem("activeName");
  localStorage.removeItem("activeDept");
  localStorage.removeItem("activeDeptName");
  localStorage.removeItem("activeRole");

  window.location.href = "/login.html";
}

// ======================================================
// GLOBAL EXPORT
// ======================================================

window.loadRecords = loadRecords;
window.loadHistory = loadHistory;
window.setHistoryRangeThisWeek = setHistoryRangeThisWeek;
window.setHistoryRangeLast7Days = setHistoryRangeLast7Days;
window.logout = logout;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveEditRecord = saveEditRecord;
window.approveRecord = approveRecord;
window.deleteRecord = deleteRecord;
