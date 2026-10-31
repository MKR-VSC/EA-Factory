
-- =====================================================
-- EA Factory / 16-department-groups.sql
-- กลุ่มแผนก (เช่น กลุ่มตัด, กลุ่มเป่า) — ตั้ง/ย้าย/ยุบได้เองที่เมนู "กลุ่มแผนก"
--
--  * department_groups : รายชื่อกลุ่ม + เกณฑ์ % ของกลุ่ม (ไม่เกิน / เตือน / คิดจาก)
--  * master_departments.group_code : แผนกนี้อยู่กลุ่มไหน (ว่าง = ไม่อยู่กลุ่ม)
--  * แผนกย่อยยังมีอาการ / เกณฑ์ / ประเภทของเสียของตัวเองเหมือนเดิม
--  * รายงานแสดงทั้ง 2 ระดับ: แผนกย่อย และ "รวมทั้งกลุ่ม" (ประเมินด้วยเกณฑ์ของกลุ่ม)
--  * ย้ายแผนกเข้า/ออกกลุ่ม ไม่ต้องย้ายข้อมูล — รายงานจัดกลุ่มตอนแสดงผล (ย้อนหลังทั้งหมดตามกลุ่มปัจจุบัน)
-- จัดการได้: admin / บัญชี / ผู้บริหาร · รันซ้ำได้ · ไม่ต้องพึ่งไฟล์ 09 / 11
-- =====================================================

BEGIN;

-- ฟังก์ชันเช็กสิทธิ์ (มีในไฟล์ 11 / 12 — ถ้ายังไม่มีให้สร้าง)
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
-- 1) กลุ่มแผนก
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.department_groups (
  code               text PRIMARY KEY,
  name               text NOT NULL,
  sort_order         integer NOT NULL DEFAULT 0,
  is_active          boolean NOT NULL DEFAULT true,
  max_waste_percent  numeric(6,2) NOT NULL DEFAULT 2.00,
  warning_percent    numeric(6,2) NOT NULL DEFAULT 1.50,
  threshold_basis    text NOT NULL DEFAULT 'total' CHECK (threshold_basis IN ('total', 'production')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.department_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dept_groups_select ON public.department_groups;
CREATE POLICY dept_groups_select ON public.department_groups
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS dept_groups_write ON public.department_groups;
CREATE POLICY dept_groups_write ON public.department_groups
  FOR ALL TO authenticated
  USING (public.pvt_has_role(ARRAY['admin', 'accounting', 'management']))
  WITH CHECK (public.pvt_has_role(ARRAY['admin', 'accounting', 'management']));

GRANT SELECT ON public.department_groups TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.department_groups TO authenticated;

-- -----------------------------------------------------
-- 2) แผนก → กลุ่ม
-- -----------------------------------------------------
ALTER TABLE public.master_departments
  ADD COLUMN IF NOT EXISTS group_code text;

-- ย้ายแผนกเข้า/ออกกลุ่ม (ผู้บริหารใช้ได้ด้วย ทั้งที่แก้ตาราง master_departments ตรง ๆ ไม่ได้)
CREATE OR REPLACE FUNCTION public.pvt_set_department_group(p_dept text, p_group text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.pvt_has_role(ARRAY['admin', 'accounting', 'management']) THEN
    RAISE EXCEPTION 'ไม่มีสิทธิ์จัดกลุ่มแผนก';
  END IF;
  IF nullif(btrim(p_group), '') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.department_groups WHERE code = p_group) THEN
    RAISE EXCEPTION 'ไม่พบกลุ่ม %', p_group;
  END IF;
  UPDATE public.master_departments
  SET group_code = nullif(btrim(p_group), '')
  WHERE upper(department_code) = upper(p_dept);
END;
$$;

REVOKE ALL ON FUNCTION public.pvt_set_department_group(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.pvt_set_department_group(text, text) TO authenticated;

-- ลบกลุ่ม → แผนกในกลุ่มกลับเป็น "ไม่อยู่กลุ่ม"
CREATE OR REPLACE FUNCTION public.pvt_dept_groups_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.master_departments SET group_code = NULL WHERE group_code = OLD.code;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_dept_groups_on_delete ON public.department_groups;
CREATE TRIGGER trg_dept_groups_on_delete
  AFTER DELETE ON public.department_groups
  FOR EACH ROW EXECUTE FUNCTION public.pvt_dept_groups_on_delete();

COMMIT;

-- =====================================================
-- (ไม่บังคับ) ตั้งกลุ่มเริ่มต้นตามที่คุยกัน — แก้ต่อได้ที่เมนู "กลุ่มแผนก"
-- =====================================================
-- INSERT INTO public.department_groups (code, name, sort_order) VALUES
--   ('CUT', 'กลุ่มตัด', 1), ('BLOWING', 'กลุ่มเป่า', 2)
-- ON CONFLICT (code) DO NOTHING;
-- UPDATE public.master_departments SET group_code = 'CUT'
--   WHERE department_code IN ('CUT_PUNCH', 'GARBAGE_BAG_CUT', 'SHEET_CUTTING');
-- UPDATE public.master_departments SET group_code = 'BLOWING'
--   WHERE department_code IN ('BLOW', 'BLOWN_FILM', 'RAIN_TAPE', 'RAIN_TAPE_CUT_PUNCH');
