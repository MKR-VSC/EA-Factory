-- =====================================================
-- EA Factory / 07-ensure-app-schema.sql
-- ตรวจให้ฐานข้อมูลมีตาราง/คอลัมน์ที่โค้ดหน้าเว็บใช้งานจริงครบ
--
-- * รันซ้ำได้ปลอดภัย (IF NOT EXISTS ทั้งหมด)
-- * ไม่ลบข้อมูล ไม่ลบ/แก้ policy เดิม — เพิ่มเฉพาะสิ่งที่ยังไม่มี
--
-- ที่มา: ไฟล์ migration ใน supabase/migrations ไม่มีตาราง
--   daily_waste_report_items, daily_machine_status
-- และไม่มีคอลัมน์ฝั่งบัญชีใน daily_waste_reports
-- แต่ form-department / supervisor-daily-review / accounting-panel
-- เรียกใช้ ถ้าขาดจะบันทึกไม่ผ่าน (column/relation does not exist)
-- =====================================================

-- -----------------------------------------------------
-- 0) profiles.password : ระบบใช้ Supabase Auth เก็บรหัสผ่านแล้ว
--    Edge Function admin-create-user ไม่ได้ส่ง password ลง profiles
--    ถ้ายังเป็น NOT NULL การ "เพิ่มผู้ใช้" จากหน้า Admin จะล้มเหลว
-- -----------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'password'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN password DROP NOT NULL;
  END IF;
END $$;

-- -----------------------------------------------------
-- 1) daily_waste_reports : คอลัมน์ที่หน้าบัญชีบันทึก
-- -----------------------------------------------------
ALTER TABLE public.daily_waste_reports
  ADD COLUMN IF NOT EXISTS production_kg          numeric,
  ADD COLUMN IF NOT EXISTS accounting_status      text,
  ADD COLUMN IF NOT EXISTS accounting_checked_by  uuid,
  ADD COLUMN IF NOT EXISTS accounting_checked_at  timestamptz;

-- -----------------------------------------------------
-- 2) daily_waste_report_items : รายการปัญหาย่อยของแต่ละรายงาน
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_waste_report_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id        uuid NOT NULL REFERENCES public.daily_waste_reports(id) ON DELETE CASCADE,
  item_no          integer,
  problem_type     text,
  waste_weight_kg  numeric DEFAULT 0,
  detail           text,
  created_at       timestamptz DEFAULT now()
);

ALTER TABLE public.daily_waste_report_items
  ADD COLUMN IF NOT EXISTS item_no          integer,
  ADD COLUMN IF NOT EXISTS problem_type     text,
  ADD COLUMN IF NOT EXISTS waste_weight_kg  numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS detail           text,
  ADD COLUMN IF NOT EXISTS created_at       timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS daily_waste_report_items_report_id_idx
  ON public.daily_waste_report_items (report_id);

-- -----------------------------------------------------
-- 3) daily_machine_status : สถานะเดินเครื่องรายวัน (หัวหน้ายืนยัน / บัญชีกรอกยอดผลิต)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_machine_status (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_date              date NOT NULL,
  department_code        text NOT NULL,
  machine_no             text NOT NULL,
  operation_status       text,
  supervisor_id          uuid,
  supervisor_name        text,
  confirmed_at           timestamptz,
  sent_accounting        boolean DEFAULT false,
  sent_at                timestamptz,
  production_kg          numeric,
  accounting_checked_by  uuid,
  accounting_checked_at  timestamptz,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

ALTER TABLE public.daily_machine_status
  ADD COLUMN IF NOT EXISTS operation_status       text,
  ADD COLUMN IF NOT EXISTS supervisor_id          uuid,
  ADD COLUMN IF NOT EXISTS supervisor_name        text,
  ADD COLUMN IF NOT EXISTS confirmed_at           timestamptz,
  ADD COLUMN IF NOT EXISTS sent_accounting        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sent_at                timestamptz,
  ADD COLUMN IF NOT EXISTS production_kg          numeric,
  ADD COLUMN IF NOT EXISTS accounting_checked_by  uuid,
  ADD COLUMN IF NOT EXISTS accounting_checked_at  timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at             timestamptz DEFAULT now();

-- upsert(..., { onConflict: "work_date,department_code,machine_no" })
-- ต้องมี unique index ชุดนี้ ไม่งั้นหัวหน้ากด "ส่งบัญชี" จะ error
-- (ถ้ามีข้อมูลซ้ำอยู่แล้ว คำสั่งนี้จะแจ้งเตือน ให้ลบแถวซ้ำก่อนแล้วรันใหม่)
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS daily_machine_status_day_machine_key
    ON public.daily_machine_status (work_date, department_code, machine_no);
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'daily_machine_status มีข้อมูลซ้ำ (work_date, department_code, machine_no) — ลบแถวซ้ำก่อนแล้วรันไฟล์นี้อีกครั้ง';
END $$;

-- -----------------------------------------------------
-- 4) RLS : เปิดใช้ และเพิ่ม policy เฉพาะเมื่อยังไม่มี policy ใด ๆ บนตารางนั้น
--    (ไม่แตะ policy ที่ตั้งไว้แล้วในฐานข้อมูลจริง)
--    ใช้ anon ด้วย เพราะหน้าฟอร์ม QR ทำงานแบบไม่ login (ตาม docs/README.md)
-- -----------------------------------------------------
ALTER TABLE public.daily_waste_report_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_machine_status     ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['daily_waste_report_items', 'daily_machine_status'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)', t || '_select_all', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (true)', t || '_insert_all', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true)', t || '_update_all', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (true)', t || '_delete_auth', t);
    END IF;
  END LOOP;
END $$;

-- ให้ PostgREST โหลด schema ใหม่ทันที
NOTIFY pgrst, 'reload schema';
