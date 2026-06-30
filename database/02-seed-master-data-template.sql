-- =====================================================
-- EA Factory / 02-seed-master-data-template.sql
-- Template สำหรับใส่ Master Data จาก DEV ไป MAIN
-- แนะนำ import ตามลำดับ:
-- 1) master_departments
-- 2) master_machines
-- 3) master_problems
-- 4) master_shifts
-- 5) factory_settings
-- =====================================================

BEGIN;

-- =========================
-- 1) Departments
-- =========================
-- หมายเหตุ: ต้องมี department_code ครบก่อน import profiles
-- ตัวอย่าง:
-- INSERT INTO master_departments
--   (department_code, department_name, is_active, sort_order, max_waste_percent, warning_percent, theme_color)
-- VALUES
--   ('MONO', 'โมโน', true, 1, 3, 2, '#2563eb')
-- ON CONFLICT (department_code) DO UPDATE SET
--   department_name = EXCLUDED.department_name,
--   is_active = EXCLUDED.is_active,
--   sort_order = EXCLUDED.sort_order,
--   max_waste_percent = EXCLUDED.max_waste_percent,
--   warning_percent = EXCLUDED.warning_percent,
--   theme_color = EXCLUDED.theme_color;

-- =========================
-- 2) Machines
-- =========================
-- INSERT INTO master_machines
--   (department_code, machine_no, is_active, sort_order)
-- VALUES
--   ('MONO', 'MONO-01', true, 1)
-- ON CONFLICT DO NOTHING;

-- =========================
-- 3) Problems
-- =========================
-- INSERT INTO master_problems
--   (department_code, problem_type, is_active, sort_order)
-- VALUES
--   ('MONO', 'เสียจากการตั้งเครื่อง', true, 1)
-- ON CONFLICT DO NOTHING;

-- =========================
-- 4) Shifts
-- =========================
-- INSERT INTO master_shifts
--   (shift_code, shift_name, start_time, end_time, is_active, sort_order)
-- VALUES
--   ('MORNING', 'กะเช้า', '08:00', '16:00', true, 1)
-- ON CONFLICT DO NOTHING;

-- =========================
-- 5) Factory Settings
-- =========================
-- INSERT INTO factory_settings
--   (setting_key, setting_value)
-- VALUES
--   ('system_name', 'EA Factory')
-- ON CONFLICT (setting_key) DO UPDATE SET
--   setting_value = EXCLUDED.setting_value;

COMMIT;
