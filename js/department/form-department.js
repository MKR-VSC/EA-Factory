/* ======================================================
   form-department.js - GO LIVE v1.0
   ส่ง 1 รายงาน + หลายรายการปัญหา
====================================================== */
const REPORT_TABLE = "daily_waste_reports";
const ITEM_TABLE = "daily_waste_report_items";
const STATUS_PENDING = "pending_supervisor";
const DEPT_NAMES = {
  PIPE: "ท่อ",
  MONO: "โมโน",
  RAIN_TAPE: "เป่าเทปน้ำพุ่ง",
  BLOW: "เป่าถุง",
  BLOWN_FILM: "เป่าฟิล์ม",
  SHEET_CUTTING: "ตัดผืน",
  CUT_PUNCH: "ตัดเจาะ",
  GARBAGE_BAG_CUT: "ตัดถุงขยะ",
  RAIN_TAPE_CUT_PUNCH: "ตัดเทปน้ำพุ่ง",
  SHADE_NET: "สแลน",
};
let state = { supabase: null, dept: "", machine: "", problems: [], staff: "" };
let idleTimer = null;
document.addEventListener("DOMContentLoaded", async () => {
  state.supabase = window.supabaseClient || window.supabase;
  if (!state.supabase) return showToast("ไม่พบ Supabase Client", "error");
  const p = new URLSearchParams(location.search);
  state.dept = normalizeDept(
    p.get("dept") || localStorage.getItem("activeDept") || "",
  );
  state.machine = String(p.get("machine") || "").trim();
  if (!state.dept) {
    showToast("ไม่พบแผนก กรุณาเปิดจาก QR หรือ Login ใหม่", "error");
    return;
  }
  localStorage.setItem("activeDept", state.dept);
  setText(
    "deptText",
    `แผนก: ${getDeptName(state.dept)} (${state.dept})${state.machine ? ` | เครื่อง: ${state.machine}` : ""}`,
  );
  setDefaultDateTime();
  await loadMasters();
  state.staff =
    localStorage.getItem("activeName") ||
    localStorage.getItem("activeUser") ||
    "";
  if (state.staff) {
    setValue("staffName", state.staff);
    showForm();
  }
  addProblemRow();
  document.getElementById("wasteForm")?.addEventListener("submit", submitForm);
  startIdleLogout();
});
function saveStaffName() {
  const name = getValue("staffName");
  if (!name) return showToast("กรุณากรอกชื่อผู้บันทึก", "error");
  state.staff = name;
  localStorage.setItem("activeName", name);
  localStorage.setItem("activeUser", name);
  showForm();
}
function showForm() {
  document.getElementById("staffPanel")?.classList.add("hidden");
  document.getElementById("wasteForm")?.classList.remove("hidden");
}
async function loadMasters() {
  await loadShifts();
  await loadMachines();
  await loadProblems();
}
async function loadShifts() {
  const s = document.getElementById("shiftSelect");
  if (!s) return;
  let list = ["กะเช้า", "กะบ่าย", "กะดึก", "OT", "วันอาทิตย์"];
  try {
    const { data, error } = await state.supabase
      .from("master_shifts")
      .select("shift_name")
      .eq("is_active", true)
      .order("id", { ascending: true });
    if (!error && data?.length)
      list = data.map((x) => x.shift_name).filter(Boolean);
  } catch {}
  s.innerHTML =
    `<option value="">เลือกกะ</option>` +
    list
      .map((x) => `<option value="${safeAttr(x)}">${safeText(x)}</option>`)
      .join("");
}
async function loadMachines() {
  const s = document.getElementById("machineSelect");
  if (!s) return;
  let list = [];
  try {
    let r = await state.supabase
      .from("master_machines")
      .select("machine_no")
      .eq("department_code", state.dept)
      .eq("is_active", true)
      .order("machine_no", { ascending: true });
    if (!r.error && r.data?.length)
      list = r.data.map((x) => x.machine_no).filter(Boolean);
  } catch {}
  if (!list.length) list = [state.machine || "M1"].filter(Boolean);
  if (state.machine && !list.includes(state.machine))
    list.unshift(state.machine);
  s.innerHTML =
    `<option value="">เลือกเครื่อง</option>` +
    list
      .map((x) => `<option value="${safeAttr(x)}">${safeText(x)}</option>`)
      .join("");
  if (state.machine) {
    s.value = state.machine;
    s.disabled = true;
    s.classList.add("qr-locked");
  }
}
async function loadProblems() {
  let list = [];
  try {
    let r = await state.supabase
      .from("master_problems")
      .select("problem_type")
      .eq("department_code", state.dept)
      .eq("is_active", true)
      .order("problem_type", { ascending: true });
    if (!r.error && r.data?.length)
      list = r.data.map((x) => x.problem_type).filter(Boolean);
  } catch {}
  state.problems = list.length ? list : ["ไม่ระบุปัญหา", "อื่นๆ"];
  renderAllProblemSelects();
}
function addProblemRow() {
  const body = document.getElementById("problemRows");
  if (!body) return;
  const idx = Date.now() + Math.floor(Math.random() * 1000);
  const tr = document.createElement("tr");
  tr.dataset.row = idx;
  tr.innerHTML = `<td><select class="problem-select" required></select></td><td><input class="problem-weight" type="number" min="0" step="0.01" placeholder="0.00" required></td><td><input class="problem-detail" placeholder="รายละเอียดของปัญหานี้"></td><td><button class="btn danger" type="button" onclick="removeProblemRow('${idx}')">ลบ</button></td>`;
  body.appendChild(tr);
  renderProblemSelect(tr.querySelector("select"));
  tr.querySelector(".problem-weight")?.addEventListener("input", updateTotal);
  updateTotal();
}
function removeProblemRow(idx) {
  const rows = document.querySelectorAll("#problemRows tr");
  if (rows.length <= 1)
    return showToast("ต้องมีอย่างน้อย 1 รายการปัญหา", "error");
  document.querySelector(`[data-row="${idx}"]`)?.remove();
  updateTotal();
}
function renderAllProblemSelects() {
  document.querySelectorAll(".problem-select").forEach(renderProblemSelect);
}
function renderProblemSelect(s) {
  if (!s) return;
  const old = s.value;
  s.innerHTML =
    `<option value="">เลือกปัญหา</option>` +
    state.problems
      .map((x) => `<option value="${safeAttr(x)}">${safeText(x)}</option>`)
      .join("");
  if (old) s.value = old;
}
function collectItems() {
  return [...document.querySelectorAll("#problemRows tr")]
    .map((tr, i) => ({
      item_no: i + 1,
      problem_type: tr.querySelector(".problem-select")?.value || "",
      waste_weight_kg: Number(tr.querySelector(".problem-weight")?.value || 0),
      detail: tr.querySelector(".problem-detail")?.value.trim() || "",
    }))
    .filter((x) => x.problem_type && x.waste_weight_kg > 0);
}
function updateTotal() {
  const t = collectItems().reduce((s, x) => s + x.waste_weight_kg, 0);
  setText("totalWasteText", `${formatNumber(t)} kg`);
}
async function submitForm(e) {
  e.preventDefault();
  const items = collectItems();
  const dt = getValue("incidentDatetime"),
    shift = getValue("shiftSelect"),
    machine = getValue("machineSelect") || state.machine;
  if (!state.staff) return showToast("กรุณากรอกชื่อผู้บันทึก", "error");
  if (!dt || !shift || !machine)
    return showToast("กรุณากรอกข้อมูลหลักให้ครบ", "error");
  if (!items.length)
    return showToast("กรุณาเพิ่มปัญหาและน้ำหนักอย่างน้อย 1 รายการ", "error");
  const total = items.reduce((s, x) => s + x.waste_weight_kg, 0);
  try {
    const reportDate = new Date(dt).toISOString().slice(0, 10);
    const first = items[0];
    const report = {
      report_date: reportDate,
      incident_datetime: new Date(dt).toISOString(),
      department_code: state.dept,
      department: getDeptName(state.dept),
      machine_no: machine,
      shift,
      work_shift: shift,
      product_name: "ปัญหาการผลิต",
      problem_type: first.problem_type,
      reason_detail: items
        .map((x) => `${x.problem_type}: ${formatNumber(x.waste_weight_kg)} kg`)
        .join(" / "),
      detail: "",
      note: "",
      waste_weight_kg: total,
      waste_qty: total,
      total_qty: 0,
      good_qty: 0,
      unit: "kg",
      status: STATUS_PENDING,
      reported_by: state.staff,
      reason_id: null,
    };
    const activeUserId = localStorage.getItem("activeUserId");
    if (isUuid(activeUserId)) report.created_by = activeUserId;
    const { data, error } = await state.supabase
      .from(REPORT_TABLE)
      .insert(report)
      .select("id")
      .single();
    if (error) throw error;
    const rows = items.map((x) => ({
      report_id: data.id,
      item_no: x.item_no,
      problem_type: x.problem_type,
      waste_weight_kg: x.waste_weight_kg,
      detail: x.detail,
    }));
    const r2 = await state.supabase.from(ITEM_TABLE).insert(rows);
    if (r2.error) throw r2.error;
    showToast("บันทึกข้อมูลเรียบร้อยแล้ว", "success");
    resetFormAfterSubmit();
  } catch (err) {
    console.error(err);
    showToast(`บันทึกข้อมูลไม่สำเร็จ: ${err.message || err}`, "error");
  }
}
function resetFormAfterSubmit() {
  document.getElementById("wasteForm")?.reset();
  document.getElementById("problemRows").innerHTML = "";
  setDefaultDateTime();
  if (state.machine) {
    const s = document.getElementById("machineSelect");
    if (s) {
      s.value = state.machine;
      s.disabled = true;
    }
  }
  addProblemRow();
  updateTotal();
}
function setDefaultDateTime() {
  const e = document.getElementById("incidentDatetime");
  if (!e) return;
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  e.value = d.toISOString().slice(0, 16);
}
function startIdleLogout() {
  resetIdle();
  ["click", "input", "change", "keydown", "touchstart"].forEach((ev) =>
    document.addEventListener(ev, resetIdle, { passive: true }),
  );
}
function resetIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(logoutNow, 5 * 60 * 1000);
}
function logoutNow() {
  ["activeUserId", "activeUser", "activeName", "activeRole"].forEach((k) =>
    localStorage.removeItem(k),
  );
  location.href = "/login.html";
}
function normalizeDept(v) {
  const k = String(v || "")
    .trim()
    .toLowerCase();
  const m = {
    blow: "BLOW",
    bag_blow: "BLOW",
    pipe: "PIPE",
    mono: "MONO",
    rain_tape: "RAIN_TAPE",
    blown_film: "BLOWN_FILM",
    sheet: "SHEET_CUTTING",
    sheet_cutting: "SHEET_CUTTING",
    cut_punch: "CUT_PUNCH",
    garbage_bag_cut: "GARBAGE_BAG_CUT",
    rain_tape_cut_punch: "RAIN_TAPE_CUT_PUNCH",
    shade_net: "SHADE_NET",
    เป่าถุง: "BLOW",
    ท่อ: "PIPE",
    โมโน: "MONO",
    ตัดผืน: "SHEET_CUTTING",
    ตัดเจาะ: "CUT_PUNCH",
    สแลน: "SHADE_NET",
  };
  return (
    m[k] ||
    String(v || "")
      .trim()
      .toUpperCase()
  );
}
function getDeptName(c) {
  return DEPT_NAMES[c] || c || "-";
}
function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
    String(v || ""),
  );
}
function formatNumber(v) {
  return Number(v || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function getValue(id) {
  return document.getElementById(id)?.value?.trim() || "";
}
function setValue(id, v) {
  const e = document.getElementById(id);
  if (e) e.value = v;
}
function setText(id, v) {
  const e = document.getElementById(id);
  if (e) e.textContent = v;
}
function safeText(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function safeAttr(v) {
  return safeText(v).replaceAll("`", "&#096;");
}
function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 2800);
}
function closeModal() {
  document.getElementById("appModal")?.classList.add("hidden");
}
window.saveStaffName = saveStaffName;
window.addProblemRow = addProblemRow;
window.removeProblemRow = removeProblemRow;
window.resetFormAfterSubmit = resetFormAfterSubmit;
window.logoutNow = logoutNow;
window.closeModal = closeModal;
