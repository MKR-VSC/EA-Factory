-- =====================================================
-- นำเข้าข้อมูล Excel ของเสีย 2569 (ม.ค.–ก.ย.) เพื่อทดสอบระบบ — ขั้นที่ 0
-- สร้างตารางพักข้อมูล (ล้างของเดิมถ้ามี) · รันซ้ำได้
-- ลำดับ: 00 → 01 → 02 → 03 → 04 → 90  (ยกเลิกทั้งหมดด้วย 99-undo.sql)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.import_excel_2569 (
  sheet      text    NOT NULL,   -- ชื่อชีต = ชื่อเครื่อง เช่น F1, ท่อ1, สแลน ทอ1
  work_date  date    NOT NULL,
  shift      text,               -- เช้า / บ่าย / ดึก / เช้า/ดึก (รวมกะ) / ไม่ระบุกะ
  problem    text,
  waste_kg   numeric NOT NULL DEFAULT 0,
  prod_kg    numeric NOT NULL DEFAULT 0,
  note       text
);
TRUNCATE public.import_excel_2569;
-- ตารางพักไม่ต้องให้หน้าเว็บอ่าน
ALTER TABLE public.import_excel_2569 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_excel_2569 FROM anon, authenticated;
