-- =====================================================
-- EA Factory / 12-loss-types.sql
-- แยกของเสียเป็น 2 ประเภท ตามใบ "รายงานการผลิตสินค้าสำเร็จรูปและน้ำหนักงานสูญเสีย"
--   production = สูญเสียจากการผลิต   (เช่น ทะลุ, ตกใบมีด, น้ำหนักไม่ถึง)
--   forced     = สูญเสียบังคับ         (เช่น เปลี่ยนไซร้, เดินเครื่องใหม่, ไฟดับ)
-- รันซ้ำได้ · ไม่ต้องพึ่งไฟล์ 09 / 11 (ถ้ายังไม่ได้รันก็ใช้ได้)
--
-- หลักการ
--  * ประเภทกำหนดที่ "อาการ" (master_problems.loss_type) — ตั้งค่า/เปลี่ยนได้ที่เมนู
--    "อาการเสีย & ประเภท" (หน้าตั้งค่าเกณฑ์) โดยเจ้านาย/บัญชี/admin
--  * ทุกรายการของเสีย (daily_waste_report_items.loss_type) เก็บประเภท "ณ ตอนบันทึก"
--    ไว้ด้วย trigger อัตโนมัติ → ถ้าภายหลังเปลี่ยนประเภทของอาการ รายงานเดือนที่ผ่านมาไม่ขยับ
--    (หัวหน้าเปลี่ยนประเภทรายรายการได้ที่หน้าตรวจสอบรายวัน เช่น กรณี "อื่นๆ")
--  * แต่ละแผนกเลือกได้ว่าเกณฑ์ % คิดจากอะไร (master_departments.threshold_basis)
--      total      = ของเสียทั้งหมด (การผลิต + บังคับ)  ← ค่าเริ่มต้น เหมือนระบบเดิม
--      production = เฉพาะสูญเสียจากการผลิต
-- =====================================================

BEGIN;

-- -----------------------------------------------------
-- 0) ฟังก์ชันเช็กสิทธิ์ (มีในไฟล์ 11 — ถ้ายังไม่ได้รัน 11 ให้สร้างไว้ก่อน)
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
-- 1) ประเภทของอาการ
-- -----------------------------------------------------
ALTER TABLE public.master_problems
  ADD COLUMN IF NOT EXISTS loss_type text NOT NULL DEFAULT 'production';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_problems_loss_type_chk') THEN
    ALTER TABLE public.master_problems
      ADD CONSTRAINT master_problems_loss_type_chk CHECK (loss_type IN ('production', 'forced'));
  END IF;
END $$;

-- -----------------------------------------------------
-- 2) ประเภท ณ ตอนบันทึก ของแต่ละรายการของเสีย
-- -----------------------------------------------------
ALTER TABLE public.daily_waste_report_items
  ADD COLUMN IF NOT EXISTS loss_type text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dwri_loss_type_chk') THEN
    ALTER TABLE public.daily_waste_report_items
      ADD CONSTRAINT dwri_loss_type_chk CHECK (loss_type IS NULL OR loss_type IN ('production', 'forced'));
  END IF;
END $$;

-- -----------------------------------------------------
-- 3) เกณฑ์ % ของแผนก คิดจากอะไร
-- -----------------------------------------------------
ALTER TABLE public.master_departments
  ADD COLUMN IF NOT EXISTS threshold_basis text NOT NULL DEFAULT 'total';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_departments_threshold_basis_chk') THEN
    ALTER TABLE public.master_departments
      ADD CONSTRAINT master_departments_threshold_basis_chk CHECK (threshold_basis IN ('total', 'production'));
  END IF;
END $$;

-- -----------------------------------------------------
-- 4) หาประเภทของอาการจากแผนกของรายงาน
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.pvt_problem_loss_type(p_report_id uuid, p_problem text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT mp.loss_type
    FROM public.daily_waste_reports r
    JOIN public.master_problems mp
      -- เทียบแผนกแบบเดียวกับคอลัมน์ department_code ของไฟล์ 09 (ไม่ต้องมีคอลัมน์นั้น)
      ON upper(regexp_replace(btrim(mp.department), '[\s-]+', '_', 'g')) = upper(r.department_code)
     AND btrim(mp.problem_type) = btrim(p_problem)
    WHERE r.id = p_report_id
    ORDER BY mp.is_active DESC NULLS LAST, mp.id
    LIMIT 1
  ), 'production');
$$;

GRANT EXECUTE ON FUNCTION public.pvt_problem_loss_type(uuid, text) TO anon, authenticated;

-- ใส่ประเภทให้อัตโนมัติ (ฟอร์มเดิม / คิวออฟไลน์ ไม่ต้องส่งค่านี้มา)
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
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_items_set_loss_type ON public.daily_waste_report_items;
CREATE TRIGGER trg_items_set_loss_type
  BEFORE INSERT OR UPDATE ON public.daily_waste_report_items
  FOR EACH ROW EXECUTE FUNCTION public.pvt_items_set_loss_type();

-- -----------------------------------------------------
-- 5) ข้อมูลที่มีอยู่แล้ว: ใส่ประเภทตามที่ตั้งไว้ตอนนี้ (ครั้งแรก = การผลิตทั้งหมด)
-- -----------------------------------------------------
--    (ปิด trigger ชั่วคราว เพื่อไม่ให้ติดล็อกงวดบัญชีของไฟล์ 09 — แค่เติมประเภท ไม่แก้ตัวเลข)
ALTER TABLE public.daily_waste_report_items DISABLE TRIGGER USER;
UPDATE public.daily_waste_report_items i
SET loss_type = public.pvt_problem_loss_type(i.report_id, i.problem_type)
WHERE i.loss_type IS NULL;
ALTER TABLE public.daily_waste_report_items ENABLE TRIGGER USER;

-- -----------------------------------------------------
-- 6) ผู้บริหาร (management) จัดการอาการ/ประเภทได้ด้วย (เดิมเฉพาะ admin / accounting)
-- -----------------------------------------------------
DROP POLICY IF EXISTS master_problems_write_management ON public.master_problems;
CREATE POLICY master_problems_write_management ON public.master_problems
  FOR ALL TO authenticated
  USING (public.pvt_has_role(ARRAY['management']))
  WITH CHECK (public.pvt_has_role(ARRAY['management']));

CREATE INDEX IF NOT EXISTS dwri_report_loss_type_idx
  ON public.daily_waste_report_items (report_id, loss_type);

COMMIT;

-- =====================================================
-- (ใช้ครั้งเดียวตอนตั้งระบบ) หลังเจ้านายกำหนดประเภทของอาการครบแล้ว
-- ถ้าต้องการให้ "ข้อมูลเก่า" ใช้ประเภทใหม่ด้วย ให้แก้วันที่แล้วรันคำสั่งนี้
-- (ไม่แตะงวดที่ปิดบัญชีแล้ว)
-- =====================================================
-- UPDATE public.daily_waste_report_items i
-- SET loss_type = public.pvt_problem_loss_type(i.report_id, i.problem_type)
-- FROM public.daily_waste_reports r
-- WHERE r.id = i.report_id
--   AND r.report_date >= DATE '2026-01-01'
--   AND NOT EXISTS (
--     SELECT 1 FROM public.accounting_period_locks l
--     WHERE l.period = to_char(r.report_date, 'YYYY-MM')
--   );

-- ตรวจผล
-- SELECT department_code, loss_type, count(*) FROM master_problems GROUP BY 1, 2 ORDER BY 1, 2;
-- SELECT loss_type, count(*), sum(waste_weight_kg) FROM daily_waste_report_items GROUP BY 1;
