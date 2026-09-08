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
};


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

  setDefaultMonth();
  bindEvents();
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
      max: Number(d.max_waste_percent || 3),
      warning: Number(d.warning_percent || 0),
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
  const body = document.getElementById("accountingBody");
  if (body)
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

    // หากเดือนปัจจุบันที่ระบบตั้งไว้ไม่มีข้อมูล แต่ในระบบมีข้อมูลเดือนอื่น ให้ปรับตัวเลือกเดือนไปยังเดือนล่าสุดที่มีข้อมูล
    adjustMonthToAvailableData();

    setText(
      "lastUpdate",
      `อัปเดตล่าสุด ${new Date().toLocaleString("th-TH")}`,
    );

    applyFilters();
  } catch (e) {
    console.error(e);
    if (body)
      body.innerHTML = `<tr><td colspan="13" class="empty">โหลดข้อมูลไม่สำเร็จ: ${safeText(e.message || e)}</td></tr>`;
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

  renderSummary(state.groups);
  renderTable(state.groups);
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

  // คำนวณสรุปแยกตามประเภทที่เลือก (แผนก, เครื่องจักร, ปัญหา)
  const groupType = document.getElementById("summaryGroupType")?.value || "dept";
  const summaryMap = {};
  const countedMachineKeys = new Set();
  const countedDeptKeys = new Set();

  activeGroups.forEach(g => {
    if (groupType === "problem") {
      if (g.items && g.items.length > 0) {
        g.items.forEach(item => {
          const pType = item.problem_type || "ไม่ระบุ";
          if (!summaryMap[pType]) summaryMap[pType] = { name: pType, production: 0, waste: 0 };
          summaryMap[pType].waste += Number(item.waste_weight_kg || 0);
        });
      } else if (g.waste > 0) {
        const pType = "ไม่ระบุ";
        if (!summaryMap[pType]) summaryMap[pType] = { name: pType, production: 0, waste: 0 };
        summaryMap[pType].waste += g.waste;
      }
    } else if (groupType === "machine") {
      const mCode = g.machine || "ไม่ระบุ";
      if (!summaryMap[mCode]) summaryMap[mCode] = { name: mCode, production: 0, waste: 0 };
      
      const machineKey = `${g.date}|${g.dept}|${g.machine}`;
      if (!countedMachineKeys.has(machineKey)) {
        countedMachineKeys.add(machineKey);
        summaryMap[mCode].production += (g.production || 0);
      }
      summaryMap[mCode].waste += (g.waste || 0);
    } else {
      const deptCode = g.dept;
      const deptName = getDeptName(deptCode) || deptCode;
      if (!summaryMap[deptCode]) {
        summaryMap[deptCode] = { name: deptName, production: 0, waste: 0 };
      }
      
      const deptKey = `${g.date}|${g.dept}|${g.machine}`;
      if (!countedDeptKeys.has(deptKey)) {
        countedDeptKeys.add(deptKey);
        summaryMap[deptCode].production += (g.production || 0);
      }
      summaryMap[deptCode].waste += (g.waste || 0);
    }
  });

  const headTitle = document.getElementById("summaryTableTitle");
  if (headTitle) {
    headTitle.textContent = groupType === "problem" ? "สรุปผลรวมแยกตามประเภทปัญหา" 
                          : groupType === "machine" ? "สรุปผลรวมแยกตามเครื่องจักร" 
                          : "สรุปผลรวมแยกตามแผนก / สินค้า";
  }

  const thCol = document.querySelector("#summaryTableHead th:first-child");
  if (thCol) {
    thCol.textContent = groupType === "problem" ? "ประเภทปัญหา" 
                      : groupType === "machine" ? "เครื่องจักร" 
                      : "แผนก / สินค้า";
  }

  const summaryBody = document.getElementById("summaryDeptBody");
  if (summaryBody) {
    const keys = Object.keys(summaryMap);
    if (keys.length === 0) {
      summaryBody.innerHTML = `<tr><td colspan="4" class="empty">ไม่พบข้อมูลตามตัวกรอง</td></tr>`;
    } else {
      const sortedValues = Object.values(summaryMap).sort((a, b) => b.waste - a.waste);
      summaryBody.innerHTML = sortedValues.map(d => {
        const pct = d.production > 0 ? (d.waste / d.production) * 100 : 0;
        const prodText = groupType === "problem" ? "-" : formatNumber(d.production);
        const pctText = groupType === "problem" ? "-" : `${formatNumber(pct)}%`;
        const pctColor = groupType === "problem" ? 'inherit' : (pct > 0 ? (pct > 3 ? '#dc2626' : '#1e40af') : 'inherit');
        return `
          <tr>
            <td style="font-weight: 600;">${safeText(d.name)}</td>
            <td class="text-right" style="color: #16a34a; font-weight: 500;">${prodText}</td>
            <td class="text-right" style="color: #dc2626; font-weight: 500;">${formatNumber(d.waste)}</td>
            <td class="text-right font-bold" style="color: ${pctColor}">${pctText}</td>
          </tr>
        `;
      }).join("");
    }
  }
}
function renderTable(groups) {
  const body = document.getElementById("accountingBody");
  if (!body) return;
  if (!groups.length) {
    body.innerHTML = `<tr><td colspan="13" class="empty">ไม่พบข้อมูลตามตัวกรอง</td></tr>`;
    return;
  }
  body.innerHTML = groups.map((g, i) => renderGroup(g, i)).join("");
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

  const percent =
    !isCancelled && !isNotRunning && g.production
      ? (g.waste / g.production) * 100
      : 0;

  let result;
  if (isCancelled) {
    result = { label: "ยกเลิก", className: "result-none" };
  } else if (isNotRunning) {
    result = { label: "ไม่ได้เดินเครื่อง", className: "result-none" };
  } else if (isNoWaste && g.production) {
    result = { label: "ไม่มีของเสีย", className: "result-success" };
  } else {
    result = getResult(g.dept, percent, !!g.production);
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

  const productionInputAttr = isCancelled
    ? "disabled"
    : isNotRunning
      ? "disabled"
      : isDone
        ? "readonly"
        : "";

  const rowClass = isCancelled ? ` class="row-cancelled"` : "";

  const expandCell = isMachineStatus
    ? `<span class="muted">—</span>`
    : `<button class="expand-btn" onclick="toggleDetail(${i})">▼</button>`;

  const wasteCell = isNotRunning ? "-" : formatNumber(g.waste);

  const problemCell = isNoWaste
    ? `<span class="status-pill status-done">ไม่มีของเสีย</span>`
    : isNotRunning
      ? `<span class="status-pill" style="background:#f1f5f9;color:#64748b;border:1px solid #cbd5e1;">ไม่ได้เดินเครื่อง</span>`
      : renderProblemInline(g.items);

  const formattedProdVal = g.production ? formatQtyNumber(g.production) : "";
  const productionCell = isNotRunning
    ? `<span class="muted cell-production-empty">-</span>`
    : `<input class="cell-input cell-input-production text-right" type="text" inputmode="decimal" autocomplete="off"
        value="${safeAttr(formattedProdVal)}"
        data-prod="${safeAttr(g.key)}"
        placeholder="0.00"
        onfocus="handleProductionFocus(this)"
        onblur="formatProductionInput(this)"
        oninput="handleProductionInput(this, '${safeAttr(g.key)}')"
        onkeydown="if(event.key==='Enter'){ this.blur(); }"
        ${productionInputAttr}>`;

  const percentCell =
    isCancelled || isNotRunning
      ? "-"
      : g.production
        ? formatPercent(percent)
        : "-";

  let actions;
  if (isNotRunning) {
    actions = `<span class="muted">-</span>`;
  } else if (isMachineStatus) {
    actions = `
      <div class="action-stack">
        <button
          class="btn warning"
          onclick="editGroup('${safeAttr(g.key)}')"
        >แก้ไข</button>

        <button
          class="btn success${isDone ? " hidden" : ""}"
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
          class="btn success${isDone ? " hidden" : ""}"
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
      <strong>${safeText(g.dept)}</strong><br>
      <small>${safeText(getDeptName(g.dept))}</small>
    </td>
    <td>${safeText(g.shift)}</td>
    <td><strong>${safeText(g.machine)}</strong></td>
    <td>${safeText([...g.reporter].join(", "))}</td>
    <td class="text-right"><strong>${wasteCell}</strong></td>
    <td>${problemCell}</td>
    <td class="text-right cell-production-col">${productionCell}</td>
    <td class="text-right">${percentCell}</td>
    <td><span class="result-pill ${result.className}">${safeText(result.label)}</span></td>
    <td>${status}</td>
    <td>${actions}</td>
  </tr>`;

  if (isMachineStatus) return mainRow;

  return `${mainRow}
  <tr
    id="detail-${i}"
    class="detail-row hidden${isCancelled ? " row-cancelled" : ""}"
  >
    <td colspan="13">${renderProblemTable(g.items, g.waste)}</td>
  </tr>`;
}

function editGroup(key) {
  const g = state.groups.find((x) => x.key === key);
  if (!g) return;

  const input = document.querySelector(`[data-prod="${cssEscape(g.key)}"]`);
  if (input) {
    input.readOnly = false;
    input.focus();
    handleProductionFocus(input);
  }

  document
    .querySelector(`[data-save="${cssEscape(g.key)}"]`)
    ?.classList.remove("hidden");

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
function renderProblemTable(items, total) {
  return `<table class="problem-table">
    <thead>
      <tr>
        <th style="padding:8px 12px;text-align:left;">กะ</th>
        <th style="padding:8px 12px;text-align:left;">ปัญหา / รายละเอียดปัญหา</th>
        <th style="padding:8px 12px;text-align:right;">น้ำหนักของเสีย kg</th>
        <th style="padding:8px 12px;text-align:left;">รายละเอียดเพิ่มเติม</th>
        <th style="padding:8px 12px;text-align:left;">ผู้บันทึก</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((x) => `
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
      `).join("")}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2" style="padding:10px 12px;font-weight:700;">รวมของเสียทั้งหมด (ทุกกะ)</td>
        <td style="padding:10px 12px;text-align:right;font-weight:bold;color:#e11d48;font-size:16px;">
          ${formatNumber(total)}
        </td>
        <td colspan="2" style="padding:10px 12px;font-weight:600;">kg</td>
      </tr>
    </tfoot>
  </table>`;
}
function toggleDetail(i) {
  document.getElementById(`detail-${i}`)?.classList.toggle("hidden");
}
async function saveGroup(key) {
  const g = state.groups.find((x) => x.key === key);
  if (!g) return;

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
    return showToast(`บันทึกไม่สำเร็จ: ${failed.error.message}`, "error");
  }

  showToast("บันทึกน้ำหนักผลิตรวม 1 วัน เรียบร้อยแล้ว", "success");
  await loadAccountingData();
}

async function cancelGroup(key) {
  const g = state.groups.find((x) => x.key === key);
  if (!g) return;

  if (g.sourceType === "machine_status") {
    return showToast("สถานะเครื่องจากหัวหน้างานไม่สามารถยกเลิกจากหน้าบัญชีได้", "error");
  }

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

  if (error) return showToast(`ยกเลิกไม่สำเร็จ: ${error.message}`, "error");
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

function getResult(dept, percent, hasProd) {
  if (!hasProd) return { label: "รอน้ำหนักผลิต", className: "result-none" };
  const s = state.standards[dept];
  if (!s) return { label: "ไม่พบเกณฑ์", className: "result-none" };
  if (percent > s.max)
    return {
      label: `เกิน ${formatPercent(percent - s.max)}`,
      className: "result-danger",
    };
  if (s.warning > 0 && percent >= s.warning)
    return { label: "เริ่มสูง", className: "result-warning" };
  return { label: "ผ่าน", className: "result-success" };
}

function getProduction(r) {
  return Number(r.production_kg ?? r.total_qty ?? 0) || 0;
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

  const row = input.closest("tr");
  if (row) {
    const pctTd = row.children[9];
    const evalTd = row.children[10];

    if (!isNaN(cleanNum) && cleanNum > 0) {
      const isNoWaste =
        g.sourceType === "machine_status" &&
        normalizeText(g.operationStatus) === MACHINE_STATUS_NO_WASTE;
      const isCancelled = normalizeText(g.status) === STATUS_CANCELLED;
      const isNotRunning =
        g.sourceType === "machine_status" &&
        normalizeText(g.operationStatus) === MACHINE_STATUS_NOT_RUNNING;

      let percent = 0;
      if (isNoWaste) {
        percent = 0;
      } else if (!isCancelled && !isNotRunning) {
        percent = (g.waste / cleanNum) * 100;
      }
      const result = getResult(g.dept, percent, true);
      if (pctTd) pctTd.textContent = formatPercent(percent);
      if (evalTd)
        evalTd.innerHTML = `<span class="result-pill ${result.className}">${safeText(result.label)}</span>`;
    } else {
      if (pctTd) pctTd.textContent = "-";
      if (evalTd) {
        const result = getResult(g.dept, 0, false);
        evalTd.innerHTML = `<span class="result-pill ${result.className}">${safeText(result.label)}</span>`;
      }
    }
  }

  // Update summary counts instantly
  renderSummary(state.groups);
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
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = "/login.html";
  }
}

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

  // Calculate Summary based on selected group type
  const groupType = document.getElementById("summaryGroupType")?.value || "dept";
  const activeGroups = (state.groups || []).filter(g => normalizeText(g.status) !== STATUS_CANCELLED);
  const summaryMap = {};
  const countedMachineKeys = new Set();
  const countedDeptKeys = new Set();

  activeGroups.forEach(g => {
    if (groupType === "problem") {
      if (g.items && g.items.length > 0) {
        g.items.forEach(item => {
          const pType = item.problem_type || "ไม่ระบุ";
          if (!summaryMap[pType]) summaryMap[pType] = { name: pType, production: 0, waste: 0 };
          summaryMap[pType].waste += Number(item.waste_weight_kg || 0);
        });
      } else if (g.waste > 0) {
        const pType = "ไม่ระบุ";
        if (!summaryMap[pType]) summaryMap[pType] = { name: pType, production: 0, waste: 0 };
        summaryMap[pType].waste += g.waste;
      }
    } else if (groupType === "machine") {
      const mCode = g.machine || "ไม่ระบุ";
      if (!summaryMap[mCode]) summaryMap[mCode] = { name: mCode, production: 0, waste: 0 };
      
      const machineKey = `${g.date}|${g.dept}|${g.machine}`;
      if (!countedMachineKeys.has(machineKey)) {
        countedMachineKeys.add(machineKey);
        summaryMap[mCode].production += (g.production || 0);
      }
      summaryMap[mCode].waste += (g.waste || 0);
    } else {
      const deptCode = g.dept;
      const deptName = getDeptName(deptCode) || deptCode;
      if (!summaryMap[deptCode]) {
        summaryMap[deptCode] = { name: deptName, production: 0, waste: 0 };
      }
      
      const deptKey = `${g.date}|${g.dept}|${g.machine}`;
      if (!countedDeptKeys.has(deptKey)) {
        countedDeptKeys.add(deptKey);
        summaryMap[deptCode].production += (g.production || 0);
      }
      summaryMap[deptCode].waste += (g.waste || 0);
    }
  });

  const sortedValues = Object.values(summaryMap).sort((a, b) => b.waste - a.waste);
  const deptRowsHTML = sortedValues.map(d => {
    const pct = d.production > 0 ? (d.waste / d.production) * 100 : 0;
    const prodText = groupType === "problem" ? "-" : `${formatNumber(d.production)} kg`;
    const pctText = groupType === "problem" ? "-" : `${formatNumber(pct)}%`;
    return `
      <tr>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-weight: 600; text-align: left;">${safeText(d.name)}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${prodText}</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: right;">${formatNumber(d.waste)} kg</td>
        <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;">${pctText}</td>
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
    const pct = g.production ? (g.waste / g.production) * 100 : 0;
    const formattedPct = isCancelled ? "-" : formatNumber(pct) + "%";
    const statusText = isCancelled ? "ยกเลิกรายการ" : (normalizeText(g.status) === STATUS_DONE ? "บัญชีตรวจแล้ว" : "รอบัญชีตรวจ");
    
    return `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 13px;">${g.date || "-"}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 13px;">${safeText(getDeptName(g.dept))}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 13px;">${g.shift || "-"}</td>
        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 13px;">${g.machine || "-"}</td>
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
        <strong>ช่วงเวลาและตัวกรอง:</strong> ${filterDesc}
      </div>

      <div class="section-title">1. ${summaryTitle}</div>
      <table>
        <thead>
          <tr>
            <th style="text-align: left;">${summaryColName}</th>
            <th style="text-align: right;">ผลิตรวม (kg)</th>
            <th style="text-align: right;">ของเสียรวม (kg)</th>
            <th style="text-align: right;">อัตราของเสีย (% Waste)</th>
          </tr>
        </thead>
        <tbody>
          ${deptRowsHTML || '<tr><td colspan="4" style="padding: 15px; text-align: center; color: #64748b;">ไม่มีข้อมูล</td></tr>'}
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
            <th style="text-align: right;">ยอดผลิต (kg)</th>
            <th style="text-align: right;">% Waste</th>
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

