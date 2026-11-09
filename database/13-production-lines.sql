-- =====================================================
-- EA Factory / 13-production-lines.sql
-- ยอดผลิตแยก กะ / สินค้า (สเปก) / จำนวน+หน่วย  ต่อ เครื่อง ต่อ วัน
-- ตามใบ "รายงานการผลิตสินค้าสำเร็จรูปและน้ำหนักงานสูญเสีย" ช่อง
--   "ที่ผลิต" (สเปกสินค้า) · "จำนวน / ม้วน" · "น้ำหนัก / กก."
--
-- หลักการ
--  * 1 เครื่อง 1 วัน มีได้หลายบรรทัด (หลายกะ / หลายสินค้า)
--  * ผลรวม weight_kg ของวันนั้น = "ผลิตดี" ที่ใช้คิด % (หน้าบัญชีบันทึกยอดรวมลง
--    production_kg เหมือนเดิม — รายงาน/Dashboard เดิมจึงใช้ต่อได้ทันที)
--  * ไม่บังคับใช้: เครื่องที่กรอกยอดรวมช่องเดียวแบบเดิมก็ยังได้
--  * shift ว่าง = รวมทั้งวัน (ไม่แยกกะ)
-- รันซ้ำได้ · ไม่ต้องพึ่งไฟล์ 09 / 11
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
-- 1) ตาราง
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_production_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_date        date NOT NULL,
  department_code  text NOT NULL,
  machine_no       text NOT NULL,
  shift            text,                       -- เช้า / บ่าย / ดึก · ว่าง = ทั้งวัน
  product_spec     text,                       -- เช่น ท่อดำ HD 32mm (PN6) 100m-โคลฟ้า
  qty              numeric CHECK (qty IS NULL OR qty >= 0),
  unit             text,                       -- ม้วน / ลูก / ผืน / ใบ / กก.
  weight_kg        numeric NOT NULL CHECK (weight_kg >= 0),
  note             text,
  sort_order       integer NOT NULL DEFAULT 0,
  created_by       uuid DEFAULT auth.uid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_production_lines_key_idx
  ON public.daily_production_lines (work_date, department_code, machine_no);

-- ใช้แนะนำสเปกสินค้าเดิมของเครื่อง (ไม่ต้องพิมพ์ใหม่ทุกวัน)
CREATE INDEX IF NOT EXISTS daily_production_lines_spec_idx
  ON public.daily_production_lines (department_code, machine_no, product_spec);

-- -----------------------------------------------------
-- 2) updated_at + ห้ามแก้งวดที่ปิดบัญชีแล้ว (ถ้ามีตารางปิดงวดจากไฟล์ 09)
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.pvt_production_lines_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date;
  locked boolean := false;
BEGIN
  IF to_regclass('public.accounting_period_locks') IS NOT NULL THEN
    FOREACH d IN ARRAY ARRAY[
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.work_date END,
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.work_date END
    ] LOOP
      CONTINUE WHEN d IS NULL;
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.accounting_period_locks WHERE period = $1)'
        INTO locked USING to_char(d, 'YYYY-MM');
      IF locked THEN
        RAISE EXCEPTION 'PERIOD_LOCKED: งวด % ปิดบัญชีแล้ว แก้ไขข้อมูลไม่ได้ (ติดต่อฝ่ายบัญชีให้เปิดงวดก่อน)',
          to_char(d, 'YYYY-MM') USING ERRCODE = 'P0001';
      END IF;
    END LOOP;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_production_lines_guard ON public.daily_production_lines;
CREATE TRIGGER trg_production_lines_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.daily_production_lines
  FOR EACH ROW EXECUTE FUNCTION public.pvt_production_lines_guard();

-- -----------------------------------------------------
-- 3) สิทธิ์: อ่านได้ทุกคนที่ login · บันทึกได้ admin / บัญชี / หัวหน้า / ผู้บริหาร
-- -----------------------------------------------------
ALTER TABLE public.daily_production_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dpl_select ON public.daily_production_lines;
CREATE POLICY dpl_select ON public.daily_production_lines
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS dpl_write ON public.daily_production_lines;
CREATE POLICY dpl_write ON public.daily_production_lines
  FOR ALL TO authenticated
  USING (public.pvt_has_role(ARRAY['admin', 'accounting', 'supervisor', 'management']))
  WITH CHECK (public.pvt_has_role(ARRAY['admin', 'accounting', 'supervisor', 'management']));

REVOKE ALL ON public.daily_production_lines FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_production_lines TO authenticated;

COMMIT;

-- ตรวจผล
-- SELECT work_date, department_code, machine_no, shift, product_spec, qty, unit, weight_kg
-- FROM daily_production_lines ORDER BY work_date DESC, department_code, machine_no, sort_order LIMIT 50;
