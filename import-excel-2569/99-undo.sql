-- =====================================================
-- ยกเลิกการนำเข้า Excel ของเสีย 2569 (ลบเฉพาะข้อมูลที่นำเข้า)
-- รายการย่อยถูกลบตามรายงานอัตโนมัติ · แผนก/เครื่อง/อาการที่เพิ่มไว้ยังอยู่ (ลบเองได้ที่หน้าแอดมิน)
-- =====================================================
BEGIN;
DELETE FROM public.daily_waste_reports WHERE note = 'IMPORT:EXCEL2569';
DELETE FROM public.daily_machine_status WHERE supervisor_name = 'นำเข้า Excel 2569';
DROP TABLE IF EXISTS public.import_excel_2569, public.import_2569_rep, public.import_2569_day,
  public.import_2569_prob, public.import_2569_map, public.import_2569_dept;
COMMIT;
