/* ======================================================
   ACCOUNTING PANEL JS
   EA Factory Waste Management v1.0
   ------------------------------------------------------
   หน้านี้ใช้สำหรับแผนกบัญชี:
   1) โหลดข้อมูลของเสียจาก daily_waste_reports
   2) โหลดเกณฑ์ % Waste จาก master_departments
   3) รวมข้อมูลตาม วันที่ + แผนก + กะ + เครื่อง
      เพราะ 1 เครื่องใน 1 วัน อาจมีหลายอาการ/หลายสาเหตุ
   4) ให้บัญชีกรอกน้ำหนักผลิต 1 ครั้งต่อกลุ่ม
   5) คำนวณ % Waste ของเครื่องจาก:
      ของเสียรวมทุกอาการ / น้ำหนักผลิตของเครื่อง
   6) แสดงสัดส่วนของแต่ละอาการในช่องอาการ
   7) Export CSV สำหรับเปิดด้วย Excel

   ตารางหลักที่ใช้:
   - daily_waste_reports
   - master_departments

   หมายเหตุสำคัญ:
   - ของเสีย = รายการละเอียด แยกตามอาการ/สาเหตุ
   - น้ำหนักผลิต = กรอกระดับกลุ่ม วันที่+แผนก+กะ+เครื่อง
   - เวลา Save ระบบจะบันทึกน้ำหนักผลิตเดียวกันให้ทุกรายการในกลุ่ม
     แต่เวลาแสดง/สรุป จะนับน้ำหนักผลิตแค่ 1 ครั้งต่อกลุ่ม
====================================================== */

/* ======================================================
   CONFIG
====================================================== */

const REPORT_TABLE = "daily_waste_reports";
const MASTER_DEPARTMENT_TABLE = "master_departments";
const REPORT_ITEM_TABLE = "daily_waste_report_items";

// Role ที่เข้าใช้งานหน้าบัญชีได้
const ALLOW_ROLES = ["admin", "accounting", "management"];

// สถานะที่ถือว่าบัญชีตรวจแล้ว
const ACCOUNTING_PENDING_STATUS = "sent_accounting";
const ACCOUNTING_CHECKED_STATUS = "accounting_checked";

// สถานะที่บัญชีควรเห็น:
// - sent_accounting = หัวหน้าตรวจแล้ว ส่งเข้าบัญชี
// - accounting_checked = บัญชีตรวจแล้ว
const ACCOUNTING_VISIBLE_STATUS_SET = new Set([
  ACCOUNTING_PENDING_STATUS,
  ACCOUNTING_CHECKED_STATUS,
  "checked",
  "บัญชีตรวจแล้ว",
]);

const CHECKED_STATUS_SET = new Set([
  ACCOUNTING_CHECKED_STATUS,
  "checked",
  "approved",
  "done",
  "completed",
  "ตรวจสอบแล้ว",
  "บัญชีตรวจแล้ว",
]);

/* ======================================================
   STATE
   เก็บข้อมูลกลางของหน้านี้
====================================================== */

const state = {
  supabase: null,
  reports: [],
  filteredReports: [],
  groupedReports: [],
  departmentStandards: {},
};

/* ======================================================
   START
====================================================== */

document.addEventListener("DOMContentLoaded", () => {
  if (!protectAccountingPage()) return;
  initAccountingPanel();
});

/* ======================================================
   AUTH / PROTECT PAGE
====================================================== */

function protectAccountingPage() {
  const activeUser = localStorage.getItem("activeUser");
  const activeRole = String(localStorage.getItem("activeRole") || "").toLowerCase();

  if (!activeUser || !ALLOW_ROLES.includes(activeRole)) {
    alert("สิทธิ์การเข้าถึงล้มเหลว: เฉพาะบัญชี / หัวหน้า / ผู้บริหาร / แอดมินเท่านั้น");
    window.location.href = "/login.html";
    return false;
  }

  return true;
}

/* ======================================================
   INIT
====================================================== */

async function initAccountingPanel() {
  bindEvents();
  setDefaultMonth();

  state.supabase = window.supabaseClient || window.supabase || null;

  if (!state.supabase) {
    renderEmpty("ไม่พบ Supabase Client กรุณาตรวจสอบ path /core/supabaseClient.js");
    showAlert("ไม่พบ Supabase Client กรุณาตรวจสอบไฟล์ supabaseClient.js");
    return;
  }

  await loadAccountingData();
}

function bindEvents() {
  document.getElementById("btn-refresh")?.addEventListener("click", loadAccountingData);
  document.getElementById("filter-dept")?.addEventListener("change", applyFilters);
  document.getElementById("filter-month")?.addEventListener("change", applyFilters);
  document.getElementById("filter-week")?.addEventListener("change", applyFilters);
  document.getElementById("filter-status")?.addEventListener("change", applyFilters);
  document.getElementById("search-input")?.addEventListener("input", applyFilters);
  document.getElementById("btn-export-raw")?.addEventListener("click", exportRawCsv);
  document.getElementById("btn-export-summary")?.addEventListener("click", exportSummaryCsv);
}

function setDefaultMonth() {
  const input = document.getElementById("filter-month");
  if (!input) return;

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  input.value = `${yyyy}-${mm}`;
}

/* ======================================================
   LOAD MASTER DATA
====================================================== */

async function loadDepartmentStandards() {
  const { data, error } = await state.supabase
    .from(MASTER_DEPARTMENT_TABLE)
    .select("department_code, department_name, max_waste_percent, warning_percent")
    .eq("is_active", true);

  if (error) throw error;

  state.departmentStandards = {};

  (data || []).forEach((dept) => {
    const code = normalizeDept(dept.department_code);
    state.departmentStandards[code] = {
      code,
      name_th: dept.department_name,
      max_waste_percent: toNumber(dept.max_waste_percent || 2),
      warning_percent: toNumber(dept.warning_percent || 1),
    };
  });
}

/* ======================================================
   LOAD REPORT DATA
====================================================== */

async function loadAccountingData() {
  hideAlert();

  const btn = document.getElementById("btn-refresh");
  if (btn) btn.disabled = true;

  try {
    await loadDepartmentStandards();

    const { data, error } = await state.supabase
      .from(REPORT_TABLE)
      .select("*")
      // บัญชีเห็นเฉพาะรายการที่หัวหน้ากด "ส่งบัญชี" แล้ว
      .in("status", Array.from(ACCOUNTING_VISIBLE_STATUS_SET))
      .order("incident_datetime", { ascending: false })
      .limit(1500);

    if (error) throw new Error(`โหลดข้อมูลไม่สำเร็จ: ${error.message}`);

    state.reports = await attachProblemItems(Array.isArray(data) ? data : []);

    setText("last-update", `อัปเดตล่าสุด: ${new Date().toLocaleString("th-TH")}`);
    applyFilters();
  } catch (err) {
    console.error(err);
    showAlert(err.message || String(err));
    renderEmpty("โหลดข้อมูลไม่สำเร็จ");
  } finally {
    if (btn) btn.disabled = false;
  }
}


/* ======================================================
   LOAD REPORT ITEMS
   ดึงรายการปัญหาย่อยจาก daily_waste_report_items
   เพื่อให้ Accounting แสดงปัญหาเป็นตาราง ไม่ใช้ข้อความรวมยาว
====================================================== */

async function attachProblemItems(reports) {
  if (!reports.length) return [];

  const reportIds = reports.map((row) => row.id).filter(Boolean);
  if (!reportIds.length) return reports;

  try {
    const { data, error } = await state.supabase
      .from(REPORT_ITEM_TABLE)
      .select("id, report_id, problem_type, waste_weight_kg, detail")
      .in("report_id", reportIds)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const itemMap = new Map();

    (data || []).forEach((item) => {
      if (!itemMap.has(item.report_id)) itemMap.set(item.report_id, []);
      itemMap.get(item.report_id).push(item);
    });

    return reports.map((row) => ({
      ...row,
      problem_items: itemMap.get(row.id) || [],
    }));
  } catch (err) {
    console.warn("โหลด daily_waste_report_items ไม่สำเร็จ ใช้ข้อมูลหัวรายงานแทน:", err);
    return reports.map((row) => ({ ...row, problem_items: [] }));
  }
}

/* ======================================================
   FILTER
   กรองข้อมูลก่อนรวมกลุ่ม
====================================================== */

function applyFilters() {
  const dept = getValue("filter-dept");
  const month = getValue("filter-month");
  const week = getValue("filter-week");
  const status = getValue("filter-status");
  const keyword = getValue("search-input").toLowerCase();

  const baseRows = state.reports.filter((row) => {
    const deptInfo = getDepartmentInfo(row);
    const rowDate = getIncidentDate(row);
    const rowMonth = toMonthInputValue(rowDate);
    const rowWeek = getWeekOfMonth(rowDate);

    const text = [
      deptInfo.name,
      deptInfo.code,
      getMachine(row),
      getShift(row),
      getProblem(row),
      getProblemDetail(row),
      ...(row.problem_items || []).flatMap((item) => [
        item.problem_type,
        item.detail,
        item.waste_weight_kg,
      ]),
      getReporter(row),
      row.note,
      row.reason_detail,
      row.corrective_action,
      row.supervisor_note,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchDept = dept === "all" || deptInfo.code === normalizeDept(dept);
    const matchMonth = !month || rowMonth === month;
    const matchWeek = week === "all" || String(rowWeek) === String(week);
    const matchKeyword = !keyword || text.includes(keyword);

    return matchDept && matchMonth && matchWeek && matchKeyword;
  });

  const groups = buildAccountingGroups(baseRows);
  const filteredGroups = groups.filter((group) => {
    if (status === "all") return true;
    return group.status === status;
  });

  state.filteredReports = baseRows;
  state.groupedReports = filteredGroups;

  renderTable(filteredGroups);
  renderSummary(filteredGroups);
}

/* ======================================================
   GROUP ACCOUNTING ROWS
   รวมข้อมูลตาม วันที่ + แผนก + กะ + เครื่อง
   เพื่อให้บัญชีกรอกน้ำหนักผลิตเพียงครั้งเดียวต่อกลุ่ม
====================================================== */

function buildAccountingGroups(rows) {
  const map = new Map();

  rows.forEach((row) => {
    const key = getAccountingGroupKey(row);
    const dept = getDepartmentInfo(row);
    const date = getReportDateKey(row);
    const shift = getShift(row) || "-";
    const machine = getMachine(row) || "-";
    const waste = getWasteWeight(row);
    const production = getProductionWeight(row);
    const rowStatus = getAccountingStatus(row);
    const reportProblemItems = getProblemItems(row);

    if (!map.has(key)) {
      map.set(key, {
        key,
        ids: [],
        rows: [],
        date,
        monthText: formatMonthText(date),
        week: getWeekOfMonth(date),
        departmentCode: dept.code,
        departmentName: dept.name,
        shift,
        machine,
        reporterNames: new Set(),
        problems: new Map(),
        waste: 0,
        production: 0,
        hasProduction: false,
        status: "checked",
      });
    }

    const group = map.get(key);
    group.ids.push(row.id);
    group.rows.push(row);
    group.waste += waste;

    if (production > 0 && !group.hasProduction) {
      group.production = production;
      group.hasProduction = true;
    }

    if (rowStatus !== "checked") {
      group.status = "pending";
    }

    const reporter = getReporter(row);
    if (reporter) group.reporterNames.add(reporter);

    reportProblemItems.forEach((item) => {
      const problemKey = item.problem || "ไม่ระบุอาการ";

      if (!group.problems.has(problemKey)) {
        group.problems.set(problemKey, {
          problem: problemKey,
          details: [],
          waste: 0,
          count: 0,
        });
      }

      const problemItem = group.problems.get(problemKey);
      problemItem.waste += item.waste;
      problemItem.count += 1;

      if (item.detail) {
        problemItem.details.push(item.detail);
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => {
    const dateCompare = String(b.date).localeCompare(String(a.date));
    if (dateCompare !== 0) return dateCompare;
    const deptCompare = String(a.departmentName).localeCompare(String(b.departmentName), "th");
    if (deptCompare !== 0) return deptCompare;
    return String(a.machine).localeCompare(String(b.machine), "th");
  });
}

function getAccountingGroupKey(row) {
  return [
    getReportDateKey(row),
    getDepartmentInfo(row).code,
    normalizeText(getShift(row)),
    normalizeText(getMachine(row)),
  ].join("||");
}

/* ======================================================
   RENDER TABLE
====================================================== */

function renderTable(groups) {
  const tbody = document.getElementById("accounting-table-body");
  if (!tbody) return;

  if (!groups.length) {
    renderEmpty("ไม่พบข้อมูลตามตัวกรอง");
    return;
  }

  tbody.innerHTML = groups.map(renderGroupRow).join("");
}

function renderGroupRow(group) {
  const wastePercent = group.hasProduction
    ? calcWastePercent(group.waste, group.production)
    : null;

  const standard = getDepartmentStandardByCode(group.departmentCode);
  const maxWastePercent = standard ? standard.max_waste_percent : null;
  const result = group.hasProduction
    ? getWasteResult(wastePercent, standard)
    : { label: "รอน้ำหนักผลิต", className: "result-none" };

  const productionValue = group.hasProduction ? group.production : "";
  const rowClass = group.status === "pending" ? " waiting-input" : "";

  return `
    <tr data-row-id="${escapeAttr(group.key)}" class="${rowClass}">
      <td>${escapeHtml(formatDateOnly(group.date))}</td>
      <td>${escapeHtml(group.monthText)}</td>
      <td>Week ${escapeHtml(group.week)}</td>
      <td>${escapeHtml(group.departmentName)}</td>
      <td>${escapeHtml(group.shift)}</td>
      <td>${escapeHtml(group.machine)}</td>
      <td>${renderProblemSummary(group)}</td>
      <td class="text-right">${formatNumber(group.waste)}</td>

      <td class="text-right">
        <input
          class="cell-input text-right${!group.hasProduction ? " empty" : ""}"
          type="number"
          step="0.01"
          min="0"
          placeholder="กรอก kg"
          value="${escapeAttr(productionValue)}"
          data-field="production"
          data-id="${escapeAttr(group.key)}"
        />
      </td>

      <td class="text-right">${group.hasProduction ? formatPercent(wastePercent) : "-"}</td>
      <td class="text-right">${maxWastePercent !== null ? formatPercent(maxWastePercent) : "-"}</td>

      <td>
        <span class="result-pill ${result.className}">
          ${escapeHtml(result.label)}
        </span>
      </td>

      <td>${escapeHtml(formatReporterNames(group))}</td>

      <td>
        <span class="status-pill status-${group.status}">
          ${group.status === "checked" ? "บัญชีตรวจแล้ว" : "รอบัญชีตรวจ"}
        </span>
      </td>

      <td>
        <div class="row-actions">
          <button class="btn btn-green" type="button" onclick="saveAccountingRow('${escapeAttr(group.key)}')">
            บันทึก
          </button>

          <button class="btn btn-gray" type="button" onclick="markPending('${escapeAttr(group.key)}')">
            ย้อนสถานะ
          </button>
        </div>
      </td>
    </tr>
  `;
}

function renderProblemSummary(group) {
  const problemItems = Array.from(group.problems.values()).sort((a, b) => b.waste - a.waste);

  if (!problemItems.length) return "-";

  return `
    <div class="problem-mini-table-wrap">
      <table class="problem-mini-table">
        <thead>
          <tr>
            <th>ปัญหา</th>
            <th class="text-right">kg</th>
            <th>รายละเอียด</th>
          </tr>
        </thead>
        <tbody>
          ${problemItems
            .map((item) => {
              const details = [...new Set(item.details || [])]
                .filter(Boolean)
                .slice(0, 3)
                .join(" / ");

              return `
                <tr>
                  <td><strong>${escapeHtml(item.problem)}</strong></td>
                  <td class="text-right">${formatNumber(item.waste)}</td>
                  <td>${details ? escapeHtml(details) : "-"}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function formatReporterNames(group) {
  const names = Array.from(group.reporterNames).filter(Boolean);
  if (!names.length) return "-";
  return names.slice(0, 3).join(", ");
}

function renderEmpty(message) {
  const tbody = document.getElementById("accounting-table-body");
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="15" class="tb-empty">${escapeHtml(message)}</td>
    </tr>
  `;

  renderSummary([]);
}

/* ======================================================
   SUMMARY
   สรุปจากกลุ่ม เพื่อไม่ให้น้ำหนักผลิตถูกนับซ้ำ
====================================================== */

function renderSummary(groups) {
  const count = groups.length;
  const totalWaste = groups.reduce((sum, group) => sum + group.waste, 0);
  const totalProduction = groups.reduce((sum, group) => sum + (group.production || 0), 0);
  const percent = calcWastePercent(totalWaste, totalProduction);

  setText("sum-count", count.toLocaleString("th-TH"));
  setText("sum-waste", formatNumber(totalWaste));
  setText("sum-production", formatNumber(totalProduction));
  setText("sum-waste-percent", formatPercent(percent));
}

/* ======================================================
   SAVE ACCOUNTING DATA
   บันทึกน้ำหนักผลิตให้ทุกแถวในกลุ่มเดียวกัน
====================================================== */

async function saveAccountingRow(groupKey) {
  if (!groupKey) return;

  const group = state.groupedReports.find((item) => item.key === groupKey);
  if (!group) {
    showAlert("ไม่พบกลุ่มข้อมูลที่ต้องการบันทึก");
    return;
  }

  const rowEl = document.querySelector(`tr[data-row-id="${cssEscape(groupKey)}"]`);
  if (!rowEl) return;

  const production = getInputNumber(rowEl, "production");

  if (!production || production <= 0) {
    showAlert("กรุณากรอกน้ำหนักผลิตให้ถูกต้อง");
    return;
  }

  const activeUserId = localStorage.getItem("activeUserId") || null;

  const payload = {
    total_qty: production,
    status: ACCOUNTING_CHECKED_STATUS,
    checked_by: activeUserId,
    checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await updateReports(group.ids, payload, "บันทึกข้อมูลกลุ่มนี้เรียบร้อยแล้ว");
}

async function markPending(groupKey) {
  if (!groupKey) return;

  const group = state.groupedReports.find((item) => item.key === groupKey);
  if (!group) {
    showAlert("ไม่พบกลุ่มข้อมูลที่ต้องการย้อนสถานะ");
    return;
  }

  const payload = {
    status: ACCOUNTING_PENDING_STATUS,
    checked_by: null,
    checked_at: null,
    updated_at: new Date().toISOString(),
  };

  await updateReports(group.ids, payload, "ย้อนสถานะกลุ่มนี้เรียบร้อยแล้ว");
}

async function updateReports(ids, payload, successMessage) {
  hideAlert();

  try {
    const { error } = await state.supabase
      .from(REPORT_TABLE)
      .update(payload)
      .in("id", ids);

    if (error) throw new Error(error.message);

    showAlert(successMessage, "success");
    await loadAccountingData();
  } catch (err) {
    console.error(err);
    showAlert(`บันทึกไม่สำเร็จ: ${err.message || err}`);
  }
}

/* ======================================================
   EXPORT CSV
====================================================== */

function exportRawCsv() {
  const groups = state.groupedReports;

  const header = [
    "วันที่",
    "เดือน",
    "Week",
    "แผนก",
    "กะ",
    "เครื่อง",
    "อาการ/สาเหตุ",
    "น้ำหนักสูญเสีย kg",
    "น้ำหนักผลิต kg",
    "% Waste เครื่อง",
    "เกณฑ์ %",
    "ผลประเมิน",
    "ผู้แจ้ง",
    "สถานะ",
  ];

  const body = [];

  groups.forEach((group) => {
    const wastePercent = calcWastePercent(group.waste, group.production);
    const standard = getDepartmentStandardByCode(group.departmentCode);
    const result = group.hasProduction
      ? getWasteResult(wastePercent, standard)
      : { label: "รอน้ำหนักผลิต" };

    Array.from(group.problems.values()).forEach((item) => {
      const share = group.waste > 0 ? (item.waste / group.waste) * 100 : 0;
      body.push([
        formatDateOnly(group.date),
        group.monthText,
        `Week ${group.week}`,
        group.departmentName,
        group.shift,
        group.machine,
        `${item.problem} (${formatNumber(item.waste)} kg / ${formatPercent(share)} ของของเสีย)`,
        item.waste,
        group.production,
        wastePercent,
        standard ? standard.max_waste_percent : "-",
        result.label,
        formatReporterNames(group),
        group.status === "checked" ? "บัญชีตรวจแล้ว" : "รอบัญชีตรวจ",
      ]);
    });
  });

  downloadCsv("accounting-waste-raw.csv", [header, ...body]);
}

function exportSummaryCsv() {
  const groups = state.groupedReports;

  const header = [
    "วันที่",
    "แผนก",
    "กะ",
    "เครื่อง",
    "จำนวนอาการ",
    "น้ำหนักสูญเสียรวม kg",
    "น้ำหนักผลิต kg",
    "% Waste",
    "เกณฑ์ %",
    "ผลประเมิน",
  ];

  const body = groups.map((group) => {
    const wastePercent = calcWastePercent(group.waste, group.production);
    const standard = getDepartmentStandardByCode(group.departmentCode);
    const result = group.hasProduction
      ? getWasteResult(wastePercent, standard)
      : { label: "รอน้ำหนักผลิต" };

    return [
      formatDateOnly(group.date),
      group.departmentName,
      group.shift,
      group.machine,
      group.problems.size,
      group.waste,
      group.production,
      wastePercent,
      standard ? standard.max_waste_percent : "-",
      result.label,
    ];
  });

  downloadCsv("accounting-waste-summary.csv", [header, ...body]);
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

/* ======================================================
   DATA MAPPING HELPERS
====================================================== */

function getIncidentDate(row) {
  return row.incident_datetime || row.report_date || row.date_time || row.created_at || row.date || null;
}

function getReportDateKey(row) {
  const value = row.report_date || getIncidentDate(row);
  if (!value) return "-";

  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return text.slice(0, 10);

  return toDateInputValue(d);
}

function getDepartmentInfo(row) {
  const code = normalizeDept(row.department_code || row.department || row.dept);
  const master = state.departmentStandards[code];

  return {
    code,
    name: master?.name_th || row.department || row.department_code || row.dept || "-",
    maxWastePercent: master?.max_waste_percent ?? null,
    warningPercent: master?.warning_percent ?? null,
    hasStandard: !!master,
  };
}

function getDepartmentStandardByCode(code) {
  const standard = state.departmentStandards[normalizeDept(code)];
  if (!standard) return null;

  return {
    max_waste_percent: standard.max_waste_percent,
    warning_percent: standard.warning_percent,
  };
}

function getShift(row) {
  return row.work_shift || row.shift || "";
}

function getMachine(row) {
  return row.machine_no || row.machine || row.machine_name || "";
}


function getProblemItems(row) {
  const items = Array.isArray(row.problem_items) ? row.problem_items : [];

  if (items.length) {
    return items.map((item) => ({
      problem: item.problem_type || "ไม่ระบุอาการ",
      waste: toNumber(item.waste_weight_kg),
      detail: item.detail || "",
    }));
  }

  return [
    {
      problem: getProblem(row) || "ไม่ระบุอาการ",
      waste: getWasteWeight(row),
      detail: getProblemDetail(row),
    },
  ];
}

function getProblem(row) {
  return row.problem_type || row.problem_name || row.reason_detail || "";
}

function getProblemDetail(row) {
  return row.detail || row.problem_detail || row.reason_detail || row.note || "";
}

function getWasteWeight(row) {
  return toNumber(row.waste_weight_kg || row.waste_qty || 0);
}

function getProductionValue(row) {
  return row.production_weight_kg ?? row.total_qty ?? row.produced_weight_kg ?? row.production_qty ?? "";
}

function getProductionWeight(row) {
  return toNumber(getProductionValue(row));
}

function getReporter(row) {
  return row.reported_by || row.reporter_name || row.created_by || "";
}

function getAccountingStatus(row) {
  const status = normalizeText(row.status);
  if (CHECKED_STATUS_SET.has(status)) return "checked";
  return "pending";
}

/* ======================================================
   DATE / CALC HELPERS
====================================================== */

function getWeekOfMonth(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return Math.ceil(d.getDate() / 7);
}

function toMonthInputValue(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function formatMonthText(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
  });
}

function formatDateOnly(value) {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value || "-";

  return d.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function calcWastePercent(waste, production) {
  if (!production) return 0;
  return (toNumber(waste) / toNumber(production)) * 100;
}

/* ======================================================
   SMALL HELPERS
====================================================== */

function getValue(id) {
  return document.getElementById(id)?.value?.trim() || "";
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function getInputValue(parent, field) {
  return parent.querySelector(`[data-field="${field}"]`)?.value?.trim() || "";
}

function getInputNumber(parent, field) {
  const value = getInputValue(parent, field);
  if (value === "") return null;
  return toNumber(value);
}

function toDateInputValue(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(value) {
  return toNumber(value).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value) {
  return `${toNumber(value).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function normalizeDept(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
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

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replaceAll('"', '\\"');
}

function getWasteResult(wastePercent, standard) {
  if (!standard) {
    return { label: "ไม่พบเกณฑ์", className: "result-none" };
  }

  const max = toNumber(standard.max_waste_percent);
  const warning = toNumber(standard.warning_percent);

  if (wastePercent > max) {
    return {
      label: `เกิน ${formatPercent(wastePercent - max)}`,
      className: "result-danger",
    };
  }

  if (warning > 0 && wastePercent >= warning) {
    return {
      label: "เริ่มสูง",
      className: "result-warning",
    };
  }

  return {
    label: "ผ่าน",
    className: "result-success",
  };
}

/* ======================================================
   GLOBAL FUNCTIONS
   ให้ปุ่ม onclick ใน HTML เรียกใช้ได้
====================================================== */

window.loadAccountingData = loadAccountingData;
window.saveAccountingRow = saveAccountingRow;
window.markPending = markPending;
