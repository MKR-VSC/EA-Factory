-- =====================================================
-- EA Factory / 01-reset-transaction-data.sql
-- ใช้ล้างข้อมูลธุรกรรมก่อน Go Live
-- ไม่ลบ Master Data
-- =====================================================

BEGIN;

-- ถ้ามีตารางใดไม่มีอยู่จริง ให้ลบบรรทัดนั้นออกก่อนรัน

TRUNCATE TABLE daily_waste_reports RESTART IDENTITY CASCADE;

-- เพิ่มตารางธุรกรรมอื่น ๆ ภายหลังได้ เช่น
-- TRUNCATE TABLE supervisor_reviews RESTART IDENTITY CASCADE;
-- TRUNCATE TABLE accounting_reviews RESTART IDENTITY CASCADE;
-- TRUNCATE TABLE activity_logs RESTART IDENTITY CASCADE;

COMMIT;
