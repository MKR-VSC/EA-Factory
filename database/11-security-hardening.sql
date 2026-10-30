-- =====================================================
-- EA Factory / 11-security-hardening.sql
-- ปิดช่องโหว่สิทธิ์ฐานข้อมูล (RLS) — รันหลัง 07, 09, 10
--
-- ปัญหาที่พบใน supabase/migrations + database/04:
--   1) daily_waste_reports มี policy "Allow All for Web" (ALL, to public, using true)
--      → ใครก็ได้ที่มี anon key (อยู่ในไฟล์ JS ของเว็บ) ลบ/แก้รายงานของเสียทั้งหมดได้
--   2) profiles: "authenticated manage profiles temporary" (ALL, using true)
--      → พนักงานที่ login แล้ว เปลี่ยน role ตัวเองเป็น admin ได้
--      และ anon อ่านคอลัมน์ password (รหัสผ่านตัวอักษรเปล่า) ของทุกคนได้
--   3) master_machines / master_problems: anon insert/update ได้
--   4) user_activity_logs / system_logs: anon อ่าน log ทั้งหมดได้
--
-- หลักการหลังรันไฟล์นี้ (ระบบยังทำงานเหมือนเดิมทุกหน้า):
--   * anon (หน้าฟอร์ม QR ที่ไม่ได้ login) : อ่าน master data, อ่าน/เพิ่มรายงานสถานะ pending,
--     เพิ่มรายการปัญหาให้รายงาน pending, เพิ่ม activity log — แก้/ลบไม่ได้
--   * staff ที่ login : เหมือน anon
--   * supervisor / accounting / management / admin : แก้รายงาน, สถานะเครื่อง
--   * accounting / admin : แก้ master data
--   * admin (หรือ is_system_owner) : จัดการผู้ใช้ / สิทธิ์แผนก / QR / log
--   * คอลัมน์ profiles.password อ่านผ่าน API ไม่ได้อีก
--
-- ⚠ ไฟล์นี้ "ลบ policy เดิมทั้งหมด" ของตารางที่ระบุ แล้วสร้างชุดใหม่
--   แนะนำให้รันใน Dev ก่อน แล้วทดสอบ: Login, QR, บันทึกฟอร์ม, หัวหน้าส่งบัญชี,
--   บัญชีกรอกยอดผลิต, Admin เพิ่ม/แก้ผู้ใช้, ตั้งค่าเกณฑ์
--   ดูผลลัพธ์ด้วยคำสั่งตรวจสอบท้ายไฟล์
-- =====================================================

BEGIN;

-- -----------------------------------------------------
-- 0) ฟังก์ชันช่วยตรวจ role (อ่าน profiles ด้วยสิทธิ์เจ้าของฟังก์ชัน ไม่ติด RLS)
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.pvt_has_role(p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND lower(coalesce(nullif(trim(p.status), ''), 'active')) = 'active'
      AND (
        lower(trim(p.role)) = ANY (p_roles)
        OR (p.is_system_owner IS TRUE AND 'admin' = ANY (p_roles))
      )
  )
$$;

REVOKE ALL ON FUNCTION public.pvt_has_role(text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.pvt_has_role(text[]) TO anon, authenticated;

-- ลบ policy ทั้งหมดของตาราง (ถ้าตารางมีอยู่)
CREATE OR REPLACE FUNCTION pg_temp.pvt_reset_policies(p_table text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  pol record;
BEGIN
  IF to_regclass('public.' || p_table) IS NULL THEN
    RETURN false;
  END IF;
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = p_table LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, p_table);
  END LOOP;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  -- anon ไม่ต้องใช้ TRUNCATE / TRIGGER / REFERENCES (TRUNCATE ไม่ผ่าน RLS)
  EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.%I FROM anon, authenticated', p_table);
  RETURN true;
END $$;

-- -----------------------------------------------------
-- 1) profiles
-- -----------------------------------------------------
SELECT pg_temp.pvt_reset_policies('profiles');

-- อ่านได้ทุกคน (หน้า Login ใช้หา email จาก username, หน้า QR ใช้แสดงรายชื่อพนักงาน)
CREATE POLICY profiles_select_all ON public.profiles
  FOR SELECT TO anon, authenticated USING (true);

-- แก้ไขได้เฉพาะ admin (เพิ่ม/ลบผู้ใช้ทำผ่าน Edge Function ด้วย service role)
CREATE POLICY profiles_admin_insert ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (public.pvt_has_role(ARRAY['admin']));
CREATE POLICY profiles_admin_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.pvt_has_role(ARRAY['admin']))
  WITH CHECK (public.pvt_has_role(ARRAY['admin']));
CREATE POLICY profiles_admin_delete ON public.profiles
  FOR DELETE TO authenticated USING (public.pvt_has_role(ARRAY['admin']));

REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon;

-- ซ่อนคอลัมน์ password: ยกเลิกสิทธิ์ SELECT ทั้งตาราง แล้วให้ทีละคอลัมน์ (ยกเว้น password)
DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name <> 'password';

  REVOKE SELECT ON public.profiles FROM anon, authenticated;
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO anon, authenticated', cols);
END $$;

-- ล้างรหัสผ่านตัวอักษรเปล่าของผู้ใช้ที่มีบัญชี Supabase Auth แล้ว (Login ใช้ Supabase Auth ไม่ได้ใช้คอลัมน์นี้)
-- ผู้ใช้ที่ยังไม่มีบัญชี Auth จะยังเก็บไว้ เพื่อให้ 08-fix-login-accounts.sql สร้างบัญชีได้
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'password'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN password DROP NOT NULL;
    UPDATE public.profiles p SET password = NULL
    WHERE p.password IS NOT NULL
      AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);
  END IF;
END $$;

-- -----------------------------------------------------
-- 2) daily_waste_reports
-- -----------------------------------------------------
SELECT pg_temp.pvt_reset_policies('daily_waste_reports');

-- อ่าน: ฟอร์ม QR ต้องตรวจรายการซ้ำ, Dashboard/บัญชีต้องอ่าน
CREATE POLICY dwr_select_all ON public.daily_waste_reports
  FOR SELECT TO anon, authenticated USING (true);

-- เพิ่ม: ทุกคนเพิ่มได้เฉพาะสถานะ "pending" (ยังไม่ผ่านหัวหน้า)
--        หัวหน้า/บัญชี/ผู้บริหาร/admin เพิ่มสถานะอื่นได้ (หน้าบัญชีเพิ่มรายการของเสียย้อนหลัง)
CREATE POLICY dwr_insert_pending ON public.daily_waste_reports
  FOR INSERT TO anon, authenticated
  WITH CHECK (lower(coalesce(nullif(trim(status), ''), 'pending')) = 'pending');
CREATE POLICY dwr_insert_staff_roles ON public.daily_waste_reports
  FOR INSERT TO authenticated
  WITH CHECK (public.pvt_has_role(ARRAY['admin', 'supervisor', 'accounting', 'management']));

CREATE POLICY dwr_update_roles ON public.daily_waste_reports
  FOR UPDATE TO authenticated
  USING (public.pvt_has_role(ARRAY['admin', 'supervisor', 'accounting', 'management']))
  WITH CHECK (public.pvt_has_role(ARRAY['admin', 'supervisor', 'accounting', 'management']));

CREATE POLICY dwr_delete_roles ON public.daily_waste_reports
  FOR DELETE TO authenticated
  USING (public.pvt_has_role(ARRAY['admin', 'supervisor']));

REVOKE UPDATE, DELETE ON public.daily_waste_reports FROM anon;

-- -----------------------------------------------------
-- 3) daily_waste_report_items
-- -----------------------------------------------------
DO $$
BEGIN
  IF pg_temp.pvt_reset_policies('daily_waste_report_items') THEN
    CREATE POLICY dwri_select_all ON public.daily_waste_report_items
      FOR SELECT TO anon, authenticated USING (true);

    -- เพิ่มรายการปัญหาได้เฉพาะรายงานที่ยังเป็น pending (ฟอร์มหน้างาน / คิวออฟไลน์)
    CREATE POLICY dwri_insert_pending ON public.daily_waste_report_items
      FOR INSERT TO anon, authenticated
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.daily_waste_reports r
        WHERE r.id = report_id
          AND lower(coalesce(nullif(trim(r.status), ''), 'pending')) = 'pending'
      ));
    CREATE POLICY dwri_insert_roles ON public.daily_waste_report_items
      FOR INSERT TO authenticated
      WITH CHECK (public.pvt_has_role(ARRAY['admin', 'supervisor', 'accounting', 'management']));

    CREATE POLICY dwri_update_roles ON public.daily_waste_report_items
      FOR UPDATE TO authenticated
      USING (public.pvt_has_role(ARRAY['admin', 'supervisor', 'accounting', 'management']))
      WITH CHECK (public.pvt_has_role(ARRAY['admin', 'supervisor', 'accounting', 'management']));

    CREATE POLICY dwri_delete_roles ON public.daily_waste_report_items
      FOR DELETE TO authenticated
      USING (public.pvt_has_role(ARRAY['admin', 'supervisor']));

    REVOKE UPDATE, DELETE ON public.daily_waste_report_items FROM anon;
  END IF;
END $$;

-- -----------------------------------------------------
-- 4) daily_machine_status (หัวหน้ายืนยันเครื่อง / บัญชีกรอกยอดผลิต)
-- -----------------------------------------------------
DO $$
BEGIN
  IF pg_temp.pvt_reset_policies('daily_machine_status') THEN
    CREATE POLICY dms_select_auth ON public.daily_machine_status
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY dms_insert_roles ON public.daily_machine_status
      FOR INSERT TO authenticated
      WITH CHECK (public.pvt_has_role(ARRAY['admin', 'supervisor', 'accounting', 'management']));
    CREATE POLICY dms_update_roles ON public.daily_machine_status
      FOR UPDATE TO authenticated
      USING (public.pvt_has_role(ARRAY['admin', 'supervisor', 'accounting', 'management']))
      WITH CHECK (public.pvt_has_role(ARRAY['admin', 'supervisor', 'accounting', 'management']));
    CREATE POLICY dms_delete_admin ON public.daily_machine_status
      FOR DELETE TO authenticated USING (public.pvt_has_role(ARRAY['admin']));
    REVOKE INSERT, UPDATE, DELETE ON public.daily_machine_status FROM anon;
  END IF;
END $$;

-- -----------------------------------------------------
-- 5) Master data: อ่านได้ทุกคน, แก้ได้เฉพาะ admin / accounting
-- -----------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'master_departments', 'master_machines', 'master_problems', 'master_shifts',
    'departments', 'waste_reasons', 'waste_standards', 'pvt_machines', 'pvt_problem_types'
  ] LOOP
    IF pg_temp.pvt_reset_policies(t) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)', t || '_select_all', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
           USING (public.pvt_has_role(ARRAY[''admin'', ''accounting'']))
           WITH CHECK (public.pvt_has_role(ARRAY[''admin'', ''accounting'']))',
        t || '_write_admin_accounting', t);
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------
-- 6) user_departments (สิทธิ์แผนกของผู้ใช้)
-- -----------------------------------------------------
DO $$
BEGIN
  IF pg_temp.pvt_reset_policies('user_departments') THEN
    CREATE POLICY user_departments_select_auth ON public.user_departments
      FOR SELECT TO authenticated USING (true);
    CREATE POLICY user_departments_write_admin ON public.user_departments
      FOR ALL TO authenticated
      USING (public.pvt_has_role(ARRAY['admin']))
      WITH CHECK (public.pvt_has_role(ARRAY['admin']));
    REVOKE SELECT, INSERT, UPDATE, DELETE ON public.user_departments FROM anon;
  END IF;
END $$;

-- -----------------------------------------------------
-- 7) department_qr_tokens: anon อ่านได้เฉพาะ token ที่ active (ใช้ตรวจ QR Login)
-- -----------------------------------------------------
DO $$
BEGIN
  IF pg_temp.pvt_reset_policies('department_qr_tokens') THEN
    CREATE POLICY qr_tokens_select_active ON public.department_qr_tokens
      FOR SELECT TO anon, authenticated USING (status = 'active');
    CREATE POLICY qr_tokens_admin_all ON public.department_qr_tokens
      FOR ALL TO authenticated
      USING (public.pvt_has_role(ARRAY['admin']))
      WITH CHECK (public.pvt_has_role(ARRAY['admin']));
    REVOKE INSERT, UPDATE, DELETE ON public.department_qr_tokens FROM anon;
  END IF;
END $$;

-- -----------------------------------------------------
-- 8) Logs: ทุกคนเขียนได้ อ่านได้เฉพาะ admin
-- -----------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_activity_logs', 'system_logs'] LOOP
    IF pg_temp.pvt_reset_policies(t) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (true)', t || '_insert_all', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.pvt_has_role(ARRAY[''admin'']))',
        t || '_select_admin', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
           USING (public.pvt_has_role(ARRAY[''admin''])) WITH CHECK (public.pvt_has_role(ARRAY[''admin'']))',
        t || '_update_admin', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.pvt_has_role(ARRAY[''admin'']))',
        t || '_delete_admin', t);
      EXECUTE format('REVOKE SELECT, UPDATE, DELETE ON public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- =====================================================
-- ตรวจสอบผล: policy ทั้งหมดของตารางหลัก
-- =====================================================
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles', 'daily_waste_reports', 'daily_waste_report_items', 'daily_machine_status',
    'master_departments', 'master_machines', 'master_problems', 'master_shifts',
    'user_departments', 'department_qr_tokens', 'user_activity_logs', 'system_logs'
  )
ORDER BY tablename, policyname;

-- ถ้าต้องการย้อนกลับฉุกเฉิน (เปิดรายงานของเสียให้แก้ได้ทุกคนแบบเดิม — ไม่แนะนำ):
--   CREATE POLICY "Allow All for Web" ON public.daily_waste_reports FOR ALL TO public USING (true) WITH CHECK (true);
