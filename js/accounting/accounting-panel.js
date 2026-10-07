/* ======================================================
   accounting-panel.js - GO LIVE v1.0
====================================================== */
const REPORT_TABLE = "daily_waste_reports";
const ITEM_TABLE = "daily_waste_report_items";
const MACHINE_STATUS_TABLE = "daily_machine_status";

const STATUS_SENT = "sent_accounting";
const STATUS_DONE = "accounting_checked";
const STATUS_CANCELLED = "accounting_cancelled";

const MACHINE_STATUS_HAS_WASTE = "has_waste";
const MACHINE_STATUS_NO_WASTE = "no_waste";
const MACHINE_STATUS_NOT_RUNNING = "not_running";

let state = {
  supabase: null,
  currentUser: null,
  reports: [],
  machineStatuses: [],
  groups: [],
  standards: {},
  // น้ำหนักผลิตที่พิมพ์ไว้แต่ยังไม่บันทึก (key กลุ่ม → ข้อความที่พิมพ์)
  // เก็บไว้ไม่ให้หายตอนรีเฟรชอัตโนมัติ / เปลี่ยนตัวกรอง
  drafts: new Map(),
  // แถวรายละเอียดที่เปิดค้างไว้ (key กลุ่ม)
  openDetails: new Set(),
  loading: false,
  // งวดบัญชีที่ปิดแล้ว: "YYYY-MM" → { locked_by_name, locked_at }
  locks: new Map(),
  locksAvailable: false, // false = ยังไม่ได้รัน database/09-accounting-controls.sql
};

const LOCK_TABLE = "accounting_period_locks";
const PRODUCTION_LOG_TABLE = "accounting_production_log";

const ROLES_WITH_DASHBOARD = ["admin", "management", "manager", "executive"];


document.addEventListener("DOMContentLoaded", async () => {
  const profile = await AUTH_GUARD.requireLogin([
    "accounting",
    "admin",
    "management"
  ]);

  if (!profile) return;

  state.currentUser = profile;
  state.supabase = window.supabaseClient || window.supabase;

  if (!state.supabase) {
    return showToast("ไม่พบ Supabase Client", "error");
  }

  // ปุ่ม "ย้อนกลับ" ไปหน้า Dashboard ใช้ได้เฉพาะผู้บริหาร/แอดมิน
  // (ฝ่ายบัญชีเข้า Dashboard ไม่ได้ ระบบจะเด้งออกไปหน้า Login)
  const role = normalizeText(profile.role || localStorage.getItem("activeRole"));
  if (!ROLES_WITH_DASHBOARD.includes(role)) {
    document.querySelector('.topbar a[href="/index.html"]')?.remove();
  }

  // เตือนก่อนออกจากหน้า ถ้ามีน้ำหนักผลิตที่ยังไม่ได้บันทึก
  window.addEventListener("beforeunload", (e) => {
    if (state.drafts.size === 0) return;
    e.preventDefault();
    e.returnValue = "";
  });

  setDefaultMonth();
  bindEvents();
  await window.WasteStandardService?.loadMachineStandards();
  await loadStandards();
  await loadAccountingData();
});

const THAI_MONTHS_ACCOUNTING = [
  { value: "01", name: "มกราคม" },
  { value: "02", name: "กุมภาพันธ์" },
  { value: "03", name: "มีนาคม" },
  { value: "04", name: "เมษายน" },
  { value: "05", name: "พฤษภาคม" },
  { value: "06", name: "มิถุนายน" },
  { value: "07", name: "กรกฎาคม" },
  { value: "08", name: "สิงหาคม" },
  { value: "09", name: "กันยายน" },
  { value: "10", name: "ตุลาคม" },
  { value: "11", name: "พฤศจิกายน" },
  { value: "12", name: "ธันวาคม" },
];

function formatThaiMonthYearAccounting(ymStr) {
  if (!ymStr || ymStr === "all") return "ทั้งหมด";
  const parts = ymStr.split("-");
  if (parts.length < 2) return ymStr;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const mName = THAI_MONTHS_ACCOUNTING[m - 1] ? THAI_MONTHS_ACCOUNTING[m - 1].name : `เดือน ${m}`;
  return `${mName} ${y + 543}`;
}

function populateAccountingThaiYears(selectEl, selectedYear) {
  if (!selectEl) return;
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 4;
  const endYear = currentYear + 2;

  let html = "";
  for (let y = endYear; y >= startYear; y--) {
    const buddhistYear = y + 543;
    html += `<option value="${y}" ${y === Number(selectedYear) ? "selected" : ""}>ปี ${buddhistYear} (${y})</option>`;
  }
  selectEl.innerHTML = html;
}

function bindEvents() {
  const monthSelect = document.getElementById("filterMonthSelect");
  const yearSelect = document.getElementById("filterYearSelect");
  const hiddenMonth = document.getElementById("filterMonth");

  const handleMonthYearChange = () => {
    const m = monthSelect?.value || "";
    const y = yearSelect?.value || String(new Date().getFullYear());

    if (!m || m === "all") {
      if (hiddenMonth) hiddenMonth.value = "";
    } else {
      if (hiddenMonth) hiddenMonth.value = `${y}-${m}`;
    }
    applyFilters();
  };

  monthSelect?.addEventListener("change", handleMonthYearChange);
  yearSelect?.addEventListener("change", handleMonthYearChange);

  ["filterDept", "filterStatus", "searchInput"].forEach((id) =>
    document
      .getElementById(id)
      ?.addEventListener(
        id === "searchInput" ? "input" : "change",
        applyFilters,
      ),
  );

  document.getElementById("summaryGroupType")?.addEventListener("change", () => {
    renderSummary(state.groups);
  });
}
function setDefaultMonth() {
  const d = new Date();
  const currentY = d.getFullYear();
  const currentM = String(d.getMonth() + 1).padStart(2, "0");

  const yearSelect = document.getElementById("filterYearSelect");
  if (yearSelect) {
    populateAccountingThaiYears(yearSelect, currentY);
  }

  const monthSelect = document.getElementById("filterMonthSelect");
  if (monthSelect) {
    monthSelect.value = currentM;
  }

  setValue(
    "filterMonth",
    `${currentY}-${currentM}`,
  );
}

function adjustMonthToAvailableData() {
  const currentFilterMonth = getValue("filterMonth");
  const allMonths = new Set();

  (state.reports || []).forEach((r) => {
    const m = toMonth(r.report_date || r.incident_datetime || r.created_at);
    if (m) allMonths.add(m);
  });

  (state.machineStatuses || []).forEach((r) => {
    const m = toMonth(r.work_date || r.created_at);
    if (m) allMonths.add(m);
  });

  if (allMonths.size === 0) return;

  // หากเดือนที่เลือกไว้ปัจจุบันมีข้อมูลอยู่แล้ว ไม่ต้องเปลี่ยน
  if (currentFilterMonth && allMonths.has(currentFilterMonth)) {
    return;
  }

  // หากไม่มีข้อมูลในเดือนปัจจุบัน ให้เลือกเดือนล่าสุดที่มีข้อมูลจริง
  const sortedMonths = Array.from(allMonths).sort().reverse();
  const latestMonth = sortedMonths[0];
  if (!latestMonth) return;

  const [y, m] = latestMonth.split("-");
  const yearSelect = document.getElementById("filterYearSelect");
  const monthSelect = document.getElementById("filterMonthSelect");

  if (yearSelect) {
    // ถ้าไม่มีปีนี้ใน dropdown ให้เติมเข้าไป
    const hasYearOption = Array.from(yearSelect.options).some(
      (opt) => opt.value === y,
    );
    if (!hasYearOption) {
      populateAccountingThaiYears(yearSelect, Number(y));
    }
    yearSelect.value = y;
  }

  if (monthSelect) {
    monthSelect.value = m;
  }

  setValue("filterMonth", latestMonth);
}
async function loadStandards() {
  const { data, error } = await state.supabase
    .from("master_departments")
    .select("department_code,department_name,max_waste_percent,warning_percent")
    .eq("is_active", true);
  if (error) console.warn(error);
  state.standards = {};
  (data || []).forEach((d) => {
    const c = normalizeDept(d.department_code);
    state.standards[c] = {
      name: d.department_name,
      // ไม่ได้ตั้งไว้ → ค่าตั้งต้นโรงงาน 2% / เตือน 1.5% ต่อเดือน
      max: Number(d.max_waste_percent) || window.WASTE_FORMULA.DEFAULT_LIMIT,
      warning: Number(d.warning_percent) || window.WASTE_FORMULA.DEFAULT_WARNING,
    };
  });
  renderDeptFilter();
}
function renderDeptFilter() {
  const s = document.getElementById("filterDept");
  if (!s) return;
  s.innerHTML =
    `<option value="all">ทุกแผนก</option>` +
    Object.entries(state.standards)
      .map(
        ([c, d]) =>
          `<option value="${safeAttr(c)}">${safeText(d.name)} (${safeText(c)})</option>`,
      )
      .join("");
}
async function loadAccountingData() {
  // กันรีเฟรช (รวมถึงรีเฟรชอัตโนมัติทุก 30 วิ) ระหว่างที่ผู้ใช้กำลังพิมพ์หรือเปิดหน้าต่างอยู่
  const active = document.activeElement;
  const typing = active && active.matches?.(".cell-input-production:not([readonly]):not([disabled])");
  const modalOpen = !document.getElementById("appModal")?.classList.contains("hidden");
  if (typing || modalOpen || state.loading) return;

  state.loading = true;
  const body = document.getElementById("accountingBody");
  // โหลดครั้งแรกเท่านั้นที่ล้างตารางเป็น "กำลังโหลด" — ครั้งต่อไปคงตารางเดิมไว้จนข้อมูลใหม่มาถึง
  if (body && !state.groups.length)
    body.innerHTML = `<tr><td colspan="13" class="empty">กำลังโหลดข้อมูล...</td></tr>`;

  try {
    // โหลดทั้ง "รายการของเสีย" และ "สถานะเครื่องประจำวัน" ที่หัวหน้าส่งบัญชีแล้ว
    const [reportResult, machineResult] = await Promise.all([
      state.supabase
        .from(REPORT_TABLE)
        .select("*")
        .in("status", [STATUS_SENT, STATUS_DONE, STATUS_CANCELLED])
        .order("report_date", { ascending: false })
        .order("created_at", { ascending: false }),

      state.supabase
        .from(MACHINE_STATUS_TABLE)
        .select("*")
        .eq("sent_accounting", true)
        .in("operation_status", [
          MACHINE_STATUS_NO_WASTE,
          MACHINE_STATUS_NOT_RUNNING,
        ])
        .order("work_date", { ascending: false }),
    ]);

    if (reportResult.error) throw reportResult.error;
    if (machineResult.error) {
      const msg = String(machineResult.error.message || "");
      if (machineResult.error.code === "PGRST205" || msg.toLowerCase().includes("daily_machine_status")) {
        console.warn("Table daily_machine_status not found, fallback to empty.");
        machineResult.data = [];
      } else {
        throw machineResult.error;
      }
    }

    state.reports = await attachProblemItems(
      Array.isArray(reportResult.data) ? reportResult.data : [],
    );

    // ไม่โหลด has_waste ซ้ำ เพราะรายการที่มีของเสียมาจาก daily_waste_reports อยู่แล้ว
    state.machineStatuses = Array.isArray(machineResult.data)
      ? machineResult.data
      : [];

    await loadPeriodLocks();

    // หากเดือนปัจจุบันที่ระบบตั้งไว้ไม่มีข้อมูล แต่ในระบบมีข้อมูลเดือนอื่น ให้ปรับตัวเลือกเดือนไปยังเดือนล่าสุดที่มีข้อมูล
    adjustMonthToAvailableData();

    setText(
      "lastUpdate",
      `อัปเดตล่าสุด ${new Date().toLocaleString("th-TH")}`,
    );

    applyFilters();
    window.renderAccountingDashboard?.();
  } catch (e) {
    console.error(e);
    if (body)
      body.innerHTML = `<tr><td colspan="13" class="empty">โหลดข้อมูลไม่สำเร็จ: ${safeText(e.message || e)}</td></tr>`;
  } finally {
    state.loading = false;
  }
}

async function attachProblemItems(rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id).filter(Boolean);
  const { data, error } = await state.supabase
    .from(ITEM_TABLE)
    .select(
      "id, report_id, item_no, problem_type, waste_weight_kg, detail, created_at",
    )
    .in("report_id", ids)
    .order("item_no", { ascending: true });
  if (error) {
    console.warn(error);
    return rows.map((r) => ({ ...r, problem_items: fallbackItems(r) }));
  }
  const map = new Map();
  (data || []).forEach((i) => {
    const k = String(i.report_id);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push({
      id: i.id,
      item_no: i.item_no,
      problem_type: i.problem_type,
      waste_weight_kg: Number(i.waste_weight_kg || 0),
      detail: i.detail || "",
    });
  });
  return rows.map((r) => ({
    ...r,
    problem_items: map.get(String(r.id)) || fallbackItems(r),
  }));
}
function fallbackItems(r) {
  return [
    {
      id: `${r.id}-fallback`,
      item_no: 1,
      problem_type: r.problem_type || r.reason_detail || "ไม่ระบุปัญหา",
      waste_weight_kg: Number(r.waste_weight_kg || r.waste_qty || 0),
      detail: r.detail || r.note || "",
    },
  ];
}
function consolidateGroups(allGroups) {
  const merged = new Map();

  allGroups.forEach((g) => {
    const isCancelled = normalizeText(g.status) === STATUS_CANCELLED;
    const isNotRunning = g.sourceType === "machine_status" && normalizeText(g.operationStatus) === MACHINE_STATUS_NOT_RUNNING;

    if (isCancelled || isNotRunning || !g.machine || g.machine === "-") {
      merged.set(g.key, g);
      return;
    }

    const key = `${g.date}|${g.dept}|${g.machine}`;
    if (!merged.has(key)) {
      merged.set(key, {
        key,
        date: g.date,
        dept: g.dept,
        machine: g.machine,
        shift: new Set(),
        reporter: new Set(),
        items: [],
        waste: 0,
        production: g.production || 0,
        status: g.status,
        ids: [],
        machineStatusIds: [],
        sourceTypes: new Set(),
        originalGroups: []
      });
    }

    const mg = merged.get(key);
    mg.originalGroups.push(g);

    if (g.shift) {
      if (g.shift.includes(",")) {
        g.shift.split(",").forEach(s => mg.shift.add(s.trim()));
      } else {
        mg.shift.add(g.shift);
      }
    }

    if (g.reporter) {
      g.reporter.forEach(r => mg.reporter.add(r));
    }

    if (g.items && g.items.length > 0) {
      mg.items.push(...g.items);
    }

    mg.waste += (g.waste || 0);

    if (g.ids && g.ids.length > 0) {
      mg.ids.push(...g.ids);
    }

    if (g.machineStatusId) {
      mg.machineStatusIds.push(g.machineStatusId);
    }

    if (g.sourceType) {
      mg.sourceTypes.add(g.sourceType);
    }

    if (g.production && g.production > mg.production) {
      mg.production = g.production;
    }
  });

  return [...merged.values()].map((mg) => {
    if (mg.originalGroups === undefined) {
      return mg;
    }

    const shiftsArr = [...mg.shift].filter(s => s && s !== "-");
    const shiftStr = shiftsArr.length > 0 ? shiftsArr.sort().join(", ") : "-";

    const allDone = mg.originalGroups.every(og => normalizeText(og.status) === STATUS_DONE);
    const finalStatus = allDone ? STATUS_DONE : STATUS_SENT;

    const finalSourceType = mg.sourceTypes.has("machine_status") && mg.ids.length === 0 
      ? "machine_status" 
      : "report";

    return {
      key: mg.key,
      ids: mg.ids,
      machineStatusIds: mg.machineStatusIds,
      machineStatusId: mg.machineStatusIds[0] || null,
      sourceType: finalSourceType,
      date: mg.date,
      dept: mg.dept,
      shift: shiftStr,
      machine: mg.machine,
      reporter: mg.reporter,
      items: mg.items,
      waste: mg.waste,
      production: mg.production,
      status: finalStatus,
    };
  });
}

function applyFilters() {
  const month = getValue("filterMonth"),
    dept = getValue("filterDept"),
    status = getValue("filterStatus"),
    kw = getValue("searchInput").toLowerCase();

  // -------------------------
  // 1) รายการที่ "มีของเสีย"
  // -------------------------
  const reportRows = state.reports.filter((r) => {
    const m = toMonth(r.report_date || r.incident_datetime || r.created_at);
    const d = normalizeDept(r.department_code || r.department);
    const text = [
      d,
      getDeptName(d),
      r.machine_no,
      r.reported_by,
      r.shift,
      r.work_shift,
      ...(r.problem_items || []).map((i) => `${i.problem_type} ${i.detail}`),
    ]
      .join(" ")
      .toLowerCase();

    return (
      (!month || m === month) &&
      (dept === "all" || d === dept) &&
      (status === "all" || getAccountingStatus(r) === status) &&
      (!kw || text.includes(kw))
    );
  });

  // ---------------------------------------------
  // 2) เครื่องที่ "ไม่มีของเสีย / ไม่ได้เดินเครื่อง"
  // ---------------------------------------------
  const machineRows = state.machineStatuses.filter((r) => {
    const m = toMonth(r.work_date || r.created_at);
    const d = normalizeDept(r.department_code);
    const op = normalizeText(r.operation_status || "");
    const accountingStatus = getMachineAccountingStatus(r);

    const text = [
      d,
      getDeptName(d),
      r.machine_no,
      r.supervisor_name,
      op === MACHINE_STATUS_NO_WASTE ? "ไม่มีของเสีย เดินเครื่อง" : "",
      op === MACHINE_STATUS_NOT_RUNNING ? "ไม่ได้เดินเครื่อง หยุดเครื่อง" : "",
    ]
      .join(" ")
      .toLowerCase();

    // "ไม่ได้เดินเครื่อง" ไม่มีงานให้บัญชีตรวจ จึงแสดงเฉพาะเมื่อเลือกสถานะ "ทั้งหมด"
    const statusMatched =
      status === "all" ||
      (op === MACHINE_STATUS_NO_WASTE && accountingStatus === status);

    return (
      (!month || m === month) &&
      (dept === "all" || d === dept) &&
      statusMatched &&
      (!kw || text.includes(kw))
    );
  });

  const reportGroups = buildGroups(reportRows);
  const machineGroups = buildMachineStatusGroups(machineRows);

  const unsorted = [...reportGroups, ...machineGroups];
  const consolidated = consolidateGroups(unsorted);
  state.groups = consolidated.sort(sortAccountingGroups);
  applyDrafts(state.groups);
  state.monthlyMachine = buildMonthlyMachineIndex();

  renderSummary(state.groups);
  renderTable(state.groups);
  updateSaveAllButton();
  renderPeriodLockBar(month);
}

// ใส่ค่าที่พิมพ์ค้างไว้กลับเข้าไปในกลุ่ม (หลังโหลดข้อมูลใหม่/เปลี่ยนตัวกรอง)
function applyDrafts(groups) {
  // ค่าที่ซ่อนอยู่เพราะตัวกรองยังคงเก็บไว้ จะหายก็ต่อเมื่อบันทึกสำเร็จเท่านั้น
  groups.forEach((g) => {
    if (!state.drafts.has(g.key)) return;
    if (isGroupLocked(g)) {
      state.drafts.delete(g.key); // งวดปิดแล้ว แก้ไม่ได้ ทิ้งค่าที่พิมพ์ค้างไว้
      return;
    }
    const n = parseNumber(state.drafts.get(g.key));
    g.production = n > 0 ? n : 0;
    g.dirty = true;
  });
}

function parseNumber(v) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function buildGroups(rows) {
  const m = new Map();
  rows.forEach((r) => {
    const rowStatus = getAccountingStatus(r);
    const key = [
      r.report_date || dateKey(r.created_at),
      normalizeDept(r.department_code || r.department),
      r.shift || r.work_shift || "",
      r.machine_no || "",
      rowStatus || STATUS_SENT,
    ].join("|");
    if (!m.has(key))
      m.set(key, {
        key,
        ids: [],
        rows: [],
        date: r.report_date || dateKey(r.created_at),
        dept: normalizeDept(r.department_code || r.department),
        shift: r.shift || r.work_shift || "-",
        machine: r.machine_no || "-",
        reporter: new Set(),
        items: [],
        waste: 0,
        // รายการที่เพิ่งส่งมาบัญชี ให้ช่อง "ผลิต kg" ว่างก่อน
        // จะแสดงน้ำหนักผลิตเดิมเฉพาะรายการที่บัญชีบันทึกแล้วเท่านั้น
        production: rowStatus === STATUS_DONE ? getProduction(r) : 0,
        status: rowStatus || STATUS_SENT,
      });
    const g = m.get(key);
    g.ids.push(r.id);
    g.rows.push(r);
    const currentStatus = getAccountingStatus(r);
    if (g.status !== STATUS_CANCELLED) {
      if (currentStatus === STATUS_CANCELLED) {
        g.status = STATUS_CANCELLED;
      } else {
        g.status =
          g.status === STATUS_DONE && currentStatus === STATUS_DONE
            ? STATUS_DONE
            : STATUS_SENT;
      }
    }
    g.reporter.add(r.reported_by || r.created_by_name || "-");
    (r.problem_items || []).forEach((i) => {
      g.items.push({
        ...i,
        shift: r.shift || r.work_shift || "-",
        reported_by: r.reported_by || r.created_by_name || "-"
      });
      g.waste += Number(i.waste_weight_kg || 0);
    });
    // ป้องกันค่าจากหน้างาน/ฟิลด์เก่าไหลมาแสดงในช่องผลิต kg
    // ก่อนที่บัญชีจะเป็นผู้กรอกและบันทึกเอง
    if (g.status === STATUS_DONE && (g.production == null || g.production === 0)) {
      g.production = getProduction(r);
    }
  });
  return [...m.values()];
}

function buildMachineStatusGroups(rows) {
  return rows
    .filter((r) => {
      const op = normalizeText(r.operation_status || "");
      return [MACHINE_STATUS_NO_WASTE, MACHINE_STATUS_NOT_RUNNING].includes(op);
    })
    .map((r) => {
      const op = normalizeText(r.operation_status || "");
      const accountingStatus = getMachineAccountingStatus(r);
      const isDone = accountingStatus === STATUS_DONE;

      return {
        key: `machine-status|${r.id}`,
        ids: [],
        rows: [],
        machineStatusId: r.id,
        sourceType: "machine_status",
        date: r.work_date || dateKey(r.created_at),
        dept: normalizeDept(r.department_code),
        shift: "ทั้งวัน",
        machine: r.machine_no || "-",
        reporter: new Set([r.supervisor_name || "หัวหน้างาน"]),
        items: [],
        waste: 0,
        operationStatus: op,

        // เครื่อง "ไม่มีของเสีย" ให้ช่องผลิตว่างจนกว่าบัญชีจะบันทึกเอง
        production:
          op === MACHINE_STATUS_NO_WASTE && isDone
            ? Number(r.production_kg || 0)
            : 0,

        // not_running เป็นข้อมูลประกอบ ไม่ใช่รายการรอบัญชี
        status:
          op === MACHINE_STATUS_NOT_RUNNING
            ? MACHINE_STATUS_NOT_RUNNING
            : accountingStatus,
      };
    });
}

function sortAccountingGroups(a, b) {
  const dateA = String(a.date || "");
  const dateB = String(b.date || "");

  if (dateA !== dateB) return dateB.localeCompare(dateA);

  const deptCompare = String(a.dept || "").localeCompare(
    String(b.dept || ""),
    "th",
  );
  if (deptCompare !== 0) return deptCompare;

  const machineCompare = String(a.machine || "").localeCompare(
    String(b.machine || ""),
    "th",
    { numeric: true },
  );
  if (machineCompare !== 0) return machineCompare;

  return String(a.shift || "").localeCompare(String(b.shift || ""), "th");
}

function renderSummary(groups) {
  // ไม่นับรายการที่ยกเลิกในยอดสรุป เพื่อไม่ให้ตัวเลขบัญชีเพี้ยน
  const activeGroups = groups.filter((g) => normalizeText(g.status) !== STATUS_CANCELLED);
  const waste = activeGroups.reduce((s, g) => s + g.waste, 0);

  // เพื่อหลีกเลี่ยงการนับซ้ำ น้ำหนักผลิตรวม 1 วัน สำหรับเครื่องจักรเดียวกัน
  const countedKeys = new Set();
  let prod = 0;
  activeGroups.forEach((g) => {
    const key = `${g.date}|${g.dept}|${g.machine}`;
    if (!countedKeys.has(key)) {
      countedKeys.add(key);
      prod += (g.production || 0);
    }
  });
  
  setText("sumCount", activeGroups.length.toLocaleString("th-TH"));
  const pending = activeGroups.filter(
    (g) => normalizeText(g.status) === STATUS_SENT,
  ).length;
  setText("sumPending", pending.toLocaleString("th-TH"));
  setText("sumWaste", formatNumber(waste));
  setText("sumProduction", formatNumber(prod));

  // อัปเดตบิชสถานะแผนกด้านขวาบน
  const deptFilter = document.getElementById("filterDept")?.value || "all";
  const deptName = deptFilter === "all" ? "ทั้งหมด" : (getDeptName(deptFilter) || deptFilter);
  const badge = document.getElementById("summaryDeptBadge");
  if (badge) {
    badge.textContent = `แผนก: ${deptName}`;
    if (deptFilter !== "all") {
      badge.style.background = "#dcfce7";
      badge.style.color = "#166534";
      badge.style.borderColor = "#bbf7d0";
    } else {
      badge.style.background = "#e0f2fe";
      badge.style.color = "#0284c7";
      badge.style.borderColor = "#bae6fd";
    }
  }

  renderSummaryTable(activeGroups);
}

/* ======================================================
   สรุปรายเดือน: รวมยอดก่อนแล้วค่อยคิด % (ไม่ใช่เฉลี่ย % รายวัน)
   % ของเสีย = ของเสีย ÷ (ผลิตดี + ของเสีย) × 100
   คิดเฉพาะรายการที่บัญชีกรอกยอดผลิตแล้ว
====================================================== */
function buildSummaryRows(activeGroups, groupType) {
  const map = new Map();
  const add = (key, init) => {
    if (!map.has(key)) map.set(key, { ...init, rows: [], problemWaste: 0 });
    return map.get(key);
  };

  activeGroups.forEach((g) => {
    if (normalizeText(g.status) === MACHINE_STATUS_NOT_RUNNING) return;
    if (groupType === "problem") {
      const items = g.items && g.items.length ? g.items : g.waste > 0 ? [{ problem_type: "ไม่ระบุ", waste_weight_kg: g.waste }] : [];
      items.forEach((it) => {
        const name = it.problem_type || "ไม่ระบุ";
        add(name, { name, sub: "" }).problemWaste += Number(it.waste_weight_kg || 0);
      });
      return;
    }
    const key = groupType === "machine" ? `${g.dept}|${g.machine}` : g.dept;
    const entry = add(key, {
      name: groupType === "machine" ? g.machine : getDeptName(g.dept),
      sub: groupType === "machine" ? getDeptName(g.dept) : g.dept,
      dept: g.dept,
      machine: groupType === "machine" ? g.machine : null,
    });
    entry.rows.push({ waste: g.waste || 0, production: g.production || 0 });
  });

  return [...map.values()].map((e) => {
    if (groupType === "problem") {
      return { ...e, waste: e.problemWaste, good: null, pct: null, evaluation: null };
    }
    const agg = window.WASTE_FORMULA.aggregate(e.rows);
    const std = standardFor(e.dept, e.machine);
    return { ...e, ...agg, std, evaluation: window.WASTE_FORMULA.evaluate(agg.pct, std) };
  });
}

function renderSummaryTable(activeGroups) {
  const groupType = document.getElementById("summaryGroupType")?.value || "dept";
  const rows = buildSummaryRows(activeGroups, groupType).sort((a, b) => b.waste - a.waste);
  const month = getValue("filterMonth");

  const headTitle = document.getElementById("summaryTableTitle");
  if (headTitle) {
    const base =
      groupType === "problem" ? "สรุปผลรวมแยกตามประเภทปัญหา"
      : groupType === "machine" ? "สรุปรายเดือนแยกตามเครื่องจักร"
      : "สรุปรายเดือนแยกตามแผนก / สินค้า";
    headTitle.textContent = month ? `${base} · ${formatThaiMonthYearAccounting(month)}` : base;
  }

  const head = document.getElementById("summaryTableHead");
  const thStyle = 'style="background-color: #afdeff; color: #0200bf;"';
  if (head) {
    head.innerHTML =
      groupType === "problem"
        ? `<tr><th ${thStyle}>ประเภทปัญหา</th><th class="text-right" ${thStyle}>น้ำหนักของเสีย (kg)</th><th class="text-right" ${thStyle}>สัดส่วน</th></tr>`
        : `<tr>
            <th ${thStyle}>${groupType === "machine" ? "เครื่องจักร" : "แผนก / สินค้า"}</th>
            <th class="text-right" ${thStyle}>ผลิตดี (kg)</th>
            <th class="text-right" ${thStyle}>ของเสีย (kg)</th>
            <th class="text-right" ${thStyle}>% ของเสีย</th>
            <th class="col-center" ${thStyle}>เกณฑ์ไม่เกิน</th>
            <th class="col-center" ${thStyle}>ผลประเมินรายเดือน</th>
            <th class="col-center" ${thStyle}>กรอกผลิตแล้ว</th>
          </tr>`;
  }

  document.getElementById("summaryTable")?.classList.toggle("is-problem", groupType === "problem");

  const body = document.getElementById("summaryDeptBody");
  if (!body) return;
  const cols = groupType === "problem" ? 3 : 7;

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="${cols}" class="empty">ไม่พบข้อมูลตามตัวกรอง</td></tr>`;
    return;
  }

  if (groupType === "problem") {
    const total = rows.reduce((s, r) => s + r.waste, 0) || 1;
    body.innerHTML = rows
      .map(
        (r) => `<tr>
          <td style="font-weight: 600;">${safeText(r.name)}</td>
          <td class="text-right" style="color: #dc2626; font-weight: 500;">${formatNumber(r.waste)}</td>
          <td class="text-right">${formatNumber((r.waste / total) * 100)}%</td>
        </tr>`,
      )
      .join("");
    return;
  }

  body.innerHTML = rows
    .map((r) => {
      const ev = r.evaluation;
      const pctText = r.pct === null ? "-" : `${formatNumber(r.pct)}%`;
      const partial = r.withProduction < r.count;
      const pending = r.wasteCounted < r.waste;
      return `<tr>
        <td style="font-weight: 600;">${safeText(r.name)}<br><small class="muted">${safeText(r.sub || "")}</small></td>
        <td class="text-right" style="color: #16a34a; font-weight: 500;">${r.good ? formatNumber(r.good) : "-"}</td>
        <td class="text-right" style="color: #dc2626; font-weight: 500;" title="${pending ? `ใช้คิด % ${formatNumber(r.wasteCounted)} kg (เฉพาะรายการที่กรอกผลิตแล้ว)` : ""}">${formatNumber(r.waste)}${pending ? `<br><small class="muted">คิด % ${formatNumber(r.wasteCounted)}</small>` : ""}</td>
        <td class="text-right font-bold">${pctText}</td>
        <td class="col-center">${formatNumber(r.std.max)}%</td>
        <td class="col-center"><span class="result-pill ${ev.className}">${safeText(ev.label)}</span>${partial && r.pct !== null ? `<br><small class="muted">ยังไม่ครบ (ผลชั่วคราว)</small>` : ""}</td>
        <td class="col-center">${r.withProduction}/${r.count}</td>
      </tr>`;
    })
    .join("");
}

// เกณฑ์ของแผนก/เครื่อง: รายเครื่อง (ถ้าตั้งไว้) → รายแผนก → ค่าตั้งต้นโรงงาน 2%
function standardFor(dept, machine) {
  const deptStd = state.standards[normalizeDept(dept)];
  if (window.WasteStandardService?.resolve) {
    return window.WasteStandardService.resolve(deptStd, dept, machine);
  }
  return window.WASTE_FORMULA.standard(deptStd);
}

/* ผลรายเดือนของเครื่อง (ใช้ในคอลัมน์ "ผลรายเดือน" ของแต่ละแถว)
   คิดจากข้อมูลทั้งเดือนของเครื่องนั้น ไม่ขึ้นกับตัวกรองสถานะ/คำค้น */
function buildMonthlyMachineIndex() {
  const index = new Map();
  if (typeof buildGroups !== "function") return index;
  const reports = (state.reports || []).filter((r) => getAccountingStatus(r) !== STATUS_CANCELLED);
  const groups = consolidateGroups([
    ...buildGroups(reports),
    ...buildMachineStatusGroups(state.machineStatuses || []),
  ]);
  groups.forEach((g) => {
    const st = normalizeText(g.status);
    if (st === STATUS_CANCELLED || st === MACHINE_STATUS_NOT_RUNNING) return;
    const key = `${periodOf(g.date)}|${g.dept}|${g.machine}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ waste: g.waste || 0, production: g.production || 0, date: g.date });
  });
  const out = new Map();
  index.forEach((rows, key) => {
    const [month, dept, machine] = key.split("|");
    const agg = window.WASTE_FORMULA.aggregate(rows);
    const std = standardFor(dept, machine);
    out.set(key, { ...agg, std, month, evaluation: window.WASTE_FORMULA.evaluate(agg.pct, std) });
  });
  return out;
}

function renderTable(groups) {
  const body = document.getElementById("accountingBody");
  if (!body) return;
  if (!groups.length) {
    body.innerHTML = `<tr><td colspan="13" class="empty">ไม่พบข้อมูลตามตัวกรอง</td></tr>`;
    return;
  }
  body.innerHTML = groups.map((g, i) => renderGroup(g, i)).join("");
  state.openDetails.forEach((key) => loadProductionHistory(key));
}
function renderGroup(g, i) {
  const isMachineStatus = g.sourceType === "machine_status";
  const isNoWaste =
    isMachineStatus &&
    normalizeText(g.operationStatus) === MACHINE_STATUS_NO_WASTE;
  const isNotRunning =
    isMachineStatus &&
    normalizeText(g.operationStatus) === MACHINE_STATUS_NOT_RUNNING;

  const isCancelled = normalizeText(g.status) === STATUS_CANCELLED;
  const isDone = normalizeText(g.status) === STATUS_DONE;

  // % ของเสียของวันนั้น (แสดงไว้ดู) — ผ่าน/เกิน ประเมินจากยอดรวมทั้งเดือน
  const dailyPct =
    !isCancelled && !isNotRunning ? window.WASTE_FORMULA.percent(g.waste, g.production) : null;

  let result;
  let resultTitle = "";
  if (isCancelled) {
    result = { label: "ยกเลิก", className: "result-none" };
  } else if (isNotRunning) {
    result = { label: "ไม่ได้เดินเครื่อง", className: "result-none" };
  } else {
    const m = state.monthlyMachine?.get(`${periodOf(g.date)}|${g.dept}|${g.machine}`);
    if (!m || m.pct === null) {
      result = { label: "รอน้ำหนักผลิต", className: "result-none" };
    } else {
      const ev = m.evaluation;
      result = { label: `${ev.level === "over" ? "เกิน" : ev.level === "warn" ? "ใกล้เกณฑ์" : "ผ่าน"} ${formatNumber(m.pct)}%`, className: ev.className };
      resultTitle = `${formatThaiMonthYearAccounting(m.month)} เครื่อง ${g.machine}: ของเสีย ${formatNumber(m.wasteCounted)} kg / ผลิตดี ${formatNumber(m.good)} kg = ${formatNumber(m.pct)}% (เกณฑ์ไม่เกิน ${formatNumber(m.std.max)}%) · กรอกผลิตแล้ว ${m.withProduction}/${m.count} วัน`;
    }
  }

  let status;
  if (isCancelled) {
    status = `<span class="status-pill status-cancelled">ยกเลิกรายการ</span>`;
  } else if (isNotRunning) {
    status = `<span class="status-pill" style="background:#f1f5f9;color:#64748b;border:1px solid #cbd5e1;">ไม่ได้เดินเครื่อง</span>`;
  } else if (isDone) {
    status = `<span class="status-pill status-done">บัญชีตรวจแล้ว</span>`;
  } else if (isNoWaste) {
    status = `<span class="status-pill" style="background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;">ไม่มีของเสีย (รอกรอกผลิต)</span>`;
  } else {
    status = `<span class="status-pill status-sent">รอบัญชีตรวจ</span>`;
  }

  const isLocked = isGroupLocked(g);
  const isDirty = !!g.dirty && !isLocked;
  const productionInputAttr = isLocked && !isCancelled && !isNotRunning
    ? "readonly"
    : isCancelled
    ? "disabled"
    : isNotRunning
      ? "disabled"
      : isDone && !isDirty
        ? "readonly"
        : "";

  const rowClass = isCancelled ? ` class="row-cancelled"` : "";

  const expandCell = `<button class="expand-btn${state.openDetails.has(g.key) ? " is-open" : ""}" type="button" onclick="toggleDetail(${i})" aria-label="ดูรายละเอียดปัญหา" aria-expanded="${state.openDetails.has(g.key)}">▼</button>`;

  const wasteCell = isNotRunning ? "-" : formatNumber(g.waste);

  const problemCell = isNoWaste
    ? `<span class="status-pill status-done">ไม่มีของเสีย</span>`
    : isNotRunning
      ? `<span class="status-pill" style="background:#f1f5f9;color:#64748b;border:1px solid #cbd5e1;">ไม่ได้เดินเครื่อง</span>`
      : renderProblemInline(g.items);

  const formattedProdVal = isDirty
    ? state.drafts.get(g.key) || ""
    : g.production
      ? formatQtyNumber(g.production)
      : "";
  const productionCell = isNotRunning
    ? `<span class="muted cell-production-empty">-</span>`
    : `<input class="cell-input cell-input-production text-right${isDirty ? " is-dirty" : ""}${isLocked ? " is-locked" : ""}" type="text" inputmode="decimal" autocomplete="off"
        value="${safeAttr(formattedProdVal)}"
        data-prod="${safeAttr(g.key)}"
        placeholder="0.00"
        onfocus="handleProductionFocus(this)"
        onblur="formatProductionInput(this)"
        oninput="handleProductionInput(this, '${safeAttr(g.key)}')"
        onkeydown="handleProductionKeydown(event, this)"
        aria-label="น้ำหนักผลิต (kg) ${safeAttr(g.machine)} ${safeAttr(formatDate(g.date))}"
        ${productionInputAttr}>`;

  const percentCell = dailyPct === null ? "-" : formatPercent(dailyPct);

  let actions;
  if (isNotRunning || isCancelled) {
    actions = `<span class="muted">-</span>`;
  } else if (isLocked) {
    actions = `<span class="lock-pill" title="งวดนี้ปิดบัญชีแล้ว แก้ไขไม่ได้"><span class="material-symbols-outlined">lock</span>ปิดงวดแล้ว</span>`;
  } else if (isMachineStatus) {
    actions = `
      <div class="action-stack">
        <button
          class="btn warning"
          onclick="editGroup('${safeAttr(g.key)}')"
        >แก้ไข</button>

        <button
          class="btn success${isDone && !isDirty ? " hidden" : ""}"
          data-save="${safeAttr(g.key)}"
          onclick="saveGroup('${safeAttr(g.key)}')"
        >บันทึก</button>
      </div>`;
  } else {
    const disabledAttr = isCancelled ? "disabled" : "";
    actions = `
      <div class="action-stack">
        <button
          class="btn warning"
          onclick="editGroup('${safeAttr(g.key)}')"
          ${disabledAttr}
        >แก้ไข</button>

        <button
          class="btn danger"
          onclick="cancelGroup('${safeAttr(g.key)}')"
          ${disabledAttr}
        >ยกเลิก</button>

        <button
          class="btn success${isDone && !isDirty ? " hidden" : ""}"
          data-save="${safeAttr(g.key)}"
          onclick="saveGroup('${safeAttr(g.key)}')"
          ${disabledAttr}
        >บันทึก</button>
      </div>`;
  }

  const mainRow = `<tr${rowClass}>
    <td>${expandCell}</td>
    <td>${safeText(formatDate(g.date))}</td>
    <td>
      <strong class="code-text">${safeText(g.dept)}</strong><br>
      <small>${safeText(getDeptName(g.dept))}</small>
    </td>
    <td>${safeText(g.shift)}</td>
    <td><strong class="code-text">${safeText(g.machine)}</strong></td>
    <td>${safeText([...g.reporter].join(", "))}</td>
    <td class="text-right"><strong>${wasteCell}</strong></td>
    <td>${problemCell}</td>
    <td class="text-right cell-production-col">${productionCell}</td>
    <td class="text-right">${percentCell}</td>
    <td><span class="result-pill ${result.className}" title="${safeAttr(resultTitle)}">${safeText(result.label)}</span></td>
    <td>${status}</td>
    <td>${actions}</td>
  </tr>`;

  return `${mainRow}
  <tr
    id="detail-${i}"
    class="detail-row${state.openDetails.has(g.key) ? "" : " hidden"}${isCancelled ? " row-cancelled" : ""}"
  >
    <td colspan="13">${renderProblemTable(g.items || [], g.waste || 0, g.key)}</td>
  </tr>`;
}

function editGroup(key) {
  const g = state.groups.find((x) => x.key === key);
  if (!g) return;
  if (isGroupLocked(g)) return showToast(lockedMessage(g.date), "error");

  const input = document.querySelector(`[data-prod="${cssEscape(g.key)}"]`);
  if (input) {
    input.readOnly = false;
    input.focus();
    handleProductionFocus(input);
  }

  document
    .querySelector(`[data-save="${cssEscape(g.key)}"]`)
    ?.classList.remove("hidden");
  if (input && !state.drafts.has(g.key)) {
    state.drafts.set(g.key, input.value);
    g.dirty = true;
    input.classList.add("is-dirty");
  }

  showToast("แก้ไขน้ำหนักผลิตรวมประจำวัน แล้วกดบันทึกอีกครั้ง", "success");
}


function renderProblemInline(items) {
  return `<div class="problem-inline">${items
    .slice(0, 3)
    .map(
      (x) =>
        `${safeText(x.problem_type)} <strong>${formatNumber(x.waste_weight_kg)} kg</strong>`,
    )
    .join(
      "<br>",
    )}${items.length > 3 ? `<br><small>+${items.length - 3} รายการ</small>` : ""}</div>`;
}
function renderProblemTable(items, total, groupKey) {
  const g = state.groups.find(x => x.key === groupKey);
  const isCancelled = g ? normalizeText(g.status) === STATUS_CANCELLED : false;
  const isDone = g ? normalizeText(g.status) === STATUS_DONE : false;

  const isLocked = g ? isGroupLocked(g) : false;
  let actionHtml = "";
  if (!isCancelled && !isDone && !isLocked) {
    actionHtml = `
      <div style="margin-top: 14px; display: flex; justify-content: flex-start; padding: 0 4px;">
        <button class="btn primary" onclick="showAddScrapModal('${safeAttr(groupKey)}')" style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; font-size: 13px; border-radius: 8px; font-weight: 600; cursor: pointer; background: #0284c7; color: white; border: none; height: 38px; transition: background 0.15s ease;">
          <span class="material-symbols-outlined" style="font-size: 18px;">add</span>
          เพิ่มรายการของเสีย (Add Scrap Item)
        </button>
      </div>
    `;
  }

  const hasItems = items && items.length > 0;
  const tbodyContent = hasItems 
    ? items.map((x) => `
        <tr>
          <td style="padding:8px 12px;vertical-align:middle;">
            <span class="status-pill" style="background:#f1f5f9;color:#334155;border:1px solid #e2e8f0;padding:2px 8px;font-size:12px;font-weight:600;border-radius:4px;white-space:nowrap;">
              ${safeText(x.shift || "-")}
            </span>
          </td>
          <td style="padding:8px 12px;vertical-align:middle;">
            <strong>${safeText(x.problem_type)}</strong>
          </td>
          <td style="padding:8px 12px;text-align:right;font-weight:600;color:#e11d48;vertical-align:middle;">
            ${formatNumber(x.waste_weight_kg)}
          </td>
          <td style="padding:8px 12px;color:#475569;vertical-align:middle;">
            ${safeText(x.detail || "-")}
          </td>
          <td style="padding:8px 12px;color:#64748b;font-size:13px;vertical-align:middle;">
            ${safeText(x.reported_by || "-")}
          </td>
        </tr>
      `).join("")
    : `<tr><td colspan="5" style="text-align:center; padding:24px; color:#64748b; font-style:italic;">ยังไม่มีรายการของเสียสำหรับวันนี้</td></tr>`;

  return `
    <div style="padding: 14px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin: 8px 0;">
      <table class="problem-table" style="width:100%; border-collapse:collapse; background:white; border-radius:6px; overflow:hidden; border:1px solid #e2e8f0;">
        <thead>
          <tr style="background:#f1f5f9; border-bottom:2px solid #cbd5e1;">
            <th style="padding:10px 12px;text-align:left;font-size:13px;color:#475569;font-weight:600;">กะ</th>
            <th style="padding:10px 12px;text-align:left;font-size:13px;color:#475569;font-weight:600;">ปัญหา / รายละเอียดปัญหา</th>
            <th style="padding:10px 12px;text-align:right;font-size:13px;color:#475569;font-weight:600;">น้ำหนักของเสีย kg</th>
            <th style="padding:10px 12px;text-align:left;font-size:13px;color:#475569;font-weight:600;">รายละเอียดเพิ่มเติม</th>
            <th style="padding:10px 12px;text-align:left;font-size:13px;color:#475569;font-weight:600;">ผู้บันทึก</th>
          </tr>
        </thead>
        <tbody>
          ${tbodyContent}
        </tbody>
        ${hasItems ? `
        <tfoot>
          <tr style="background:#f8fafc; border-top:2px solid #cbd5e1;">
            <td colspan="2" style="padding:12px;font-weight:700;color:#1e293b;">รวมของเสียทั้งหมด (ทุกกะ)</td>
            <td style="padding:12px;text-align:right;font-weight:bold;color:#e11d48;font-size:16px;">
              ${formatNumber(total)}
            </td>
            <td colspan="2" style="padding:12px;font-weight:600;color:#1e293b;">kg</td>
          </tr>
        </tfoot>
        ` : ""}
      </table>
      ${actionHtml}
      ${g && !isCancelled && g.machine && g.machine !== "-" ? `
      <div class="prod-history" data-history="${safeAttr(groupKey)}">
        <div class="prod-history-head">
          <span class="material-symbols-outlined">history</span>
          ประวัติการแก้น้ำหนักผลิต
        </div>
        <div class="prod-history-body muted">กำลังโหลด...</div>
      </div>` : ""}
    </div>
  `;
}
function toggleDetail(i) {
  const row = document.getElementById(`detail-${i}`);
  if (!row) return;
  const open = row.classList.toggle("hidden") === false;
  const key = state.groups[i]?.key;
  if (key) open ? state.openDetails.add(key) : state.openDetails.delete(key);
  if (open && key) loadProductionHistory(key);
  const btn = row.previousElementSibling?.querySelector(".expand-btn");
  if (btn) {
    btn.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", String(open));
  }
}
async function saveGroup(key) {
  const result = await saveGroupCore(key);
  if (!result.ok) return showToast(result.message, "error");
  state.drafts.delete(key);
  showToast("บันทึกน้ำหนักผลิตรวม 1 วัน เรียบร้อยแล้ว", "success");
  await loadAccountingData();
}

// บันทึกน้ำหนักผลิตของกลุ่มเดียว (ไม่โหลดตารางใหม่) — ใช้ร่วมกับ "บันทึกทั้งหมด"
async function saveGroupCore(key) {
  const g = state.groups.find((x) => x.key === key);
  if (!g) return { ok: false, message: "ไม่พบรายการ" };
  if (isGroupLocked(g)) return { ok: false, message: lockedMessage(g.date) };
  const showToast = (message) => ({ ok: false, message });

  if (
    g.sourceType === "machine_status" &&
    normalizeText(g.operationStatus) === MACHINE_STATUS_NOT_RUNNING
  ) {
    return showToast("เครื่องนี้ไม่ได้เดินเครื่อง ไม่ต้องกรอกน้ำหนักผลิต", "error");
  }

  const inputEl = document.querySelector(`[data-prod="${cssEscape(key)}"]`);
  const rawVal = inputEl?.value || "0";
  const prod = Number(String(rawVal).replace(/,/g, "").trim()) || 0;

  if (!prod || prod <= 0) {
    return showToast("กรุณากรอกน้ำหนักผลิตให้ถูกต้อง", "error");
  }

  const uid =
    state.currentUser?.id || localStorage.getItem("activeUserId") || null;
  const now = new Date().toISOString();

  const machineStatusIds = g.machineStatusIds || (g.machineStatusId ? [g.machineStatusId] : []);
  const reportIds = g.ids || [];

  const promises = [];

  if (machineStatusIds.length > 0) {
    promises.push(
      state.supabase
        .from(MACHINE_STATUS_TABLE)
        .update({
          production_kg: prod,
          accounting_checked_by: uid,
          accounting_checked_at: now,
          updated_at: now,
        })
        .in("id", machineStatusIds)
    );
  }

  if (reportIds.length > 0) {
    promises.push(
      state.supabase
        .from(REPORT_TABLE)
        .update({
          production_kg: prod,
          status: STATUS_DONE,
          accounting_status: STATUS_DONE,
          accounting_checked_by: uid,
          accounting_checked_at: now,
          updated_at: now,
        })
        .in("id", reportIds)
    );
  }

  if (promises.length === 0) {
    return showToast("ไม่พบรายการสำหรับบันทึก", "error");
  }

  const results = await Promise.all(promises);
  const failed = results.find((r) => r.error);
  if (failed) {
    return showToast(`บันทึกไม่สำเร็จ: ${friendlyDbError(failed.error)}`, "error");
  }
  return { ok: true };
}

// บันทึกทุกแถวที่กรอกน้ำหนักผลิตไว้แล้วแต่ยังไม่บันทึก
async function saveAllDrafts() {
  const keys = state.groups
    .filter((g) => state.drafts.has(g.key) && parseNumber(state.drafts.get(g.key)) > 0)
    .map((g) => g.key);
  if (!keys.length) return showToast("ยังไม่มีน้ำหนักผลิตที่กรอกไว้", "error");

  const btn = document.getElementById("btnSaveAll");
  if (btn) {
    btn.disabled = true;
    btn.dataset.label = btn.innerHTML;
    btn.innerHTML = `<span class="material-symbols-outlined">hourglass_top</span> กำลังบันทึก...`;
  }

  let okCount = 0;
  const errors = [];
  for (const key of keys) {
    const r = await saveGroupCore(key);
    if (r.ok) {
      okCount += 1;
      state.drafts.delete(key);
    } else {
      const g = state.groups.find((x) => x.key === key);
      errors.push(`${g ? `${g.machine} (${formatDate(g.date)})` : key}: ${r.message}`);
    }
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.label || btn.innerHTML;
  }

  if (errors.length) {
    showToast(`บันทึกสำเร็จ ${okCount} รายการ, ไม่สำเร็จ ${errors.length} รายการ`, "error");
    console.warn("saveAllDrafts errors:", errors);
  } else {
    showToast(`บันทึกน้ำหนักผลิตแล้ว ${okCount} รายการ`, "success");
  }
  await loadAccountingData();
}

function updateSaveAllButton() {
  const btn = document.getElementById("btnSaveAll");
  if (!btn) return;
  const visibleKeys = new Set(state.groups.map((g) => g.key));
  const n = [...state.drafts.entries()].filter(
    ([k, v]) => visibleKeys.has(k) && parseNumber(v) > 0,
  ).length;
  btn.hidden = n === 0;
  const count = btn.querySelector(".save-all-count");
  if (count) count.textContent = n.toLocaleString("th-TH");
}

async function cancelGroup(key) {
  const g = state.groups.find((x) => x.key === key);
  if (!g) return;

  if (g.sourceType === "machine_status") {
    return showToast("สถานะเครื่องจากหัวหน้างานไม่สามารถยกเลิกจากหน้าบัญชีได้", "error");
  }
  if (isGroupLocked(g)) return showToast(lockedMessage(g.date), "error");

  const ok = await askCancelConfirm(g);
  if (!ok) return;

  const { error } = await state.supabase
    .from(REPORT_TABLE)
    .update({
      status: STATUS_CANCELLED,
      accounting_status: STATUS_CANCELLED,
      updated_at: new Date().toISOString(),
    })
    .in("id", g.ids);

  if (error) return showToast(`ยกเลิกไม่สำเร็จ: ${friendlyDbError(error)}`, "error");
  showToast("ยกเลิกรายการแล้ว รายการเดิมจะแสดงเป็นสีเทา", "success");
  await loadAccountingData();
}

function askCancelConfirm(g) {
  return new Promise((resolve) => {
    const modal = document.getElementById("appModal");
    const title = document.getElementById("modalTitle");
    const body = document.getElementById("modalBody");
    const actions = document.getElementById("modalActions");

    if (!modal || !title || !body || !actions) {
      resolve(confirm("ยืนยันยกเลิกรายการนี้ใช่ไหม?"));
      return;
    }

    title.textContent = "ยืนยันยกเลิกรายการ";
    body.innerHTML = `
      <p>ต้องการยกเลิกรายการนี้ใช่ไหม?</p>
      <p class="muted">ระบบจะไม่ลบข้อมูลออก แต่จะเปลี่ยนรายการเป็นสีเทา เพื่อให้รู้ว่าเป็นรายการที่ยกเลิกแล้ว</p>
      <p><strong>${safeText(formatDate(g.date))}</strong> / ${safeText(g.dept)} / ${safeText(g.shift)} / ${safeText(g.machine)}</p>
    `;
    actions.innerHTML = `
      <button class="btn light" id="cancelNoBtn">ไม่ยกเลิก</button>
      <button class="btn danger" id="cancelYesBtn">ยืนยันยกเลิก</button>
    `;

    modal.classList.remove("hidden");

    document.getElementById("cancelNoBtn")?.addEventListener("click", () => {
      modal.classList.add("hidden");
      resolve(false);
    }, { once: true });

    document.getElementById("cancelYesBtn")?.addEventListener("click", () => {
      modal.classList.add("hidden");
      resolve(true);
    }, { once: true });
  });
}

// ประเมินผลจาก % ที่คิดแล้ว (ใช้กับยอดรายเดือน)
function getResult(dept, percent, hasProd, machineNo = "") {
  if (!hasProd) return { label: "รอน้ำหนักผลิต", className: "result-none" };
  const ev = window.WASTE_FORMULA.evaluate(percent, standardFor(dept, machineNo));
  return { label: ev.label, className: ev.className };
}

// ยอดผลิตดีที่ฝ่ายบัญชีกรอก (ไม่ใช้ total_qty เพราะฟอร์มหน้างานเก็บน้ำหนักของเสียไว้ในช่องนั้น)
function getProduction(r) {
  return Number(r.production_kg ?? 0) || 0;
}

function getAccountingStatus(r) {
  return normalizeText(r.accounting_status || r.status || "");
}


function getMachineAccountingStatus(r) {
  const op = normalizeText(r.operation_status || "");

  if (op === MACHINE_STATUS_NOT_RUNNING) {
    return MACHINE_STATUS_NOT_RUNNING;
  }

  // ถ้าบัญชีเคยบันทึกแล้ว จะมี accounting_checked_at
  // ไม่ต้องสร้าง status ซ้ำในตาราง daily_machine_status
  return r.accounting_checked_at ? STATUS_DONE : STATUS_SENT;
}

function getDeptName(c) {
  return state.standards[normalizeDept(c)]?.name || c || "-";
}
function normalizeDept(v) {
  return window.EA_COMMON?.normalizeDepartmentCode
    ? window.EA_COMMON.normalizeDepartmentCode(v)
    : String(v || "")
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, "_");
}
function normalizeText(v) {
  return window.EA_COMMON?.normalizeText
    ? window.EA_COMMON.normalizeText(v)
    : String(v || "")
        .trim()
        .toLowerCase();
}
function toMonth(v) {
  if (!v) return "";
  const s = String(v).trim();
  // 1) Direct matching for YYYY-MM prefix (e.g. "2026-03-07", "2026-03", "2026-03-07T14:30:00Z")
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}`;
  }
  // 2) Fallback to date parsing
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? ""
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function dateKey(v) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "-" : d.toISOString().slice(0, 10);
}
function formatDate(v) {
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("th-TH");
}
function formatNumber(v) {
  return window.EA_COMMON?.formatNumber
    ? window.EA_COMMON.formatNumber(v, 2, 2)
    : Number(v || 0).toLocaleString("th-TH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}
function formatQtyNumber(v) {
  if (v === null || v === undefined || v === "") return "";
  const clean = String(v).replace(/,/g, "").trim();
  const n = Number(clean);
  if (isNaN(n) || n === 0) return "";
  return n.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function formatProductionInput(input) {
  const raw = String(input.value || "").replace(/,/g, "").trim();
  if (!raw) {
    input.value = "";
    return;
  }
  const n = Number(raw);
  if (!isNaN(n) && n >= 0) {
    input.value = n.toLocaleString("th-TH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const key = input.dataset.prod;
    if (key && state.drafts.has(key)) state.drafts.set(key, input.value);
  }
}
function handleProductionFocus(input) {
  setTimeout(() => {
    try {
      input.select();
    } catch (_) {}
  }, 25);
}
function handleProductionInput(input, key) {
  const filtered = input.value.replace(/[^0-9.,]/g, "");
  if (filtered !== input.value) {
    input.value = filtered;
  }

  const cleanNum = Number(String(input.value || "").replace(/,/g, "").trim());
  const g = state.groups.find((x) => x.key === key);
  if (!g) return;

  // Update in state
  g.production = cleanNum;
  g.dirty = true;
  state.drafts.set(key, input.value);
  input.classList.add("is-dirty");
  document.querySelector(`[data-save="${cssEscape(key)}"]`)?.classList.remove("hidden");
  updateSaveAllButton();

  // อัปเดต % ของวันนั้นทันที (ผลรายเดือนจะคำนวณใหม่หลังกดบันทึก)
  const row = input.closest("tr");
  if (row) {
    const pctTd = row.children[9];
    const isNotRunning =
      g.sourceType === "machine_status" &&
      normalizeText(g.operationStatus) === MACHINE_STATUS_NOT_RUNNING;
    const pct = isNotRunning ? null : window.WASTE_FORMULA.percent(g.waste, cleanNum);
    if (pctTd) pctTd.textContent = pct === null ? "-" : formatPercent(pct);
  }

  // Update summary counts instantly
  renderSummary(state.groups);
}
// Enter = ไปช่องน้ำหนักผลิตถัดไป (Shift+Enter = ย้อนกลับ) กรอกต่อเนื่องได้เหมือน Excel
function handleProductionKeydown(event, input) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const all = [...document.querySelectorAll(".cell-input-production:not([readonly]):not([disabled])")];
  const idx = all.indexOf(input);
  const next = all[idx + (event.shiftKey ? -1 : 1)];
  input.blur();
  if (next) {
    next.focus();
    next.scrollIntoView({ block: "nearest" });
  }
}

function formatPercent(v) {
  return `${formatNumber(v)}%`;
}
function getValue(id) {
  return document.getElementById(id)?.value?.trim() || "";
}
function setValue(id, v) {
  const e = document.getElementById(id);
  if (e) e.value = v;
}
function setText(id, v) {
  if (window.setTextAnimated) {
    window.setTextAnimated(id, v);
  } else {
    const e = document.getElementById(id);
    if (e) e.textContent = v;
  }
}
function safeText(v) {
  return window.EA_COMMON?.safeText
    ? window.EA_COMMON.safeText(v)
    : String(v ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
function safeAttr(v) {
  return window.EA_COMMON?.safeAttr
    ? window.EA_COMMON.safeAttr(v)
    : safeText(v).replaceAll("`", "&#096;");
}
function cssEscape(v) {
  return window.CSS?.escape ? CSS.escape(v) : String(v).replaceAll('"', '\\"');
}
function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 2600);
}
function closeModal() {
  document.getElementById("appModal")?.classList.add("hidden");
}

async function logoutAccounting() {
  try {
    const client = state.supabase || window.supabaseClient || window.supabase;
    if (client?.auth?.signOut) {
      await Promise.race([
        client.auth.signOut(),
        new Promise((res) => setTimeout(res, 800)),
      ]);
    }
  } catch (e) {
    console.warn("ออกจากระบบไม่สมบูรณ์:", e);
  } finally {
    // ล้างข้อมูลเข้าสู่ระบบ แต่เก็บรายการที่รอส่ง (บันทึกตอนเน็ตหลุด) และธีมสีไว้
    const keepKeys = ["pvtOfflineQueue", "pvtOfflineFailed", "pvtAppTheme"];
    const kept = keepKeys.map((k) => [k, localStorage.getItem(k)]);
    localStorage.clear();
    kept.forEach(([k, v]) => v !== null && localStorage.setItem(k, v));
    sessionStorage.clear();
    window.location.href = "/login.html";
  }
}

/* ======================================================
   ปิดงวดบัญชีรายเดือน
   (บังคับจริงที่ฐานข้อมูลด้วย trigger ใน database/09-accounting-controls.sql)
====================================================== */
async function loadPeriodLocks() {
  try {
    const { data, error } = await state.supabase
      .from(LOCK_TABLE)
      .select("period, locked_by_name, locked_at, note");
    if (error) throw error;
    state.locks = new Map((data || []).map((r) => [r.period, r]));
    state.locksAvailable = true;
  } catch (err) {
    // ยังไม่ได้รัน SQL 09 → ใช้งานส่วนอื่นได้ตามปกติ แค่ยังปิดงวดไม่ได้
    console.warn("โหลดงวดที่ปิดแล้วไม่สำเร็จ:", err?.message || err);
    state.locks = new Map();
    state.locksAvailable = false;
  }
}

function periodOf(date) {
  return String(date || "").slice(0, 7);
}

function isGroupLocked(g) {
  return !!g && state.locks.has(periodOf(g.date));
}

function lockedMessage(date) {
  return `งวด ${formatThaiMonthYearAccounting(periodOf(date))} ปิดบัญชีแล้ว แก้ไขไม่ได้ (เปิดงวดก่อนถ้าจำเป็นต้องแก้)`;
}

function friendlyDbError(err) {
  const msg = String(err?.message || err || "");
  if (msg.includes("PERIOD_LOCKED")) {
    return msg.replace(/^.*PERIOD_LOCKED:\s*/, "");
  }
  return msg;
}

function renderPeriodLockBar(month) {
  const bar = document.getElementById("periodLockBar");
  if (!bar) return;

  if (!month) {
    bar.hidden = false;
    bar.className = "period-lock-bar is-info";
    bar.innerHTML = `<span class="material-symbols-outlined">info</span>
      <span>เลือกเดือนในตัวกรองด้านบน เพื่อดูหรือปิดงวดบัญชีของเดือนนั้น</span>`;
    return;
  }

  const label = formatThaiMonthYearAccounting(month);
  const lock = state.locks.get(month);
  bar.hidden = false;

  if (!state.locksAvailable) {
    bar.className = "period-lock-bar is-info";
    bar.innerHTML = `<span class="material-symbols-outlined">info</span>
      <span>ยังปิดงวดบัญชีไม่ได้ — ต้องรันไฟล์ <code>database/09-accounting-controls.sql</code> ใน Supabase ก่อน</span>`;
    return;
  }

  if (lock) {
    const when = lock.locked_at ? new Date(lock.locked_at).toLocaleString("th-TH") : "-";
    bar.className = "period-lock-bar is-locked";
    bar.innerHTML = `<span class="material-symbols-outlined">lock</span>
      <span><strong>งวด ${safeText(label)} ปิดบัญชีแล้ว</strong>
      <small>โดย ${safeText(lock.locked_by_name || "-")} · ${safeText(when)} — ข้อมูลเดือนนี้แก้ไขไม่ได้ทั้งระบบ</small></span>
      <button type="button" class="btn light" onclick="unlockPeriod('${safeAttr(month)}')">
        <span class="material-symbols-outlined">lock_open</span> เปิดงวดอีกครั้ง
      </button>`;
    return;
  }

  const pending = state.groups.filter(
    (g) => periodOf(g.date) === month && normalizeText(g.status) === STATUS_SENT,
  ).length;
  bar.className = "period-lock-bar is-open";
  bar.innerHTML = `<span class="material-symbols-outlined">lock_open</span>
    <span><strong>งวด ${safeText(label)} ยังเปิดอยู่</strong>
    <small>${pending ? `เหลือรอตรวจ ${pending.toLocaleString("th-TH")} รายการ` : "ตรวจครบทุกรายการแล้ว พร้อมปิดงวด"}</small></span>
    <button type="button" class="btn primary" onclick="lockPeriod('${safeAttr(month)}')">
      <span class="material-symbols-outlined">lock</span> ปิดงวดเดือนนี้
    </button>`;
}

function askConfirm({ title, html, okText = "ยืนยัน", okClass = "primary" }) {
  return new Promise((resolve) => {
    const modal = document.getElementById("appModal");
    const titleEl = document.getElementById("modalTitle");
    const body = document.getElementById("modalBody");
    const actions = document.getElementById("modalActions");
    if (!modal || !titleEl || !body || !actions) {
      resolve(confirm(title));
      return;
    }
    titleEl.textContent = title;
    body.innerHTML = html;
    actions.innerHTML = `
      <button class="btn light" id="askNoBtn" type="button">ยกเลิก</button>
      <button class="btn ${okClass}" id="askYesBtn" type="button">${safeText(okText)}</button>`;
    modal.classList.remove("hidden");
    const done = (v) => {
      modal.classList.add("hidden");
      resolve(v);
    };
    document.getElementById("askNoBtn")?.addEventListener("click", () => done(false), { once: true });
    document.getElementById("askYesBtn")?.addEventListener("click", () => done(true), { once: true });
  });
}

async function lockPeriod(month) {
  if (!month) return;
  const label = formatThaiMonthYearAccounting(month);
  const pending = state.groups.filter(
    (g) => periodOf(g.date) === month && normalizeText(g.status) === STATUS_SENT,
  ).length;
  const draftsInMonth = [...state.drafts.keys()].filter((k) => k.startsWith(month)).length;

  const ok = await askConfirm({
    title: `ปิดงวด ${label}`,
    okText: "ปิดงวด",
    okClass: "primary",
    html: `
      <p>หลังปิดงวด ข้อมูลของเสียเดือนนี้จะ<strong>แก้ไข เพิ่ม หรือลบไม่ได้ทั้งระบบ</strong>
      (หน้างาน หัวหน้างาน และบัญชี) จนกว่าจะเปิดงวดอีกครั้ง</p>
      ${pending ? `<p class="lock-warn">⚠️ ยังมีรายการ <strong>รอบัญชีตรวจ ${pending} รายการ</strong> ที่ยังไม่ได้กรอกน้ำหนักผลิต</p>` : ""}
      ${draftsInMonth ? `<p class="lock-warn">⚠️ มีน้ำหนักผลิตที่พิมพ์ไว้แต่ยังไม่บันทึก ${draftsInMonth} รายการ จะถูกทิ้ง</p>` : ""}
      <label class="lock-note">หมายเหตุ (ถ้ามี)<input id="lockNoteInput" type="text" maxlength="200" placeholder="เช่น ปิดงวดหลังกระทบยอดกับคลังแล้ว" /></label>`,
  });
  if (!ok) return;
  const note = document.getElementById("lockNoteInput")?.value?.trim() || null;

  const { error } = await state.supabase.from(LOCK_TABLE).insert({ period: month, note });
  if (error) {
    const denied = /row-level security|permission/i.test(error.message || "");
    return showToast(
      denied ? "บัญชีนี้ไม่มีสิทธิ์ปิดงวด (เฉพาะฝ่ายบัญชีและแอดมิน)" : `ปิดงวดไม่สำเร็จ: ${error.message}`,
      "error",
    );
  }
  showToast(`ปิดงวด ${label} แล้ว`, "success");
  await loadAccountingData();
}

async function unlockPeriod(month) {
  if (!month) return;
  const label = formatThaiMonthYearAccounting(month);
  const ok = await askConfirm({
    title: `เปิดงวด ${label} อีกครั้ง`,
    okText: "เปิดงวด",
    okClass: "warning",
    html: `<p>เมื่อเปิดงวด ข้อมูลเดือนนี้จะกลับมาแก้ไขได้ ระบบจะบันทึกไว้ว่าใครเปิดงวดและเมื่อไร</p>
      <p class="muted">ควรเปิดเฉพาะเมื่อต้องแก้ข้อมูลจริง แล้วปิดงวดอีกครั้งหลังแก้เสร็จ</p>`,
  });
  if (!ok) return;

  const { error, count } = await state.supabase
    .from(LOCK_TABLE)
    .delete({ count: "exact" })
    .eq("period", month);
  if (error || count === 0) {
    return showToast(
      error ? `เปิดงวดไม่สำเร็จ: ${error.message}` : "บัญชีนี้ไม่มีสิทธิ์เปิดงวด (เฉพาะฝ่ายบัญชีและแอดมิน)",
      "error",
    );
  }
  showToast(`เปิดงวด ${label} แล้ว`, "success");
  await loadAccountingData();
}

/* ======================================================
   ประวัติการแก้น้ำหนักผลิต (บันทึกอัตโนมัติโดยฐานข้อมูล)
====================================================== */
async function loadProductionHistory(key) {
  const g = state.groups.find((x) => x.key === key);
  const box = document.querySelector(`[data-history="${cssEscape(key)}"] .prod-history-body`);
  if (!g || !box) return;

  const { data, error } = await state.supabase
    .from(PRODUCTION_LOG_TABLE)
    .select("changed_at, changed_by_name, old_production, new_production")
    .eq("work_date", g.date)
    .eq("department_code", String(g.dept || "").toUpperCase())
    .eq("machine_no", g.machine)
    .order("changed_at", { ascending: false })
    .limit(30);

  if (error) {
    box.innerHTML = /does not exist|PGRST205|schema cache/i.test(error.message || "")
      ? `ยังไม่ได้เปิดใช้ — รันไฟล์ <code>database/09-accounting-controls.sql</code> ใน Supabase`
      : `โหลดประวัติไม่สำเร็จ: ${safeText(error.message)}`;
    return;
  }

  // หนึ่งครั้งที่กดบันทึกอาจแก้หลายแถวพร้อมกัน (หลายกะ) → รวมเป็นรายการเดียว
  const seen = new Set();
  const rows = (data || []).filter((r) => {
    const k = `${String(r.changed_at).slice(0, 19)}|${r.changed_by_name}|${r.old_production}|${r.new_production}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (!rows.length) {
    box.textContent = "ยังไม่มีการบันทึกหรือแก้ไขน้ำหนักผลิต";
    return;
  }

  box.classList.remove("muted");
  box.innerHTML = `<ol class="prod-history-list">${rows
    .map((r) => {
      const from = r.old_production == null ? "ว่าง" : `${formatNumber(r.old_production)} kg`;
      const to = r.new_production == null ? "ว่าง" : `${formatNumber(r.new_production)} kg`;
      return `<li>
        <span class="ph-when">${safeText(new Date(r.changed_at).toLocaleString("th-TH"))}</span>
        <span class="ph-who">${safeText(r.changed_by_name || "-")}</span>
        <span class="ph-what">${safeText(from)} → <strong>${safeText(to)}</strong></span>
      </li>`;
    })
    .join("")}</ol>`;
}

/* ======================================================
   ส่งออก Excel (.xlsx)
   สร้างไฟล์ในเครื่องของผู้ใช้เท่านั้น — ไม่ส่งข้อมูลออกไปที่ใด
====================================================== */
const XLSX_CDN = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";

function loadXlsxLib() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = XLSX_CDN;
    s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error("โหลดตัวสร้าง Excel ไม่สำเร็จ")));
    s.onerror = () => reject(new Error("โหลดตัวสร้าง Excel ไม่สำเร็จ (ตรวจสอบอินเทอร์เน็ต)"));
    document.head.appendChild(s);
  });
}

function groupStatusText(g) {
  const st = normalizeText(g.status);
  if (st === STATUS_CANCELLED) return "ยกเลิกรายการ";
  if (st === MACHINE_STATUS_NOT_RUNNING) return "ไม่ได้เดินเครื่อง";
  if (st === STATUS_DONE) return "บัญชีตรวจแล้ว";
  return "รอบัญชีตรวจ";
}

async function exportAccountingExcel() {
  const groups = state.groups || [];
  if (!groups.length) return showToast("ไม่มีข้อมูลตามตัวกรองให้ส่งออก", "error");

  let XLSX;
  try {
    window.LoadingService?.show("กำลังสร้างไฟล์ Excel", "กรุณารอสักครู่");
    XLSX = await loadXlsxLib();
  } catch (err) {
    window.LoadingService?.hide();
    return showToast(err.message, "error");
  }

  try {
    const num = (v) => Math.round(Number(v || 0) * 100) / 100;
    const month = getValue("filterMonth");
    const dept = getValue("filterDept");

    // แผ่น 1: รายการ (ตามตัวกรองบนหน้าจอ)
    const detail = groups.map((g) => {
      const st = normalizeText(g.status);
      const active = st !== STATUS_CANCELLED && st !== MACHINE_STATUS_NOT_RUNNING;
      const pct = active ? window.WASTE_FORMULA.percent(g.waste, g.production) : null;
      const m = active ? state.monthlyMachine?.get(`${periodOf(g.date)}|${g.dept}|${g.machine}`) : null;
      return {
        "วันที่": g.date,
        "รหัสแผนก": g.dept,
        "แผนก": getDeptName(g.dept),
        "กะ": g.shift,
        "เครื่อง": g.machine,
        "ผู้บันทึก": [...(g.reporter || [])].join(", "),
        "ของเสีย (kg)": num(g.waste),
        "ผลิตดี (kg)": g.production ? num(g.production) : null,
        "% ของเสีย (วันนั้น)": pct === null ? null : num(pct),
        "% ของเสียทั้งเดือน (เครื่อง)": m && m.pct !== null ? num(m.pct) : null,
        "ผลรายเดือน (เครื่อง)": !active ? "" : m && m.pct !== null ? m.evaluation.label : "รอน้ำหนักผลิต",
        "สถานะ": groupStatusText(g),
        "งวด": isGroupLocked(g) ? "ปิดงวดแล้ว" : "เปิดอยู่",
      };
    });

    // แผ่น 2: รายการปัญหา (ทีละปัญหา)
    const problems = [];
    groups.forEach((g) => {
      if (normalizeText(g.status) === STATUS_CANCELLED) return;
      (g.items || []).forEach((it) => {
        problems.push({
          "วันที่": g.date,
          "รหัสแผนก": g.dept,
          "แผนก": getDeptName(g.dept),
          "เครื่อง": g.machine,
          "กะ": it.shift || g.shift,
          "ปัญหา": it.problem_type || "",
          "น้ำหนักของเสีย (kg)": num(it.waste_weight_kg),
          "รายละเอียด": it.detail || "",
          "ผู้บันทึก": it.reported_by || "",
        });
      });
    });

    // แผ่น 3: สรุปรายเดือนแยกตามแผนก (สูตรเดียวกับหน้าจอ)
    const activeForSum = groups.filter((g) => normalizeText(g.status) !== STATUS_CANCELLED);
    const pendingByDept = new Map();
    activeForSum.forEach((g) => {
      if (normalizeText(g.status) === STATUS_SENT) pendingByDept.set(g.dept, (pendingByDept.get(g.dept) || 0) + 1);
    });
    const summary = buildSummaryRows(activeForSum, "dept").map((r) => ({
      "รหัสแผนก": r.dept,
      "แผนก": getDeptName(r.dept),
      "จำนวนรายการ": r.count,
      "รอบัญชีตรวจ": pendingByDept.get(r.dept) || 0,
      "กรอกผลิตแล้ว": `${r.withProduction}/${r.count}`,
      "ของเสียรวม (kg)": num(r.waste),
      "ของเสียที่ใช้คิด % (kg)": num(r.wasteCounted),
      "ผลิตดีรวม (kg)": num(r.good),
      "% ของเสีย": r.pct === null ? null : num(r.pct),
      "เกณฑ์ไม่เกิน (%)": num(r.std.max),
      "ผลประเมินรายเดือน": r.evaluation.label,
    }));

    const info = [
      { "รายการ": "รายงาน", "ค่า": "ข้อมูลของเสียจากการผลิต (ฝ่ายบัญชี)" },
      { "รายการ": "เดือน", "ค่า": formatThaiMonthYearAccounting(month) },
      { "รายการ": "แผนก", "ค่า": dept === "all" ? "ทุกแผนก" : getDeptName(dept) },
      { "รายการ": "สถานะ", "ค่า": document.getElementById("filterStatus")?.selectedOptions?.[0]?.textContent || "ทั้งหมด" },
      { "รายการ": "สูตร", "ค่า": "% ของเสีย = ของเสีย ÷ (ผลิตดี + ของเสีย) × 100 · ประเมินรายเดือน (เฉพาะรายการที่กรอกผลิตแล้ว)" },
      { "รายการ": "ส่งออกเมื่อ", "ค่า": new Date().toLocaleString("th-TH") },
      { "รายการ": "ส่งออกโดย", "ค่า": state.currentUser?.display_name || state.currentUser?.full_name || state.currentUser?.username || "-" },
    ];

    const wb = XLSX.utils.book_new();
    const add = (rows, name, widths) => {
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ "ข้อมูล": "ไม่มีข้อมูล" }]);
      if (widths) ws["!cols"] = widths.map((w) => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    };
    add(summary, "สรุปแผนก", [10, 16, 12, 12, 12, 16, 20, 16, 12, 14, 18]);
    add(detail, "รายการ", [12, 10, 14, 10, 14, 18, 12, 12, 16, 22, 20, 14, 12]);
    add(problems, "รายการปัญหา", [12, 10, 14, 14, 8, 22, 16, 30, 16]);
    add(info, "ข้อมูลรายงาน", [14, 40]);

    const fileMonth = month || "ทุกเดือน";
    const fileDept = dept && dept !== "all" ? `_${dept}` : "";
    XLSX.writeFile(wb, `ของเสีย_บัญชี_${fileMonth}${fileDept}.xlsx`);
    showToast("ส่งออก Excel แล้ว", "success");
  } catch (err) {
    console.error(err);
    showToast(`ส่งออก Excel ไม่สำเร็จ: ${err.message || err}`, "error");
  } finally {
    window.LoadingService?.hide();
  }
}

window.lockPeriod = lockPeriod;
window.unlockPeriod = unlockPeriod;
window.exportAccountingExcel = exportAccountingExcel;

window.loadAccountingData = loadAccountingData;
window.applyFilters = applyFilters;
window.toggleDetail = toggleDetail;
window.saveGroup = saveGroup;
window.closeModal = closeModal;
window.editGroup = editGroup;
window.cancelGroup = cancelGroup;
window.logoutAccounting = logoutAccounting;
window.formatProductionInput = formatProductionInput;
window.handleProductionFocus = handleProductionFocus;
window.handleProductionInput = handleProductionInput;
window.formatQtyNumber = formatQtyNumber;
window.handleProductionKeydown = handleProductionKeydown;
window.saveAllDrafts = saveAllDrafts;

function exportAccountingSummaryPDF() {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("กรุณาอนุญาตให้เปิดหน้าต่างป็อปอัปเพื่อออกรายงาน PDF");
    return;
  }
  const html = generateAccountingReportHTML(false);
  printWindow.document.write(html);
  printWindow.document.close();
}

function printAccountingSummary() {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("กรุณาอนุญาตให้เปิดหน้าต่างป็อปอัปเพื่อพิมพ์รายงาน");
    return;
  }
  const html = generateAccountingReportHTML(true);
  printWindow.document.write(html);
  printWindow.document.close();
}

function generateAccountingReportHTML(isPrintImmediate = false) {
  const month = document.getElementById("filterMonth")?.value || "";
  const deptFilter = document.getElementById("filterDept")?.value || "all";
  const statusFilter = document.getElementById("filterStatus")?.value || "all";

  let filterDesc = `ข้อมูลประจำเดือน: ${formatThaiMonthYearAccounting(month)}`;
  if (deptFilter !== "all") {
    filterDesc += ` | แผนก: ${getDeptName(deptFilter)}`;
  }
  if (statusFilter !== "all") {
    const statusText = statusFilter === "sent_accounting" ? "รอบัญชีตรวจ" : (statusFilter === "accounting_checked" ? "บัญชีตรวจแล้ว" : "ยกเลิกรายการ");
    filterDesc += ` | สถานะ: ${statusText}`;
  }

  // สรุปรายเดือน (สูตรเดียวกับหน้าจอ: ของเสีย ÷ (ผลิตดี + ของเสีย) × 100)
  const groupType = document.getElementById("summaryGroupType")?.value || "dept";
  const activeGroups = (state.groups || []).filter(g => normalizeText(g.status) !== STATUS_CANCELLED);
  const sumRows = buildSummaryRows(activeGroups, groupType).sort((a, b) => b.waste - a.waste);
  const td = 'style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: right;"';
  const deptRowsHTML = sumRows.map(d => {
    const isProblem = groupType === "problem";
    return `
      <tr>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-weight: 600; text-align: left;">${safeText(d.name)}${d.sub && !isProblem ? `<br><small style="color:#64748b;font-weight:400">${safeText(d.sub)}</small>` : ""}</td>
        <td ${td}>${isProblem || !d.good ? "-" : `${formatNumber(d.good)} kg`}</td>
        <td ${td}>${formatNumber(d.waste)} kg</td>
        <td ${td}><strong>${isProblem || d.pct === null ? "-" : `${formatNumber(d.pct)}%`}</strong></td>
        <td ${td}>${isProblem ? "-" : `${formatNumber(d.std.max)}%`}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">${isProblem ? "-" : safeText(d.evaluation.label)}${!isProblem && d.withProduction < d.count && d.pct !== null ? "<br><small style='color:#64748b'>ยังกรอกผลิตไม่ครบ</small>" : ""}</td>
      </tr>
    `;
  }).join("");

  const summaryTitle = groupType === "problem" ? "สรุปผลรวมแยกตามประเภทปัญหา" 
                     : groupType === "machine" ? "สรุปผลรวมแยกตามเครื่องจักร" 
                     : "สรุปผลรวมแยกตามแผนก / สินค้า";
                     
  const summaryColName = groupType === "problem" ? "ประเภทปัญหา" 
                       : groupType === "machine" ? "เครื่องจักร" 
                       : "แผนก / สินค้า";

  // Detailed rows HTML
  const detailedRowsHTML = (state.groups || []).map(g => {
    const isCancelled = normalizeText(g.status) === STATUS_CANCELLED;
    const pct = window.WASTE_FORMULA.percent(g.waste, g.production);
    const formattedPct = isCancelled || pct === null ? "-" : formatNumber(pct) + "%";
    const statusText = isCancelled ? "ยกเลิกรายการ" : (normalizeText(g.status) === STATUS_DONE ? "บัญชีตรวจแล้ว" : "รอบัญชีตรวจ");
    
    return `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 13px;">${safeText(g.date ? formatDate(g.date) : "-")}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 13px;">${safeText(getDeptName(g.dept))}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 13px;">${safeText(g.shift || "-")}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 13px;">${safeText(g.machine || "-")}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 13px;">${formatNumber(g.waste)} kg</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 13px;">${g.production ? formatNumber(g.production) + " kg" : "-"}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 13px; font-weight: 600;">${formattedPct}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 12px;">${statusText}</td>
      </tr>
    `;
  }).join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>รายงานสรุปข้อมูลของเสียประจำแผนกบัญชี</title>
      <meta charset="utf-8">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
      <style>
        body {
          font-family: 'Sarabun', sans-serif;
          color: #1e293b;
          margin: 40px;
          line-height: 1.6;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #0284c7;
          padding-bottom: 15px;
          margin-bottom: 30px;
        }
        .header h1 {
          font-size: 24px;
          margin: 0;
          color: #0f172a;
        }
        .header p {
          font-size: 14px;
          margin: 5px 0 0 0;
          color: #64748b;
        }
        .meta-info {
          font-size: 14px;
          margin-bottom: 25px;
          color: #475569;
          background: #f8fafc;
          padding: 12px 18px;
          border-radius: 8px;
          border-left: 4px solid #0284c7;
        }
        .section-title {
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
          margin: 30px 0 12px 0;
          border-bottom: 1px solid #cbd5e1;
          padding-bottom: 6px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        th {
          background-color: #0284c7;
          color: white;
          font-weight: 600;
          text-align: left;
          padding: 10px 8px;
          font-size: 14px;
        }
        th.text-right {
          text-align: right;
        }
        td {
          font-size: 14px;
        }
        .footer {
          margin-top: 50px;
          text-align: center;
          font-size: 12px;
          color: #94a3b8;
          border-top: 1px solid #e2e8f0;
          padding-top: 15px;
        }
        @media print {
          body {
            margin: 20px;
          }
          .no-print {
            display: none !important;
          }
        }
      </style>
    </head>
    <body ${isPrintImmediate ? 'onload="window.print()"' : ''}>
      <div style="display: flex; justify-content: flex-end; margin-bottom: 20px;" class="no-print">
        <button onclick="window.print();" style="background: #0284c7; color: white; border: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 6px -1px rgba(2, 132, 199, 0.2);">
          พิมพ์ / บันทึกเป็น PDF
        </button>
      </div>
      <div class="header">
        <div>
          <h1>รายงานสรุปประสิทธิภาพและของเสียรายแผนก (Accounting)</h1>
          <p>PVT&T FACTORY Management System - ฝ่ายบัญชีและการคำนวณอัตราของเสีย</p>
        </div>
        <div style="text-align: right; font-size: 12px; color: #64748b;">
          พิมพ์เมื่อ: ${new Date().toLocaleDateString("th-TH")}
        </div>
      </div>
      
      <div class="meta-info">
        <strong>ช่วงเวลาและตัวกรอง:</strong> ${filterDesc}<br>
        <strong>สูตร:</strong> % ของเสีย = ของเสีย ÷ (ผลิตดี + ของเสีย) × 100 · ประเมินผ่าน/เกินจากยอดรวมทั้งเดือน (เฉพาะรายการที่บัญชีกรอกผลิตแล้ว)
      </div>

      <div class="section-title">1. ${summaryTitle}</div>
      <table>
        <thead>
          <tr>
            <th style="text-align: left;">${summaryColName}</th>
            <th style="text-align: right;">ผลิตดีรวม (kg)</th>
            <th style="text-align: right;">ของเสียรวม (kg)</th>
            <th style="text-align: right;">% ของเสีย</th>
            <th style="text-align: right;">เกณฑ์ไม่เกิน</th>
            <th style="text-align: center;">ผลประเมินรายเดือน</th>
          </tr>
        </thead>
        <tbody>
          ${deptRowsHTML || '<tr><td colspan="6" style="padding: 15px; text-align: center; color: #64748b;">ไม่มีข้อมูล</td></tr>'}
        </tbody>
      </table>

      <div class="section-title">2. รายละเอียดรายการผลิตและของเสียรายวัน (Daily Transactions)</div>
      <table>
        <thead>
          <tr>
            <th style="text-align: left;">วันที่</th>
            <th style="text-align: left;">แผนก</th>
            <th style="text-align: center;">กะ</th>
            <th style="text-align: left;">เครื่อง</th>
            <th style="text-align: right;">ของเสีย (kg)</th>
            <th style="text-align: right;">ผลิตดี (kg)</th>
            <th style="text-align: right;">% ของเสีย (วันนั้น)</th>
            <th style="text-align: center;">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          ${detailedRowsHTML || '<tr><td colspan="8" style="padding: 15px; text-align: center; color: #64748b;">ไม่มีข้อมูลรายละเอียด</td></tr>'}
        </tbody>
      </table>

      <div class="footer">
        เอกสารนี้จัดทำและรับรองโดยระบบบัญชีอัตโนมัติของบริษัท PVT&T FACTORY Management System
      </div>
    </body>
    </html>
  `;
}

window.exportAccountingSummaryPDF = exportAccountingSummaryPDF;
window.printAccountingSummary = printAccountingSummary;

async function fetchProblemTypesForDept(dept) {
  const cleanDept = String(dept || "").toLowerCase().trim();
  try {
    const { data, error } = await state.supabase
      .from("master_problems")
      .select("problem_type")
      .eq("department_code", cleanDept)
      .eq("is_active", true)
      .order("problem_type", { ascending: true });

    if (!error && data?.length > 0) {
      return data.map((item) => item.problem_type).filter(Boolean);
    }
  } catch (err) {
    console.warn("Error fetching master_problems by code:", err);
  }

  try {
    const { data, error } = await state.supabase
      .from("master_problems")
      .select("problem_type")
      .eq("department", cleanDept)
      .eq("is_active", true)
      .order("problem_type", { ascending: true });

    if (!error && data?.length > 0) {
      return data.map((item) => item.problem_type).filter(Boolean);
    }
  } catch (err) {
    console.warn("Error fetching master_problems by name:", err);
  }

  try {
    const { data, error } = await state.supabase
      .from("pvt_problem_types")
      .select("problem_name")
      .eq("department_code", cleanDept)
      .order("problem_name", { ascending: true });

    if (!error && data?.length > 0) {
      return data.map((item) => item.problem_name).filter(Boolean);
    }
  } catch (err) {
    console.warn("Error fetching pvt_problem_types:", err);
  }

  // Fallback lists
  if (cleanDept.includes("blow")) {
    return ["หลอดสั้น", "หลอดคด", "ก้นบาง", "น้ำหนักเกิน", "ฟองอากาศ", "รอยขีดข่วน", "อื่นๆ"];
  } else if (cleanDept.includes("print")) {
    return ["สีเพี้ยน", "ลายเลอะ", "พิมพ์ไม่ติด", "พิมพ์เบี้ยว", "อื่นๆ"];
  }
  return ["ชำรุด", "ไม่ได้มาตรฐาน", "เศษวัสดุ", "อื่นๆ"];
}

async function showAddScrapModal(groupKey) {
  const g = state.groups.find((x) => x.key === groupKey);
  if (!g) return;
  if (isGroupLocked(g)) return showToast(lockedMessage(g.date), "error");

  const modal = document.getElementById("appModal");
  const title = document.getElementById("modalTitle");
  const body = document.getElementById("modalBody");
  const actions = document.getElementById("modalActions");

  if (!modal || !title || !body || !actions) return;

  title.textContent = `เพิ่มรายการของเสีย - เครื่อง ${g.machine} (${formatDate(g.date)})`;

  body.innerHTML = `
    <form id="addScrapForm" style="display: flex; flex-direction: column; gap: 14px; padding: 8px 4px;">
      <div class="form-group" style="display: flex; flex-direction: column; gap: 4px;">
        <label style="font-weight: 600; font-size: 14px; color: #334155;">กะการผลิต *</label>
        <select id="scrapShift" class="filter-select" style="width: 100%; height: 40px; border-radius: 6px; padding: 0 10px; border: 1px solid #cbd5e1;" required>
          <option value="A">กะ A (เช้า)</option>
          <option value="B">กะ B (บ่าย)</option>
          <option value="C">กะ C (ดึก)</option>
        </select>
      </div>

      <div class="form-group" style="display: flex; flex-direction: column; gap: 4px;">
        <label style="font-weight: 600; font-size: 14px; color: #334155;">ประเภทปัญหา *</label>
        <select id="scrapProblemType" class="filter-select" style="width: 100%; height: 40px; border-radius: 6px; padding: 0 10px; border: 1px solid #cbd5e1;" required>
          <option value="">กำลังโหลดรายการปัญหา...</option>
        </select>
      </div>

      <div class="form-group" style="display: flex; flex-direction: column; gap: 4px;">
        <label style="font-weight: 600; font-size: 14px; color: #334155;">น้ำหนักของเสีย (kg) *</label>
        <input type="number" id="scrapWeight" class="cell-input" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; box-sizing: border-box;" step="0.01" min="0.01" placeholder="ระบุน้ำหนักเป็น kg" required />
      </div>

      <div class="form-group" style="display: flex; flex-direction: column; gap: 4px;">
        <label style="font-weight: 600; font-size: 14px; color: #334155;">รายละเอียดเพิ่มเติม</label>
        <textarea id="scrapDetail" class="cell-input" style="width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; min-height: 60px; box-sizing: border-box;" placeholder="ระบุรายละเอียดเพิ่มเติม (ถ้ามี)"></textarea>
      </div>
    </form>
  `;

  actions.innerHTML = `
    <button class="btn light" id="btnCancelScrap" style="padding: 8px 16px; border-radius: 6px;">ยกเลิก</button>
    <button class="btn primary" id="btnSubmitScrap" style="background-color: #0284c7; padding: 8px 16px; border-radius: 6px; color: white; border: none; font-weight: 600; cursor: pointer;">บันทึกของเสีย</button>
  `;

  modal.classList.remove("hidden");

  // Load problem types asynchronously
  const problemSelect = document.getElementById("scrapProblemType");
  fetchProblemTypesForDept(g.dept).then(problems => {
    if (problemSelect) {
      problemSelect.innerHTML = problems.map(p => `<option value="${safeAttr(p)}">${safeText(p)}</option>`).join("");
      if (!problems.some(p => p.includes("อื่น"))) {
        problemSelect.innerHTML += `<option value="อื่นๆ">อื่นๆ</option>`;
      }
    }
  }).catch(err => {
    console.error("Failed to load problem types:", err);
    if (problemSelect) {
      problemSelect.innerHTML = `
        <option value="ทั่วไป">ทั่วไป</option>
        <option value="อื่นๆ">อื่นๆ</option>
      `;
    }
  });

  const cancelBtn = document.getElementById("btnCancelScrap");
  cancelBtn?.addEventListener("click", () => {
    closeModal();
  });

  const submitBtn = document.getElementById("btnSubmitScrap");
  submitBtn?.addEventListener("click", async () => {
    const shift = document.getElementById("scrapShift")?.value;
    const problemType = document.getElementById("scrapProblemType")?.value;
    const weightStr = document.getElementById("scrapWeight")?.value;
    const detail = document.getElementById("scrapDetail")?.value || "";

    if (!shift || !problemType || !weightStr) {
      showToast("กรุณากรอกข้อมูลให้ครบถ้วน", "error");
      return;
    }

    const weight = parseFloat(weightStr);
    if (isNaN(weight) || weight <= 0) {
      showToast("กรุณากรอกน้ำหนักของเสียให้ถูกต้อง (มากกว่า 0)", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "กำลังบันทึก...";

    try {
      await appendScrapItem(g, shift, problemType, weight, detail);
      closeModal();
      showToast("เพิ่มรายการของเสียเรียบร้อยแล้ว", "success");
      await loadAccountingData();
    } catch (err) {
      console.error(err);
      showToast(`เกิดข้อผิดพลาด: ${friendlyDbError(err)}`, "error");
      submitBtn.disabled = false;
      submitBtn.textContent = "บันทึกของเสีย";
    }
  });
}

async function appendScrapItem(g, shift, problemType, weight, detail) {
  // Check if a report already exists for this date, dept, machine, and shift
  const { data: existingReports, error: findErr } = await state.supabase
    .from(REPORT_TABLE)
    .select("id, status")
    .eq("report_date", g.date)
    .eq("department_code", g.dept)
    .eq("machine_no", g.machine)
    .eq("work_shift", shift)
    .neq("status", STATUS_CANCELLED)
    .limit(1);

  if (findErr) throw findErr;

  let reportId;
  let reportStatus = g.status === STATUS_DONE ? STATUS_DONE : STATUS_SENT;

  if (existingReports && existingReports.length > 0) {
    reportId = existingReports[0].id;
    reportStatus = existingReports[0].status;
  } else {
    // No active report exists for this shift, create a new one
    const newReport = {
      report_date: g.date,
      department_code: g.dept,
      department: g.dept,
      machine_no: g.machine,
      shift: shift,
      work_shift: shift,
      reported_by:
        state.currentUser?.full_name ||
        state.currentUser?.display_name ||
        state.currentUser?.username ||
        "บัญชี",
      status: reportStatus,
      waste_weight_kg: weight,
      reason_detail: problemType,
      detail: detail || null
    };

    const { data: insertedReport, error: reportInsertErr } = await state.supabase
      .from(REPORT_TABLE)
      .insert(newReport)
      .select("id")
      .single();

    if (reportInsertErr) throw reportInsertErr;
    reportId = insertedReport?.id;
  }

  // Get the next item_no for this report
  const { data: existingItems, error: itemsError } = await state.supabase
    .from(ITEM_TABLE)
    .select("item_no")
    .eq("report_id", reportId);

  if (itemsError) throw itemsError;

  const nextItemNo = (existingItems || []).reduce((max, item) => Math.max(max, item.item_no || 0), 0) + 1;

  // Insert the new scrap item
  const newItemRow = {
    report_id: reportId,
    item_no: nextItemNo,
    problem_type: problemType,
    waste_weight_kg: weight,
    detail: detail || null
  };

  const { error: itemInsertErr } = await state.supabase
    .from(ITEM_TABLE)
    .insert(newItemRow);

  if (itemInsertErr) throw itemInsertErr;

  // Recalculate and update the total waste_weight_kg on the parent report
  const { data: updatedItems, error: loadUpdatedErr } = await state.supabase
    .from(ITEM_TABLE)
    .select("waste_weight_kg")
    .eq("report_id", reportId);

  if (!loadUpdatedErr && updatedItems) {
    const totalWasteWeight = updatedItems.reduce((sum, item) => sum + Number(item.waste_weight_kg || 0), 0);
    
    // Update parent report with the new total waste weight
    await state.supabase
      .from(REPORT_TABLE)
      .update({ 
        waste_weight_kg: totalWasteWeight,
        waste_qty: totalWasteWeight // sync waste_qty if they are used interchangeably
      })
      .eq("id", reportId);
  }
}

window.showAddScrapModal = showAddScrapModal;