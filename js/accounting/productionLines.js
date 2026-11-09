/* ======================================================
   productionLines.js — ยอดผลิตแยก กะ / สินค้า / จำนวน (หน้าบัญชี)
   ตาราง daily_production_lines (database/13-production-lines.sql)

   - ช่อง "ผลิตดี kg" ของแต่ละเครื่อง-วัน มีปุ่ม "แยกกะ / สินค้า"
     เปิดหน้าต่างกรอกหลายบรรทัด: กะ · สินค้า (สเปก) · จำนวน · หน่วย · น้ำหนัก kg
   - กดบันทึก → เก็บบรรทัดทั้งหมด แล้วบันทึก "ผลรวมน้ำหนัก" ลงช่องผลิตดีแบบเดิม
     (สูตร % / สรุป / Dashboard เดิมใช้ต่อได้ทันที)
   - ไม่บังคับ: เครื่องที่ไม่แยก ยังพิมพ์ยอดรวมช่องเดียวได้เหมือนเดิม
   ใช้ตัวแปร/ฟังก์ชันของ accounting-panel.js (state, saveGroup, safeText …)
====================================================== */
(function () {
  "use strict";

  const TABLE = "daily_production_lines";
  const SHIFTS = [
    ["", "ทั้งวัน"],
    ["เช้า", "เช้า"],
    ["บ่าย", "บ่าย"],
    ["ดึก", "ดึก"],
  ];
  const UNITS = ["ม้วน", "ลูก", "ผืน", "ใบ", "ชิ้น", "กก."];

  const PL = {
    available: false,
    byKey: new Map(), // "YYYY-MM-DD|DEPT|MACHINE" → [lines]
    all: [],
  };

  const keyOf = (date, dept, machine) => `${date}|${String(dept || "").toUpperCase()}|${machine}`;
  PL.keyOfGroup = (g) => keyOf(g.date, g.dept, g.machine);
  PL.linesFor = (g) => PL.byKey.get(PL.keyOfGroup(g)) || [];

  /* ---------- โหลด ---------- */
  PL.load = async function () {
    const sb = state.supabase;
    if (!sb) return;
    const build = () =>
      sb
        .from(TABLE)
        .select("*")
        .order("work_date", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
    const { data, error } = window.SB_FETCH ? await window.SB_FETCH.all(build) : await build();
    if (error) {
      // ยังไม่ได้รัน database/13-production-lines.sql → ซ่อนปุ่ม ใช้ช่องยอดรวมแบบเดิม
      PL.available = false;
      PL.byKey = new Map();
      PL.all = [];
      return;
    }
    PL.available = true;
    PL.all = data || [];
    PL.byKey = new Map();
    PL.all.forEach((l) => {
      const k = keyOf(l.work_date, l.department_code, l.machine_no);
      if (!PL.byKey.has(k)) PL.byKey.set(k, []);
      PL.byKey.get(k).push(l);
    });
  };

  /* ---------- ส่วนที่แสดงใต้ช่องผลิตดี ---------- */
  PL.cellButton = function (g, { disabled } = {}) {
    if (!PL.available || !g.machine || g.machine === "-") return "";
    const lines = PL.linesFor(g);
    const label = lines.length
      ? `${lines.length} รายการ · ${summarizeShifts(lines)}`
      : "แยกกะ / สินค้า";
    return `<button type="button" class="prod-lines-btn${lines.length ? " has-lines" : ""}" onclick="PL.open('${safeAttr(g.key)}')" ${disabled ? "disabled" : ""} title="กรอกยอดผลิตแยกกะ / สินค้า / จำนวน">${safeText(label)}</button>`;
  };

  PL.hasLines = (g) => PL.available && PL.linesFor(g).length > 0;

  function summarizeShifts(lines) {
    const s = [...new Set(lines.map((l) => l.shift || "ทั้งวัน"))];
    return s.join("/");
  }

  /* ---------- หน้าต่างกรอก ---------- */
  PL.open = function (groupKey) {
    const g = state.groups.find((x) => x.key === groupKey);
    if (!g) return;
    const locked = isGroupLocked(g);
    const cancelled = normalizeText(g.status) === STATUS_CANCELLED;
    const readOnly = locked || cancelled;

    const existing = PL.linesFor(g);
    const rows = existing.length
      ? existing.map((l) => ({ ...l }))
      : [{ shift: "เช้า", product_spec: "", qty: "", unit: "ม้วน", weight_kg: g.production || "" }];

    const modal = document.getElementById("appModal");
    document.getElementById("modalTitle").textContent = `ยอดผลิต ${g.machine} · ${formatDate(g.date)}`;

    const specs = suggestSpecs(g);
    const forced = typeof forcedOf === "function" ? forcedOf(g) : 0;

    document.getElementById("modalBody").innerHTML = `
      <div class="pl">
        <p class="pl-sub">${safeText(getDeptName(g.dept))} (${safeText(g.dept)}) · ของเสียวันนี้ ${formatNumber(g.waste)} kg${
          state.hasLossType && forced > 0 ? ` (การผลิต ${formatNumber(g.waste - forced)} · บังคับ ${formatNumber(forced)})` : ""
        }</p>
        ${locked ? `<p class="pl-warn">งวดนี้ปิดบัญชีแล้ว ดูได้อย่างเดียว</p>` : ""}
        <datalist id="plSpecs">${specs.map((s) => `<option value="${safeAttr(s)}"></option>`).join("")}</datalist>
        <div class="pl-head" aria-hidden="true"><span>กะ</span><span>สินค้า / สเปก</span><span>จำนวน</span><span>หน่วย</span><span>น้ำหนัก kg</span><span></span></div>
        <div class="pl-rows" id="plRows">${rows.map((r) => rowHtml(r, readOnly)).join("")}</div>
        ${readOnly ? "" : `<button type="button" class="btn light pl-add" id="plAdd">+ เพิ่มบรรทัด</button>`}
        <div class="pl-total" id="plTotal"></div>
      </div>`;

    document.getElementById("modalActions").innerHTML = readOnly
      ? `<button class="btn light" type="button" onclick="closeModal()">ปิด</button>`
      : `${existing.length ? `<button class="btn light pl-clear" type="button" id="plClear">ไม่แยก (ลบทั้งหมด)</button>` : ""}
         <button class="btn light" type="button" onclick="closeModal()">ยกเลิก</button>
         <button class="btn primary" type="button" id="plSave">บันทึกยอดผลิต</button>`;

    const box = document.getElementById("plRows");
    box.addEventListener("input", () => renderTotal(g));
    box.addEventListener("change", () => renderTotal(g));
    box.addEventListener("click", (e) => {
      const del = e.target.closest(".pl-del");
      if (!del) return;
      del.closest(".pl-row").remove();
      if (!box.children.length) box.insertAdjacentHTML("beforeend", rowHtml({ shift: "เช้า", unit: "ม้วน" }, false));
      renderTotal(g);
    });
    document.getElementById("plAdd")?.addEventListener("click", () => {
      const last = box.lastElementChild;
      const prev = last ? readRow(last) : {};
      box.insertAdjacentHTML(
        "beforeend",
        rowHtml({ shift: nextShift(prev.shift), product_spec: prev.product_spec || "", unit: prev.unit || "ม้วน" }, false),
      );
      box.lastElementChild.querySelector(".pl-weight")?.focus();
      renderTotal(g);
    });
    document.getElementById("plSave")?.addEventListener("click", () => save(g));
    document.getElementById("plClear")?.addEventListener("click", () => clearAll(g));

    renderTotal(g);
    modal.classList.remove("hidden");
    if (!readOnly) box.querySelector(".pl-row .pl-weight")?.focus();
  };

  function rowHtml(r, ro) {
    const dis = ro ? "disabled" : "";
    const unit = r.unit || "ม้วน";
    const units = UNITS.includes(unit) ? UNITS : [...UNITS, unit];
    return `<div class="pl-row">
      <select class="pl-shift" aria-label="กะ" ${dis}>${SHIFTS.map(([v, t]) => `<option value="${v}" ${String(r.shift || "") === v ? "selected" : ""}>${t}</option>`).join("")}</select>
      <input class="pl-spec" list="plSpecs" maxlength="160" placeholder="เช่น ท่อดำ HD 32mm 100m" value="${safeAttr(r.product_spec || "")}" aria-label="สินค้า / สเปก" ${dis} />
      <input class="pl-qty" inputmode="decimal" placeholder="0" value="${r.qty ?? ""}" aria-label="จำนวน" ${dis} />
      <select class="pl-unit" aria-label="หน่วย" ${dis}>${units.map((u) => `<option ${u === unit ? "selected" : ""}>${safeText(u)}</option>`).join("")}</select>
      <input class="pl-weight" inputmode="decimal" placeholder="0.00" value="${r.weight_kg ?? ""}" aria-label="น้ำหนัก kg" ${dis} />
      ${ro ? "<span></span>" : `<button type="button" class="pl-del" aria-label="ลบบรรทัด">×</button>`}
    </div>`;
  }

  const num = (v) => {
    const n = Number(String(v ?? "").replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : NaN;
  };

  function readRow(el) {
    return {
      shift: el.querySelector(".pl-shift").value,
      product_spec: el.querySelector(".pl-spec").value.trim().replace(/\s+/g, " "),
      qtyRaw: el.querySelector(".pl-qty").value.trim(),
      unit: el.querySelector(".pl-unit").value,
      weightRaw: el.querySelector(".pl-weight").value.trim(),
    };
  }

  function readAll() {
    return [...document.querySelectorAll("#plRows .pl-row")].map((el) => ({ el, ...readRow(el) }));
  }

  function nextShift(s) {
    return { "": "", เช้า: "ดึก", บ่าย: "ดึก", ดึก: "เช้า" }[s || ""] ?? "เช้า";
  }

  function renderTotal(g) {
    const rows = readAll().filter((r) => r.weightRaw !== "");
    const byShift = new Map();
    let total = 0;
    rows.forEach((r) => {
      const w = num(r.weightRaw);
      if (!(w >= 0)) return;
      total += w;
      const k = r.shift || "ทั้งวัน";
      byShift.set(k, (byShift.get(k) || 0) + w);
    });
    const pct = total > 0 ? window.WASTE_FORMULA.percent(g.waste, total) : null;
    const el = document.getElementById("plTotal");
    if (!el) return;
    el.innerHTML = `
      <div>${[...byShift].map(([k, v]) => `<span>${k === "ทั้งวัน" ? "ทั้งวัน" : `กะ${safeText(k)}`} ${formatNumber(v)}</span>`).join("")}</div>
      <strong>ผลิตดีรวม ${formatNumber(total)} kg</strong>
      <small>% ของเสียวันนี้ ${pct === null ? "-" : formatPercent(pct)}</small>`;
  }

  function suggestSpecs(g) {
    const sameMachine = [];
    const sameDept = [];
    PL.all.forEach((l) => {
      if (!l.product_spec) return;
      if (String(l.department_code).toUpperCase() !== g.dept) return;
      (l.machine_no === g.machine ? sameMachine : sameDept).push(l.product_spec);
    });
    return [...new Set([...sameMachine, ...sameDept])].slice(0, 80);
  }

  /* ---------- บันทึก ---------- */
  async function save(g) {
    // บรรทัดที่ไม่มีทั้งจำนวนและน้ำหนัก = บรรทัดว่าง (สเปกที่คัดลอกมาอย่างเดียวไม่นับ)
    const rows = readAll().filter((r) => r.qtyRaw || r.weightRaw);
    let bad = null;
    rows.forEach((r) => {
      r.el.classList.remove("is-invalid");
      const w = num(r.weightRaw);
      const q = r.qtyRaw === "" ? 0 : num(r.qtyRaw);
      if (!(w > 0) || !(q >= 0)) {
        r.el.classList.add("is-invalid");
        bad = bad || r.el;
      }
    });
    if (bad) {
      bad.querySelector(".pl-weight")?.focus();
      return showToast("กรอกน้ำหนัก (kg) ให้ครบและมากกว่า 0 ทุกบรรทัด", "error");
    }
    if (!rows.length) return showToast("ยังไม่มีบรรทัดยอดผลิต", "error");

    const btn = document.getElementById("plSave");
    if (btn) btn.disabled = true;
    try {
      await replaceLines(
        g,
        rows.map((r, i) => ({
          work_date: g.date,
          department_code: g.dept,
          machine_no: g.machine,
          shift: r.shift || null,
          product_spec: r.product_spec || null,
          qty: r.qtyRaw === "" ? null : num(r.qtyRaw),
          unit: r.unit || null,
          weight_kg: num(r.weightRaw),
          sort_order: i,
        })),
      );
      const total = rows.reduce((s, r) => s + num(r.weightRaw), 0);
      closeModal();
      await commitTotal(g, total);
    } catch (err) {
      console.error(err);
      showToast(`บันทึกไม่สำเร็จ: ${friendlyDbError(err)}`, "error");
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function clearAll(g) {
    if (!confirm("ลบยอดผลิตแยกกะ / สินค้าของวันนี้ทั้งหมด?\nยอดผลิตดีรวมที่บันทึกไว้ยังอยู่ แก้ไขต่อได้ที่ช่องผลิตดี")) return;
    try {
      await replaceLines(g, []);
      closeModal();
      showToast("ลบรายการแยกแล้ว — แก้ยอดรวมได้ที่ช่องผลิตดี", "success");
      await loadAccountingData();
    } catch (err) {
      showToast(`ลบไม่สำเร็จ: ${friendlyDbError(err)}`, "error");
    }
  }

  async function replaceLines(g, lines) {
    const sb = state.supabase;
    const del = await sb
      .from(TABLE)
      .delete()
      .eq("work_date", g.date)
      .eq("department_code", g.dept)
      .eq("machine_no", g.machine);
    if (del.error) throw del.error;
    if (lines.length) {
      const ins = await sb.from(TABLE).insert(lines);
      if (ins.error) throw ins.error;
    }
    const k = PL.keyOfGroup(g);
    PL.all = PL.all.filter((l) => keyOf(l.work_date, l.department_code, l.machine_no) !== k).concat(lines);
    if (lines.length) PL.byKey.set(k, lines);
    else PL.byKey.delete(k);
  }

  // ยอดรวมลงช่องผลิตดีเดิม แล้วบันทึกตามขั้นตอนปกติของหน้าบัญชี
  async function commitTotal(g, total) {
    const input = document.querySelector(`[data-prod="${cssEscape(g.key)}"]`);
    const text = String(Math.round(total * 100) / 100);
    if (input) input.value = text;
    g.production = total;
    state.drafts.set(g.key, text);
    await saveGroup(g.key);
  }

  window.PL = PL;
})();
