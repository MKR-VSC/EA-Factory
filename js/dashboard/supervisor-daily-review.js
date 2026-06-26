// ======================================================
// supervisor-daily-review.js
// หน้าให้หัวหน้างานตรวจสอบข้อมูลของเสียรายวัน
//
// แก้รอบนี้:
// - แก้ปัญหาข้อมูลไม่แสดงจากการกรอง status / department เข้มเกินไป
// - โหลดข้อมูลตามวันที่ก่อน แล้วค่อยกรองสถานะด้วย JS เพื่อรองรับ status เดิมหลายแบบ
// - รองรับ department_code / department / dept / dept_code และชื่อไทยของแผนก
// - เพิ่มข้อความช่วย debug ใน console และบนหน้าจอ
// - ประวัติเลือกช่วงวันที่เองได้เหมือนเดิม
// - ปรับตาม schema จริงของ public.daily_waste_reports แล้ว
// ======================================================

let currentProfile = null;
let currentRecords = [];
let responsibleDepartments = [];

const STATUS = {
  PENDING: "pending",
  RESOLVED: "resolved",
};

const DEPARTMENT_LABELS_TH = {
  blow: "เป่าถุง",
  blown_film: "เป่าฟิล์ม",
  bag_blow: "เป่าถุง",
  pipe: "ท่อ",
  sheet: "ตัดผืน",
  sheet_cutting: "ตัดผืน",
  garbage_bag_cut: "ตัดถุงขยะ",
  rain_tape: "เทปน้ำพุ่ง",
  rain_tape_cut_punch: "ตัดเจาะเทปน้ำพุ่ง",
  shade_net: "สแลน",
  cut_punch: "ตัดเจาะ",
  print: "ม้วนพิมพ์",
  accounting: "บัญชี",
  management: "ผู้บริหาร",
};

function getDepartmentLabelTH(code) {
  const normalized = normalizeDepartmentCode(code);
  return DEPARTMENT_LABELS_TH[normalized] || code;
}

// สถานะที่ถือว่ายังรอหัวหน้าตรวจ
// เพิ่ม submitted / draft / null ไว้กันข้อมูลเก่าหรือข้อมูลจากฟอร์มที่ยังไม่ได้ตั้งเป็น pending
const PENDING_STATUS_SET = new Set([
  "",
  "pending",
  "submitted",
  "draft",
  "waiting_supervisor",
  "รอตรวจสอบ",
]);

// สถานะที่ถือว่าส่งบัญชีแล้ว / ตรวจแล้ว
const RESOLVED_STATUS_SET = new Set([
  "resolved",
  "checked",
  "approved",
  "sent_accounting",
  "ส่งบัญชีแล้ว",
  "ตรวจแล้ว",
]);

const DEPARTMENT_ALIASES = {
  blow: ["blow", "bag_blow", "เป่าถุง", "แผนกเป่าถุง", "ถุง"],
  pipe: ["pipe", "ท่อ", "แผนกท่อ"],
  sheet: ["sheet", "sheet_cutting", "ตัดผืน", "แผนกตัดผืน"],
  print: ["print", "printing", "ม้วนพิมพ์", "พิมพ์"],
  accounting: ["accounting", "บัญชี"],
  management: ["management", "ผู้บริหาร"],
};

document.addEventListener("DOMContentLoaded", async () => {
  await initPage();
});

// ======================================================
// INIT
// ======================================================

async function initPage() {
  const today = getLocalDateString(new Date());

  setValue("filterDate", today);
  setValue("filterStatus", STATUS.PENDING);

  // ตั้งช่วงประวัติเริ่มต้นเป็นจันทร์-อาทิตย์ของสัปดาห์ปัจจุบัน
  initHistoryWeekRange();

  currentProfile = getLocalProfile();

  if (!currentProfile) {
    alert("ไม่พบข้อมูลผู้ใช้งาน กรุณา Login ใหม่");
    window.location.href = "/login.html";
    return;
  }

  const allowedRoles = ["admin", "management", "supervisor", "manager", "executive"];

  if (!allowedRoles.includes(normalizeText(currentProfile.role))) {
    alert("สิทธิ์การเข้าถึงล้มเหลว: เฉพาะหัวหน้างานหรือผู้ดูแลระบบ");
    window.location.href = "/login.html";
    return;
  }

  // โหลดแผนกที่รับผิดชอบแบบไม่บังคับ
  // ถ้าอ่าน user_departments ไม่ได้ ระบบจะยังใช้ activeDept เดิม เพื่อไม่ให้ข้อมูลเดิมหาย
  await loadResponsibleDepartments();

  renderLoginUserInfo();

  if (!canSeeAllDepartments() && !getCurrentDepartmentKey()) {
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
  const savedProfile = safeJsonParse(localStorage.getItem("ea_profile"));

  const role =
    localStorage.getItem("activeRole") ||
    savedProfile?.role ||
    savedProfile?.user_role ||
    "";

  if (!role) return null;

  return {
    id:
      localStorage.getItem("activeUserId") ||
      savedProfile?.id ||
      savedProfile?.user_id ||
      "",
    username:
      localStorage.getItem("activeUser") ||
      savedProfile?.username ||
      savedProfile?.email ||
      "",
    display_name:
      localStorage.getItem("activeName") ||
      savedProfile?.display_name ||
      savedProfile?.full_name ||
      savedProfile?.username ||
      "",
    department_code:
      localStorage.getItem("activeDept") ||
      savedProfile?.department_code ||
      savedProfile?.department ||
      "",
    department_name:
      localStorage.getItem("activeDeptName") ||
      savedProfile?.department_name ||
      savedProfile?.department ||
      "",
    role: normalizeText(role),
  };
}

function canSeeAllDepartments() {
  return ["admin", "management", "executive"].includes(
    normalizeText(currentProfile?.role)
  );
}

async function loadResponsibleDepartments() {
  responsibleDepartments = [];

  if (canSeeAllDepartments()) return;

  // สำคัญ: เอา activeDept เดิมใส่ก่อน เพื่อไม่ให้ข้อมูลเดิมหาย
  const fallbackDept = normalizeDepartmentCode(
    currentProfile?.department_code || currentProfile?.department_name || ""
  );

  if (fallbackDept) responsibleDepartments.push(fallbackDept);

  // ถ้าไม่มี user id ก็ใช้ของเดิมไปก่อน
  if (!currentProfile?.id) {
    responsibleDepartments = uniqueArray(responsibleDepartments);
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("user_departments")
      .select("department_code")
      .eq("user_id", currentProfile.id);

    if (error) {
      console.warn("อ่าน user_departments ไม่ได้ ใช้ activeDept เดิมแทน:", error);
      responsibleDepartments = uniqueArray(responsibleDepartments);
      return;
    }

    const mapped = (Array.isArray(data) ? data : [])
      .map((row) => normalizeDepartmentCode(row.department_code))
      .filter(Boolean);

    responsibleDepartments = uniqueArray([...responsibleDepartments, ...mapped]);
  } catch (error) {
    console.warn("โหลดแผนกที่รับผิดชอบไม่สำเร็จ ใช้ activeDept เดิมแทน:", error);
    responsibleDepartments = uniqueArray(responsibleDepartments);
  }
}

function getAllowedDepartmentCodes() {
  if (canSeeAllDepartments()) return [];

  const depts = responsibleDepartments.length
    ? responsibleDepartments
    : [currentProfile?.department_code || currentProfile?.department_name];

  return uniqueArray(depts.map(normalizeDepartmentCode).filter(Boolean));
}

function getCurrentDepartmentKey() {
  return getAllowedDepartmentCodes()[0] || "";
}

// กลับมาใช้วิธี query กว้างก่อน แล้วค่อยกรองใน JS
// เพื่อไม่ให้ข้อมูลหายจาก .in("department_code") หรือ policy/RLS
function applyDepartmentFilter(query) {
  return query;
}

function normalizeDepartmentCode(value) {
  const text = normalizeText(value);
  if (!text) return "";

  for (const [code, aliases] of Object.entries(DEPARTMENT_ALIASES)) {
    if (aliases.map(normalizeText).includes(text)) return code;
  }

  return text.replace(/[\s-]+/g, "_");
}

function filterRecordsForCurrentDepartment(rows) {
  if (!Array.isArray(rows)) return [];
  if (canSeeAllDepartments()) return rows;

  const allowedDepartments = getAllowedDepartmentCodes();

  // ถ้าไม่มีข้อมูลแผนกเลย ไม่กรองทิ้ง เพื่อให้เห็นข้อมูลแทนที่จะหน้าว่าง
  if (!allowedDepartments.length) return rows;

  return rows.filter((row) => {
    const rowDept = normalizeDepartmentCode(row.department_code || row.department || "");
    return allowedDepartments.includes(rowDept);
  });
}

function renderLoginUserInfo() {
  setText(
    "userName",
    currentProfile.display_name || currentProfile.username || "-"
  );

  const deptText = canSeeAllDepartments()
    ? "รับผิดชอบ: ทุกแผนก"
    : getAllowedDepartmentCodes().length
      ? `รับผิดชอบ: ${getAllowedDepartmentCodes()
          .map(getDepartmentLabelTH)
          .join(", ")}`
      : `รับผิดชอบ: ${getDepartmentLabelTH(
          currentProfile.department_name || currentProfile.department_code
        )}`;

  setText("userDept", deptText);
}

function uniqueArray(values) {
  return [...new Set((values || []).filter(Boolean))];
}

// ======================================================
// LOAD RECORDS
// รายการด้านบนใช้วันที่เดียว + สถานะเดียว
// ======================================================

async function loadRecords() {
  const list = document.getElementById("recordList");
  if (!list) return;

  list.innerHTML = `<p class="empty">กำลังโหลดข้อมูล...</p>`;

  const filterDate = getValue("filterDate");
  const filterStatus = getValue("filterStatus") || STATUS.PENDING;

  if (!filterDate) {
    list.innerHTML = `<p class="empty">กรุณาเลือกวันที่</p>`;
    return;
  }

  try {
    await loadSummary(filterDate);

    // สำคัญ: ไม่ .eq("status", pending) ตรงนี้
    // เพราะข้อมูลเดิมบางรายการอาจเป็น submitted / draft / null
    let query = supabaseClient
      .from("daily_waste_reports")
      .select("*")
      .eq("report_date", filterDate)
      .order("created_at", { ascending: false });

    query = applyDepartmentFilter(query);

    const { data, error } = await query;

    if (error) throw error;

    const rows = Array.isArray(data) ? data : [];
    const deptRows = filterRecordsForCurrentDepartment(rows);
    currentRecords = filterRecordsByStatus(deptRows, filterStatus);

    console.info("[supervisor-daily-review] loadRecords", {
      filterDate,
      filterStatus,
      totalFromDB: rows.length,
      afterDeptFilter: deptRows.length,
      afterStatusFilter: currentRecords.length,
      currentProfile,
    });

    if (currentRecords.length === 0) {
      list.innerHTML = renderEmptyRecordMessage(rows.length, deptRows.length, filterStatus);
    } else {
      list.innerHTML = currentRecords.map(renderRecordCard).join("");
    }

    await loadHistory();
  } catch (error) {
    console.error("โหลดข้อมูลไม่สำเร็จ:", error);
    list.innerHTML = `<p class="empty">โหลดข้อมูลไม่สำเร็จ: ${safeText(error.message)}</p>`;
  }
}

function renderEmptyRecordMessage(totalFromDB, afterDeptFilter, filterStatus) {
  if (totalFromDB > 0 && afterDeptFilter === 0 && !canSeeAllDepartments()) {
    return `
      <div class="empty">
        <strong>พบข้อมูลในวันที่เลือก แต่ไม่ตรงกับแผนกของ User นี้</strong>
        <br />
        แผนกของคุณ: ${safeText(currentProfile.department_code || currentProfile.department_name || "-")}
        <br />
        กรุณาตรวจ activeDept / department_code ของ User ในหน้า Admin
      </div>
    `;
  }

  if (afterDeptFilter > 0 && filterStatus !== "all") {
    return `
      <div class="empty">
        ไม่พบข้อมูลสถานะ “${safeText(getStatusLabel(filterStatus))}”
        <br />
        ลองเปลี่ยนสถานะเป็น “ทั้งหมด”
      </div>
    `;
  }

  return `<p class="empty">ไม่พบข้อมูลรายการของเสียในวันที่เลือก</p>`;
}

function filterRecordsByStatus(rows, filterStatus) {
  if (!Array.isArray(rows)) return [];
  if (filterStatus === "all") return rows;

  return rows.filter((row) => {
    const status = normalizeText(row.status);

    if (filterStatus === STATUS.PENDING) {
      return PENDING_STATUS_SET.has(status) || !RESOLVED_STATUS_SET.has(status);
    }

    if (filterStatus === STATUS.RESOLVED) {
      return RESOLVED_STATUS_SET.has(status);
    }

    return status === normalizeText(filterStatus);
  });
}

// ======================================================
// SUMMARY KPI
// KPI ยังอิงวันที่ด้านบน filterDate
// ======================================================

async function loadSummary(reportDate) {
  try {
    let query = supabaseClient
      .from("daily_waste_reports")
      .select("status, machine_no, waste_weight_kg, waste_qty, department_code, department")
      .eq("report_date", reportDate);

    query = applyDepartmentFilter(query);

    const { data, error } = await query;

    if (error) throw error;

    const rows = filterRecordsForCurrentDepartment(Array.isArray(data) ? data : []);

    const pending = rows.filter((row) => {
      const status = normalizeText(row.status);
      return PENDING_STATUS_SET.has(status) || !RESOLVED_STATUS_SET.has(status);
    }).length;

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
    // ไม่ .eq("status", resolved) ตรงนี้ เพื่อรองรับ status เดิมหลายชื่อ
    let query = supabaseClient
      .from("daily_waste_reports")
      .select("*")
      .gte("report_date", startDate)
      .lte("report_date", endDate)
      .order("report_date", { ascending: false })
      .order("checked_at", { ascending: false, nullsFirst: false });

    query = applyDepartmentFilter(query);

    const { data, error } = await query;

    if (error) throw error;

    const allRows = filterRecordsForCurrentDepartment(Array.isArray(data) ? data : []);
    const rows = filterRecordsByStatus(allRows, STATUS.RESOLVED);

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
          <td>${safeText(getDepartmentText(row))}</td>
          <td>${safeText(row.shift || row.work_shift || "-")}</td>
          <td>${safeText(row.machine_no || "-")}</td>
          <td>${safeText(row.problem_type || row.reason_detail || "-")}</td>
          <td>${formatNumber(getWasteValue(row))} kg</td>
          <td>${safeText(row.reported_by || row.created_by_name || "-")}</td>
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
  const isResolved = RESOLVED_STATUS_SET.has(normalizeText(record.status));
  const isPending = !isResolved;

  return `
    <article class="record-card">
      <div class="record-top">
        <div>
          <div class="record-title">
            แผนก: ${safeText(getDepartmentText(record))}
          </div>

          <div class="record-meta">
            วันที่: ${safeText(record.report_date || "-")}
            | กะ: ${safeText(record.shift || record.work_shift || "-")}
            | เครื่องจักร: ${safeText(record.machine_no || "-")}
          </div>
        </div>

        <div class="record-meta">
          ผู้กรอก: ${safeText(record.reported_by || record.created_by_name || "-")}
        </div>
      </div>

      <div class="record-detail">
        <div class="detail-box">
          <span>ปัญหา</span>
          <strong>${safeText(record.problem_type || record.reason_detail || "-")}</strong>
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
        <label for="note-${safeAttr(record.id)}">หมายเหตุหัวหน้า</label>
        <textarea
          id="note-${safeAttr(record.id)}"
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
            : `
              <span class="record-meta">รายการนี้ส่งบัญชีแล้ว</span>

              <button class="btn warning" type="button" onclick="openEditModal('${safeAttr(record.id)}')">
                ✏️ แก้ไข
              </button>

              <button class="btn danger" type="button" onclick="deleteRecord('${safeAttr(record.id)}')">
                🗑 ลบ
              </button>
            `
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
  setValue("editProblemType", record.problem_type || record.reason_detail || "");
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

  const note = document.getElementById(`note-${CSS.escape(String(id))}`)?.value || "";

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
  const text = normalizeText(status);

  if (PENDING_STATUS_SET.has(text)) return "รอตรวจสอบ";
  if (RESOLVED_STATUS_SET.has(text)) return "ส่งบัญชีแล้ว";

  return status || "รอตรวจสอบ";
}

function getWasteValue(row) {
  return Number(row.waste_weight_kg || row.waste_qty || 0) || 0;
}

function getDepartmentText(row) {
  return (
    row.department_name ||
    row.department_code ||
    row.department ||
    row.dept ||
    row.dept_code ||
    "-"
  );
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}


function safeJsonParse(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch (_) {
    return null;
  }
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
// DEBUG HELPER
// ใช้ใน Console ได้: debugDailyWasteToday()
// ======================================================

async function debugDailyWasteToday() {
  const date = getValue("filterDate") || getLocalDateString(new Date());

  const { data, error } = await supabaseClient
    .from("daily_waste_reports")
    .select("id, report_date, status, department_code, department, machine_no, problem_type, waste_weight_kg, waste_qty, reported_by, created_at")
    .eq("report_date", date)
    .order("created_at", { ascending: false });

  console.table(data || []);
  if (error) console.error(error);

  return { data, error };
}

window.debugDailyWasteToday = debugDailyWasteToday;

async function debugMyDepartments() {
  const profile = currentProfile || getLocalProfile();

  console.log("currentProfile:", profile);
  console.log("responsibleDepartments:", responsibleDepartments);
  console.log("allowedDepartments:", getAllowedDepartmentCodes());

  if (!profile?.id) {
    console.warn("ไม่พบ activeUserId หรือ currentProfile.id");
    return { data: [], error: "missing user id" };
  }

  const { data, error } = await supabaseClient
    .from("user_departments")
    .select("department_code")
    .eq("user_id", profile.id);

  console.table(data || []);
  if (error) console.error(error);

  return { data, error };
}

window.debugMyDepartments = debugMyDepartments;


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
