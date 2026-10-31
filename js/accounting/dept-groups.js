/* ======================================================
   dept-groups.js — เมนู "กลุ่มแผนก" (pages/dept-groups.html)
   - สร้าง / เปลี่ยนชื่อ / ลบ กลุ่ม · ตั้งเกณฑ์ % ของกลุ่ม (ไม่เกิน / เตือน / คิดจาก)
   - เพิ่ม / เอาออก แผนกจากกลุ่ม (ผ่านฟังก์ชัน pvt_set_department_group)
   ตาราง: department_groups + master_departments.group_code (database/16-department-groups.sql)
====================================================== */
(function () {
  "use strict";

  const ALLOW_ROLES = ["admin", "accounting", "management"];
  const EXCLUDE = ["IT_SUPPORT", "IT_SUPORT", "ACCOUNTING", "MANAGEMENT", "ADMIN", "PRINT"];

  const st = { sb: null, groups: [], depts: [] };
  const $ = (id) => document.getElementById(id);
  const up = (v) => String(v || "").trim().toUpperCase();
  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[c]);
  const num = (v, d) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };

  document.addEventListener("DOMContentLoaded", async () => {
    if (window.AUTH_GUARD?.requireLogin) {
      const p = await window.AUTH_GUARD.requireLogin(ALLOW_ROLES);
      if (!p) return;
    }
    st.sb = window.supabaseClient || window.supabase || null;
    if (!st.sb?.from) return alertBox("ไม่พบการเชื่อมต่อฐานข้อมูล");

    const role = String(localStorage.getItem("activeRole") || "").toLowerCase();
    $("lbl-active-user").textContent = localStorage.getItem("activeName") || localStorage.getItem("activeUser") || "ผู้ใช้งาน";
    $("lbl-active-role").textContent = { admin: "ผู้ดูแลระบบ", accounting: "ฝ่ายบัญชี", management: "ผู้บริหาร" }[role] || role;

    $("btn-refresh")?.addEventListener("click", load);
    const logout = () => (window.AUTH_GUARD?.logoutAndRedirect ? AUTH_GUARD.logoutAndRedirect() : location.replace("/login.html"));
    $("btn-logout")?.addEventListener("click", logout);
    $("btn-logout-side")?.addEventListener("click", logout);
    $("form-add").addEventListener("submit", (e) => {
      e.preventDefault();
      addGroup();
    });
    $("dg-list").addEventListener("click", onClick);
    $("dg-list").addEventListener("change", onChange);
    $("dg-free").addEventListener("change", onChange);

    await load();
  });

  /* ---------- โหลด ---------- */
  async function load() {
    alertBox("");
    const g = await st.sb.from("department_groups").select("*").order("sort_order", { ascending: true }).order("name");
    if (g.error) {
      alertBox("ยังไม่ได้เพิ่มตารางกลุ่มแผนก — ให้ผู้ดูแลรันไฟล์ database/16-department-groups.sql ก่อน");
      $("dg-list").innerHTML = "";
      $("form-add").querySelectorAll("input, button").forEach((el) => (el.disabled = true));
      return;
    }
    st.groups = g.data || [];
    const d = await st.sb
      .from("master_departments")
      .select("department_code, department_name, sort_order, is_active, group_code")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (d.error) return alertBox(`โหลดแผนกไม่สำเร็จ: ${d.error.message}`);
    st.depts = (d.data || []).filter((x) => !EXCLUDE.includes(up(x.department_code)));
    render();
  }

  /* ---------- แสดงผล ---------- */
  function deptLabel(d) {
    return `${esc(d.department_name || d.department_code)} <small>${esc(up(d.department_code))}</small>`;
  }

  function moveSelect(current) {
    return `<select class="dg-move" aria-label="ย้ายไปกลุ่ม">
      <option value="">${current ? "เอาออกจากกลุ่ม" : "เพิ่มเข้ากลุ่ม…"}</option>
      ${st.groups.filter((g) => g.code !== current).map((g) => `<option value="${esc(g.code)}">${current ? "ย้ายไป " : ""}${esc(g.name)}</option>`).join("")}
    </select>`;
  }

  function render() {
    const free = st.depts.filter((d) => !d.group_code || !st.groups.some((g) => g.code === d.group_code));

    $("dg-list").innerHTML = st.groups.length
      ? st.groups
          .map((g) => {
            const members = st.depts.filter((d) => d.group_code === g.code);
            return `<section class="rv-card dg-card" data-code="${esc(g.code)}">
              <header class="dg-head">
                <input class="dg-name" value="${esc(g.name)}" data-orig="${esc(g.name)}" maxlength="80" aria-label="ชื่อกลุ่ม" />
                <span class="dg-count">${members.length} แผนก</span>
                <button type="button" class="btn-icon-danger" data-act="delete">ลบกลุ่ม</button>
              </header>
              <div class="dg-std">
                <label>เกณฑ์ไม่เกิน <span class="dg-pct"><input type="number" step="0.01" min="0" max="100" data-field="max_waste_percent" value="${num(g.max_waste_percent, 2)}" /> %</span></label>
                <label>ค่าเตือน <span class="dg-pct"><input type="number" step="0.01" min="0" max="100" data-field="warning_percent" value="${num(g.warning_percent, 1.5)}" /> %</span></label>
                <label>คิดจาก
                  <select data-field="threshold_basis">
                    <option value="total" ${g.threshold_basis !== "production" ? "selected" : ""}>ของเสียทั้งหมด</option>
                    <option value="production" ${g.threshold_basis === "production" ? "selected" : ""}>เฉพาะสูญเสียจากการผลิต</option>
                  </select>
                </label>
                <small class="muted">ต่อเดือน · ใช้กับแถว "รวมทั้งกลุ่ม"</small>
              </div>
              <div class="dg-members">
                ${
                  members.length
                    ? members.map((d) => `<div class="dg-member" data-dept="${esc(up(d.department_code))}"><span>${deptLabel(d)}</span>${moveSelect(g.code)}</div>`).join("")
                    : `<p class="ls-muted">ยังไม่มีแผนก — เพิ่มจาก "แผนกที่ยังไม่อยู่กลุ่ม" ด้านล่าง</p>`
                }
              </div>
            </section>`;
          })
          .join("")
      : `<p class="ls-empty">ยังไม่มีกลุ่ม — สร้างกลุ่มแรกจากช่องด้านบน</p>`;

    $("dg-free").innerHTML = free.length
      ? free.map((d) => `<div class="dg-member" data-dept="${esc(up(d.department_code))}"><span>${deptLabel(d)}</span>${st.groups.length ? moveSelect("") : ""}</div>`).join("")
      : `<span class="ls-muted">ทุกแผนกอยู่ในกลุ่มแล้ว</span>`;
  }

  /* ---------- แก้ไข ---------- */
  async function addGroup() {
    const name = $("new-name").value.trim().replace(/\s+/g, " ");
    if (!name) return;
    if (st.groups.some((g) => g.name === name)) return toast(`มีกลุ่ม "${name}" แล้ว`, "error");
    const code = `G${Date.now().toString(36).toUpperCase()}`;
    const sort = st.groups.reduce((m, g) => Math.max(m, Number(g.sort_order) || 0), 0) + 1;
    const { error } = await st.sb.from("department_groups").insert({ code, name, sort_order: sort });
    if (error) return fail("สร้างกลุ่มไม่สำเร็จ", error);
    $("new-name").value = "";
    toast(`สร้าง "${name}" แล้ว — เลือกแผนกเข้ากลุ่มได้เลย`, "success");
    await load();
  }

  async function onClick(e) {
    const btn = e.target.closest('[data-act="delete"]');
    if (!btn) return;
    const card = btn.closest(".dg-card");
    const g = st.groups.find((x) => x.code === card.dataset.code);
    if (!g || !confirm(`ลบ "${g.name}"?\n\nแผนกในกลุ่มจะกลับเป็น "ไม่อยู่กลุ่ม" (ข้อมูลไม่หาย)`)) return;
    const { error } = await st.sb.from("department_groups").delete().eq("code", g.code);
    if (error) return fail("ลบกลุ่มไม่สำเร็จ", error);
    toast(`ลบ "${g.name}" แล้ว`, "success");
    await load();
  }

  async function onChange(e) {
    const el = e.target;

    // ย้ายแผนก
    if (el.matches(".dg-move")) {
      const dept = el.closest(".dg-member").dataset.dept;
      const target = el.value;
      const inGroup = el.closest(".dg-card");
      if (!target && !inGroup) return;
      const { error } = await st.sb.rpc("pvt_set_department_group", { p_dept: dept, p_group: target || null });
      if (error) return fail("ย้ายแผนกไม่สำเร็จ", error);
      const gName = st.groups.find((g) => g.code === target)?.name;
      toast(target ? `ย้าย ${dept} เข้า "${gName}" แล้ว` : `เอา ${dept} ออกจากกลุ่มแล้ว`, "success");
      await load();
      return;
    }

    const card = el.closest(".dg-card");
    if (!card) return;
    const code = card.dataset.code;

    // เปลี่ยนชื่อกลุ่ม
    if (el.matches(".dg-name")) {
      const name = el.value.trim().replace(/\s+/g, " ");
      if (!name || name === el.dataset.orig) {
        el.value = el.dataset.orig;
        return;
      }
      const { error } = await st.sb.from("department_groups").update({ name, updated_at: new Date().toISOString() }).eq("code", code);
      if (error) {
        el.value = el.dataset.orig;
        return fail("เปลี่ยนชื่อไม่สำเร็จ", error);
      }
      el.dataset.orig = name;
      toast("เปลี่ยนชื่อกลุ่มแล้ว", "success");
      return;
    }

    // เกณฑ์ของกลุ่ม
    if (el.dataset.field) {
      const max = num(card.querySelector('[data-field="max_waste_percent"]').value, 0);
      const warn = num(card.querySelector('[data-field="warning_percent"]').value, 0);
      if (warn > max) return toast("ค่าเตือนต้องไม่มากกว่าเกณฑ์ไม่เกิน", "error");
      const patch = {
        max_waste_percent: max,
        warning_percent: warn,
        threshold_basis: card.querySelector('[data-field="threshold_basis"]').value,
        updated_at: new Date().toISOString(),
      };
      const { error } = await st.sb.from("department_groups").update(patch).eq("code", code);
      if (error) return fail("บันทึกเกณฑ์ไม่สำเร็จ", error);
      toast("บันทึกเกณฑ์ของกลุ่มแล้ว", "success");
    }
  }

  /* ---------- ตัวช่วย ---------- */
  function alertBox(msg) {
    const el = $("alert-box");
    el.textContent = msg;
    el.hidden = !msg;
  }
  function fail(prefix, err) {
    console.error(err);
    const msg = String(err?.message || err || "");
    toast(`${prefix}${/permission|policy|สิทธิ์/i.test(msg) ? " (บัญชีนี้ไม่มีสิทธิ์)" : ""}: ${msg}`, "error");
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
