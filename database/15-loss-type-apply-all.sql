-- =====================================================
-- EA Factory / 15-loss-type-apply-all.sql
-- เปลี่ยน "ประเภทของเสีย" ของอาการ → มีผลกับข้อมูลทั้งหมด (รวมข้อมูลเก่า)
-- รันหลัง 12-loss-types.sql · รันซ้ำได้
--
-- หลังรันไฟล์นี้
--  * กดเปลี่ยน การผลิต / บังคับ ที่เมนู "อาการเสีย & ประเภท"
--    → ทุกรายการของอาการนั้น (แผนกเดียวกัน) เปลี่ยนตามทันที ทั้งเก่าและใหม่
--  * ยกเว้น 2 กรณี (ไม่เปลี่ยนให้)
--      1) งวดที่ปิดบัญชีแล้ว (ไฟล์ 09) — ตัวเลขที่ปิดงวดไปแล้วต้องคงเดิม
--      2) รายการที่หัวหน้าเลือกประเภทเองในหน้าตรวจสอบรายวัน (เช่น "อื่นๆ")
--  * ท้ายไฟล์ปรับข้อมูลที่มีอยู่ตอนนี้ให้ตรงกับที่ตั้งไว้ในเมนูแล้วด้วย
-- =====================================================

BEGIN;

-- -----------------------------------------------------
-- 0) ฟังก์ชันเช็กสิทธิ์ (มีในไฟล์ 11 / 12 — ถ้ายังไม่มีให้สร้าง)
-- -----------------------------------------------------
DO $$
DECLARE
  owner_check text := '';
BEGIN
  IF to_regprocedure('public.pvt_has_role(text[])') IS NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'is_system_owner') THEN
      owner_check := ' OR (p.is_system_owner IS TRUE AND ''admin'' = ANY (p_roles))';
    END IF;
    EXECUTE $f$
      CREATE FUNCTION public.pvt_has_role(p_roles text[])
      RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
      AS $b$
        SELECT EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND lower(coalesce(nullif(trim(p.status), ''), 'active')) = 'active'
            AND (lower(trim(p.role)) = ANY (p_roles)$f$ || owner_check || $f$)
        )
      $b$ $f$;
    REVOKE ALL ON FUNCTION public.pvt_has_role(text[]) FROM public;
    GRANT EXECUTE ON FUNCTION public.pvt_has_role(text[]) TO anon, authenticated;
  END IF;
END $$;

-- -----------------------------------------------------
-- 1) จำว่ารายการไหนหัวหน้าเลือกประเภทเอง
-- -----------------------------------------------------
ALTER TABLE public.daily_waste_report_items
  ADD COLUMN IF NOT EXISTS loss_type_manual boolean NOT NULL DEFAULT false;

-- trigger เดิมของไฟล์ 12 + ทำเครื่องหมาย "เลือกเอง"
CREATE OR REPLACE FUNCTION public.pvt_items_set_loss_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.loss_type IS NULL THEN
      NEW.loss_type := public.pvt_problem_loss_type(NEW.report_id, NEW.problem_type);
    END IF;
  ELSIF NEW.problem_type IS DISTINCT FROM OLD.problem_type
        AND NEW.loss_type IS NOT DISTINCT FROM OLD.loss_type THEN
    -- เปลี่ยนอาการ แต่ไม่ได้ระบุประเภทเอง → ใช้ประเภทของอาการใหม่
    NEW.loss_type := public.pvt_problem_loss_type(NEW.report_id, NEW.problem_type);
    NEW.loss_type_manual := false;
  ELSIF NEW.loss_type IS DISTINCT FROM OLD.loss_type
        AND coalesce(current_setting('pvt.reclass', true), '') <> 'on' THEN
    -- มีคนเลือกประเภทให้รายการนี้เอง (หน้าตรวจสอบรายวัน)
    NEW.loss_type_manual := true;
  END IF;
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------
-- 2) ปรับประเภทของรายการตามที่ตั้งไว้ของอาการ
--    p_dept / p_problem ว่าง = ทุกแผนก / ทุกอาการ · คืนจำนวนรายการที่เปลี่ยน
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.pvt_reclassify_loss_types(p_dept text DEFAULT NULL, p_problem text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
  lock_clause text := '';
BEGIN
  -- เรียกจากหน้าเว็บได้เฉพาะ admin / บัญชี / ผู้บริหาร (SQL Editor และ trigger ผ่านเสมอ)
  IF auth.uid() IS NOT NULL AND NOT public.pvt_has_role(ARRAY['admin', 'accounting', 'management']) THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์ปรับประเภทของเสีย';
  END IF;

  IF to_regclass('public.accounting_period_locks') IS NOT NULL THEN
    lock_clause := ' AND NOT EXISTS (SELECT 1 FROM public.accounting_period_locks l
                                     WHERE l.period = to_char(r.report_date, ''YYYY-MM''))';
  END IF;

  PERFORM set_config('pvt.reclass', 'on', true);
  EXECUTE format($q$
    WITH target AS (
      SELECT i.id,
             (SELECT x.loss_type
              FROM public.master_problems x
              WHERE upper(regexp_replace(btrim(x.department), '[\s-]+', '_', 'g')) = upper(r.department_code)
                AND btrim(x.problem_type) = btrim(i.problem_type)
              ORDER BY x.is_active DESC NULLS LAST, x.id
              LIMIT 1) AS lt
      FROM public.daily_waste_report_items i
      JOIN public.daily_waste_reports r ON r.id = i.report_id
      WHERE NOT i.loss_type_manual
        AND ($1::text IS NULL OR upper(r.department_code) = upper($1))
        AND ($2::text IS NULL OR btrim(i.problem_type) = btrim($2))
        %s
    )
    UPDATE public.daily_waste_report_items i
    SET loss_type = target.lt
    FROM target
    WHERE i.id = target.id
      AND target.lt IS NOT NULL
      AND i.loss_type IS DISTINCT FROM target.lt
  $q$, lock_clause) USING p_dept, p_problem;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('pvt.reclass', 'off', true);
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.pvt_reclassify_loss_types(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.pvt_reclassify_loss_types(text, text) TO authenticated;

-- -----------------------------------------------------
-- 3) เปลี่ยนประเภทของอาการ → ปรับข้อมูลทั้งหมดของอาการนั้นทันที
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.pvt_problems_apply_loss_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.loss_type IS DISTINCT FROM OLD.loss_type THEN
    PERFORM public.pvt_reclassify_loss_types(
      upper(regexp_replace(btrim(NEW.department), '[\s-]+', '_', 'g')),
      NEW.problem_type
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_problems_apply_loss_type ON public.master_problems;
CREATE TRIGGER trg_problems_apply_loss_type
  AFTER UPDATE OF loss_type ON public.master_problems
  FOR EACH ROW EXECUTE FUNCTION public.pvt_problems_apply_loss_type();

COMMIT;

-- -----------------------------------------------------
-- 4) ปรับข้อมูลที่มีอยู่ตอนนี้ให้ตรงกับที่ตั้งไว้ในเมนูแล้ว (ครั้งเดียว)
-- -----------------------------------------------------
SELECT public.pvt_reclassify_loss_types() AS "จำนวนรายการที่ปรับประเภท";
