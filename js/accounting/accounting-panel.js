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


function bindEvents() {
  ["filterMonth", "filterDept", "filterStatus", "searchInput"].forEach((id) =>
    document
      .getElementById(id)
      ?.addEventListener(
        id === "searchInput" ? "input" : "change",
        applyFilters,
      ),
  );
}
function setDefaultMonth() {
  const d = new Date();
  setValue(
    "filterMonth",
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
  );
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

  state.groups = [...reportGroups, ...machineGroups].sort(sortAccountingGroups);

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
      g.items.push(i);
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
  const waste = activeGroups.reduce((s, g) => s + g.waste, 0),
    prod = activeGroups.reduce((s, g) => s + (g.production || 0), 0);
  setText("sumCount", activeGroups.length.toLocaleString("th-TH"));
  setText("sumWaste", formatNumber(waste));
  setText("sumProduction", formatNumber(prod));
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
    status = `<span class="status-pill" style="background:#e2e8f0;color:#475569;">ไม่ได้เดินเครื่อง</span>`;
  } else if (isDone) {
    status = `<span class="status-pill status-done">บัญชีตรวจแล้ว</span>`;
  } else if (isNoWaste) {
    status = `<span class="status-pill status-sent">รอบัญชีกรอกผลิต</span>`;
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
      ? `<span class="muted">ไม่ได้เดินเครื่อง</span>`
      : renderProblemInline(g.items);

  const productionCell = isNotRunning
    ? `<span class="muted">-</span>`
    : `<input class="cell-input text-right" type="number" step="0.01" min="0"
        value="${safeAttr(g.production || "")}"
        data-prod="${safeAttr(g.key)}"
        placeholder="kg"
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
    <td class="text-right">${productionCell}</td>
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
  const input = document.querySelector(`[data-prod="${cssEscape(key)}"]`);
  if (!input) return;

  // รายการที่บันทึกแล้วจะล็อกช่องไว้
  // เมื่อกด "แก้ไข" จึงเปิดให้แก้และแสดงปุ่ม "บันทึก" กลับมา
  input.readOnly = false;
  document
    .querySelector(`[data-save="${cssEscape(key)}"]`)
    ?.classList.remove("hidden");

  input.focus();
  input.select();

  showToast("แก้ไขน้ำหนักผลิต แล้วกดบันทึกอีกครั้ง", "success");
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
  return `<table class="problem-table"><thead><tr><th>ปัญหา</th><th class="text-right">น้ำหนัก kg</th><th>รายละเอียด</th></tr></thead><tbody>${items.map((x) => `<tr><td><strong>${safeText(x.problem_type)}</strong></td><td class="text-right">${formatNumber(x.waste_weight_kg)}</td><td>${safeText(x.detail || "-")}</td></tr>`).join("")}</tbody><tfoot><tr><td>รวมของเสีย</td><td class="text-right">${formatNumber(total)}</td><td>kg</td></tr></tfoot></table>`;
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

  const prod = Number(
    document.querySelector(`[data-prod="${cssEscape(key)}"]`)?.value || 0,
  );

  if (!prod || prod <= 0) {
    return showToast("กรุณากรอกน้ำหนักผลิตให้ถูกต้อง", "error");
  }

  const uid =
    state.currentUser?.id || localStorage.getItem("activeUserId") || null;
  const now = new Date().toISOString();

  // ---------------------------------------------------------
  // เครื่อง "เดินเครื่อง / ไม่มีของเสีย"
  // เก็บน้ำหนักผลิตไว้ใน daily_machine_status
  // ---------------------------------------------------------
  if (g.sourceType === "machine_status") {
    const { error } = await state.supabase
      .from(MACHINE_STATUS_TABLE)
      .update({
        production_kg: prod,
        accounting_checked_by: uid,
        accounting_checked_at: now,
        updated_at: now,
      })
      .eq("id", g.machineStatusId);

    if (error) {
      return showToast(`บันทึกไม่สำเร็จ: ${error.message}`, "error");
    }

    showToast("บันทึกน้ำหนักผลิตเรียบร้อยแล้ว", "success");
    await loadAccountingData();
    return;
  }

  // ---------------------------------------------------------
  // รายการที่มีของเสีย ใช้ daily_waste_reports ตามระบบเดิม
  // ---------------------------------------------------------
  const { error } = await state.supabase
    .from(REPORT_TABLE)
    .update({
      production_kg: prod,
      status: STATUS_DONE,
      accounting_status: STATUS_DONE,
      accounting_checked_by: uid,
      accounting_checked_at: now,
      updated_at: now,
    })
    .in("id", g.ids);

  if (error) {
    return showToast(`บันทึกไม่สำเร็จ: ${error.message}`, "error");
  }

  showToast("บันทึกเรียบร้อยแล้ว", "success");
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
  const d = new Date(v);
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
