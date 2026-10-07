-- =====================================================
-- EA Factory / 09-accounting-controls.sql
-- รันต่อจาก 07-ensure-app-schema.sql (รันซ้ำได้ปลอดภัย ไม่ลบข้อมูล)
--
--  1) master_machines / master_problems : เพิ่ม department_code (คำนวณจาก department อัตโนมัติ)
--     → แก้ error 400 "column department_code does not exist" ที่เกิดทุกครั้งที่โหลดฟอร์ม
--     → ฟอร์มหน้างานดึงเครื่อง/ปัญหาของแผนกได้ถูกต้อง (เดิมหาไม่เจอเพราะตัวพิมพ์เล็ก/ใหญ่ไม่ตรง)
--  2) ประวัติการแก้น้ำหนักผลิต (accounting_production_log)
--     → ฐานข้อมูลบันทึกให้อัตโนมัติทุกครั้งที่ production_kg เปลี่ยน แก้ไข/ลบประวัติไม่ได้
--  3) ปิดงวดบัญชีรายเดือน (accounting_period_locks)
--     → เดือนที่ปิดแล้ว ห้ามเพิ่ม/แก้/ลบ รายงานของเสีย รายการปัญหา และสถานะเครื่อง
--       (บังคับที่ฐานข้อมูล ไม่ใช่แค่ซ่อนปุ่มบนหน้าเว็บ)
--     → เปิด/ปิดงวดได้เฉพาะ role accounting และ admin
-- =====================================================

-- -----------------------------------------------------
-- 0) ฟังก์ชันช่วย: role / ชื่อ ของผู้ใช้ที่ login อยู่
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.pvt_current_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(trim(role)) FROM public.profiles WHERE id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.pvt_current_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(display_name, ''), NULLIF(full_name, ''), username)
  FROM public.profiles WHERE id = auth.uid() LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.pvt_current_role() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pvt_current_name() TO anon, authenticated;

-- -----------------------------------------------------
-- 1) department_code ของเครื่องจักร / ปัญหา
--    คอลัมน์คำนวณ (generated) จาก department เช่น 'blow' → 'BLOW', 'cut punch' → 'CUT_PUNCH'
--    ไม่ต้องแก้โค้ดเดิมที่บันทึกลง department และข้อมูลจะตรงกันเสมอ
-- -----------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['master_machines', 'master_problems'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t)
       AND NOT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = t AND column_name = 'department_code'
       ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN department_code text
           GENERATED ALWAYS AS (upper(regexp_replace(btrim(department), ''[\s-]+'', ''_'', ''g''))) STORED',
        t
      );
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (department_code)', t || '_department_code_idx', t);
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------
-- 2) ประวัติการแก้น้ำหนักผลิต
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_production_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_at       timestamptz NOT NULL DEFAULT now(),
  changed_by       uuid,
  changed_by_name  text,
  source_table     text NOT NULL,
  source_id        uuid NOT NULL,
  work_date        date,
  department_code  text,
  machine_no       text,
  old_production   numeric,
  new_production   numeric
);

CREATE INDEX IF NOT EXISTS accounting_production_log_lookup_idx
  ON public.accounting_production_log (work_date, department_code, machine_no, changed_at DESC);

ALTER TABLE public.accounting_production_log ENABLE ROW LEVEL SECURITY;

-- อ่านได้เฉพาะผู้ที่ login (เขียนผ่าน trigger เท่านั้น — ไม่มี policy insert/update/delete)
DROP POLICY IF EXISTS accounting_production_log_select ON public.accounting_production_log;
CREATE POLICY accounting_production_log_select
  ON public.accounting_production_log FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.pvt_log_production_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date date;
BEGIN
  IF NEW.production_kg IS NOT DISTINCT FROM OLD.production_kg THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'daily_machine_status' THEN
    v_date := NEW.work_date;
  ELSE
    v_date := NEW.report_date;
  END IF;

  INSERT INTO public.accounting_production_log (
    changed_by, changed_by_name, source_table, source_id,
    work_date, department_code, machine_no, old_production, new_production
  ) VALUES (
    auth.uid(), public.pvt_current_name(), TG_TABLE_NAME, NEW.id,
    v_date, upper(NEW.department_code), NEW.machine_no, OLD.production_kg, NEW.production_kg
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_log_production_reports ON public.daily_waste_reports;
CREATE TRIGGER trg_log_production_reports
  AFTER UPDATE OF production_kg ON public.daily_waste_reports
  FOR EACH ROW EXECUTE FUNCTION public.pvt_log_production_change();

DROP TRIGGER IF EXISTS trg_log_production_machine ON public.daily_machine_status;
CREATE TRIGGER trg_log_production_machine
  AFTER UPDATE OF production_kg ON public.daily_machine_status
  FOR EACH ROW EXECUTE FUNCTION public.pvt_log_production_change();

-- -----------------------------------------------------
-- 3) ปิดงวดบัญชีรายเดือน
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounting_period_locks (
  period          text PRIMARY KEY CHECK (period ~ '^[0-9]{4}-[0-9]{2}$'),  -- 'YYYY-MM' (ค.ศ.)
  locked_by       uuid DEFAULT auth.uid(),
  locked_by_name  text DEFAULT public.pvt_current_name(),
  locked_at       timestamptz NOT NULL DEFAULT now(),
  note            text
);

-- ประวัติการปิด/เปิดงวด
CREATE TABLE IF NOT EXISTS public.accounting_period_lock_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period     text NOT NULL,
  action     text NOT NULL,           -- 'lock' | 'unlock'
  by_user    uuid,
  by_name    text,
  at         timestamptz NOT NULL DEFAULT now(),
  note       text
);

ALTER TABLE public.accounting_period_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_period_lock_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accounting_period_locks_select ON public.accounting_period_locks;
CREATE POLICY accounting_period_locks_select
  ON public.accounting_period_locks FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS accounting_period_locks_insert ON public.accounting_period_locks;
CREATE POLICY accounting_period_locks_insert
  ON public.accounting_period_locks FOR INSERT TO authenticated
  WITH CHECK (public.pvt_current_role() IN ('accounting', 'admin'));

DROP POLICY IF EXISTS accounting_period_locks_delete ON public.accounting_period_locks;
CREATE POLICY accounting_period_locks_delete
  ON public.accounting_period_locks FOR DELETE TO authenticated
  USING (public.pvt_current_role() IN ('accounting', 'admin'));

DROP POLICY IF EXISTS accounting_period_lock_events_select ON public.accounting_period_lock_events;
CREATE POLICY accounting_period_lock_events_select
  ON public.accounting_period_lock_events FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.pvt_log_lock_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.accounting_period_lock_events (period, action, by_user, by_name, note)
  VALUES (
    COALESCE(NEW.period, OLD.period),
    CASE WHEN TG_OP = 'INSERT' THEN 'lock' ELSE 'unlock' END,
    auth.uid(), public.pvt_current_name(),
    CASE WHEN TG_OP = 'INSERT' THEN NEW.note ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_period_lock_events ON public.accounting_period_locks;
CREATE TRIGGER trg_period_lock_events
  AFTER INSERT OR DELETE ON public.accounting_period_locks
  FOR EACH ROW EXECUTE FUNCTION public.pvt_log_lock_event();

-- ตรวจว่าวันที่อยู่ในงวดที่ปิดแล้วหรือไม่
CREATE OR REPLACE FUNCTION public.pvt_is_period_locked(p_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_date IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.accounting_period_locks WHERE period = to_char(p_date, 'YYYY-MM')
  )
$$;

GRANT EXECUTE ON FUNCTION public.pvt_is_period_locked(date) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.pvt_block_locked_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d_new date;
  d_old date;
BEGIN
  IF TG_TABLE_NAME = 'daily_waste_report_items' THEN
    IF TG_OP <> 'DELETE' THEN
      SELECT report_date INTO d_new FROM public.daily_waste_reports WHERE id = NEW.report_id;
    END IF;
    IF TG_OP <> 'INSERT' THEN
      SELECT report_date INTO d_old FROM public.daily_waste_reports WHERE id = OLD.report_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'daily_machine_status' THEN
    IF TG_OP <> 'DELETE' THEN d_new := NEW.work_date; END IF;
    IF TG_OP <> 'INSERT' THEN d_old := OLD.work_date; END IF;
  ELSE
    IF TG_OP <> 'DELETE' THEN d_new := NEW.report_date; END IF;
    IF TG_OP <> 'INSERT' THEN d_old := OLD.report_date; END IF;
  END IF;

  IF public.pvt_is_period_locked(d_new) OR public.pvt_is_period_locked(d_old) THEN
    RAISE EXCEPTION 'PERIOD_LOCKED: งวด % ปิดบัญชีแล้ว แก้ไขข้อมูลไม่ได้ (ติดต่อฝ่ายบัญชีให้เปิดงวดก่อน)',
      to_char(COALESCE(d_new, d_old), 'YYYY-MM')
      USING ERRCODE = 'P0001';
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_block_locked_reports ON public.daily_waste_reports;
CREATE TRIGGER trg_block_locked_reports
  BEFORE INSERT OR UPDATE OR DELETE ON public.daily_waste_reports
  FOR EACH ROW EXECUTE FUNCTION public.pvt_block_locked_period();

DROP TRIGGER IF EXISTS trg_block_locked_items ON public.daily_waste_report_items;
CREATE TRIGGER trg_block_locked_items
  BEFORE INSERT OR UPDATE OR DELETE ON public.daily_waste_report_items
  FOR EACH ROW EXECUTE FUNCTION public.pvt_block_locked_period();

DROP TRIGGER IF EXISTS trg_block_locked_machine ON public.daily_machine_status;
CREATE TRIGGER trg_block_locked_machine
  BEFORE INSERT OR UPDATE OR DELETE ON public.daily_machine_status
  FOR EACH ROW EXECUTE FUNCTION public.pvt_block_locked_period();

GRANT SELECT ON public.accounting_production_log TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.accounting_period_locks TO authenticated;
GRANT SELECT ON public.accounting_period_locks TO anon;
GRANT SELECT ON public.accounting_period_lock_events TO authenticated;

NOTIFY pgrst, 'reload schema';
