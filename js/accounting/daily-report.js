/* ======================================================
   daily-report.js — รายงานการผลิตสินค้าสำเร็จรูปและน้ำหนักงานสูญเสีย
   (pages/daily-report.html) หน้าตาตามใบรายงานกระดาษของโรงงาน

   รายวัน / รายเดือน · แยกแผนก → เครื่อง → สินค้าที่ผลิต
   คอลัมน์: ที่ผลิต · จำนวน · น้ำหนัก กก. ·
            สูญเสียจากการผลิต (กะเช้า · กะบ่าย/ดึก · รวม · %) ·
            สูญเสียบังคับ (รวมกะ · %) · สาเหตุ
   % = ของเสียประเภทนั้น ÷ (ผลิตดี + ของเสียทั้งหมด) × 100  (core/wasteFormula.js)

   แหล่งข้อมูล
   - ของเสีย: daily_waste_reports + daily_waste_report_items (ไม่นับรายการที่บัญชียกเลิก)
   - ประเภทของเสีย: items.loss_type (database/12) — ไม่มี = นับเป็นสูญเสียจากการผลิต
   - ผลิตดี: daily_production_lines (database/13) ถ้ามี · ไม่มีใช้ production_kg ที่บัญชีกรอก
====================================================== */
(function () {
  "use strict";

  const ALLOW = ["admin", "accounting", "management", "manager", "executive", "supervisor"];
  const SEE_ALL = ["admin", "accounting", "management", "manager", "executive"];
  const EXCLUDE = ["IT_SUPPORT", "IT_SUPORT", "ACCOUNTING", "MANAGEMENT", "ADMIN", "PRINT"];
  const CANCELLED = "accounting_cancelled";
  const DONE = "accounting_checked";
  const W = () => window.WASTE_FORMULA;

  const st = {
    sb: null,
    profile: null,
    mode: "day",
    depts: [], // [{code, name, max, basis, order}]
    machineOrder: new Map(), // DEPT|MACHINE → sort
    allowed: null, // Set ของแผนกที่หัวหน้าดูได้ (null = ทุกแผนก)
    hasLoss: false,
    hasLines: false,
  };

  const $ = (id) => document.getElementById(id);
  const up = (v) => String(v || "").trim().toUpperCase();
  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
  const n2 = (v) => Number(v || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nQty = (v) => Number(v || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
  const pctTxt = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "-" : n2(v));
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  /* ---------- เริ่มต้น ---------- */
  document.addEventListener("DOMContentLoaded", async () => {
    if (window.AUTH_GUARD?.requireLogin) {
      st.profile = await window.AUTH_GUARD.requireLogin(ALLOW);
      if (!st.profile) return;
    }
    st.sb = window.supabaseClient || window.supabase || null;
    if (!st.sb?.from) return showAlert("ไม่พบการเชื่อมต่อฐานข้อมูล");

    $("lbl-user").textContent = localStorage.getItem("activeName") || localStorage.getItem("activeUser") || "-";
    initControls();
    await loadMasters();
    await render();
  });

  function role() {
    return String(st.profile?.role || localStorage.getItem("activeRole") || "").toLowerCase();
  }

  function initControls() {
    const q = new URLSearchParams(location.search);
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86400000);
    $("in-day").value = q.get("date") || ymd(today.getHours() < 12 ? yesterday : today);
    $("in-month").value = q.get("month") || ymd(today).slice(0, 7);
    if (q.get("month")) setMode("month", false);

    document.querySelectorAll(".dr-mode-btn").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
    ["in-day", "in-month", "in-dept"].forEach((id) => $(id).addEventListener("change", render));
    $("btn-prev").addEventListener("click", () => shift(-1));
    $("btn-next").addEventListener("click", () => shift(1));
    $("btn-print").addEventListener("click", () => window.print());
    $("btn-refresh").addEventListener("click", render);
    const logout = () => (window.AUTH_GUARD?.logoutAndRedirect ? AUTH_GUARD.logoutAndRedirect() : location.replace("/login.html"));
    $("btn-logout")?.addEventListener("click", logout);
    $("btn-logout-side")?.addEventListener("click", logout);
  }

  function setMode(mode, rerender = true) {
    st.mode = mode;
    document.querySelectorAll(".dr-mode-btn").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === mode));
    $("wrap-day").hidden = mode !== "day";
    $("wrap-month").hidden = mode !== "month";
    if (rerender) render();
  }

  function shift(step) {
    if (st.mode === "day") {
      const d = new Date(`${$("in-day").value}T00:00:00`);
      d.setDate(d.getDate() + step);
      $("in-day").value = ymd(d);
    } else {
      const [y, m] = $("in-month").value.split("-").map(Number);
      const d = new Date(y, m - 1 + step, 1);
      $("in-month").value = ymd(d).slice(0, 7);
    }
    render();
  }

  /* ---------- ข้อมูลหลัก ---------- */
  async function loadMasters() {
    const base = "department_code, department_name, sort_order, is_active, max_waste_percent";
    const q = (cols) => st.sb.from("master_departments").select(cols).eq("is_active", true);
    let res = await q(`${base}, threshold_basis, dept_kind`); // dept_kind: database/14
    if (res.error) res = await q(`${base}, threshold_basis`);
    if (res.error) res = await q(base);
    st.depts = (res.data || [])
      .filter((d) => !EXCLUDE.includes(up(d.department_code)))
      .map((d) => ({
        code: up(d.department_code),
        name: d.department_name || up(d.department_code),
        order: Number(d.sort_order) || 0,
        max: Number(d.max_waste_percent) || W().DEFAULT_LIMIT,
        basis: d.threshold_basis === "production" ? "production" : "total",
        recycle: d.dept_kind === "recycle",
      }))
      .sort((a, b) => a.order - b.order);

    // ชื่อไทยของทุกแผนก (รวมที่ปิดใช้งาน) สำหรับข้อมูลเก่า
    const allD = await st.sb.from("master_departments").select("department_code, department_name, is_active");
    st.allNames = new Map();
    (allD.data || [])
      .filter((d) => d.department_name && up(d.department_name) !== up(d.department_code))
      .forEach((d) => st.allNames.set(up(d.department_code), d.department_name));
    st.depts.forEach((d) => {
      if (d.name === d.code && st.allNames.has(d.code)) d.name = st.allNames.get(d.code);
    });

    // กลุ่มแผนก (database/16) — ไม่มีก็ข้าม
    st.groups = [];
    const [grp, gmap] = await Promise.all([
      st.sb.from("department_groups").select("*").eq("is_active", true),
      st.sb.from("master_departments").select("department_code, group_code"),
    ]);
    if (!grp.error && !gmap.error) {
      st.groups = (grp.data || [])
        .map((g) => ({
          code: g.code,
          name: g.name,
          order: Number(g.sort_order) || 0,
          max: Number(g.max_waste_percent) || W().DEFAULT_LIMIT,
          warning: Number(g.warning_percent) || W().DEFAULT_WARNING,
          basis: g.threshold_basis === "production" ? "production" : "total",
        }))
        .sort((a, b) => a.order - b.order);
      const of = new Map((gmap.data || []).map((d) => [up(d.department_code), d.group_code]));
      st.depts.forEach((d) => {
        const g = st.groups.find((x) => x.code === of.get(d.code));
        if (g) d.group = g;
      });
    }

    const mm = await st.sb.from("master_machines").select("*");
    (mm.data || []).forEach((m, i) =>
      st.machineOrder.set(`${up(m.department_code || m.department)}|${m.machine_no}`, Number(m.sort_order) || i),
    );

    // หัวหน้าเห็นเฉพาะแผนกที่รับผิดชอบ
    if (!SEE_ALL.includes(role()) && st.profile?.id) {
      const ud = await st.sb.from("user_departments").select("*").eq("user_id", st.profile.id);
      const codes = (ud.data || []).map((r) => up(r.department_code));
      if (st.profile.department_code) codes.push(up(st.profile.department_code));
      st.allowed = new Set(codes);
      st.depts = st.depts.filter((d) => st.allowed.has(d.code));
    }

    $("in-dept").innerHTML =
      (st.depts.length > 1 ? `<option value="all">ทุกแผนก</option>` : "") +
      st.depts.map((d) => `<option value="${esc(d.code)}">${esc(d.name)}</option>`).join("");
    const qDept = new URLSearchParams(location.search).get("dept");
    if (qDept && st.depts.some((d) => d.code === up(qDept))) $("in-dept").value = up(qDept);
  }

  function range() {
    if (st.mode === "day") {
      const d = $("in-day").value;
      return { from: d, to: d };
    }
    const [y, m] = $("in-month").value.split("-").map(Number);
    return { from: `${$("in-month").value}-01`, to: ymd(new Date(y, m, 0)) };
  }

  async function fetchAll(build) {
    return window.SB_FETCH ? window.SB_FETCH.all(build) : build();
  }

  async function loadData() {
    const { from, to } = range();
    const reportsRes = await fetchAll(() =>
      st.sb
        .from("daily_waste_reports")
        .select("*")
        .gte("report_date", from)
        .lte("report_date", to)
        .order("report_date", { ascending: true })
        .order("id", { ascending: true }),
    );
    if (reportsRes.error) throw reportsRes.error;
    const reports = (reportsRes.data || []).filter((r) => String(r.status || "").toLowerCase() !== CANCELLED);

    // รายการของเสีย (พร้อมประเภท ถ้ามี)
    const ids = reports.map((r) => r.id);
    const COLS = "id, report_id, item_no, problem_type, waste_weight_kg";
    const items = async (cols) => {
      if (!ids.length) return { data: [], error: null };
      const build = (chunk) => st.sb.from("daily_waste_report_items").select(cols).in("report_id", chunk);
      return window.SB_FETCH ? window.SB_FETCH.inChunks(ids, build) : build(ids);
    };
    let itemRes = await items(`${COLS}, loss_type`);
    st.hasLoss = !itemRes.error;
    if (itemRes.error) itemRes = await items(COLS);

    // ยอดผลิตแยกกะ/สินค้า (database/13)
    const linesRes = await fetchAll(() =>
      st.sb
        .from("daily_production_lines")
        .select("*")
        .gte("work_date", from)
        .lte("work_date", to)
        .order("sort_order", { ascending: true }),
    );
    st.hasLines = !linesRes.error;

    const msRes = await fetchAll(() =>
      st.sb.from("daily_machine_status").select("*").gte("work_date", from).lte("work_date", to),
    );

    return {
      reports,
      items: itemRes.data || [],
      lines: st.hasLines ? linesRes.data || [] : [],
      machineStatus: msRes.error ? [] : msRes.data || [],
    };
  }

  /* ---------- รวมยอด ---------- */
  // เช้า → morning · บ่าย/ดึก → late · รวมหลายกะ (เช่น "เช้า/ดึก") / ไม่ระบุกะ → all (นับในยอดรวมเท่านั้น)
  function shiftBucket(s) {
    const t = String(s || "").trim().toLowerCase();
    const morning = /เช้า|กลางวัน|^a$|กะ ?a\b/.test(t);
    const late = /บ่าย|ดึก|คืน|^b$|^c$|กะ ?[bc]\b/.test(t);
    if (morning && late) return "all";
    if (late) return "late";
    if (morning) return "morning";
    return "all";
  }

  function build(data) {
    const deptFilter = $("in-dept").value;
    const okDept = (c) => (deptFilter === "all" ? !st.allowed || st.allowed.has(c) : c === deptFilter);
    const machines = new Map(); // DEPT|MACHINE → agg
    const days = new Map(); // date|DEPT|MACHINE → { good from accounting }

    const getM = (dept, machine) => {
      const k = `${dept}|${machine}`;
      if (!machines.has(k))
        machines.set(k, {
          dept,
          machine,
          lines: new Map(),
          good: 0,
          prodMorning: 0,
          prodLate: 0,
          prodAll: 0, // กะรวม/ไม่ระบุกะ
          forced: 0,
          lossMorning: 0, // ของเสียทุกประเภทแยกกะ (ใช้กับตารางรีไซเคิล)
          lossLate: 0,
          lossAll: 0,
          causes: new Map(),
          dayKeys: new Set(),
          daysWithGood: new Set(),
          pending: 0,
        });
      return machines.get(k);
    };

    const itemsByReport = new Map();
    data.items.forEach((i) => {
      const k = String(i.report_id);
      if (!itemsByReport.has(k)) itemsByReport.set(k, []);
      itemsByReport.get(k).push(i);
    });

    data.reports.forEach((r) => {
      const dept = up(r.department_code || r.department);
      const machine = r.machine_no || "-";
      if (!okDept(dept)) return;
      const m = getM(dept, machine);
      const day = r.report_date;
      m.dayKeys.add(day);
      if (String(r.status || "").toLowerCase() !== DONE) m.pending++;
      const dk = `${day}|${dept}|${machine}`;
      const prod = Number(r.production_kg || 0);
      if (prod > 0) days.set(dk, Math.max(days.get(dk) || 0, prod));

      const its = itemsByReport.get(String(r.id)) || [
        { problem_type: r.problem_type || "ไม่ระบุ", waste_weight_kg: r.waste_weight_kg, loss_type: null },
      ];
      const bucket = shiftBucket(r.work_shift || r.shift);
      its.forEach((i) => {
        const kg = Number(i.waste_weight_kg || 0);
        if (!kg) return;
        const forced = i.loss_type === "forced";
        if (forced) m.forced += kg;
        else if (bucket === "late") m.prodLate += kg;
        else if (bucket === "morning") m.prodMorning += kg;
        else m.prodAll += kg;
        if (bucket === "late") m.lossLate += kg;
        else if (bucket === "morning") m.lossMorning += kg;
        else m.lossAll += kg;
        const name = i.problem_type || "ไม่ระบุ";
        const c = m.causes.get(name) || { kg: 0, forced };
        c.kg += kg;
        m.causes.set(name, c);
      });
    });

    // เครื่องที่ "ไม่มีของเสีย" แต่มียอดผลิต
    data.machineStatus.forEach((s) => {
      const dept = up(s.department_code);
      if (!okDept(dept) || !(Number(s.production_kg) > 0)) return;
      const machine = s.machine_no || "-";
      const dk = `${s.work_date}|${dept}|${machine}`;
      getM(dept, machine).dayKeys.add(s.work_date);
      days.set(dk, Math.max(days.get(dk) || 0, Number(s.production_kg)));
    });

    // ผลิตดี: บรรทัดแยกกะ/สินค้า (ถ้ามี) แทนยอดรวม
    const linesByDay = new Map();
    data.lines.forEach((l) => {
      const dept = up(l.department_code);
      if (!okDept(dept)) return;
      const dk = `${l.work_date}|${dept}|${l.machine_no}`;
      if (!linesByDay.has(dk)) linesByDay.set(dk, []);
      linesByDay.get(dk).push(l);
    });

    const allDayKeys = new Set([...days.keys(), ...linesByDay.keys()]);
    allDayKeys.forEach((dk) => {
      const [day, dept, machine] = dk.split("|");
      const m = getM(dept, machine);
      m.dayKeys.add(day);
      const ls = linesByDay.get(dk);
      if (ls?.length) {
        ls.forEach((l) => {
          const key = `${l.product_spec || ""}|${l.unit || ""}`;
          const e = m.lines.get(key) || { spec: l.product_spec || "", unit: l.unit || "", qty: 0, kg: 0, shifts: new Set(), morning: 0, late: 0, allday: 0 };
          e.qty += Number(l.qty || 0);
          e.kg += Number(l.weight_kg || 0);
          const b = l.shift ? shiftBucket(l.shift) : "allday";
          e[b] += Number(l.weight_kg || 0);
          e.shifts.add(l.shift || "ทั้งวัน");
          m.lines.set(key, e);
          m.good += Number(l.weight_kg || 0);
        });
      } else {
        const g = days.get(dk) || 0;
        m.good += g;
        if (g > 0) {
          const e = m.lines.get("|") || { spec: "", unit: "", qty: 0, kg: 0, shifts: new Set(), morning: 0, late: 0, allday: 0 };
          e.kg += g;
          e.allday += g;
          m.lines.set("|", e);
        }
      }
      if ((days.get(dk) || 0) > 0 || ls?.length) m.daysWithGood.add(day);
    });

    // จัดกลุ่มตามแผนก
    const byDept = new Map();
    machines.forEach((m) => {
      if (!byDept.has(m.dept)) byDept.set(m.dept, []);
      byDept.get(m.dept).push(m);
    });
    const deptMeta = (c) =>
      st.depts.find((d) => d.code === c) || { code: c, name: st.allNames?.get(c) || c, order: 999, max: W().DEFAULT_LIMIT, basis: "total" };
    const collator = new Intl.Collator("th", { numeric: true });

    return [...byDept.entries()]
      .map(([code, ms]) => ({
        ...deptMeta(code),
        machines: ms.sort(
          (a, b) =>
            (st.machineOrder.get(`${code}|${a.machine}`) ?? 9999) - (st.machineOrder.get(`${code}|${b.machine}`) ?? 9999) ||
            collator.compare(a.machine, b.machine),
        ),
      }))
      .sort((a, b) => a.order - b.order || collator.compare(a.code, b.code));
  }

  function sums(list) {
    const s = { good: 0, prodMorning: 0, prodLate: 0, prodAll: 0, forced: 0, units: new Map(), days: 0, daysWithGood: 0, pending: 0 };
    // คิด % เฉพาะเครื่องที่มียอดผลิตแล้ว (เหมือนหน้าบัญชี) — ยังไม่มียอดผลิต = ยังไม่นำมาคิด
    let prodCounted = 0;
    let forcedCounted = 0;
    list.forEach((m) => {
      if (m.good > 0) {
        prodCounted += m.prodMorning + m.prodLate + (m.prodAll || 0);
        forcedCounted += m.forced;
      }
      s.good += m.good;
      s.prodMorning += m.prodMorning;
      s.prodLate += m.prodLate;
      s.prodAll += m.prodAll || 0;
      s.forced += m.forced;
      s.pending += m.pending || 0;
      s.days += m.dayKeys?.size || 0;
      s.daysWithGood += m.daysWithGood?.size || 0;
      (m.lines ? [...m.lines.values()] : []).forEach((l) => {
        if (l.unit && l.qty) s.units.set(l.unit, (s.units.get(l.unit) || 0) + l.qty);
      });
      if (m.units) m.units.forEach((v, k) => s.units.set(k, (s.units.get(k) || 0) + v));
    });
    s.prod = s.prodMorning + s.prodLate + s.prodAll;
    s.waste = s.prod + s.forced;
    const base = s.good > 0 ? s.good + prodCounted + forcedCounted : 0;
    s.pctProd = base ? (prodCounted / base) * 100 : null;
    s.pctForced = base ? (forcedCounted / base) * 100 : null;
    s.pctTotal = base ? ((prodCounted + forcedCounted) / base) * 100 : null;
    s.partial = prodCounted + forcedCounted < s.waste;
    return s;
  }

  /* ---------- แสดงผล ---------- */
  async function render() {
    const sheet = $("dr-sheet");
    sheet.innerHTML = `<p class="dr-empty">กำลังโหลด...</p>`;
    hideAlert();
    let data;
    try {
      data = await loadData();
    } catch (err) {
      console.error(err);
      sheet.innerHTML = `<p class="dr-empty">โหลดข้อมูลไม่สำเร็จ: ${esc(err.message || err)}</p>`;
      return;
    }
    const built = build(data);
    // เรียงตามกลุ่มแผนก: แผนกในกลุ่มเดียวกันอยู่ติดกัน (ตามลำดับกลุ่ม) แล้วตามด้วยแผนกที่ไม่อยู่กลุ่ม
    const groupOf = (code) => st.depts.find((x) => x.code === code)?.group || null;
    built.forEach((d) => (d.group = groupOf(d.code)));
    const gOrder = (d) => (d.group ? st.groups.indexOf(d.group) : st.groups.length);
    built.sort((a, b) => gOrder(a) - gOrder(b));
    const depts = built.filter((d) => !d.recycle);
    const recycleDepts = built.filter((d) => d.recycle);
    const monthly = st.mode === "month";
    const { from } = range();
    const dateText = monthly
      ? `ประจำเดือน ${new Date(`${from}T00:00:00`).toLocaleDateString("th-TH", { month: "long", year: "numeric" })}`
      : `วันที่ ${new Date(`${from}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}`;

    const notes = [];
    if (!st.hasLoss) notes.push("ยังไม่ได้แยกประเภทของเสีย (รัน database/12-loss-types.sql) — นับทั้งหมดเป็นสูญเสียจากการผลิต");
    if (notes.length) showAlert(notes.join(" · "));

    if (!depts.length && !recycleDepts.length) {
      sheet.innerHTML = `${sheetHead(dateText)}<p class="dr-empty">ไม่มีข้อมูลการผลิตหรือของเสียใน${monthly ? "เดือน" : "วัน"}นี้</p>`;
      return;
    }

    let body = "";
    const all = [];
    depts.forEach((d, di) => {
      const rows = d.machines;
      all.push(...rows);
      const dt = sums(rows);
      const span = rows.length + (rows.length > 1 ? 1 : 0);
      rows.forEach((m, idx) => {
        const s = sums([m]);
        body += `<tr class="dr-machine">
          ${idx === 0 ? `<th scope="rowgroup" rowspan="${span}" class="dr-dept">${esc(d.name)}${d.group ? `<small class="dr-dept-group">${esc(d.group.name)}</small>` : ""}</th>` : ""}
          <td class="dr-what">${machineCell(m)}</td>
          <td class="num">${linesCol(m, "qty")}</td>
          <td class="num">${linesCol(m, "kg")}</td>
          <td class="num">${kg(s.prodMorning)}</td>
          <td class="num">${kg(s.prodLate)}</td>
          <td class="num strong">${kg(s.prod)}</td>
          <td class="num">${s.prod ? pctTxt(s.pctProd) : ""}</td>
          <td class="num">${kg(s.forced)}</td>
          <td class="num">${s.forced ? pctTxt(s.pctForced) : ""}</td>
          ${monthly ? `<td class="ctr">${evalPill(s, d)}</td>` : ""}
          <td class="dr-cause">${causes(m)}</td>
        </tr>`;
      });
      if (rows.length > 1) body += totalRow("รวมทั้งสิ้น", dt, monthly ? d : null, "dr-subtotal");
      // จบกลุ่ม → แถวรวมทั้งกลุ่ม (ประเมินด้วยเกณฑ์ของกลุ่ม)
      const next = depts[di + 1];
      if (d.group && (!next || next.group !== d.group)) {
        const members = depts.filter((x) => x.group === d.group).flatMap((x) => x.machines);
        body += totalRow(`รวม${d.group.name}`, sums(members), monthly ? d.group : null, "dr-group-total", true);
      }
    });

    const gt = sums(all);
    if (depts.length) body += totalRow("รวมทั้งสิ้นทุกแผนก", gt, null, "dr-grand", true);

    sheet.innerHTML = `
      ${sheetHead(dateText)}
      ${depts.length ? `<div class="dr-scroll">
        <table class="dr-table">
          <thead>
            <tr>
              <th rowspan="2" class="dr-dept-h">แผนก</th>
              <th rowspan="2">เครื่อง / ที่ผลิต</th>
              <th colspan="2" class="grp">สินค้าสำเร็จรูป</th>
              <th colspan="4" class="grp loss-prod-h">สูญเสียจากการผลิต</th>
              <th colspan="2" class="grp loss-forced-h">สูญเสียบังคับ</th>
              ${monthly ? `<th rowspan="2">ผลเดือน</th>` : ""}
              <th rowspan="2" class="dr-cause-h">สาเหตุการสูญเสีย</th>
            </tr>
            <tr>
              <th class="num">จำนวน</th>
              <th class="num">น้ำหนัก / กก.</th>
              <th class="num">กะเช้า</th>
              <th class="num">กะบ่าย/ดึก</th>
              <th class="num">รวมทั้งสิ้น</th>
              <th class="num">คิดเป็น %</th>
              <th class="num">รวมกะ</th>
              <th class="num">คิดเป็น %</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>` : ""}
      ${recycleDepts.length ? recycleTable(recycleDepts) : ""}
      ${sheetFoot(depts.length ? gt : sums(recycleDepts.flatMap((d) => d.machines)), monthly)}`;
  }

  /* ---------- ตารางรีไซเคิล (ส่วนล่างของใบรายงาน) ----------
     น้ำหนักแยกกะต่อชนิดเม็ด · ของเสียแยกกะต่อเครื่อง · % = ของเสีย ÷ (น้ำหนักได้ + ของเสีย) */
  function recycleTable(depts) {
    const all = depts.flatMap((d) => d.machines);
    let rows = "";
    let tot = { morning: 0, late: 0, good: 0, lossM: 0, lossL: 0, lossA: 0 };
    all.forEach((m) => {
      const specs = [...m.lines.values()];
      const list = specs.length ? specs : [{ spec: "", morning: 0, late: 0, allday: 0, kg: 0 }];
      const loss = m.lossMorning + m.lossLate + m.lossAll;
      const pct = m.good > 0 ? (loss / (m.good + loss)) * 100 : null;
      tot.good += m.good;
      tot.lossM += m.lossMorning;
      tot.lossL += m.lossLate;
      tot.lossA += m.lossAll;
      list.forEach((l, i) => {
        tot.morning += l.morning || 0;
        tot.late += l.late || 0;
        rows += `<tr class="dr-machine">
          ${i === 0 ? `<th scope="rowgroup" rowspan="${list.length}" class="dr-dept">${esc(m.machine)}</th>` : ""}
          <td class="dr-what">${l.spec ? esc(l.spec) : `<span class="muted">${l.kg ? "ไม่ระบุชนิด" : "รอยอดผลิต"}</span>`}${l.allday ? ` <small class="muted">(ไม่แยกกะ ${n2(l.allday)})</small>` : ""}</td>
          <td class="num">${kg(l.morning)}</td>
          <td class="num">${kg(l.late)}</td>
          <td class="num strong">${kg(l.kg)}</td>
          ${i === 0 ? `<td class="num" rowspan="${list.length}">${kg(m.lossMorning)}</td>
          <td class="num" rowspan="${list.length}">${kg(m.lossLate)}</td>
          <td class="num strong" rowspan="${list.length}">${kg(loss)}</td>
          <td class="num" rowspan="${list.length}">${loss ? pctTxt(pct) : ""}</td>
          <td class="dr-cause" rowspan="${list.length}">${causes(m)}</td>` : ""}
        </tr>`;
      });
    });
    const tLoss = tot.lossM + tot.lossL + tot.lossA;
    const tPct = tot.good > 0 ? (tLoss / (tot.good + tLoss)) * 100 : null;
    rows += `<tr class="dr-grand">
      <th scope="row" colspan="2" class="dr-total-label">รวมทั้งสิ้น</th>
      <td class="num">${n2(tot.morning)}</td>
      <td class="num">${n2(tot.late)}</td>
      <td class="num">${n2(tot.good)}</td>
      <td class="num">${n2(tot.lossM)}</td>
      <td class="num">${n2(tot.lossL)}</td>
      <td class="num">${n2(tLoss)}</td>
      <td class="num">${pctTxt(tPct)}</td>
      <td></td>
    </tr>`;
    return `<h3 class="dr-sub">เครื่องรีไซเคิล</h3>
      <div class="dr-scroll">
        <table class="dr-table dr-recycle">
          <thead>
            <tr>
              <th rowspan="2" class="dr-dept-h">เครื่อง</th>
              <th rowspan="2">รายละเอียด</th>
              <th colspan="3" class="grp">น้ำหนัก / กก.</th>
              <th colspan="4" class="grp loss-forced-h">สูญเสีย</th>
              <th rowspan="2" class="dr-cause-h">สาเหตุ</th>
            </tr>
            <tr>
              <th class="num">กะเช้า</th>
              <th class="num">กะบ่าย/ดึก</th>
              <th class="num">นน.รวมทั้งสิ้น</th>
              <th class="num">กะเช้า</th>
              <th class="num">กะบ่าย/ดึก</th>
              <th class="num">นน.รวมทั้งสิ้น</th>
              <th class="num">คิดเป็น %</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function sheetHead(dateText) {
    const deptSel = $("in-dept");
    const deptText = deptSel.value === "all" ? "" : ` · แผนก${deptSel.selectedOptions[0]?.textContent || ""}`;
    return `<header class="dr-head">
      <img src="/icons/logo-header.png" width="42" height="37" alt="" />
      <div>
        <h2>รายงานการผลิตสินค้าสำเร็จรูปและน้ำหนักงานสูญเสีย</h2>
        <p>${esc(dateText)}${esc(deptText)}</p>
      </div>
    </header>`;
  }

  function sheetFoot(gt, monthly) {
    const warn = [];
    if (gt.pending) warn.push(`มีรายการของเสียที่บัญชียังไม่ตรวจ ${gt.pending} รายการ`);
    const missing = gt.days - gt.daysWithGood;
    if (missing > 0) warn.push(`ยังไม่มียอดผลิต ${missing} เครื่อง-วัน (ยังไม่นำมาคิด %)`);
    return `<footer class="dr-foot">
      <p>% = ของเสียประเภทนั้น ÷ (ผลิตดี + ของเสียทั้งหมด) × 100 · แถวรวมคิด % เฉพาะเครื่องที่มียอดผลิตแล้ว${gt.prodAll ? ` · ของเสียที่บันทึกแบบรวมกะ/ไม่ระบุกะ ${n2(gt.prodAll)} กก. นับในช่อง "รวมทั้งสิ้น" เท่านั้น` : ""}${monthly ? " · ผลเดือนเทียบเกณฑ์ของแผนก (คิดจากรวม หรือเฉพาะการผลิต ตามที่ตั้งไว้)" : ""}</p>
      ${warn.length ? `<p class="dr-foot-warn">${esc(warn.join(" · "))}</p>` : ""}
      <p class="dr-printed">พิมพ์เมื่อ ${esc(new Date().toLocaleString("th-TH"))} · ${esc(localStorage.getItem("activeName") || "")}</p>
    </footer>`;
  }

  function kg(v) {
    return v ? n2(v) : "";
  }

  function machineCell(m) {
    const specs = [...m.lines.values()];
    const named = specs.filter((l) => l.spec);
    return `<strong>${esc(m.machine)}</strong>${
      named.length
        ? named.map((l) => `<div class="dr-line">${esc(l.spec)}${st.mode === "day" && l.shifts?.size ? ` <small>(${esc([...l.shifts].join("/"))})</small>` : ""}</div>`).join("")
        : ""
    }${specs.some((l) => !l.spec) && named.length ? `<div class="dr-line muted">ไม่ระบุสินค้า</div>` : ""}`;
  }

  function linesCol(m, field) {
    const specs = [...m.lines.values()];
    const named = specs.filter((l) => l.spec);
    const unnamed = specs.filter((l) => !l.spec);
    const cell = (l) => (field === "qty" ? (l.qty ? `${nQty(l.qty)} ${esc(l.unit)}` : "") : n2(l.kg));
    if (!named.length) {
      const total = specs.reduce((s, l) => s + (field === "qty" ? 0 : l.kg), 0);
      return field === "qty" ? "" : total ? `<div class="dr-line-first">${n2(total)}</div>` : `<span class="muted">รอยอดผลิต</span>`;
    }
    const linesHtml = [...named, ...unnamed].map((l) => `<div class="dr-line">${cell(l)}</div>`).join("");
    const multi = named.length + unnamed.length > 1;
    let total = "";
    if (multi) {
      if (field === "kg") total = `<div class="dr-line dr-line-total">${n2(m.good)}</div>`;
      else {
        const units = new Map();
        specs.forEach((l) => l.unit && l.qty && units.set(l.unit, (units.get(l.unit) || 0) + l.qty));
        total = `<div class="dr-line dr-line-total">${[...units].map(([u, q]) => `${nQty(q)} ${esc(u)}`).join(" · ")}</div>`;
      }
    }
    return `<div class="dr-line-first"></div>${linesHtml}${total}`;
  }

  function causes(m) {
    const list = [...m.causes.entries()].sort((a, b) => b[1].kg - a[1].kg);
    if (!list.length) return "";
    return list
      .map(([name, c]) => `<span class="${c.forced ? "c-forced" : ""}">${esc(name)} ${n2(c.kg)}</span>`)
      .join(" + ");
  }

  function evalPill(s, d) {
    const pct = d.basis === "production" ? s.pctProd : s.pctTotal;
    if (pct === null) return `<span class="muted">รอยอดผลิต</span>`;
    const ev = W().evaluate(pct, { max: d.max, warning: d.warning });
    const label = ev.level === "over" ? "เกิน" : ev.level === "warn" ? "ใกล้" : "ผ่าน";
    return `<span class="result-pill ${ev.className}" title="เกณฑ์ ${n2(d.max)}% · คิดจาก${d.basis === "production" ? "การผลิต" : "รวม"}">${label} ${n2(pct)}%</span>`;
  }

  function totalRow(label, s, dept, cls, isGrand) {
    const units = [...s.units].map(([u, q]) => `${nQty(q)} ${esc(u)}`).join(" · ");
    const monthly = st.mode === "month";
    return `<tr class="${cls}">
      ${isGrand ? `<th scope="row" colspan="2" class="dr-total-label">${esc(label)}</th>` : `<td class="dr-total-label">${esc(label)}</td>`}
      <td class="num">${units}</td>
      <td class="num">${n2(s.good)}</td>
      <td class="num">${kg(s.prodMorning)}</td>
      <td class="num">${kg(s.prodLate)}</td>
      <td class="num">${n2(s.prod)}</td>
      <td class="num">${pctTxt(s.pctProd)}</td>
      <td class="num">${n2(s.forced)}</td>
      <td class="num">${pctTxt(s.pctForced)}</td>
      ${monthly ? `<td class="ctr">${dept ? evalPill(s, dept) : `<span class="dr-total-pct">รวม ${pctTxt(s.pctTotal)}%</span>`}</td>` : ""}
      <td class="dr-cause">${monthly || !isGrand ? "" : `รวมของเสียทั้งหมด ${n2(s.waste)} กก. (${pctTxt(s.pctTotal)}%)`}</td>
    </tr>`;
  }

  function showAlert(msg) {
    const el = $("dr-alert");
    el.textContent = msg;
    el.hidden = false;
  }
  function hideAlert() {
    $("dr-alert").hidden = true;
  }
})();
