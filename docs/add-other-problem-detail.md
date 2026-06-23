-- เพิ่มคอลัมน์สำหรับเก็บรายละเอียดกรณีเลือกประเภทปัญหาเป็น "อื่นๆ"
-- รันใน Supabase SQL Editor ก่อนใช้งานไฟล์ JS เวอร์ชันนี้

ALTER TABLE daily_waste_reports
ADD COLUMN IF NOT EXISTS other_problem_detail TEXT;

COMMENT ON COLUMN daily_waste_reports.other_problem_detail
IS 'รายละเอียดเพิ่มเติมเมื่อ problem_type = อื่นๆ ใช้สำหรับวิเคราะห์สาเหตุของเสีย';
