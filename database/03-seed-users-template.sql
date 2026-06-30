-- =====================================================
-- EA Factory / 03-seed-users-template.sql
-- Template สำหรับ profiles / user_departments
-- สำคัญ: ต้องสร้าง Auth Users ใน Supabase Authentication ก่อน
-- แล้วจึง import profiles ที่ id ตรงกับ auth.users.id
-- =====================================================

BEGIN;

-- เช็กว่า department_code มีครบก่อน
-- SELECT department_code FROM master_departments ORDER BY department_code;

-- ตัวอย่าง profiles
-- INSERT INTO profiles
--   (id, username, email, display_name, role, status, department_code)
-- VALUES
--   ('AUTH_USER_UUID_HERE', 'ADMIN', 'admin@example.com', 'Admin', 'ADMIN', 'ACTIVE', 'MONO')
-- ON CONFLICT (id) DO UPDATE SET
--   username = EXCLUDED.username,
--   email = EXCLUDED.email,
--   display_name = EXCLUDED.display_name,
--   role = EXCLUDED.role,
--   status = EXCLUDED.status,
--   department_code = EXCLUDED.department_code;

-- ตัวอย่าง user_departments ถ้ามีใช้
-- INSERT INTO user_departments
--   (user_id, department_code)
-- VALUES
--   ('AUTH_USER_UUID_HERE', 'MONO')
-- ON CONFLICT DO NOTHING;

COMMIT;
