-- =====================================================
-- EA Factory / 10-machine-waste-standards.sql
-- รันต่อจาก 09-accounting-controls.sql (ใช้ฟังก์ชัน pvt_current_role / pvt_current_name)
-- รันซ้ำได้ปลอดภัย ไม่ลบข้อมูล
--
-- 1) เกณฑ์ % ของเสีย "รายเครื่อง" เก็บในฐานข้อมูล
--    (เดิมเก็บไว้แค่ในเบราว์เซอร์ของเครื่องที่ตั้งค่า เครื่องอื่นไม่เห็น และหน้าบัญชีไม่ได้ใช้)
-- 2) ค่าตั้งต้นของแผนกใหม่ = ไม่เกิน 2.00% ต่อเดือน (เตือน 1.50%)
--    *ไม่เปลี่ยนค่าของแผนกที่มีอยู่แล้ว* — ปรับได้ที่หน้า "ตั้งค่าเกณฑ์ % ของเสีย"
--
-- สูตรที่ระบบใช้ (หน้าเว็บ core/wasteFormula.js):
--   % ของเสีย = ของเสีย ÷ (ผลิตดี + ของเสีย) × 100  — ประเมินรายเดือน
-- =====================================================

CREATE TABLE IF NOT EXISTS public.machine_waste_standards (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_code    text NOT NULL,
  machine_no         text NOT NULL,
  max_waste_percent  numeric(6,2) NOT NULL CHECK (max_waste_percent > 0 AND max_waste_percent <= 100),
  warning_percent    numeric(6,2) NOT NULL CHECK (warning_percent >= 0),
  updated_by         uuid DEFAULT auth.uid(),
  updated_by_name    text DEFAULT public.pvt_current_name(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT machine_waste_standards_warn_le_max CHECK (warning_percent <= max_waste_percent)
);

CREATE UNIQUE INDEX IF NOT EXISTS machine_waste_standards_dept_machine_key
  ON public.machine_waste_standards (department_code, machine_no);

-- อัปเดตชื่อ/เวลาผู้แก้ทุกครั้ง
CREATE OR REPLACE FUNCTION public.pvt_touch_machine_std()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  NEW.updated_by_name := public.pvt_current_name();
  NEW.department_code := upper(regexp_replace(btrim(NEW.department_code), '[\s-]+', '_', 'g'));
  NEW.machine_no := upper(btrim(NEW.machine_no));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_touch_machine_std ON public.machine_waste_standards;
CREATE TRIGGER trg_touch_machine_std
  BEFORE INSERT OR UPDATE ON public.machine_waste_standards
  FOR EACH ROW EXECUTE FUNCTION public.pvt_touch_machine_std();

ALTER TABLE public.machine_waste_standards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS machine_waste_standards_select ON public.machine_waste_standards;
CREATE POLICY machine_waste_standards_select
  ON public.machine_waste_standards FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS machine_waste_standards_write ON public.machine_waste_standards;
CREATE POLICY machine_waste_standards_write
  ON public.machine_waste_standards FOR ALL TO authenticated
  USING (public.pvt_current_role() IN ('accounting', 'admin'))
  WITH CHECK (public.pvt_current_role() IN ('accounting', 'admin'));

GRANT SELECT ON public.machine_waste_standards TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.machine_waste_standards TO authenticated;

-- ค่าตั้งต้นของแผนกที่เพิ่มใหม่ = 2.00% / 1.50%
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'master_departments' AND column_name = 'max_waste_percent'
  ) THEN
    ALTER TABLE public.master_departments ALTER COLUMN max_waste_percent SET DEFAULT 2.00;
    ALTER TABLE public.master_departments ALTER COLUMN warning_percent SET DEFAULT 1.50;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- -----------------------------------------------------
-- (ไม่บังคับ) ปรับทุกแผนกเป็น 2% / 1.5% ทีเดียว — เอาเครื่องหมาย -- ออกแล้วรัน
-- -----------------------------------------------------
-- UPDATE public.master_departments SET max_waste_percent = 2.00, warning_percent = 1.50;
