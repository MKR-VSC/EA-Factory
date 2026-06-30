-- =====================================================
-- EA Factory / 05-check-system.sql
-- ใช้ตรวจสอบ MAIN หลัง import / ตั้ง RLS
-- =====================================================

-- 1) ตารางทั้งหมด
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 2) จำนวนข้อมูล Master
SELECT 'master_departments' AS table_name, COUNT(*) AS rows FROM master_departments
UNION ALL
SELECT 'master_machines', COUNT(*) FROM master_machines
UNION ALL
SELECT 'master_problems', COUNT(*) FROM master_problems
UNION ALL
SELECT 'master_shifts', COUNT(*) FROM master_shifts
UNION ALL
SELECT 'profiles', COUNT(*) FROM profiles;

-- 3) หา profiles ที่ department_code ไม่มีใน master_departments
SELECT
  p.username,
  p.display_name,
  p.department_code
FROM profiles p
LEFT JOIN master_departments d
  ON d.department_code = p.department_code
WHERE p.department_code IS NOT NULL
  AND d.department_code IS NULL;

-- 4) ตรวจ RLS ที่เปิดอยู่
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 5) ดู policies
SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
