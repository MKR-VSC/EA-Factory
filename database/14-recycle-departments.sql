-- =====================================================
-- EA Factory / 14-recycle-departments.sql
-- แผนกเครื่องรีไซเคิล (เช่น PATICO / EREMA) — ส่วนล่างของใบรายงานการผลิต
--
-- master_departments.dept_kind
--   production = แผนกผลิตสินค้า (ค่าเริ่มต้น)
--   recycle    = แผนกรีไซเคิล → รายงานประจำวันแยกเป็นตารางของตัวเอง
--                (น้ำหนักแยกกะ · สูญเสียแยกกะ · %) และไม่นับรวมกับยอดผลิตสินค้า
--
-- ใช้งานร่วมกับระบบเดิมทั้งหมด:
--   เครื่อง (PATICO 2, EREMA 1 …) เพิ่มที่หน้าแอดมิน > Master Data
--   น้ำหนักแยกกะ / ชนิดเม็ด (HD-ถุงเพาะชำ, LD-ใส 2 …) กรอกที่ปุ่ม "แยกกะ / สินค้า" ในหน้าบัญชี
--   ของเสียบันทึกผ่านฟอร์มแผนกเหมือนแผนกอื่น
-- รันซ้ำได้
-- =====================================================

BEGIN;

ALTER TABLE public.master_departments
  ADD COLUMN IF NOT EXISTS dept_kind text NOT NULL DEFAULT 'production';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'master_departments_dept_kind_chk') THEN
    ALTER TABLE public.master_departments
      ADD CONSTRAINT master_departments_dept_kind_chk CHECK (dept_kind IN ('production', 'recycle'));
  END IF;
END $$;

COMMIT;

-- =====================================================
-- ตัวอย่างตั้งแผนกรีไซเคิล (แก้ชื่อ/รหัสให้ตรงโรงงาน แล้วเอา -- ออก)
-- =====================================================
-- INSERT INTO public.master_departments (department_code, department_name, is_active, sort_order, dept_kind)
-- VALUES ('RECYCLE', 'รีไซเคิล', true, 90, 'recycle')
-- ON CONFLICT (department_code) DO UPDATE SET dept_kind = 'recycle';
--
-- INSERT INTO public.master_machines (machine_no, department, is_active, sort_order)
-- VALUES ('PATICO 1', 'recycle', true, 1), ('PATICO 2', 'recycle', true, 2),
--        ('EREMA 1', 'recycle', true, 3), ('EREMA 2', 'recycle', true, 4);
--
-- หรือเปลี่ยนแผนกที่มีอยู่แล้ว:
-- UPDATE public.master_departments SET dept_kind = 'recycle' WHERE department_code = 'RECYCLE';
