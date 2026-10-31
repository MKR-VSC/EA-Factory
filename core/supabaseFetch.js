/* ======================================================
   supabaseFetch.js — ดึงข้อมูลจาก Supabase ให้ครบทุกแถว

   ทำไมต้องมี:
   - Supabase (PostgREST) ส่งกลับได้สูงสุด 1,000 แถวต่อครั้ง (ค่าเริ่มต้น)
     ถ้าข้อมูลเกิน ระบบจะ "ตัดทิ้งเงียบ ๆ" ไม่มี error → ยอดรวม/กราฟ/หน้าบัญชีขาดหาย
   - .in("report_id", [...]) ที่มี id หลายร้อยตัว ทำให้ URL ยาวเกินจน request ล้มเหลว

   วิธีใช้:
     const { data, error } = await SB_FETCH.all(() =>
       client.from("daily_waste_reports").select("*").gte(...).order("report_date")
     );
     const { data, error } = await SB_FETCH.inChunks(ids, (chunk) =>
       client.from("daily_waste_report_items").select("...").in("report_id", chunk)
     );
   (build ต้องสร้าง query ใหม่ทุกครั้ง และยังไม่ใส่ .range / .limit)
====================================================== */
(function () {
  "use strict";

  const PAGE_SIZE = 1000;
  const CHUNK_SIZE = 150;
  const CONCURRENCY = 4;
  const MAX_PAGES = 200; // กันวนไม่รู้จบ (200,000 แถว)

  function dedupeById(rows) {
    const seen = new Set();
    const out = [];
    for (const row of rows) {
      const key = row && row.id !== undefined && row.id !== null ? String(row.id) : null;
      if (key) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      out.push(row);
    }
    return out;
  }

  /** ดึงทุกหน้า (ทีละ 1,000 แถว) แล้วรวมกัน — คืน { data, error } เหมือน supabase-js */
  async function all(build, { pageSize = PAGE_SIZE } = {}) {
    const rows = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const from = page * pageSize;
      const { data, error } = await build().range(from, from + pageSize - 1);
      if (error) return { data: null, error };
      const list = Array.isArray(data) ? data : [];
      rows.push(...list);
      if (list.length < pageSize) break;
    }
    return { data: dedupeById(rows), error: null };
  }

  /** แบ่ง id เป็นชุดเล็ก ๆ (กัน URL ยาวเกิน) แล้วดึงทุกชุด/ทุกหน้า */
  async function inChunks(ids, build, { chunkSize = CHUNK_SIZE } = {}) {
    const unique = Array.from(new Set((ids || []).filter((v) => v !== null && v !== undefined && v !== "")));
    if (!unique.length) return { data: [], error: null };

    // ดึงพร้อมกันครั้งละ CONCURRENCY ชุด (เดิมทีละชุด เดือนที่มีข้อมูลมากต้องรอหลายรอบ)
    const chunks = [];
    for (let i = 0; i < unique.length; i += chunkSize) chunks.push(unique.slice(i, i + chunkSize));
    const results = new Array(chunks.length);
    let next = 0;
    let failed = null;
    async function worker() {
      while (!failed && next < chunks.length) {
        const k = next++;
        const res = await all(() => build(chunks[k]));
        if (res.error) failed = res.error;
        else results[k] = res.data;
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker));
    if (failed) return { data: null, error: failed };
    return { data: dedupeById(results.flat()), error: null };
  }

  window.SB_FETCH = { all, inChunks, PAGE_SIZE };
})();
