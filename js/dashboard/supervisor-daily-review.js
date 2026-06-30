// ======================================================
// supervisor-daily-review.js
// หน้าให้หัวหน้างานตรวจสอบข้อมูลของเสียรายวัน
// Go Live Version: ใช้ daily_waste_reports + daily_waste_report_items
// ------------------------------------------------------
// Workflow:
// 1) Form บันทึกข้อมูล -> daily_waste_reports.status = pending / pending_supervisor
// 2) Supervisor ตรวจแล้ว -> status = sent_accounting
// 3) Accounting เห็นเฉพาะ sent_accounting และตรวจต่อ
// ======================================================

let currentProfile = null;
let currentRecords = [];
let responsibleDepartments = [];
let departmentStandards = {};

const REPORT_TABLE = "daily_waste_reports";
const ITEM_TABLE = "daily_waste_report_items";

const STATUS = {
  PENDING: "pending",
  SENT_ACCOUNTING: "sent_accounting",
  ACCOUNTING_CHECKED: "accounting_checked",
};

const FILTER_STATUS = {
  PENDING: "pending",
  SENT_ACCOUNTING: "sent_accounting",
  ALL: "all",
};

const PENDING_STATUS_SET = new Set([
  "",
  "pending",
  "pending_supervisor",
  "submitted",
  "draft",
  "waiting_supervisor",
  "รอตรวจสอบ",
]);

const SENT_ACCOUNTING_STATUS_SET = new Set([
  "sent_accounting",
  "resolved",
  "ส่งบัญชีแล้ว",
  "ตรวจแล้ว",
]);

const ACCOUNTING_CHECKED_STATUS_SET = new Set([
  "accounting_checked",
  "checked",
  "approved",
  "done",
  "completed",
  "บัญชีตรวจแล้ว",
]);

const RESOLVED_STATUS_SET = new Set([
  ...SENT_ACCOUNTING_STATUS_SET,
  ...ACCOUNTING_CHECKED_STATUS_SET,
]);

const DEPARTMENT_LABELS_TH = {
  BLOW: "เป่าถุง",
  BLOWN_FILM: "เป่าฟิล์ม",
  PIPE: "ท่อ",
  MONO: "โมโน",
  SHEET_CUTTING: "ตัดผืน",
  CUT_PUNCH: "ตัดเจาะ",
  GARBAGE_BAG_CUT: "ตัดถุงขยะ",
  RAIN_TAPE: "เทปน้ำพุ่ง",
  RAIN_TAPE_CUT_PUNCH: "ตัดเจาะเทปน้ำพุ่ง",
  SHADE_NET: "สแลน",
  ACCOUNTING: "บัญชี",
  MANAGEMENT: "ผู้บริหาร",
};

// ======================================================
// START
// ======================================================

document.addEventListener("DOMContentLoaded", async () => {
  await initPage();
});

async function initPage() {
  const today = getLocalDateString(new Date());

  setValue("filterDate", today);
  setValue("filterStatus", FILTER_STATUS.PENDING);
  initHistoryMonthRange();

  currentProfile = getLocalProfile();

  if (!currentProfile) {
    notify("ไม่พบข้อมูลผู้ใช้งาน กรุณา Login ใหม่", "error");
    window.location.href = "/login.html";
    return;
  }

  const allowedRoles = [
    "admin",
    "management",
    "supervisor",
    "manager",
    "executive",
  ];

  if (!allowedRoles.includes(normalizeText(currentProfile.role))) {
    notify("สิทธิ์การเข้าถึงล้มเหลว: เฉพาะหัวหน้างานหรือผู้ดูแลระบบ", "error");
    window.location.href = "/login.html";
    return;
  }

  await loadDepartmentStandards();
  await loadResponsibleDepartments();
  renderLoginUserInfo();

  if (!canSeeAllDepartments() && !getAllowedDepartmentCodes().length) {
    notify("User นี้ยังไม่ได้กำหนดแผนก กรุณาเพิ่ม department_code ในหน้า Admin", "error");
    return;
  }

  await loadRecords();
}

// ======================================================
// PROFILE / ROLE / DEPARTMENT
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
    normalizeText(currentProfile?.role),
  );
}

async function loadDepartmentStandards() {
  try {
    const { data, error } = await supabaseClient
      .from("master_departments")
      .select("department_code, department_name, max_waste_percent, warning_percent")
      .eq("is_active", true);

    if (error) throw error;

    departmentStandards = {};

    (data || []).forEach((dept) => {
      const code = normalizeDepartmentCode(dept.department_code);
      departmentStandards[code] = {
        code,
        name: dept.department_name,
        maxWastePercent: Number(dept.max_waste_percent || 3),
        warningPercent: Number(dept.warning_percent || 0),
      };
    });
  } catch (error) {
    console.warn("โหลด master_departments ไม่สำเร็จ:", error);
    departmentStandards = {};
  }
}

async function loadResponsibleDepartments() {
  responsibleDepartments = [];

  if (canSeeAllDepartments()) return;

  const fallbackDept = normalizeDepartmentCode(
    currentProfile?.department_code || currentProfile?.department_name || "",
  );

  if (fallbackDept) responsibleDepartments.push(fallbackDept);

  if (!currentProfile?.id) {
    responsibleDepartments = uniqueArray(responsibleDepartments);
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("user_departments")
      .select("department_code")
      .eq("user_id", currentProfile.id);

    if (error) throw error;

    const mapped = (data || [])
      .map((row) => normalizeDepartmentCode(row.department_code))
      .filter(Boolean);

    responsibleDepartments = uniqueArray([
      ...responsibleDepartments,
      ...mapped,
    ]);
  } catch (error) {
    console.warn("อ่าน user_departments ไม่ได้ ใช้ activeDept เดิมแทน:", error);
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

function filterRecordsForCurrentDepartment(rows) {
  if (!Array.isArray(rows)) return [];
  if (canSeeAllDepartments()) return rows;

  const allowed = getAllowedDepartmentCodes();
  if (!allowed.length) return rows;

  return rows.filter((row) => {
    const code = normalizeDepartmentCode(row.department_code || row.department || "");
    return allowed.includes(code);
  });
}

function renderLoginUserInfo() {
  setText("userName", currentProfile.display_name || currentProfile.username || "-");

  const deptText = canSeeAllDepartments()
    ? "รับผิดชอบ: ทุกแผนก"
    : getAllowedDepartmentCodes().length
      ? `รับผิดชอบ: ${getAllowedDepartmentCodes().map(getDepartmentLabelTH).join(", ")}`
      : `รับผิดชอบ: ${getDepartmentLabelTH(currentProfile.department_name || currentProfile.department_code)}`;

  setText("userDept", deptText);
}

function normalizeDepartmentCode(value) {
  const text = String(value || "").trim();
  const key = text.toLowerCase();

  const aliases = {
    blow: "BLOW",
    bag_blow: "BLOW",
    เป่าถุง: "BLOW",
    pipe: "PIPE",
    ท่อ: "PIPE",
    mono: "MONO",
    โมโน: "MONO",
    blown_film: "BLOWN_FILM",
    print: "BLOWN_FILM",
    เป่าฟิล์ม: "BLOWN_FILM",
    ม้วนพิมพ์: "BLOWN_FILM",
    sheet: "SHEET_CUTTING",
    sheet_cutting: "SHEET_CUTTING",
    ตัดผืน: "SHEET_CUTTING",
    cut_punch: "CUT_PUNCH",
    cutting: "CUT_PUNCH",
    ตัดเจาะ: "CUT_PUNCH",
    garbage_bag_cut: "GARBAGE_BAG_CUT",
    ตัดถุงขยะ: "GARBAGE_BAG_CUT",
    rain_tape: "RAIN_TAPE",
    เทปน้ำพุ่ง: "RAIN_TAPE",
    เป่าเทปน้ำพุ่ง: "RAIN_TAPE",
    rain_tape_cut_punch: "RAIN_TAPE_CUT_PUNCH",
    ตัดเทปน้ำพุ่ง: "RAIN_TAPE_CUT_PUNCH",
    shade_net: "SHADE_NET",
    สแลน: "SHADE_NET",
    accounting: "ACCOUNTING",
    บัญชี: "ACCOUNTING",
    management: "MANAGEMENT",
    ผู้บริหาร: "MANAGEMENT",
  };

  return aliases[key] || text.toUpperCase().replace(/[\s-]+/g, "_");
}

function getDepartmentLabelTH(code) {
  const normalized = normalizeDepartmentCode(code);
  return (
    departmentStandards[normalized]?.name ||
    DEPARTMENT_LABELS_TH[normalized] ||
    code ||
    "-"
  );
}

function getDepartmentInfo(row) {
  const code = normalizeDepartmentCode(row.department_code || row.department || "");
  const master = departmentStandards[code];

  return {
    code,
    name: master?.name || row.department || row.department_code || "-",
    maxWastePercent: master?.maxWastePercent ?? null,
    warningPercent: master?.warningPercent ?? null,
  };
}

function getDepartmentText(row) {
  return getDepartmentInfo(row).name;
}

// ไม่กรองใน query เพื่อกันข้อมูลหายจาก schema/RLS เดิม แล้วค่อยกรองด้วย JS
function applyDepartmentFilter(query) {
  return query;
}

// ======================================================
// DATE HELPERS
// ======================================================

function getLocalDateString(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function initHistoryMonthRange() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  setValue("historyStartDate", getLocalDateString(firstDay));
  setValue("historyEndDate", getLocalDateString(lastDay));
}

function setHistoryRangeThisWeek() {
  const range = getThisWeekMondayToSunday();
  setValue("historyStartDate", range.start);
  setValue("historyEndDate", range.end);
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

function getThisWeekMondayToSunday() {
  const today = new Date();
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

// ======================================================
// LOAD RECORDS + ITEMS
// ======================================================

async function loadRecords() {
  const list = document.getElementById("recordList");
  if (!list) return;

  list.innerHTML = `<p class="empty">กำลังโหลดข้อมูล...</p>`;

  const filterDate = getValue("filterDate");
  const filterStatus = getValue("filterStatus") || FILTER_STATUS.PENDING;

  if (!filterDate) {
    list.innerHTML = `<p class="empty">กรุณาเลือกวันที่</p>`;
    return;
  }

  try {
    await loadSummary(filterDate);

    let query = supabaseClient
      .from(REPORT_TABLE)
      .select("*")
      .eq("report_date", filterDate)
      .order("created_at", { ascending: false });

    query = applyDepartmentFilter(query);

    const { data, error } = await query;
    if (error) throw error;

    const rows = await attachProblemItemsToReports(Array.isArray(data) ? data : []);
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

    list.innerHTML = currentRecords.length
      ? currentRecords.map(renderRecordCard).join("")
      : renderEmptyRecordMessage(rows.length, deptRows.length, filterStatus);

    await loadHistory();
  } catch (error) {
    console.error("โหลดข้อมูลไม่สำเร็จ:", error);
    list.innerHTML = `<p class="empty">โหลดข้อมูลไม่สำเร็จ: ${safeText(error.message)}</p>`;
  }
}

async function attachProblemItemsToReports(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows || [];

  const reportIds = rows.map((row) => row.id).filter(Boolean);
  if (!reportIds.length) return rows.map(normalizeReportItemsFallback);

  try {
    const { data, error } = await supabaseClient
      .from(ITEM_TABLE)
      .select("id, report_id, problem_id, problem_type, waste_weight_kg, detail, created_at")
      .in("report_id", reportIds)
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("โหลด daily_waste_report_items ไม่สำเร็จ ใช้ข้อมูลหัวรายงานแทน:", error);
      return rows.map(normalizeReportItemsFallback);
    }

    const itemMap = new Map();

    (data || []).forEach((item) => {
      const reportId = String(item.report_id || "");
      if (!itemMap.has(reportId)) itemMap.set(reportId, []);

      itemMap.get(reportId).push({
        id: item.id,
        problem_id: item.problem_id || null,
        problem_type: item.problem_type || "ไม่ระบุปัญหา",
        waste_weight_kg: Number(item.waste_weight_kg || 0),
        detail: item.detail || "",
      });
    });

    return rows.map((row) => {
      const items = itemMap.get(String(row.id)) || [];
      return {
        ...row,
        problem_items: items.length ? items : getFallbackProblemItems(row),
      };
    });
  } catch (error) {
    console.warn("attachProblemItemsToReports error:", error);
    return rows.map(normalizeReportItemsFallback);
  }
}

function normalizeReportItemsFallback(row) {
  return {
    ...row,
    problem_items: getFallbackProblemItems(row),
  };
}

function getFallbackProblemItems(row) {
  return [
    {
      id: `${row?.id || "fallback"}-item`,
      problem_type: row?.problem_type || row?.reason_detail || "ไม่ระบุปัญหา",
      waste_weight_kg: Number(row?.waste_weight_kg || row?.waste_qty || 0),
      detail: row?.detail || row?.note || "",
    },
  ];
}

function getReportItems(record) {
  const items = Array.isArray(record?.problem_items) ? record.problem_items : [];
  return items.length ? items : getFallbackProblemItems(record || {});
}

function getReportItemsWaste(record) {
  const total = getReportItems(record).reduce(
    (sum, item) => sum + Number(item.waste_weight_kg || 0),
    0,
  );

  return total || getWasteValue(record);
}

function filterRecordsByStatus(rows, filterStatus) {
  if (!Array.isArray(rows)) return [];
  if (filterStatus === FILTER_STATUS.ALL || filterStatus === "all") return rows;

  return rows.filter((row) => {
    const status = normalizeText(row.status);

    if (filterStatus === FILTER_STATUS.PENDING || filterStatus === "pending") {
      return PENDING_STATUS_SET.has(status) || !RESOLVED_STATUS_SET.has(status);
    }

    if (filterStatus === FILTER_STATUS.SENT_ACCOUNTING || filterStatus === "resolved") {
      return SENT_ACCOUNTING_STATUS_SET.has(status) || ACCOUNTING_CHECKED_STATUS_SET.has(status);
    }

    return status === normalizeText(filterStatus);
  });
}

function renderEmptyRecordMessage(totalFromDB, afterDeptFilter, filterStatus) {
  if (totalFromDB > 0 && afterDeptFilter === 0 && !canSeeAllDepartments()) {
    return `
      <div class="empty">
        <strong>พบข้อมูลในวันที่เลือก แต่ไม่ตรงกับแผนกของ User นี้</strong><br />
        แผนกของคุณ: ${safeText(currentProfile.department_code || currentProfile.department_name || "-")}<br />
        กรุณาตรวจ activeDept / department_code ของ User ในหน้า Admin
      </div>
    `;
  }

  if (afterDeptFilter > 0 && filterStatus !== "all") {
    return `
      <div class="empty">
        ไม่พบข้อมูลสถานะ “${safeText(getStatusLabel(filterStatus))}”<br />
        ลองเปลี่ยนสถานะเป็น “ทั้งหมด”
      </div>
    `;
  }

  return `<p class="empty">ไม่พบข้อมูลรายการของเสียในวันที่เลือก</p>`;
}

// ======================================================
// SUMMARY KPI
// ======================================================

async function loadSummary(reportDate) {
  try {
    let query = supabaseClient
      .from(REPORT_TABLE)
      .select("id, status, machine_no, waste_weight_kg, waste_qty, department_code, department")
      .eq("report_date", reportDate);

    query = applyDepartmentFilter(query);

    const { data, error } = await query;
    if (error) throw error;

    const hydratedRows = await attachProblemItemsToReports(Array.isArray(data) ? data : []);
    const rows = filterRecordsForCurrentDepartment(hydratedRows);

    const pending = rows.filter((row) => {
      const status = normalizeText(row.status);
      return PENDING_STATUS_SET.has(status) || !RESOLVED_STATUS_SET.has(status);
    }).length;

    const totalWaste = rows.reduce((sum, row) => sum + getReportItemsWaste(row), 0);

    const machineWasteMap = {};
    rows.forEach((row) => {
      const machine = row.machine_no || "ไม่ระบุเครื่อง";
      machineWasteMap[machine] = (machineWasteMap[machine] || 0) + getReportItemsWaste(row);
    });

    const topMachine = Object.entries(machineWasteMap).sort((a, b) => b[1] - a[1])[0];

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
// RENDER RECORD CARD
// ======================================================

function renderRecordCard(record) {
  const status = normalizeText(record.status);
  const isResolved = RESOLVED_STATUS_SET.has(status);
  const isPending = !isResolved;
  const totalWaste = getReportItemsWaste(record);

  return `
    <article class="record-card">
      <div class="record-top">
        <div>
          <div class="record-title">แผนก: ${safeText(getDepartmentText(record))}</div>
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

      <div class="problem-section-title">
        <span class="material-symbols-outlined">list_alt</span>
        <span>รายการปัญหา</span>
        <strong>${formatNumber(totalWaste)} kg</strong>
      </div>

      ${renderProblemItemsTable(record)}

      <div class="note-box">
        <label for="note-${safeAttr(record.id)}">หมายเหตุหัวหน้า</label>
        <textarea
          id="note-${safeAttr(record.id)}"
          rows="2"
          placeholder="ใส่หมายเหตุถ้ามี"
          ${isResolved ? "disabled" : ""}
        >${safeText(record.supervisor_note || "")}</textarea>
      </div>

      <div class="evidence-box">
        <div class="evidence-title">หลักฐานรูปภาพ (ไม่บังคับ)</div>
        <div class="evidence-actions">
          <input
            id="evidence-file-${safeAttr(record.id)}"
            class="evidence-file-input"
            type="file"
            accept="image/*"
            ${isResolved ? "disabled" : ""}
          />
          <button
            class="btn secondary"
            type="button"
            onclick="uploadEvidenceForRecord('${safeAttr(record.id)}')"
            ${isResolved ? "disabled" : ""}
          >
            📷 อัปโหลดรูปหลักฐาน
          </button>
        </div>
        <div class="evidence-preview" id="evidence-preview-${safeAttr(record.id)}">
          ${renderEvidencePreview(record)}
        </div>
        <div class="evidence-empty">รูปภาพจะถูกเก็บไว้กับรายการนี้เพื่อใช้เป็นหลักฐานประกอบการตรวจสอบ</div>
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
              <span class="record-meta">${safeText(getStatusLabel(record.status))}</span>
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

function renderProblemItemsTable(record) {
  const items = getReportItems(record);
  const totalWaste = items.reduce((sum, item) => sum + Number(item.waste_weight_kg || 0), 0);

  return `
    <div class="problem-table-wrap">
      <table class="problem-table">
        <thead>
          <tr>
            <th>ปัญหา</th>
            <th class="text-right">น้ำหนัก (kg)</th>
            <th>รายละเอียด</th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
                <tr>
                  <td><strong>${safeText(item.problem_type || "-")}</strong></td>
                  <td class="text-right">${formatNumber(item.waste_weight_kg || 0)}</td>
                  <td>${safeText(item.detail || "-")}</td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
        <tfoot>
          <tr>
            <td>รวมของเสีย</td>
            <td class="text-right">${formatNumber(totalWaste || getWasteValue(record))}</td>
            <td>kg</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

// ======================================================
// HISTORY
// ======================================================

async function loadHistory() {
  const tbody = document.getElementById("historyTableBody");
  if (!tbody) return;

  const startDate = getValue("historyStartDate");
  const endDate = getValue("historyEndDate");

  if (!startDate || !endDate) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-cell">กรุณาเลือกช่วงวันที่ประวัติ</td></tr>`;
    setText("historySummary", "กรุณาเลือกช่วงวันที่ประวัติ");
    return;
  }

  if (startDate > endDate) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-cell">วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด</td></tr>`;
    setText("historySummary", "ช่วงวันที่ไม่ถูกต้อง");
    return;
  }

  tbody.innerHTML = `<tr><td colspan="10" class="empty-cell">กำลังโหลดประวัติ...</td></tr>`;
  setText("historySummary", "กำลังโหลดสรุปประวัติ...");

  try {
    let query = supabaseClient
      .from(REPORT_TABLE)
      .select("*")
      .gte("report_date", startDate)
      .lte("report_date", endDate)
      .order("report_date", { ascending: false })
      .order("checked_at", { ascending: false, nullsFirst: false });

    query = applyDepartmentFilter(query);

    const { data, error } = await query;
    if (error) throw error;

    const hydratedRows = await attachProblemItemsToReports(Array.isArray(data) ? data : []);
    const allRows = filterRecordsForCurrentDepartment(hydratedRows);
    const rows = filterRecordsByStatus(allRows, FILTER_STATUS.SENT_ACCOUNTING);

    renderHistorySummary(rows, startDate, endDate);
    renderHistoryTable(rows);
  } catch (error) {
    console.error("โหลดประวัติไม่สำเร็จ:", error);
    tbody.innerHTML = `<tr><td colspan="10" class="empty-cell">โหลดประวัติไม่สำเร็จ: ${safeText(error.message)}</td></tr>`;
    setText("historySummary", "โหลดประวัติไม่สำเร็จ");
  }
}

function renderHistorySummary(rows, startDate, endDate) {
  const totalWaste = rows.reduce((sum, row) => sum + getReportItemsWaste(row), 0);
  const totalRecords = rows.length;

  const machineWasteMap = {};
  rows.forEach((row) => {
    const machine = row.machine_no || "ไม่ระบุเครื่อง";
    machineWasteMap[machine] = (machineWasteMap[machine] || 0) + getReportItemsWaste(row);
  });

  const topMachine = Object.entries(machineWasteMap).sort((a, b) => b[1] - a[1])[0];
  const topMachineText = topMachine
    ? ` | เครื่องสูงสุด: ${topMachine[0]} (${formatNumber(topMachine[1])} kg)`
    : "";

  setText(
    "historySummary",
    `ช่วง ${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)} | ส่งบัญชีแล้ว ${formatNumber(totalRecords)} รายการ | ของเสีย ${formatNumber(totalWaste)} kg${topMachineText}`,
  );
}

function renderHistoryTable(rows) {
  const tbody = document.getElementById("historyTableBody");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-cell">ยังไม่มีประวัติการตรวจสอบในช่วงวันที่เลือก</td></tr>`;
    return;
  }

  tbody.innerHTML = rows
    .map((row) => {
      const itemsText = getReportItems(row)
        .map((item) => {
          const detail = item.detail ? ` (${item.detail})` : "";
          return `${item.problem_type || "-"} ${formatNumber(item.waste_weight_kg || 0)} kg${detail}`;
        })
        .join(" / ");

      return `
        <tr>
          <td>${safeText(formatDisplayDate(row.report_date || "-"))}</td>
          <td>${safeText(getDepartmentText(row))}</td>
          <td>${safeText(row.shift || row.work_shift || "-")}</td>
          <td>${safeText(row.machine_no || "-")}</td>
          <td>${safeText(itemsText || "-")}</td>
          <td>${formatNumber(getReportItemsWaste(row))} kg</td>
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
// EVIDENCE IMAGE
// ======================================================

function renderEvidencePreview(record) {
  const evidenceUrl = getEvidenceImageUrl(record);

  if (!evidenceUrl) {
    return `<div class="evidence-empty">ยังไม่มีรูปภาพหลักฐานในรายการนี้</div>`;
  }

  return `
    <img src="${safeAttr(evidenceUrl)}" alt="หลักฐานของเสีย" />
    <a class="evidence-link" href="${safeAttr(evidenceUrl)}" target="_blank" rel="noreferrer">
      เปิดรูปภาพในแท็บใหม่
    </a>
  `;
}

function getEvidenceImageUrl(record) {
  const directValue =
    record?.evidence_image_url ||
    record?.evidence_url ||
    record?.image_url ||
    record?.photo_url ||
    record?.evidence_image ||
    record?.photo ||
    "";

  if (directValue) return directValue;

  const combinedText = [record?.detail, record?.note, record?.supervisor_note]
    .filter(Boolean)
    .join("\n");

  if (!combinedText) return "";

  const markerMatch = combinedText.match(/__evidence_image__:(.+)$/im);
  if (markerMatch?.[1]) return markerMatch[1].trim();

  const urlMatch = combinedText.match(/(data:image\/[^\s]+|https?:\/\/[^\s]+)/i);
  return urlMatch?.[1] || "";
}

async function uploadEvidenceForRecord(id) {
  const input = document.getElementById(`evidence-file-${CSS.escape(String(id))}`);
  const file = input?.files?.[0];

  if (!file) {
    notify("กรุณาเลือกไฟล์รูปภาพก่อนอัปโหลด", "error");
    return;
  }

  if (!file.type.startsWith("image/")) {
    notify("กรุณาเลือกไฟล์รูปภาพเท่านั้น", "error");
    return;
  }

  const record = currentRecords.find((item) => String(item.id) === String(id));
  if (!record) {
    notify("ไม่พบรายการที่เลือก", "error");
    return;
  }

  const preview = document.getElementById(`evidence-preview-${CSS.escape(String(id))}`);
  if (preview) preview.innerHTML = `<div class="evidence-empty">กำลังอัปโหลดรูปภาพหลักฐาน...</div>`;

  try {
    let imageUrl = "";
    let objectPath = "";

    try {
      const cleanFileName = String(file.name).replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `daily_waste_evidence/${currentProfile?.id || "unknown"}/${String(id)}/${Date.now()}-${cleanFileName}`;

      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from("daily-waste-evidence")
        .upload(storagePath, file, { cacheControl: "3600", upsert: false });

      if (!uploadError && uploadData) {
        const { data: publicData } = supabaseClient.storage
          .from("daily-waste-evidence")
          .getPublicUrl(storagePath);

        imageUrl = publicData?.publicUrl || "";
        objectPath = storagePath;
      } else {
        console.warn("Upload evidence image to storage failed:", uploadError);
      }
    } catch (storageError) {
      console.warn("Storage upload exception:", storageError);
    }

    if (!imageUrl) imageUrl = await readFileAsDataUrl(file);

    const existingDetail = String(record.detail || "").replace(/__evidence_image__:.+/gim, "").trim();
    const fallbackDetail = existingDetail
      ? `${existingDetail}\n__evidence_image__:${imageUrl}`
      : `__evidence_image__:${imageUrl}`;

    const existingNote = String(record.note || "").replace(/__evidence_image__:.+/gim, "").trim();
    const fallbackNote = existingNote
      ? `${existingNote}\n__evidence_image__:${imageUrl}`
      : `__evidence_image__:${imageUrl}`;

    const updatePayload = {
      detail: fallbackDetail,
      note: fallbackNote,
      evidence_image_url: imageUrl,
      evidence_image_path: objectPath || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseClient
      .from(REPORT_TABLE)
      .update(updatePayload)
      .eq("id", id);

    if (error) {
      const fallbackResponse = await supabaseClient
        .from(REPORT_TABLE)
        .update({ detail: fallbackDetail, note: fallbackNote, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (fallbackResponse.error) throw fallbackResponse.error;
    }

    notify("อัปโหลดรูปภาพหลักฐานเรียบร้อยแล้ว", "success");
    input.value = "";
    await loadRecords();
  } catch (error) {
    console.error("อัปโหลดรูปภาพหลักฐานไม่สำเร็จ:", error);
    notify(`อัปโหลดรูปภาพหลักฐานไม่สำเร็จ: ${error.message || error}`, "error");
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result || "");
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

// ======================================================
// EDIT RECORD
// ======================================================

function openEditModal(id) {
  const record = currentRecords.find((item) => String(item.id) === String(id));

  if (!record) {
    notify("ไม่พบรายการที่ต้องการแก้ไข", "error");
    return;
  }

  setValue("editRecordId", record.id);
  setValue("editShift", record.shift || record.work_shift || "");
  setValue("editMachineNo", record.machine_no || "");
  setValue("editProblemType", getReportItems(record)[0]?.problem_type || record.problem_type || record.reason_detail || "");
  setValue("editWasteWeight", getReportItemsWaste(record));
  setValue("editDetail", getReportItems(record).map((item) => item.detail).filter(Boolean).join(" / ") || record.detail || record.note || "");
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
    notify("ไม่พบรหัสรายการ", "error");
    return;
  }

  const shift = getValue("editShift");
  const machineNo = getValue("editMachineNo");
  const problemType = getValue("editProblemType");
  const wasteWeight = Number(getValue("editWasteWeight") || 0);
  const detail = getValue("editDetail");
  const supervisorNote = getValue("editSupervisorNote");

  if (!machineNo) {
    notify("กรุณาระบุเครื่องจักร", "error");
    return;
  }

  if (!problemType) {
    notify("กรุณาระบุปัญหา", "error");
    return;
  }

  if (!Number.isFinite(wasteWeight) || wasteWeight < 0) {
    notify("กรุณาระบุน้ำหนักของเสียให้ถูกต้อง", "error");
    return;
  }

  try {
    const payload = {
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
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabaseClient
      .from(REPORT_TABLE)
      .update(payload)
      .eq("id", id);

    if (error) throw error;

    // ถ้าเป็นข้อมูลหลายปัญหาจริง จะไม่แก้ item ย่อยใน modal นี้เพื่อกันข้อมูลผิด
    // modal นี้ใช้แก้ข้อมูลหัวรายงานและ fallback เดิมเท่านั้น
    closeEditModal();
    notify("แก้ไขข้อมูลเรียบร้อยแล้ว", "success");
    await loadRecords();
  } catch (error) {
    console.error("แก้ไขไม่สำเร็จ:", error);
    notify(`แก้ไขไม่สำเร็จ: ${error.message || error}`, "error");
  }
}

// ======================================================
// APPROVE / SEND ACCOUNTING
// ======================================================

async function approveRecord(id) {
  const ok = window.confirm("ยืนยันตรวจแล้ว และส่งข้อมูลให้บัญชีใช่ไหม?");
  if (!ok) return;

  const note = document.getElementById(`note-${CSS.escape(String(id))}`)?.value || "";

  try {
    const { error } = await supabaseClient
      .from(REPORT_TABLE)
      .update({
        status: STATUS.SENT_ACCOUNTING,
        checked_by: currentProfile.id || null,
        checked_by_name: currentProfile.display_name || currentProfile.username,
        checked_at: new Date().toISOString(),
        supervisor_note: note,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;

    notify("ส่งข้อมูลให้บัญชีเรียบร้อยแล้ว", "success");
    await loadRecords();
  } catch (error) {
    console.error("ส่งบัญชีไม่สำเร็จ:", error);
    notify(`ส่งบัญชีไม่สำเร็จ: ${error.message || error}`, "error");
  }
}

// ======================================================
// DELETE
// ======================================================

async function deleteRecord(id) {
  const ok = window.confirm("ต้องการลบรายการนี้ใช่ไหม?\n\nใช้เฉพาะกรณีข้อมูลกรอกผิดจริง และไม่ต้องการส่งบัญชี");
  if (!ok) return;

  try {
    const { error } = await supabaseClient
      .from(REPORT_TABLE)
      .delete()
      .eq("id", id);

    if (error) throw error;

    notify("ลบรายการเรียบร้อยแล้ว", "success");
    await loadRecords();
  } catch (error) {
    console.error("ลบรายการไม่สำเร็จ:", error);
    notify(`ลบรายการไม่สำเร็จ: ${error.message || error}`, "error");
  }
}

// ======================================================
// LOGOUT
// ======================================================

function logout() {
  const ok = window.confirm("ต้องการออกจากระบบใช่ไหม?");
  if (!ok) return;

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
// DATA HELPERS
// ======================================================

function getStatusLabel(status) {
  const text = normalizeText(status);

  if (PENDING_STATUS_SET.has(text)) return "รอตรวจสอบ";
  if (SENT_ACCOUNTING_STATUS_SET.has(text)) return "ส่งบัญชีแล้ว";
  if (ACCOUNTING_CHECKED_STATUS_SET.has(text)) return "บัญชีตรวจแล้ว";

  return status || "รอตรวจสอบ";
}

function getWasteValue(row) {
  return Number(row?.waste_weight_kg || row?.waste_qty || 0) || 0;
}

function getProductionValue(row) {
  return (
    Number(
      row?.production_weight_kg ||
        row?.total_qty ||
        row?.produced_weight_kg ||
        row?.production_qty ||
        0,
    ) || 0
  );
}

function calcWastePercent(waste, production) {
  if (!production) return null;
  return (waste / production) * 100;
}

function getWasteResult(row) {
  const waste = getReportItemsWaste(row);
  const production = getProductionValue(row);
  const percent = calcWastePercent(waste, production);
  const dept = getDepartmentInfo(row);

  const status = normalizeText(row.status);
  const isAccountingChecked = ACCOUNTING_CHECKED_STATUS_SET.has(status);

  if (!isAccountingChecked || !production) {
    return {
      percentText: "-",
      standardText: dept.maxWastePercent !== null ? `${formatNumber(dept.maxWastePercent)}%` : "-",
      label: "รอบัญชีกรอกน้ำหนักผลิต",
      className: "result-none",
    };
  }

  if (dept.maxWastePercent === null) {
    return {
      percentText: `${formatNumber(percent)}%`,
      standardText: "-",
      label: "ไม่พบเกณฑ์",
      className: "result-none",
    };
  }

  if (percent > dept.maxWastePercent) {
    return {
      percentText: `${formatNumber(percent)}%`,
      standardText: `${formatNumber(dept.maxWastePercent)}%`,
      label: `เกิน ${formatNumber(percent - dept.maxWastePercent)}%`,
      className: "result-danger",
    };
  }

  if (dept.warningPercent > 0 && percent >= dept.warningPercent) {
    return {
      percentText: `${formatNumber(percent)}%`,
      standardText: `${formatNumber(dept.maxWastePercent)}%`,
      label: "เริ่มสูง",
      className: "result-warning",
    };
  }

  return {
    percentText: `${formatNumber(percent)}%`,
    standardText: `${formatNumber(dept.maxWastePercent)}%`,
    label: "ปกติ",
    className: "result-success",
  };
}

// ======================================================
// SMALL HELPERS
// ======================================================

function safeJsonParse(value) {
  try {
    return value ? JSON.parse(value) : null;
  } catch (_) {
    return null;
  }
}

function uniqueArray(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function normalizeText(value) {
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

function notify(message, type = "info") {
  const prefix = type === "success" ? "✅ " : type === "error" ? "⚠️ " : "";
  console[type === "error" ? "error" : "log"](message);
  window.alert(prefix + message);
}

// ======================================================
// DEBUG
// ======================================================

async function debugDailyWasteToday() {
  const date = getValue("filterDate") || getLocalDateString(new Date());

  const { data, error } = await supabaseClient
    .from(REPORT_TABLE)
    .select("id, report_date, status, department_code, department, machine_no, problem_type, waste_weight_kg, waste_qty, reported_by, created_at")
    .eq("report_date", date)
    .order("created_at", { ascending: false });

  console.table(data || []);
  if (error) console.error(error);

  return { data, error };
}

async function debugDailyWasteItemsToday() {
  const date = getValue("filterDate") || getLocalDateString(new Date());

  const { data: reports, error: reportError } = await supabaseClient
    .from(REPORT_TABLE)
    .select("id, report_date, machine_no")
    .eq("report_date", date);

  if (reportError) {
    console.error(reportError);
    return { data: [], error: reportError };
  }

  const ids = (reports || []).map((row) => row.id);

  const { data, error } = await supabaseClient
    .from(ITEM_TABLE)
    .select("id, report_id, problem_type, waste_weight_kg, detail, created_at")
    .in("report_id", ids);

  console.table(data || []);
  if (error) console.error(error);

  return { data, error };
}

window.debugDailyWasteToday = debugDailyWasteToday;
window.debugDailyWasteItemsToday = debugDailyWasteItemsToday;

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
window.uploadEvidenceForRecord = uploadEvidenceForRecord;
