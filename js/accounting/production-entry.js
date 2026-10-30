/* ======================================================
   production-entry.js — กรอกยอดผลิตทั้งใบ (pages/production-entry.html)
   เจ้าหน้าที่นำใบรายงานการผลิตกระดาษมากรอกทีเดียวทั้งวัน

   - เลือกวัน → ทุกเครื่องเรียงตามแผนก/ลำดับเครื่อง (ลำดับเดียวกับใบรายงาน)
   - แต่ละเครื่องกรอกได้หลายบรรทัด: กะ · สินค้า/สเปก · จำนวน · หน่วย · น้ำหนัก kg
   - เห็นของเสียของวันนั้น (การผลิต/บังคับ) และ % ทันทีระหว่างกรอก
   - Enter = ช่องถัดไป · "ดึงสินค้าจากวันก่อน" = ใส่สเปก/กะ/หน่วย ให้เครื่องที่ยังว่าง
   - บันทึกทั้งใบ:
       1) daily_production_lines (แทนที่บรรทัดเดิมของเครื่อง-วันนั้น)
       2) ยอดรวมลง production_kg ของรายงานที่หัวหน้าส่งบัญชีแล้ว + สถานะเครื่อง "ไม่มีของเสีย"
          และตั้งเป็น "บัญชีตรวจแล้ว" (เหมือนกดบันทึกในหน้าบัญชี)
       รายงานที่หัวหน้ายังไม่ส่ง: เก็บยอดไว้ หน้าบัญชีจะใส่ยอดรอให้ตอนหัวหน้าส่งมา
====================================================== */
(function () {
  "use strict";

  const ALLOW = ["admin", "accounting", "management"];
  const EXCLUDE = ["IT_SUPPORT", "IT_SUPORT", "ACCOUNTING", "MANAGEMENT", "ADMIN", "PRINT"];
  const LINES = "daily_production_lines";
  const SENT = "sent_accounting";
  const DONE = "accounting_checked";
  const CANCELLED = "accounting_cancelled";
  const SHIFTS = [
    ["เช้า", "เช้า"],
    ["บ่าย", "บ่าย"],
    ["ดึก", "ดึก"],
    ["", "ทั้งวัน"],
  ];
  const UNITS = ["ม้วน", "ลูก", "ผืน", "ใบ", "ชิ้น", "กก."];

  const st = {
    sb: null,
    profile: null,
    depts: [],
    machines: [], // [{key, dept, machine, order, waste, forced, reports:[], statuses:[], lines:[], orig}]
    specs: new Map(), // DEPT|MACHINE → [spec]
    locked: false,
    hasLoss: false,
    ready: false,
  };

  const $ = (id) => document.getElementById(id);
  const up = (v) => String(v || "").trim().toUpperCase();
  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
  const n2 = (v) => Number(v || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const num = (v) => {
    const n = Number(String(v ?? "").replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : NaN;
  };

  /* ---------- เริ่มต้น ---------- */
  document.addEventListener("DOMContentLoaded", async () => {
    if (window.AUTH_GUARD?.requireLogin) {
      st.profile = await window.AUTH_GUARD.requireLogin(ALLOW);
      if (!st.profile) return;
    }
    st.sb = window.supabaseClient || window.supabase || null;
    if (!st.sb?.from) return alertBox("ไม่พบการเชื่อมต่อฐานข้อมูล");
    $("lbl-user").textContent = localStorage.getItem("activeName") || localStorage.getItem("activeUser") || "-";

    const q = new URLSearchParams(location.search);
    const today = new Date();
    $("in-day").value = q.get("date") || ymd(new Date(today.getTime() - 86400000));

    bind();
    await loadDepts();
    await load();
  });

  function bind() {
    $("in-day").addEventListener("change", () => guard(load));
    $("in-dept").addEventListener("change", () => guard(render));
    $("btn-prev").addEventListener("click", () => guard(() => moveDay(-1)));
    $("btn-next").addEventListener("click", () => guard(() => moveDay(1)));
    $("btn-refresh").addEventListener("click", () => guard(load));
    $("btn-copy").addEventListener("click", copyPrevious);
    $("btn-save").addEventListener("click", saveAll);
    $("btn-discard").addEventListener("click", () => {
      if (confirm("ทิ้งตัวเลขที่ยังไม่บันทึกทั้งหมด?")) render();
    });
    const logout = () => (window.AUTH_GUARD?.logoutAndRedirect ? AUTH_GUARD.logoutAndRedirect() : location.replace("/login.html"));
    $("btn-logout-side")?.addEventListener("click", logout);

    const list = $("pe-list");
    list.addEventListener("input", onEdit);
    list.addEventListener("change", onEdit);
    list.addEventListener("click", onClick);
    list.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", (e) => {
      if (dirtyMachines().length) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
  }

  // เปลี่ยนวัน/แผนก ขณะมีตัวเลขยังไม่บันทึก → ถามก่อน
  function guard(fn) {
    if (dirtyMachines().length && !confirm("มีตัวเลขที่ยังไม่บันทึก ต้องการทิ้งแล้วไปต่อ?")) {
      return;
    }
    fn();
  }

  function moveDay(step) {
    const d = new Date(`${$("in-day").value}T00:00:00`);
    d.setDate(d.getDate() + step);
    $("in-day").value = ymd(d);
    load();
  }

  /* ---------- โหลด ---------- */
  async function loadDepts() {
    const base = "department_code, department_name, sort_order, is_active";
    let res = await st.sb.from("master_departments").select(`${base}, dept_kind`).eq("is_active", true);
    if (res.error) res = await st.sb.from("master_departments").select(base).eq("is_active", true);
    st.depts = (res.data || [])
      .filter((d) => !EXCLUDE.includes(up(d.department_code)))
      .map((d) => ({ code: up(d.department_code), name: d.department_name || up(d.department_code), order: Number(d.sort_order) || 0, recycle: d.dept_kind === "recycle" }))
      .sort((a, b) => a.order - b.order);
    $("in-dept").innerHTML =
      `<option value="all">ทุกแผนก</option>` + st.depts.map((d) => `<option value="${esc(d.code)}">${esc(d.name)}</option>`).join("");
  }

  const fetchAll = (build) => (window.SB_FETCH ? window.SB_FETCH.all(build) : build());

  async function load() {
    const day = $("in-day").value;
    if (!day) return;
    $("pe-list").innerHTML = `<p class="pe-empty">กำลังโหลด...</p>`;
    alertBox("");
    st.ready = false;

    const prev = new Date(`${day}T00:00:00`);
    prev.setDate(prev.getDate() - 90);

    const [mm, reps, ms, lines, hist, lock] = await Promise.all([
      st.sb.from("master_machines").select("*"),
      fetchAll(() => st.sb.from("daily_waste_reports").select("*").eq("report_date", day).order("id", { ascending: true })),
      fetchAll(() => st.sb.from("daily_machine_status").select("*").eq("work_date", day)),
      fetchAll(() => st.sb.from(LINES).select("*").eq("work_date", day).order("sort_order", { ascending: true })),
      fetchAll(() =>
        st.sb
          .from(LINES)
          .select("work_date, department_code, machine_no, shift, product_spec, unit")
          .gte("work_date", ymd(prev))
          .lt("work_date", day)
          .order("work_date", { ascending: false }),
      ),
      st.sb.from("accounting_period_locks").select("*").eq("period", day.slice(0, 7)),
    ]);

    if (lines.error) {
      $("pe-list").innerHTML = `<p class="pe-empty">ยังไม่ได้ตั้งตารางยอดผลิตแยกกะ — ให้ผู้ดูแลรันไฟล์ database/13-production-lines.sql ก่อน</p>`;
      return;
    }
    if (reps.error) {
      $("pe-list").innerHTML = `<p class="pe-empty">โหลดข้อมูลไม่สำเร็จ: ${esc(reps.error.message)}</p>`;
      return;
    }

    st.locked = !lock.error && (lock.data || []).length > 0;
    const reports = (reps.data || []).filter((r) => String(r.status || "").toLowerCase() !== CANCELLED);

    // ของเสียแยกประเภท
    const ids = reports.map((r) => r.id);
    let items = { data: [] };
    if (ids.length) {
      const get = (cols) => st.sb.from("daily_waste_report_items").select(cols).in("report_id", ids);
      items = await get("report_id, waste_weight_kg, loss_type");
      st.hasLoss = !items.error;
      if (items.error) items = await get("report_id, waste_weight_kg");
    }
    const itemsBy = new Map();
    (items.data || []).forEach((i) => {
      const k = String(i.report_id);
      if (!itemsBy.has(k)) itemsBy.set(k, []);
      itemsBy.get(k).push(i);
    });

    // รวมเครื่องทั้งหมด: Master + ที่มีข้อมูลวันนั้น
    const map = new Map();
    const deptOk = new Set(st.depts.map((d) => d.code));
    const get = (dept, machine, order = 9999) => {
      const key = `${dept}|${machine}`;
      if (!map.has(key))
        map.set(key, { key, dept, machine, order, waste: 0, forced: 0, reports: [], statuses: [], lines: [], active: true });
      const m = map.get(key);
      m.order = Math.min(m.order, order);
      return m;
    };
    (mm.data || []).forEach((m, i) => {
      const dept = up(m.department_code || m.department);
      if (!deptOk.has(dept) || m.is_active === false) return;
      get(dept, m.machine_no, Number(m.sort_order ?? i));
    });
    reports.forEach((r) => {
      const dept = up(r.department_code || r.department);
      if (!deptOk.has(dept)) return;
      const m = get(dept, r.machine_no || "-");
      m.reports.push(r);
      (itemsBy.get(String(r.id)) || [{ waste_weight_kg: r.waste_weight_kg }]).forEach((i) => {
        const kg = Number(i.waste_weight_kg || 0);
        m.waste += kg;
        if (i.loss_type === "forced") m.forced += kg;
      });
    });
    (ms.data || []).forEach((s) => {
      const dept = up(s.department_code);
      if (!deptOk.has(dept)) return;
      get(dept, s.machine_no).statuses.push(s);
    });
    (lines.data || []).forEach((l) => {
      const dept = up(l.department_code);
      if (!deptOk.has(dept)) return;
      get(dept, l.machine_no).lines.push(l);
    });

    // สเปกที่เคยผลิต (แนะนำในช่องสินค้า) + รายการล่าสุดของแต่ละเครื่อง (ปุ่มดึงจากวันก่อน)
    st.specs = new Map();
    st.lastDay = new Map();
    (hist.data || []).forEach((l) => {
      const k = `${up(l.department_code)}|${l.machine_no}`;
      if (l.product_spec) {
        if (!st.specs.has(k)) st.specs.set(k, new Set());
        st.specs.get(k).add(l.product_spec);
      }
      const last = st.lastDay.get(k);
      if (!last) st.lastDay.set(k, { date: l.work_date, lines: [l] });
      else if (last.date === l.work_date) last.lines.push(l);
    });

    const deptOrder = new Map(st.depts.map((d, i) => [d.code, i]));
    const coll = new Intl.Collator("th", { numeric: true });
    st.machines = [...map.values()].sort(
      (a, b) => (deptOrder.get(a.dept) ?? 99) - (deptOrder.get(b.dept) ?? 99) || a.order - b.order || coll.compare(a.machine, b.machine),
    );
    st.machines.forEach((m) => (m.orig = serialize(m.lines)));
    st.ready = true;

    const notes = [];
    if (st.locked) notes.push(`งวด ${day.slice(0, 7)} ปิดบัญชีแล้ว — ดูได้อย่างเดียว`);
    alertBox(notes.join(" · "));
    render();
  }

  /* ---------- แสดงผล ---------- */
  function render() {
    const list = $("pe-list");
    const dept = $("in-dept").value;
    const ms = st.machines.filter((m) => dept === "all" || m.dept === dept);
    if (!ms.length) {
      list.innerHTML = `<p class="pe-empty">ไม่มีเครื่องจักรในแผนกนี้ — เพิ่มได้ที่หน้าแอดมิน &gt; Master Data</p>`;
      updateSaveBar();
      return;
    }
    let html = "";
    let cur = null;
    ms.forEach((m) => {
      if (m.dept !== cur) {
        if (cur !== null) html += `</section>`;
        cur = m.dept;
        const d = st.depts.find((x) => x.code === m.dept);
        html += `<section class="rv-card pe-dept" data-dept="${esc(m.dept)}">
          <header class="pe-dept-head"><h2>${esc(d?.name || m.dept)}${d?.recycle ? ` <small>รีไซเคิล</small>` : ""}</h2><span class="pe-dept-sum" data-sum="${esc(m.dept)}"></span></header>`;
      }
      html += machineHtml(m);
    });
    html += `</section>`;
    list.innerHTML = html;
    ms.forEach((m) => updateMachine(m.key));
    updateDeptSums();
    updateSaveBar();
  }

  function statusChip(m) {
    if (m.statuses.some((s) => String(s.operation_status) === "not_running")) return `<span class="pe-chip off">ไม่ได้เดินเครื่อง</span>`;
    if (!m.reports.length) {
      if (m.statuses.some((s) => String(s.operation_status) === "no_waste")) return `<span class="pe-chip ok">ไม่มีของเสีย</span>`;
      return `<span class="pe-chip muted">ยังไม่มีข้อมูลจากหัวหน้า</span>`;
    }
    const pending = m.reports.filter((r) => ![SENT, DONE].includes(String(r.status || "").toLowerCase())).length;
    if (pending) return `<span class="pe-chip warn">หัวหน้ายังไม่ส่ง ${pending}</span>`;
    if (m.reports.every((r) => String(r.status).toLowerCase() === DONE)) return `<span class="pe-chip ok">บัญชีตรวจแล้ว</span>`;
    return `<span class="pe-chip">รอบัญชี</span>`;
  }

  function machineHtml(m) {
    const ro = st.locked;
    const rows = m.lines.length ? m.lines : [{ shift: "เช้า", unit: defaultUnit(m) }];
    const specs = [...(st.specs.get(m.key) || [])];
    return `<div class="pe-machine${ro ? " is-ro" : ""}" data-key="${esc(m.key)}">
      <div class="pe-m-info">
        <strong>${esc(m.machine)}</strong>
        ${statusChip(m)}
        <small>ของเสีย ${n2(m.waste)} kg${st.hasLoss && m.forced ? ` · บังคับ ${n2(m.forced)}` : ""}</small>
        <datalist id="dl-${esc(m.key)}">${specs.map((s) => `<option value="${esc(s)}"></option>`).join("")}</datalist>
      </div>
      <div class="pe-m-lines">${rows.map((r) => lineHtml(m, r, ro)).join("")}
        ${ro ? "" : `<button type="button" class="pe-add" data-act="add">+ บรรทัด</button>`}
      </div>
      <div class="pe-m-sum" data-msum></div>
    </div>`;
  }

  function defaultUnit(m) {
    const last = st.lastDay.get(m.key)?.lines?.[0]?.unit;
    return last || "ม้วน";
  }

  function lineHtml(m, r, ro) {
    const dis = ro ? "disabled" : "";
    // บรรทัดเดิมที่ไม่มีหน่วย แสดง "–" (ไม่เติมหน่วยให้เอง จะได้ไม่นับว่าแก้ไข)
    const unit = r.unit ?? "";
    const units = ["", ...(UNITS.includes(unit) || !unit ? UNITS : [...UNITS, unit])];
    return `<div class="pe-line">
      <select class="pe-shift" aria-label="กะ" ${dis}>${SHIFTS.map(([v, t]) => `<option value="${v}" ${String(r.shift ?? "") === v ? "selected" : ""}>${t}</option>`).join("")}</select>
      <input class="pe-in pe-spec" list="dl-${esc(m.key)}" maxlength="160" placeholder="สินค้า / สเปก" value="${esc(r.product_spec || "")}" aria-label="สินค้า ${esc(m.machine)}" ${dis} />
      <input class="pe-in pe-qty" inputmode="decimal" placeholder="จำนวน" value="${r.qty ?? ""}" aria-label="จำนวน ${esc(m.machine)}" ${dis} />
      <select class="pe-unit" aria-label="หน่วย" ${dis}>${units.map((u) => `<option value="${esc(u)}" ${u === unit ? "selected" : ""}>${u ? esc(u) : "–"}</option>`).join("")}</select>
      <input class="pe-in pe-weight" inputmode="decimal" placeholder="น้ำหนัก kg" value="${r.weight_kg ?? ""}" aria-label="น้ำหนัก kg ${esc(m.machine)}" ${dis} />
      ${ro ? "<span></span>" : `<button type="button" class="pe-del" data-act="del" aria-label="ลบบรรทัด">×</button>`}
    </div>`;
  }

  /* ---------- อ่านค่าในจอ ---------- */
  function readLines(key) {
    const box = document.querySelector(`.pe-machine[data-key="${CSS.escape(key)}"]`);
    if (!box) return null; // ไม่ได้แสดง (กรองแผนก) → ใช้ค่าเดิม
    return [...box.querySelectorAll(".pe-line")]
      .map((el) => ({
        el,
        shift: el.querySelector(".pe-shift").value,
        product_spec: el.querySelector(".pe-spec").value.trim().replace(/\s+/g, " "),
        qtyRaw: el.querySelector(".pe-qty").value.trim(),
        unit: el.querySelector(".pe-unit").value,
        weightRaw: el.querySelector(".pe-weight").value.trim(),
      }))
      .filter((r) => r.weightRaw !== "" || r.qtyRaw !== "");
  }

  function serialize(lines) {
    return JSON.stringify(
      lines.map((l) => [
        l.shift || "",
        l.product_spec || "",
        l.qty === "" || l.qty === null || l.qty === undefined ? null : Number(l.qty),
        l.unit || "",
        Number(l.weight_kg || 0),
      ]),
    );
  }

  function currentOf(m) {
    const rows = readLines(m.key);
    if (!rows) return null;
    return rows.map((r) => ({
      shift: r.shift,
      product_spec: r.product_spec,
      qty: r.qtyRaw === "" ? null : num(r.qtyRaw),
      unit: r.unit,
      weight_kg: num(r.weightRaw),
    }));
  }

  function dirtyMachines() {
    if (!st.ready) return [];
    return st.machines.filter((m) => {
      const cur = currentOf(m);
      return cur && serialize(cur) !== m.orig;
    });
  }

  /* ---------- อัปเดตตัวเลข ---------- */
  function updateMachine(key) {
    const m = st.machines.find((x) => x.key === key);
    const box = document.querySelector(`.pe-machine[data-key="${CSS.escape(key)}"]`);
    if (!m || !box) return;
    const cur = currentOf(m) || [];
    const good = cur.reduce((s, l) => s + (num(l.weight_kg) > 0 ? num(l.weight_kg) : 0), 0);
    m.good = good;
    const pct = good > 0 ? window.WASTE_FORMULA.percent(m.waste, good) : null;
    const pctProd = good > 0 ? ((m.waste - m.forced) / (good + m.waste)) * 100 : null;
    const dirty = serialize(cur) !== m.orig;
    box.classList.toggle("is-dirty", dirty);
    box.querySelector("[data-msum]").innerHTML = good
      ? `<strong>${n2(good)} kg</strong><small>% เสีย ${n2(pct)}${st.hasLoss && m.forced ? ` · ผลิต ${n2(pctProd)}` : ""}</small>${dirty ? `<em>ยังไม่บันทึก</em>` : ""}`
      : `<small class="muted">ยังไม่มียอดผลิต</small>${dirty ? `<em>ยังไม่บันทึก</em>` : ""}`;
  }

  function updateDeptSums() {
    document.querySelectorAll("[data-sum]").forEach((el) => {
      const ms = st.machines.filter((m) => m.dept === el.dataset.sum);
      const good = ms.reduce((s, m) => s + (m.good || 0), 0);
      const waste = ms.reduce((s, m) => s + (m.good > 0 ? m.waste : 0), 0);
      const pct = good > 0 ? window.WASTE_FORMULA.percent(waste, good) : null;
      el.textContent = good ? `ผลิตดีรวม ${n2(good)} kg · % เสีย ${n2(pct)}` : "";
    });
  }

  function updateSaveBar() {
    const d = dirtyMachines();
    $("pe-savebar").hidden = !d.length || st.locked;
    $("pe-dirty-count").textContent = `${d.length} เครื่อง`;
    $("pe-dirty-total").textContent = d.length ? `(${d.map((m) => m.machine).slice(0, 6).join(", ")}${d.length > 6 ? " …" : ""})` : "";
  }

  function onEdit(e) {
    const box = e.target.closest(".pe-machine");
    if (!box) return;
    if (e.target.matches(".pe-qty, .pe-weight")) {
      const v = e.target.value.replace(/[^0-9.,]/g, "");
      if (v !== e.target.value) e.target.value = v;
    }
    e.target.closest(".pe-line")?.classList.remove("is-invalid");
    updateMachine(box.dataset.key);
    updateDeptSums();
    updateSaveBar();
  }

  function onClick(e) {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const box = btn.closest(".pe-machine");
    const m = st.machines.find((x) => x.key === box.dataset.key);
    const linesBox = box.querySelector(".pe-m-lines");
    if (btn.dataset.act === "add") {
      const last = [...linesBox.querySelectorAll(".pe-line")].pop();
      const prev = last
        ? { shift: last.querySelector(".pe-shift").value, spec: last.querySelector(".pe-spec").value, unit: last.querySelector(".pe-unit").value }
        : {};
      const next = { เช้า: "ดึก", บ่าย: "ดึก", ดึก: "เช้า", "": "" }[prev.shift ?? "เช้า"] ?? "เช้า";
      btn.insertAdjacentHTML("beforebegin", lineHtml(m, { shift: next, product_spec: prev.spec || "", unit: prev.unit || defaultUnit(m) }, false));
      btn.previousElementSibling.querySelector(".pe-weight").focus();
    } else if (btn.dataset.act === "del") {
      const line = btn.closest(".pe-line");
      if (linesBox.querySelectorAll(".pe-line").length > 1) line.remove();
      else line.querySelectorAll("input").forEach((i) => (i.value = ""));
    }
    updateMachine(m.key);
    updateDeptSums();
    updateSaveBar();
  }

  // Enter = ช่องถัดไป (ข้ามไปเครื่องถัดไปได้) · Shift+Enter = ย้อนกลับ
  function onKey(e) {
    if (e.key !== "Enter" || !e.target.matches(".pe-in")) return;
    e.preventDefault();
    const all = [...document.querySelectorAll("#pe-list .pe-in:not([disabled])")];
    const i = all.indexOf(e.target);
    const next = all[i + (e.shiftKey ? -1 : 1)];
    if (next) {
      next.focus();
      next.select?.();
    }
  }

  /* ---------- ดึงสินค้าจากวันก่อน ---------- */
  function copyPrevious() {
    if (st.locked) return;
    let n = 0;
    document.querySelectorAll(".pe-machine").forEach((box) => {
      const m = st.machines.find((x) => x.key === box.dataset.key);
      const lines = [...box.querySelectorAll(".pe-line")];
      const empty = lines.every((l) => !l.querySelector(".pe-spec").value && !l.querySelector(".pe-weight").value && !l.querySelector(".pe-qty").value);
      const last = st.lastDay.get(m.key);
      if (!empty || !last?.lines?.length) return;
      lines.forEach((l) => l.remove());
      const add = box.querySelector(".pe-add");
      last.lines.forEach((l) =>
        add.insertAdjacentHTML("beforebegin", lineHtml(m, { shift: l.shift ?? "", product_spec: l.product_spec || "", unit: l.unit || "ม้วน" }, false)),
      );
      n++;
    });
    toast(n ? `ใส่สินค้าจากวันก่อนให้ ${n} เครื่อง — กรอกน้ำหนักต่อได้เลย` : "ไม่มีเครื่องว่างที่มีรายการวันก่อน", n ? "success" : "info");
  }

  /* ---------- บันทึก ---------- */
  async function saveAll() {
    if (st.locked) return;
    const dirty = dirtyMachines();
    if (!dirty.length) return;

    // ตรวจทุกบรรทัด: ต้องมีน้ำหนัก > 0
    let bad = null;
    dirty.forEach((m) => {
      readLines(m.key).forEach((r) => {
        const w = num(r.weightRaw);
        const q = r.qtyRaw === "" ? 0 : num(r.qtyRaw);
        const ok = w > 0 && q >= 0;
        r.el.classList.toggle("is-invalid", !ok);
        if (!ok && !bad) bad = r.el;
      });
    });
    if (bad) {
      bad.scrollIntoView({ block: "center" });
      bad.querySelector(".pe-weight")?.focus();
      return toast("กรอกน้ำหนัก (kg) ให้ครบและมากกว่า 0 ทุกบรรทัดที่มีตัวเลข", "error");
    }

    const btn = $("btn-save");
    btn.disabled = true;
    btn.textContent = "กำลังบันทึก...";
    const day = $("in-day").value;
    const uid = st.profile?.id || localStorage.getItem("activeUserId") || null;
    const now = new Date().toISOString();
    const failed = [];
    let waiting = 0;

    for (const m of dirty) {
      const cur = currentOf(m);
      try {
        const del = await st.sb.from(LINES).delete().eq("work_date", day).eq("department_code", m.dept).eq("machine_no", m.machine);
        if (del.error) throw del.error;
        if (cur.length) {
          const ins = await st.sb.from(LINES).insert(
            cur.map((l, i) => ({
              work_date: day,
              department_code: m.dept,
              machine_no: m.machine,
              shift: l.shift || null,
              product_spec: l.product_spec || null,
              qty: l.qty,
              unit: l.unit || null,
              weight_kg: l.weight_kg,
              sort_order: i,
            })),
          );
          if (ins.error) throw ins.error;
        }

        // ยอดรวมลงช่องผลิตดีเดิม (เฉพาะที่หัวหน้าส่งบัญชีแล้ว)
        const total = Math.round(cur.reduce((s, l) => s + l.weight_kg, 0) * 100) / 100;
        if (total > 0) {
          const repIds = m.reports.filter((r) => [SENT, DONE].includes(String(r.status || "").toLowerCase())).map((r) => r.id);
          waiting += m.reports.length - repIds.length;
          if (repIds.length) {
            const u = await st.sb
              .from("daily_waste_reports")
              .update({ production_kg: total, status: DONE, accounting_status: DONE, accounting_checked_by: uid, accounting_checked_at: now, updated_at: now })
              .in("id", repIds);
            if (u.error) throw u.error;
          }
          const msIds = m.statuses
            .filter((s) => String(s.operation_status) === "no_waste" && s.sent_accounting !== false)
            .map((s) => s.id);
          if (msIds.length) {
            const u = await st.sb
              .from("daily_machine_status")
              .update({ production_kg: total, accounting_checked_by: uid, accounting_checked_at: now, updated_at: now })
              .in("id", msIds);
            if (u.error) throw u.error;
          }
        }
        m.lines = cur;
        m.orig = serialize(cur);
      } catch (err) {
        console.error(err);
        failed.push(`${m.machine}: ${friendly(err)}`);
      }
    }

    btn.disabled = false;
    btn.textContent = "บันทึกทั้งใบ";
    if (failed.length) {
      toast(`บันทึกไม่สำเร็จ ${failed.length} เครื่อง — ${failed[0]}`, "error");
      alertBox(`บันทึกไม่สำเร็จ: ${failed.join(" · ")}`);
    } else {
      toast(
        `บันทึกยอดผลิต ${dirty.length} เครื่องแล้ว${waiting ? ` · ${waiting} รายงานที่หัวหน้ายังไม่ส่ง จะได้ยอดนี้อัตโนมัติในหน้าบัญชี` : ""}`,
        "success",
      );
    }
    await load();
  }

  function friendly(err) {
    const msg = String(err?.message || err || "");
    if (msg.includes("PERIOD_LOCKED")) return "งวดนี้ปิดบัญชีแล้ว";
    if (/row-level|permission|policy/i.test(msg)) return "บัญชีนี้ไม่มีสิทธิ์บันทึก";
    return msg;
  }

  function alertBox(msg) {
    const el = $("pe-alert");
    el.textContent = msg;
    el.hidden = !msg;
  }

  function toast(message, type = "info") {
    const box = $("toast-container");
    const el = document.createElement("div");
    el.className = `toast pe-toast toast-${type}`;
    el.textContent = message;
    box.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 300);
    }, 4000);
  }
})();
