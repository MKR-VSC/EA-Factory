/* ======================================================
   offlineQueue.js — บันทึกของเสียได้แม้เน็ตหลุด
   - กดบันทึกตอนไม่มีเน็ต (หรือเน็ตหลุดระหว่างส่ง) → เก็บไว้ในเครื่องนี้ก่อน
   - เน็ตกลับมา / เปิดหน้าฟอร์มหรือหน้า Login ครั้งถัดไป → ส่งให้อัตโนมัติ
   - ส่งซ้ำได้ปลอดภัย: ใช้ id ของรายงานที่สร้างในเครื่อง ถ้าเคยส่งถึงแล้วจะไม่บันทึกซ้ำ
   - ถ้าระหว่างรอมีคนบันทึกรายการเดียวกันไปแล้ว หรือเดือนนั้นปิดงวดแล้ว
     จะไม่ส่งซ้ำ และแจ้งให้ผู้ใช้ทราบ (เก็บไว้ในรายการ "ส่งไม่ได้")
   ใช้ใน: pages/form-department.html, login.html
====================================================== */
(function () {
  "use strict";

  const QUEUE_KEY = "pvtOfflineQueue";
  const FAILED_KEY = "pvtOfflineFailed";
  const RETRY_MS = 60 * 1000;

  let flushing = false;

  /* ---------- storage ---------- */
  function read(key) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (_) {
      return [];
    }
  }

  function write(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
      return true;
    } catch (err) {
      console.error("[offlineQueue] เก็บข้อมูลในเครื่องไม่ได้:", err);
      return false;
    }
  }

  function client() {
    return window.supabaseClient || window.supabase || null;
  }

  function uuid() {
    if (window.crypto?.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  /* ---------- ตรวจชนิด error ---------- */
  function isNetworkError(err) {
    if (navigator.onLine === false) return true;
    const msg = String(err?.message || err || "");
    return /Failed to fetch|NetworkError|Load failed|network|ERR_INTERNET|ERR_NETWORK|timeout|fetch failed/i.test(msg);
  }

  function isDuplicateKey(err) {
    return err?.code === "23505" || /duplicate key/i.test(String(err?.message || ""));
  }

  function isPeriodLocked(err) {
    return /PERIOD_LOCKED/.test(String(err?.message || ""));
  }

  /* ---------- ส่ง 1 รายการ (ใช้ทั้งตอนออนไลน์ปกติและตอนส่งคิว) ---------- */
  // submission = { reportData: {...มี id แล้ว}, itemRows: [{item_no, problem_type, waste_weight_kg, detail}] }
  async function send(submission) {
    const sb = client();
    if (!sb) throw new Error("ไม่พบการเชื่อมต่อฐานข้อมูล");
    const report = submission.reportData;
    const reportId = report.id;

    const { error: rErr } = await sb.from("daily_waste_reports").insert([report]);
    // เคยส่งถึงแล้ว (เน็ตหลุดตอนรอคำตอบ) → ข้ามไปส่งรายการปัญหาต่อ
    if (rErr && !isDuplicateKey(rErr)) throw rErr;

    const { data: existing, error: eErr } = await sb
      .from("daily_waste_report_items")
      .select("item_no")
      .eq("report_id", reportId);
    if (eErr) throw eErr;

    const have = new Set((existing || []).map((x) => Number(x.item_no)));
    const rows = submission.itemRows
      .filter((it) => !have.has(Number(it.item_no)))
      .map((it) => ({ ...it, report_id: reportId }));

    if (rows.length) {
      const { error: iErr } = await sb.from("daily_waste_report_items").insert(rows);
      if (iErr) throw iErr;
    }
    return reportId;
  }

  // มีคนบันทึก "วัน/แผนก/กะ/เครื่อง/ปัญหา" เดียวกันไปแล้วหรือไม่ (ไม่นับรายงานของคิวนี้เอง)
  async function findDuplicate(submission) {
    const sb = client();
    const r = submission.reportData;
    const types = submission.itemRows.map((x) => x.problem_type).filter(Boolean);
    if (!types.length) return null;
    const { data, error } = await sb
      .from("daily_waste_report_items")
      .select("report_id, problem_type, daily_waste_reports!inner(id, report_date, department_code, work_shift, machine_no)")
      .eq("daily_waste_reports.report_date", r.report_date)
      .eq("daily_waste_reports.department_code", r.department_code)
      .eq("daily_waste_reports.work_shift", r.work_shift)
      .eq("daily_waste_reports.machine_no", r.machine_no)
      .in("problem_type", types)
      .neq("report_id", r.id)
      .limit(1);
    if (error) throw error;
    return data && data.length ? data[0] : null;
  }

  /* ---------- คิว ---------- */
  function prepare(reportData, itemRows) {
    return {
      reportData: { ...reportData, id: reportData.id || uuid() },
      itemRows: itemRows.map(({ report_id, ...rest }) => rest),
    };
  }

  function enqueue(submission) {
    const list = read(QUEUE_KEY);
    list.push({ ...submission, queuedAt: new Date().toISOString(), attempts: 0 });
    const ok = write(QUEUE_KEY, list);
    updateChip();
    return ok;
  }

  function label(sub) {
    const r = sub.reportData || {};
    return `${r.report_date || "-"} · ${r.machine_no || "-"} · ${r.work_shift || "-"}`;
  }

  async function flush({ silent = false } = {}) {
    if (flushing || navigator.onLine === false || !client()) return { sent: 0, failed: 0 };
    const list = read(QUEUE_KEY);
    if (!list.length) return { sent: 0, failed: 0 };

    flushing = true;
    updateChip("sending");
    let sent = 0;
    const keep = [];
    const failedNow = [];

    for (const sub of list) {
      try {
        const dup = await findDuplicate(sub);
        if (dup) {
          failedNow.push({ ...sub, reason: "มีผู้บันทึกรายการเดียวกันไปแล้ว (ไม่บันทึกซ้ำ)" });
          continue;
        }
        await send(sub);
        sent += 1;
      } catch (err) {
        if (isNetworkError(err)) {
          keep.push({ ...sub, attempts: (sub.attempts || 0) + 1 });
        } else if (isPeriodLocked(err)) {
          failedNow.push({ ...sub, reason: "เดือนนี้ปิดงวดบัญชีแล้ว ส่งไม่ได้" });
        } else {
          // error อื่น ๆ: เก็บไว้ลองใหม่ แต่ถ้าลองเกิน 5 ครั้งให้แจ้ง
          const attempts = (sub.attempts || 0) + 1;
          if (attempts >= 5) failedNow.push({ ...sub, reason: String(err?.message || err) });
          else keep.push({ ...sub, attempts });
        }
      }
    }

    write(QUEUE_KEY, keep);
    if (failedNow.length) write(FAILED_KEY, [...read(FAILED_KEY), ...failedNow]);
    flushing = false;
    updateChip();

    if (!silent && (sent || failedNow.length)) {
      let msg = "";
      if (sent) msg += `ส่งข้อมูลที่บันทึกไว้ตอนออฟไลน์แล้ว ${sent} รายการ`;
      if (failedNow.length) {
        msg += `${msg ? "\n\n" : ""}ส่งไม่ได้ ${failedNow.length} รายการ:\n` +
          failedNow.map((f) => `• ${label(f)} — ${f.reason}`).join("\n") +
          "\n\nกรุณาแจ้งหัวหน้างาน";
      }
      alert(msg);
    }
    return { sent, failed: failedNow.length };
  }

  /* ---------- ป้ายแจ้งจำนวนที่รอส่ง ---------- */
  function updateChip(stateText) {
    if (!document.body) return;
    const n = read(QUEUE_KEY).length;
    const failed = read(FAILED_KEY).length;
    let chip = document.getElementById("offline-queue-chip");

    if (!n && !failed) {
      chip?.remove();
      return;
    }
    if (!chip) {
      chip = document.createElement("div");
      chip.id = "offline-queue-chip";
      chip.setAttribute("role", "status");
      chip.setAttribute("aria-live", "polite");
      document.body.appendChild(chip);
    }

    const offline = navigator.onLine === false;
    chip.className = `offline-queue-chip${offline ? " is-offline" : ""}${!n && failed ? " is-failed" : ""}`;

    if (n) {
      chip.innerHTML = `
        <span class="material-symbols-outlined" aria-hidden="true">${stateText === "sending" ? "sync" : offline ? "cloud_off" : "cloud_upload"}</span>
        <span>${stateText === "sending" ? "กำลังส่ง" : "รอส่ง"} <strong>${n}</strong> รายการ${offline ? " · ไม่มีอินเทอร์เน็ต" : ""}</span>
        ${!offline && stateText !== "sending" ? `<button type="button" data-act="flush">ส่งตอนนี้</button>` : ""}`;
    } else {
      chip.innerHTML = `
        <span class="material-symbols-outlined" aria-hidden="true">error</span>
        <span>ส่งไม่ได้ <strong>${failed}</strong> รายการ</span>
        <button type="button" data-act="failed">ดูรายการ</button>`;
    }

    chip.querySelector('[data-act="flush"]')?.addEventListener("click", () => flush());
    chip.querySelector('[data-act="failed"]')?.addEventListener("click", showFailed);
  }

  function showFailed() {
    const list = read(FAILED_KEY);
    if (!list.length) return;
    const text = list
      .map((f) => {
        const items = (f.itemRows || []).map((i) => `${i.problem_type} ${Number(i.waste_weight_kg || 0).toFixed(2)} kg`).join(", ");
        return `• ${label(f)}\n   ${items}\n   เหตุผล: ${f.reason}`;
      })
      .join("\n\n");
    const clear = confirm(
      `รายการที่ส่งไม่ได้ (${list.length})\n\n${text}\n\nจดรายการไว้แจ้งหัวหน้างานแล้ว ต้องการล้างรายการนี้ออกจากเครื่องหรือไม่?`,
    );
    if (clear) {
      write(FAILED_KEY, []);
      updateChip();
    }
  }

  /* ---------- เริ่มทำงาน ---------- */
  function start() {
    updateChip();
    setTimeout(() => flush(), 1500);
    window.addEventListener("online", () => setTimeout(() => flush(), 800));
    window.addEventListener("offline", () => updateChip());
    setInterval(() => flush({ silent: false }), RETRY_MS);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();

  window.PVT_OFFLINE = {
    prepare,
    send,
    enqueue,
    flush,
    isNetworkError,
    isPeriodLocked,
    count: () => read(QUEUE_KEY).length,
  };
})();
