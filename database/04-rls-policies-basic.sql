-- =====================================================
-- EA Factory / 04-rls-policies-basic.sql
-- RLS ขั้นต้น: ให้ระบบ Login และอ่าน Master Data ได้ก่อน
-- หลัง Go Live ค่อยล็อกเพิ่มแบบละเอียด
-- =====================================================

-- =========================
-- Master Data: อ่านได้
-- =========================
ALTER TABLE master_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_shifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read master_departments" ON master_departments;
CREATE POLICY "public read master_departments"
ON master_departments FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "public read master_machines" ON master_machines;
CREATE POLICY "public read master_machines"
ON master_machines FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "public read master_problems" ON master_problems;
CREATE POLICY "public read master_problems"
ON master_problems FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "public read master_shifts" ON master_shifts;
CREATE POLICY "public read master_shifts"
ON master_shifts FOR SELECT
TO anon, authenticated
USING (true);

-- =========================
-- Profiles: เปิดอ่านเพื่อ Login username
-- ถ้า login ใช้ username จาก profiles ต้องมี policy นี้
-- =========================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read profiles for login" ON profiles;
CREATE POLICY "public read profiles for login"
ON profiles FOR SELECT
TO anon, authenticated
USING (true);

-- ให้ user ที่ login แล้วอ่าน/แก้ข้อมูลได้ชั่วคราว
-- หลังระบบนิ่งแล้วค่อยเปลี่ยนเป็น role-based
DROP POLICY IF EXISTS "authenticated manage profiles temporary" ON profiles;
CREATE POLICY "authenticated manage profiles temporary"
ON profiles FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- =========================
-- Daily Waste Reports: ขั้นต้น
-- =========================
ALTER TABLE daily_waste_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read daily_waste_reports" ON daily_waste_reports;
CREATE POLICY "authenticated read daily_waste_reports"
ON daily_waste_reports FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "authenticated insert daily_waste_reports" ON daily_waste_reports;
CREATE POLICY "authenticated insert daily_waste_reports"
ON daily_waste_reports FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated update daily_waste_reports" ON daily_waste_reports;
CREATE POLICY "authenticated update daily_waste_reports"
ON daily_waste_reports FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
