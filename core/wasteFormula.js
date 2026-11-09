/* ======================================================
   wasteFormula.js — สูตร % ของเสีย ที่ใช้ร่วมกันทั้งระบบ
   (หน้าบัญชี, Dashboard ผู้บริหาร, Dashboard หัวหน้างาน, ตั้งค่าเกณฑ์)

   นิยาม
   - "น้ำหนักผลิต" ที่ฝ่ายบัญชีกรอก = ยอดผลิตดี (ไม่รวมของเสีย)
   - % ของเสีย = ของเสีย ÷ (ผลิตดี + ของเสีย) × 100
   - เก็บข้อมูลทุกวัน แต่ "ประเมินผ่าน/เกิน" เป็นรายเดือน:
       ของเสียทั้งเดือน ÷ (ผลิตดีทั้งเดือน + ของเสียทั้งเดือน) × 100
     (รวมยอดก่อนแล้วค่อยหาร ไม่ใช่เอา % รายวันมาเฉลี่ย)
   - คิดเฉพาะรายการที่บัญชีกรอกยอดผลิตแล้ว (ยังไม่กรอก = ยังไม่นำมาคิด)
   - เกณฑ์ตั้งต้นของโรงงาน: ไม่เกิน 2.00% ต่อเดือน, เตือนที่ 1.50%
   - ของเสีย 2 ประเภท (ตามใบรายงานการผลิต): สูญเสียจากการผลิต / สูญเสียบังคับ
       % แต่ละประเภท = ของเสียประเภทนั้น ÷ (ผลิตดี + ของเสียทั้งหมด) × 100
       → % การผลิต + % บังคับ = % รวม
     แต่ละแผนกเลือกได้ว่าเกณฑ์คิดจาก "ของเสียทั้งหมด" (total) หรือ "เฉพาะการผลิต" (production)
====================================================== */
(function () {
  "use strict";

  const DEFAULT_LIMIT = 2.0;
  const DEFAULT_WARNING = 1.5;

  const toNum = (v) => {
    const n = Number(String(v ?? "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  /** % ของเสีย จากของเสีย (kg) และยอดผลิตดี (kg) — คืน null ถ้ายังไม่มียอดผลิต */
  function percent(waste, goodOutput) {
    const w = toNum(waste);
    const g = toNum(goodOutput);
    if (g <= 0) return null;
    return (w / (g + w)) * 100;
  }

  /** เกณฑ์ที่ใช้จริง (ค่าที่ตั้งไว้ หรือค่าตั้งต้น 2% / 1.5%) */
  function standard(std) {
    const max = toNum(std?.max ?? std?.max_waste_percent) || DEFAULT_LIMIT;
    let warning = toNum(std?.warning ?? std?.warning_percent);
    if (!warning || warning > max) warning = Math.min(DEFAULT_WARNING, max);
    return { max, warning };
  }

  /**
   * ประเมินผลรายเดือน
   * คืน { level: 'none'|'pass'|'warn'|'over', label, className, pct, max, warning }
   */
  function evaluate(pct, std) {
    const { max, warning } = standard(std);
    if (pct === null || pct === undefined || !Number.isFinite(pct)) {
      return { level: "none", label: "รอน้ำหนักผลิต", className: "result-none", pct: null, max, warning };
    }
    if (pct > max) {
      return { level: "over", label: `เกินเกณฑ์ ${max.toFixed(2)}%`, className: "result-danger", pct, max, warning };
    }
    if (pct >= warning) {
      return { level: "warn", label: "ใกล้เกณฑ์", className: "result-warning", pct, max, warning };
    }
    return { level: "pass", label: "ผ่าน", className: "result-success", pct, max, warning };
  }

  /**
   * รวมยอดหลายรายการ (เช่น ทุกวันในเดือน) แล้วคิด % ครั้งเดียว
   * rows: [{ waste, production, forced? }]
   *   production = ยอดผลิตดีที่บัญชีกรอก (0/ว่าง = ยังไม่กรอก)
   *   forced     = ส่วนของ waste ที่เป็น "สูญเสียบังคับ" (kg)
   */
  function aggregate(rows) {
    let waste = 0;
    let wasteCounted = 0;
    let forced = 0;
    let forcedCounted = 0;
    let good = 0;
    let count = 0;
    let withProduction = 0;
    (rows || []).forEach((r) => {
      const w = toNum(r.waste);
      const f = Math.min(toNum(r.forced), w);
      const g = toNum(r.production);
      waste += w;
      forced += f;
      count += 1;
      if (g > 0) {
        good += g;
        wasteCounted += w;
        forcedCounted += f;
        withProduction += 1;
      }
    });
    const base = good > 0 ? good + wasteCounted : 0;
    const share = (kg) => (base > 0 ? (kg / base) * 100 : null);
    return {
      waste, // ของเสียทั้งหมด (รวมรายการที่ยังไม่กรอกผลิต)
      wasteCounted, // ของเสียเฉพาะรายการที่กรอกผลิตแล้ว (ใช้คิด %)
      forced, // สูญเสียบังคับ (kg)
      lossProduction: waste - forced, // สูญเสียจากการผลิต (kg)
      good, // ผลิตดีรวม
      count,
      withProduction,
      complete: count > 0 && withProduction === count,
      pct: percent(wasteCounted, good),
      pctForced: share(forcedCounted),
      pctProduction: share(wasteCounted - forcedCounted),
    };
  }

  /** % ที่ใช้ประเมินตามเกณฑ์ของแผนก: basis = 'production' → เฉพาะการผลิต, อื่น ๆ → รวม */
  function basisPct(agg, basis) {
    if (!agg) return null;
    return basis === "production" ? agg.pctProduction : agg.pct;
  }

  const BASIS_LABEL = { total: "ของเสียทั้งหมด", production: "เฉพาะสูญเสียจากการผลิต" };

  window.WASTE_FORMULA = {
    DEFAULT_LIMIT,
    DEFAULT_WARNING,
    percent,
    standard,
    evaluate,
    aggregate,
    basisPct,
    BASIS_LABEL,
    description: "% ของเสีย = ของเสีย ÷ (ผลิตดี + ของเสีย) × 100 · ประเมินรายเดือน",
  };
})();
