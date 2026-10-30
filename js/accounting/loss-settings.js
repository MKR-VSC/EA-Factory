/* ======================================================
   loss-settings.js — เมนู "อาการเสีย & ประเภท" (pages/loss-settings.html)
   - เพิ่ม / แก้ชื่อ / ลบ / เรียงลำดับ / เปิด-ปิด อาการเสียของแต่ละแผนก
   - กำหนดประเภท: production = สูญเสียจากการผลิต · forced = สูญเสียบังคับ
   - ตาราง master_problems (คอลัมน์ loss_type มาจาก database/12-loss-types.sql)
   - เปลี่ยนประเภทแล้วมีผลกับรายการที่บันทึกหลังจากนี้ (รายการเก่าเก็บประเภทไว้แล้ว)
====================================================== */
(function () {
  "use strict";

  const TABLE = "master_problems";
  const ALLOW_ROLES = ["admin", "accounting", "management"];
  const EXCLUDE = ["IT_SUPPORT", "IT_SUPORT", "ACCOUNTING", "MANAGEMENT", "ADMIN", "PRINT"];
  const TYPE_LABEL = { production: "การผลิต", forced: "บังคับ" };

  const state = {
    sb: null,
    departments: [],
    dept: "",
    problems: [],
    counts: {}, // dept -> { production, forced }
    filter: "all",
    search: "",
    hasType: true,
    byCode: true, // master_problems มีคอลัมน์ department_code (database/09)
  };

  const $ = (id) => document.getElementById(id);

  /* ---------- เริ่มต้น ---------- */
  document.addEventListener("DOMContentLoaded", async () => {
    if (window.AUTH_GUARD?.requireLogin) {
      const profile = await window.AUTH_GUARD.requireLogin(ALLOW_ROLES);
      if (!profile) return;
    }

    state.sb = window.supabaseClient || window.supabase || null;
    if (!state.sb?.from) {
      showAlert("ไม่พบการเชื่อมต่อฐานข้อมูล");
      return;
    }

    initUser();
    bindEvents();
    await loadDepartments();
  });

  function initUser() {
    const role = String(localStorage.getItem("activeRole") || "").toLowerCase();
    const labels = { admin: "ผู้ดูแลระบบ", accounting: "ฝ่ายบัญชี", management: "ผู้บริหาร" };
    $("lbl-active-user").textContent = localStorage.getItem("activeName") || localStorage.getItem("activeUser") || "ผู้ใช้งาน";
    $("lbl-active-role").textContent = labels[role] || role || "-";
  }

  function bindEvents() {
    $("btn-refresh")?.addEventListener("click", () => loadDepartments(true));
    const logout = () => (window.AUTH_GUARD?.logoutAndRedirect ? AUTH_GUARD.logoutAndRedirect() : location.replace("/login.html"));
    $("btn-logout")?.addEventListener("click", logout);
    $("btn-logout-side")?.addEventListener("click", logout);

    document.querySelectorAll(".ls-filter-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        state.filter = btn.dataset.filter;
        document.querySelectorAll(".ls-filter-btn").forEach((b) => b.classList.toggle("is-active", b === btn));
        renderList();
      }),
    );

    $("input-search")?.addEventListener("input", (e) => {
      state.search = e.target.value.trim().toLowerCase();
      renderList();
    });

    $("form-add")?.addEventListener("submit", (e) => {
      e.preventDefault();
      addProblem();
    });

    // เปลี่ยนค่าในรายการ (ใช้ event delegation)
    const list = $("problem-list");
    list?.addEventListener("click", onListClick);
    list?.addEventListener("change", onListChange);
    list?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.matches(".ls-name, .ls-order")) e.target.blur();
      if (e.key === "Escape" && e.target.matches(".ls-name")) {
        e.target.value = e.target.dataset.orig;
        e.target.blur();
      }
    });
  }

  /* ---------- โหลดข้อมูล ---------- */
  async function loadDepartments(manual = false) {
    hideAlert();
    try {
      const { data, error } = await state.sb
        .from("master_departments")
        .select("department_code, department_name, sort_order, is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;

      state.departments = (data || []).filter((d) => !EXCLUDE.includes(code(d.department_code)));
      if (!state.departments.some((d) => code(d.department_code) === state.dept)) {
        state.dept = code(state.departments[0]?.department_code);
      }

      await loadCounts();
      renderDepts();
      await loadProblems();
      if (manual) toast("โหลดข้อมูลล่าสุดแล้ว", "success");
    } catch (err) {
      console.error(err);
      showAlert(`โหลดแผนกไม่สำเร็จ: ${err.message || err}`);
      $("problem-list").innerHTML = `<p class="ls-empty">โหลดข้อมูลไม่สำเร็จ</p>`;
    }
  }

  // นับจำนวนอาการแต่ละประเภทของทุกแผนก (โชว์บนปุ่มแผนก)
  async function loadCounts() {
    state.counts = {};
    // select("*") เพื่อรู้ว่าฐานข้อมูลมีคอลัมน์ไหนแล้วบ้าง (ตารางเล็ก)
    const res = await state.sb.from(TABLE).select("*");
    if (res.error) return;
    if (res.data?.length) {
      state.hasType = "loss_type" in res.data[0];
      state.byCode = "department_code" in res.data[0];
    } else {
      const probe = await state.sb.from(TABLE).select("loss_type").limit(1);
      state.hasType = !probe.error;
    }

    (res.data || []).forEach((p) => {
      const c = code(p.department_code || p.department);
      const t = p.loss_type === "forced" ? "forced" : "production";
      state.counts[c] = state.counts[c] || { production: 0, forced: 0 };
      state.counts[c][t]++;
    });

    if (!state.hasType) {
      showAlert(
        "ยังไม่ได้เพิ่มช่อง \"ประเภท\" ในฐานข้อมูล — ให้ผู้ดูแลรันไฟล์ database/12-loss-types.sql ก่อน " +
          "(ระหว่างนี้ยังเพิ่ม/แก้ชื่อ/ลบอาการได้ตามปกติ)",
      );
    }
  }

  async function loadProblems() {
    const list = $("problem-list");
    if (!state.dept) {
      list.innerHTML = `<p class="ls-empty">ยังไม่มีแผนกการผลิต</p>`;
      return;
    }
    list.innerHTML = `<p class="ls-empty">กำลังโหลด...</p>`;

    const base = () => state.sb.from(TABLE).select("*");
    let res = state.byCode
      ? await base().eq("department_code", state.dept).order("sort_order", { ascending: true }).order("problem_type")
      : { error: true };
    if (res.error) {
      state.byCode = false;
      res = await base().eq("department", state.dept.toLowerCase()).order("sort_order", { ascending: true }).order("problem_type");
    }
    if (res.error) {
      list.innerHTML = `<p class="ls-empty">โหลดอาการไม่สำเร็จ: ${esc(res.error.message || res.error)}</p>`;
      return;
    }

    state.problems = res.data || [];
    renderList();
  }

  /* ---------- แสดงผล ---------- */
  function renderDepts() {
    const box = $("dept-chips");
    if (!state.departments.length) {
      box.innerHTML = `<span class="ls-muted">ยังไม่มีแผนกการผลิต</span>`;
      return;
    }
    box.innerHTML = state.departments
      .map((d) => {
        const c = code(d.department_code);
        const n = state.counts[c] || { production: 0, forced: 0 };
        const on = c === state.dept;
        return `<button type="button" class="ls-dept${on ? " is-active" : ""}" role="tab" aria-selected="${on}" data-dept="${attr(c)}">
          <span>${esc(d.department_name || c)}</span>
          <small>${n.production + n.forced} อาการ${state.hasType ? ` · บังคับ ${n.forced}` : ""}</small>
        </button>`;
      })
      .join("");

    box.querySelectorAll(".ls-dept").forEach((btn) =>
      btn.addEventListener("click", () => {
        if (btn.dataset.dept === state.dept) return;
        state.dept = btn.dataset.dept;
        box.querySelectorAll(".ls-dept").forEach((b) => {
          const on = b === btn;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-selected", on);
        });
        loadProblems();
      }),
    );
  }

  function renderList() {
    const list = $("problem-list");
    const all = state.problems;
    const typeOf = (p) => (p.loss_type === "forced" ? "forced" : "production");

    $("cnt-all").textContent = all.length;
    $("cnt-production").textContent = all.filter((p) => typeOf(p) === "production").length;
    $("cnt-forced").textContent = all.filter((p) => typeOf(p) === "forced").length;
    document.querySelector(".ls-filter")?.classList.toggle("is-disabled", !state.hasType);
    $("new-type").disabled = !state.hasType;

    const rows = all.filter(
      (p) =>
        (state.filter === "all" || !state.hasType || typeOf(p) === state.filter) &&
        (!state.search || String(p.problem_type || "").toLowerCase().includes(state.search)),
    );

    if (!rows.length) {
      list.innerHTML = `<p class="ls-empty">${all.length ? "ไม่พบอาการตามที่กรอง" : "แผนกนี้ยังไม่มีอาการ — เพิ่มได้จากช่องด้านบน"}</p>`;
      return;
    }

    list.innerHTML = rows
      .map((p) => {
        const t = typeOf(p);
        const active = p.is_active !== false;
        return `<div class="ls-row${active ? "" : " is-off"}" data-id="${attr(p.id)}">
          <input class="ls-order" type="number" min="0" inputmode="numeric" value="${attr(p.sort_order ?? 0)}" data-orig="${attr(p.sort_order ?? 0)}" aria-label="ลำดับของ ${attr(p.problem_type)}" />
          <input class="ls-name" type="text" maxlength="120" value="${attr(p.problem_type)}" data-orig="${attr(p.problem_type)}" aria-label="ชื่ออาการ" />
          <div class="ls-type${state.hasType ? "" : " is-disabled"}" role="radiogroup" aria-label="ประเภทของ ${attr(p.problem_type)}">
            <button type="button" class="ls-type-btn is-production${t === "production" ? " is-on" : ""}" data-type="production" role="radio" aria-checked="${t === "production"}" ${state.hasType ? "" : "disabled"}>การผลิต</button>
            <button type="button" class="ls-type-btn is-forced${t === "forced" ? " is-on" : ""}" data-type="forced" role="radio" aria-checked="${t === "forced"}" ${state.hasType ? "" : "disabled"}>บังคับ</button>
          </div>
          <label class="switch" title="${active ? "เปิดใช้งาน (แสดงในฟอร์ม)" : "ปิดใช้งาน (ไม่แสดงในฟอร์ม)"}">
            <input type="checkbox" class="ls-active" ${active ? "checked" : ""} aria-label="เปิดใช้งาน ${attr(p.problem_type)}" />
            <span class="slider"></span>
          </label>
          <button type="button" class="btn-icon-danger ls-del" aria-label="ลบ ${attr(p.problem_type)}">ลบ</button>
        </div>`;
      })
      .join("");
  }

  /* ---------- แก้ไข ---------- */
  function rowInfo(el) {
    const row = el.closest(".ls-row");
    const id = row?.dataset.id;
    const p = state.problems.find((x) => String(x.id) === String(id));
    return { row, id, p };
  }

  async function update(id, patch) {
    const { error } = await state.sb.from(TABLE).update(patch).eq("id", id);
    if (error) throw error;
    const p = state.problems.find((x) => String(x.id) === String(id));
    if (p) Object.assign(p, patch);
  }

  async function onListClick(e) {
    const typeBtn = e.target.closest(".ls-type-btn");
    if (typeBtn && !typeBtn.disabled) {
      const { id, p } = rowInfo(typeBtn);
      const t = typeBtn.dataset.type;
      if (!p || (p.loss_type || "production") === t) return;
      try {
        await update(id, { loss_type: t });
        bumpCount(t);
        renderList();
        toast(`"${p.problem_type}" เป็นสูญเสีย${TYPE_LABEL[t]}แล้ว (มีผลกับรายการใหม่)`, "success");
      } catch (err) {
        fail("เปลี่ยนประเภทไม่สำเร็จ", err);
      }
      return;
    }

    const del = e.target.closest(".ls-del");
    if (del) {
      const { id, p } = rowInfo(del);
      if (!p) return;
      const ok = confirm(
        `ลบอาการ "${p.problem_type}" ใช่หรือไม่?\n\n` +
          "รายงานที่เคยบันทึกด้วยอาการนี้ยังอยู่ครบ\nถ้าแค่ไม่อยากให้เลือกในฟอร์มแล้ว แนะนำ \"ปิดใช้งาน\" แทนการลบ",
      );
      if (!ok) return;
      try {
        const { error } = await state.sb.from(TABLE).delete().eq("id", id);
        if (error) throw error;
        state.problems = state.problems.filter((x) => String(x.id) !== String(id));
        await refreshCounts();
        renderList();
        toast(`ลบ "${p.problem_type}" แล้ว`, "success");
      } catch (err) {
        fail("ลบไม่สำเร็จ", err);
      }
    }
  }

  async function onListChange(e) {
    const el = e.target;
    const { id, p, row } = rowInfo(el);
    if (!p) return;

    if (el.matches(".ls-active")) {
      try {
        await update(id, { is_active: el.checked });
        row.classList.toggle("is-off", !el.checked);
        toast(el.checked ? `เปิดใช้งาน "${p.problem_type}"` : `ปิดใช้งาน "${p.problem_type}" (ไม่แสดงในฟอร์ม)`, "success");
      } catch (err) {
        el.checked = !el.checked;
        fail("เปลี่ยนสถานะไม่สำเร็จ", err);
      }
      return;
    }

    if (el.matches(".ls-order")) {
      const val = Math.max(0, parseInt(el.value, 10) || 0);
      try {
        await update(id, { sort_order: val });
        el.dataset.orig = val;
        toast("บันทึกลำดับแล้ว", "success");
      } catch (err) {
        el.value = el.dataset.orig;
        fail("บันทึกลำดับไม่สำเร็จ", err);
      }
      return;
    }

    if (el.matches(".ls-name")) {
      const name = el.value.trim().replace(/\s+/g, " ");
      const orig = el.dataset.orig;
      if (!name || name === orig) {
        el.value = orig;
        return;
      }
      if (isDuplicate(name, id)) {
        el.value = orig;
        toast(`มีอาการ "${name}" ในแผนกนี้แล้ว`, "error");
        return;
      }
      const ok = confirm(
        `เปลี่ยนชื่อ "${orig}" เป็น "${name}" ใช่หรือไม่?\n\nรายงานที่บันทึกไปแล้วยังแสดงชื่อเดิม`,
      );
      if (!ok) {
        el.value = orig;
        return;
      }
      try {
        await update(id, { problem_type: name });
        el.dataset.orig = name;
        el.value = name;
        toast("เปลี่ยนชื่ออาการแล้ว", "success");
      } catch (err) {
        el.value = orig;
        fail("เปลี่ยนชื่อไม่สำเร็จ", err);
      }
    }
  }

  async function addProblem() {
    const nameEl = $("new-name");
    const name = nameEl.value.trim().replace(/\s+/g, " ");
    if (!name || !state.dept) return;
    if (isDuplicate(name)) {
      toast(`มีอาการ "${name}" ในแผนกนี้แล้ว`, "error");
      return;
    }

    const btn = $("btn-add");
    btn.disabled = true;
    const maxOrder = state.problems.reduce((m, p) => Math.max(m, Number(p.sort_order) || 0), 0);
    const row = {
      problem_type: name,
      department: state.dept.toLowerCase(),
      sort_order: maxOrder + 1,
      is_active: true,
    };
    if (state.hasType) row.loss_type = $("new-type").value;

    try {
      const { error } = await state.sb.from(TABLE).insert(row);
      if (error) throw error;
      nameEl.value = "";
      toast(`เพิ่ม "${name}" แล้ว`, "success");
      await refreshCounts();
      await loadProblems();
      nameEl.focus();
    } catch (err) {
      fail("เพิ่มอาการไม่สำเร็จ", err);
    } finally {
      btn.disabled = false;
    }
  }

  function isDuplicate(name, exceptId) {
    const n = name.toLowerCase();
    return state.problems.some((p) => String(p.id) !== String(exceptId) && String(p.problem_type || "").trim().toLowerCase() === n);
  }

  function bumpCount() {
    const c = { production: 0, forced: 0 };
    state.problems.forEach((p) => c[p.loss_type === "forced" ? "forced" : "production"]++);
    state.counts[state.dept] = c;
    renderDepts();
  }

  async function refreshCounts() {
    await loadCounts();
    renderDepts();
  }

  /* ---------- ตัวช่วย ---------- */
  function code(v) {
    return String(v || "").trim().toUpperCase();
  }
  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
  }
  const attr = esc;

  function showAlert(msg) {
    const box = $("alert-box");
    if (!box) return;
    box.textContent = msg;
    box.hidden = false;
  }
  function hideAlert() {
    const box = $("alert-box");
    if (box) box.hidden = true;
  }
  function fail(prefix, err) {
    console.error(err);
    const msg = String(err?.message || err || "");
    const hint = /permission|policy|row-level/i.test(msg) ? " (บัญชีนี้ไม่มีสิทธิ์แก้ไข)" : "";
    toast(`${prefix}${hint}: ${msg}`, "error");
  }
  function toast(message, type = "info") {
    const box = $("toast-container");
    if (!box) return;
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.textContent = message;
    box.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 300);
    }, 3200);
  }
})();
