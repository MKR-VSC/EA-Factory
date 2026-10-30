-- =====================================================
-- นำเข้าข้อมูล Excel ของเสีย 2569 — ขั้นที่ 90: ย้ายจากตารางพักเข้าระบบ
-- รันหลัง 00, 01, 02, 03 · ต้องรันไฟล์ 07 (และแนะนำ 12, 13, 14) แล้ว
-- รันซ้ำได้: ลบข้อมูลที่เคยนำเข้า (ป้าย IMPORT:EXCEL2569) ก่อนใส่ใหม่
-- ทั้งหมดอยู่ใน DO block เดียว (คำสั่งเดียว) — SQL Editor ของ Supabase รันได้แน่นอน ไม่ว่าจะแยกคำสั่งหรือไม่
--
-- ผลลัพธ์
--  * แผนก / เครื่อง / อาการ ที่ยังไม่มี → เพิ่มให้ (ของเดิมไม่แตะ)
--  * ของเสีย: 1 รายงาน ต่อ เครื่อง-วัน-กะ · ทุกอาการเป็นรายการย่อย (ประเภทตามที่ตั้งไว้ของอาการ)
--  * ยอดผลิต: รวมทุกบรรทัดของเครื่อง-วันนั้น (รวมทุกกะ) → ผลิตดี (production_kg)
--      มีทั้งของเสียและยอดผลิต → สถานะ "บัญชีตรวจแล้ว"
--      มีของเสียแต่ไม่มียอดผลิต → "รอบัญชีตรวจ" (ให้เห็นในหน้าบัญชี)
--      มียอดผลิตแต่ไม่มีของเสีย → สถานะเครื่อง "ไม่มีของเสีย" + ยอดผลิต
--  * ผู้บันทึก = "นำเข้า Excel 2569" · หมายเหตุ = IMPORT:EXCEL2569 (ใช้ลบทีหลัง)
--
-- ⚙ แก้ "ชีต → รหัสแผนก" ได้ในส่วนที่ 1 ให้ตรงกับรหัสแผนกในระบบ
-- =====================================================

DO $import$
DECLARE
  unmapped text;
BEGIN

  -- -----------------------------------------------------
  -- 1) ชีต → แผนก (แก้ได้)
  -- -----------------------------------------------------
  DROP TABLE IF EXISTS import_2569_dept;
  CREATE TEMP TABLE import_2569_dept (code text PRIMARY KEY, name text, ord int);
  INSERT INTO import_2569_dept VALUES
    ('MONO', 'โมโน', 1),
    ('PIPE', 'ท่อ', 2),
    ('BLOWN_FILM', 'เป่าฟิล์ม (F1–F7)', 3),
    ('BLOW', 'เป่าถุง', 4),
    ('RAIN_TAPE', 'เทปน้ำพุ่ง', 5),
    ('CUT_PUNCH', 'ตัดเจาะ', 6),
    ('GARBAGE_BAG_CUT', 'ตัดถุงขยะ-ถุงอเนกประสงค์', 7),
    ('RAIN_TAPE_CUT_PUNCH', 'ตัดเทปน้ำพุ่ง', 8),
    ('SHEET_CUTTING', 'ตัดผืน', 9),
    ('SHADE_NET', 'สแลน', 10);

  DROP TABLE IF EXISTS import_2569_map;
  CREATE TEMP TABLE import_2569_map (sheet text PRIMARY KEY, code text, ord int);
  INSERT INTO import_2569_map
  SELECT s.sheet,
         CASE
           WHEN s.sheet ILIKE 'mono%' THEN 'MONO'
           WHEN s.sheet LIKE 'ท่อ%' THEN 'PIPE'
           WHEN s.sheet ~ '^F[0-9]+$' THEN 'BLOWN_FILM'
           WHEN s.sheet = 'เป่าถุง' THEN 'BLOW'
           WHEN s.sheet = 'เทปน้ำพุ่ง' THEN 'RAIN_TAPE'
           WHEN s.sheet LIKE 'ตัดเจาะ%' THEN 'CUT_PUNCH'
           WHEN s.sheet LIKE 'ตัดถุงขยะ%' THEN 'GARBAGE_BAG_CUT'
           WHEN s.sheet = 'ตัดเทปน้ำพุ่ง' THEN 'RAIN_TAPE_CUT_PUNCH'
           WHEN s.sheet = 'ตัดผืน' THEN 'SHEET_CUTTING'
           WHEN s.sheet LIKE 'สแลน%' THEN 'SHADE_NET'
         END,
         coalesce(nullif(regexp_replace(s.sheet, '\D', '', 'g'), '')::int, 1)
  FROM (SELECT DISTINCT sheet FROM public.import_excel_2569) s;

    SELECT string_agg(sheet, ', ') INTO unmapped FROM import_2569_map WHERE code IS NULL;
    IF unmapped IS NOT NULL THEN
      RAISE EXCEPTION 'ยังไม่ได้กำหนดแผนกให้ชีต: % (แก้ส่วนที่ 1 ของไฟล์นี้)', unmapped;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.import_excel_2569) THEN
      RAISE EXCEPTION 'ตารางพักว่าง — รันไฟล์ 01, 02, 03 ก่อน';
    END IF;

  -- -----------------------------------------------------
  -- 2) ลบข้อมูลที่เคยนำเข้า (รันซ้ำได้)
  -- -----------------------------------------------------
  DELETE FROM public.daily_waste_reports WHERE note = 'IMPORT:EXCEL2569';
  DELETE FROM public.daily_machine_status WHERE supervisor_name = 'นำเข้า Excel 2569';

  -- -----------------------------------------------------
  -- 3) Master data ที่ยังไม่มี
  -- -----------------------------------------------------
  INSERT INTO public.master_departments (department_code, department_name, is_active, sort_order)
  SELECT d.code, d.name, true, 100 + d.ord
  FROM import_2569_dept d
  WHERE EXISTS (SELECT 1 FROM import_2569_map m WHERE m.code = d.code)
    AND NOT EXISTS (SELECT 1 FROM public.master_departments x WHERE upper(x.department_code) = d.code);

  INSERT INTO public.master_machines (machine_no, department, is_active, sort_order)
  SELECT m.sheet, lower(m.code), true, m.ord
  FROM import_2569_map m
  WHERE NOT EXISTS (
    SELECT 1 FROM public.master_machines x
    WHERE x.machine_no = m.sheet
      AND upper(regexp_replace(btrim(x.department), '[\s-]+', '_', 'g')) = m.code
  );

  -- อาการตามชีต "อาการ" ของ Excel + อาการที่พบในข้อมูลจริง
  DROP TABLE IF EXISTS import_2569_prob;
  CREATE TEMP TABLE import_2569_prob (code text, problem text, ord int);
  INSERT INTO import_2569_prob VALUES
      ('MONO','ขาดหน้าดาย',1),
      ('MONO','ขาดอ่างน้ำร้อน',2),
      ('MONO','ขาดพันลูกกลิ้ง',3),
      ('MONO','ตัดเส้นไม่ขาด',4),
      ('MONO','ขาดลมร้อน',5),
      ('MONO','เดินเครื่องใหม่',6),
      ('MONO','เปลี่ยนสีโมโน',7),
      ('MONO','ไฟดับ',8),
      ('MONO','อื่นๆ',9),
      ('PIPE','ทะลุ',1),
      ('PIPE','น้ำท่วมถังแว็ก',2),
      ('PIPE','ขี้ดายหลุด',3),
      ('PIPE','แว็กสูง',4),
      ('PIPE','แว็กตก',5),
      ('PIPE','เข้าม้วนหัก',6),
      ('PIPE','หนาบางกลางม้วน',7),
      ('PIPE','โครไม่สวย',8),
      ('PIPE','เดินเครื่องใหม่',9),
      ('PIPE','เปลี่ยนไซร้',10),
      ('PIPE','ไฟดับ',11),
      ('PIPE','อื่นๆ',12),
      ('BLOWN_FILM','ทะลุ',1),
      ('BLOWN_FILM','ตกใบมีด',2),
      ('BLOWN_FILM','ลูกโปร่งส่าย',3),
      ('BLOWN_FILM','รอยกรีดไม่สวย',4),
      ('BLOWN_FILM','รูเจาะฉีกขาด',5),
      ('BLOWN_FILM','เจาะรูไม่ทะลุ',6),
      ('BLOWN_FILM','เนื้อฟิล์มแข็งเป็นเม็ด',7),
      ('BLOWN_FILM','สกรีนไม่สวย',8),
      ('BLOWN_FILM','น้ำหนักไม่ถึง/เกิน',9),
      ('BLOWN_FILM','จับจีบไม่สวย',10),
      ('BLOWN_FILM','ไซร้ไม่ได้ขนาด',11),
      ('BLOWN_FILM','ขี้ดายหลุด',12),
      ('BLOWN_FILM','เดินเครื่องใหม่',13),
      ('BLOWN_FILM','เปลี่ยนสี',14),
      ('BLOWN_FILM','เปลี่ยนไซร้',15),
      ('BLOWN_FILM','เศษเจาะ',16),
      ('BLOWN_FILM','ขัดหน้าดาย',17),
      ('BLOWN_FILM','ตั้งมีดใหม่',18),
      ('BLOWN_FILM','อื่นๆ',19),
      ('BLOWN_FILM','ไฟดับ',20),
      ('BLOW','ทะลุ',1),
      ('BLOW','ตกใบมีด',2),
      ('BLOW','ลูกโปร่งส่าย',3),
      ('BLOW','รอยกรีดไม่สวย',4),
      ('BLOW','รูเจาะฉีกขาด',5),
      ('BLOW','เจาะรูไม่ทะลุ',6),
      ('BLOW','เนื้อฟิล์มแข็งเป็นเม็ด',7),
      ('BLOW','สกรีนไม่สวย',8),
      ('BLOW','น้ำหนักไม่ถึง/เกิน',9),
      ('BLOW','จับจีบไม่สวย',10),
      ('BLOW','ไซร้ไม่ได้ขนาด',11),
      ('BLOW','ขี้ดายหลุด',12),
      ('BLOW','เดินเครื่องใหม่',13),
      ('BLOW','เปลี่ยนสี',14),
      ('BLOW','เปลี่ยนไซร้',15),
      ('BLOW','เศษเจาะ',16),
      ('BLOW','ขัดหน้าดาย',17),
      ('BLOW','ตั้งมีดใหม่',18),
      ('BLOW','อื่นๆ',19),
      ('BLOW','ไฟดับ',20),
      ('RAIN_TAPE','ทะลุ',1),
      ('RAIN_TAPE','ตกใบมีด',2),
      ('RAIN_TAPE','ลูกโปร่งส่าย',3),
      ('RAIN_TAPE','รอยกรีดไม่สวย',4),
      ('RAIN_TAPE','รูเจาะฉีกขาด',5),
      ('RAIN_TAPE','เจาะรูไม่ทะลุ',6),
      ('RAIN_TAPE','เนื้อฟิล์มแข็งเป็นเม็ด',7),
      ('RAIN_TAPE','สกรีนไม่สวย',8),
      ('RAIN_TAPE','น้ำหนักไม่ถึง/เกิน',9),
      ('RAIN_TAPE','จับจีบไม่สวย',10),
      ('RAIN_TAPE','ไซร้ไม่ได้ขนาด',11),
      ('RAIN_TAPE','ขี้ดายหลุด',12),
      ('RAIN_TAPE','เดินเครื่องใหม่',13),
      ('RAIN_TAPE','เปลี่ยนสี',14),
      ('RAIN_TAPE','เปลี่ยนไซร้',15),
      ('RAIN_TAPE','เศษเจาะ',16),
      ('RAIN_TAPE','ขัดหน้าดาย',17),
      ('RAIN_TAPE','ตั้งมีดใหม่',18),
      ('RAIN_TAPE','อื่นๆ',19),
      ('RAIN_TAPE','ไฟดับ',20),
      ('CUT_PUNCH','มีดตัดไม่ขาด',1),
      ('CUT_PUNCH','ตัดเอียง',2),
      ('CUT_PUNCH','ซีนไม่ติด',3),
      ('CUT_PUNCH','ซีนขาด',4),
      ('CUT_PUNCH','เจาะไม่ทะลุ',5),
      ('CUT_PUNCH','รูเจาะเอียง',6),
      ('CUT_PUNCH','ขนาดไม่ได้มาตราฐาน',7),
      ('CUT_PUNCH','ผิวไม่ได้มาตราฐาน',8),
      ('CUT_PUNCH','เปลี่ยนยาง / ลวด / ลวดซีนเคลื่อน',9),
      ('CUT_PUNCH','เปลี่ยนซีน',10),
      ('CUT_PUNCH','เปลี่ยนไซร้',11),
      ('CUT_PUNCH','ซ่อมเครื่อง',12),
      ('CUT_PUNCH','ไฟดับ',13),
      ('CUT_PUNCH','รอยต่อม้วน',14),
      ('CUT_PUNCH','เศษเจาะ',15),
      ('CUT_PUNCH','เศษปลายม้วน',16),
      ('CUT_PUNCH','สตาร์ทเครื่องใหม่',17),
      ('CUT_PUNCH','อื่นๆ',18),
      ('GARBAGE_BAG_CUT','ซีนไม่ติด / ซีนขาด',1),
      ('GARBAGE_BAG_CUT','ถุงมีรอยขาด/ขูด',2),
      ('GARBAGE_BAG_CUT','ขนาดไม่ได้',3),
      ('GARBAGE_BAG_CUT','ตัดไม่ขาด',4),
      ('GARBAGE_BAG_CUT','ถุงเอียง / ก้นถุงใหญ่',5),
      ('GARBAGE_BAG_CUT','เช็คดูซีน',6),
      ('GARBAGE_BAG_CUT','ต้นม้วน/ปลายม้วน',7),
      ('GARBAGE_BAG_CUT','เปลี่ยนไซร้',8),
      ('GARBAGE_BAG_CUT','ซ่อมเครื่อง',9),
      ('GARBAGE_BAG_CUT','ไฟดับ',10),
      ('GARBAGE_BAG_CUT','เปลี่ยนซีน',11),
      ('GARBAGE_BAG_CUT','อื่นๆ',12),
      ('RAIN_TAPE_CUT_PUNCH','ความยาวไม่ถึง',1),
      ('RAIN_TAPE_CUT_PUNCH','ขนาดไม่ได้',2),
      ('RAIN_TAPE_CUT_PUNCH','ม้วนล้นกระดาษ',3),
      ('RAIN_TAPE_CUT_PUNCH','เข็มหัก',4),
      ('RAIN_TAPE_CUT_PUNCH','รูไม่ทะลุ',5),
      ('RAIN_TAPE_CUT_PUNCH','สกรีนหาย',6),
      ('RAIN_TAPE_CUT_PUNCH','ทะลุ/ขี้ดาย',7),
      ('RAIN_TAPE_CUT_PUNCH','เศษปลายม้วน',8),
      ('RAIN_TAPE_CUT_PUNCH','เศษลองน้ำ / ตัดดูรู',9),
      ('RAIN_TAPE_CUT_PUNCH','ตั้งไซร้',10),
      ('RAIN_TAPE_CUT_PUNCH','ซ่อมเครื่อง',11),
      ('RAIN_TAPE_CUT_PUNCH','ไฟดับ',12),
      ('RAIN_TAPE_CUT_PUNCH','อื่นๆ',13),
      ('SHEET_CUTTING','ความยาวไม่ถึง',1),
      ('SHEET_CUTTING','เศษหัวม้วน / ปลายม้วน',2),
      ('SHEET_CUTTING','เครื่องเสีย',3),
      ('SHEET_CUTTING','ส่วนที่เสียจากแผนกสแลน',4),
      ('SHEET_CUTTING','อื่นๆ',5),
      ('SHADE_NET','ฟิล์มขาดยาว',1),
      ('SHADE_NET','โมโนขาด',2),
      ('SHADE_NET','เปลี่ยนความกว้าง',3),
      ('SHADE_NET','เปลี่ยนเปอร์เซ็นต์การผลิต',4),
      ('SHADE_NET','สี ไม่ได้คุณภาพ',5),
      ('SHADE_NET','น้ำหนักไม่ได้คุณภาพ',6),
      ('SHADE_NET','ความกว้างไม่ถึง',7),
      ('SHADE_NET','เศษฟิล์มปลายม้วน(ดำ,เขียว,เงิน,ฟ้า,ขาว)',8),
      ('SHADE_NET','เศษฟิล์มเส้นข้าง(ดำ,เขียว,เงิน,ฟ้า,ขาว)',9),
      ('SHADE_NET','โมโนปลายม้วน',10),
      ('SHADE_NET','เศษฟิล์มกรีดหา(ดำ,เขียว,เงิน,ฟ้า,ขาว)',11),
      ('SHADE_NET','เศษแสลนทอแล้ว',12),
      ('SHADE_NET','อื่นๆ',13),
      ('SHADE_NET','ตัดทิ้ง',14);
  INSERT INTO import_2569_prob
  SELECT DISTINCT m.code, s.problem, 900
  FROM public.import_excel_2569 s JOIN import_2569_map m USING (sheet)
  WHERE s.waste_kg > 0 AND s.problem IS NOT NULL;

  INSERT INTO public.master_problems (problem_type, department, is_active, sort_order)
  SELECT p.problem, lower(p.code), true, min(p.ord)
  FROM import_2569_prob p
  WHERE EXISTS (SELECT 1 FROM import_2569_map m WHERE m.code = p.code)
    AND NOT EXISTS (
      SELECT 1 FROM public.master_problems x
      WHERE btrim(x.problem_type) = p.problem
        AND upper(regexp_replace(btrim(x.department), '[\s-]+', '_', 'g')) = p.code
    )
  GROUP BY p.problem, p.code;

  -- -----------------------------------------------------
  -- 4) ยอดผลิตต่อเครื่อง-วัน (รวมทุกกะ)
  -- -----------------------------------------------------
  DROP TABLE IF EXISTS import_2569_day;
  CREATE TEMP TABLE import_2569_day AS
  SELECT s.sheet, s.work_date, m.code, sum(s.prod_kg) AS prod_kg, sum(s.waste_kg) AS waste_kg
  FROM public.import_excel_2569 s JOIN import_2569_map m USING (sheet)
  GROUP BY s.sheet, s.work_date, m.code;

  -- -----------------------------------------------------
  -- 5) รายงานของเสีย: 1 รายงานต่อ เครื่อง-วัน-กะ
  -- -----------------------------------------------------
  DROP TABLE IF EXISTS import_2569_rep;
  CREATE TEMP TABLE import_2569_rep AS
  SELECT gen_random_uuid() AS id, s.sheet, s.work_date, s.shift, m.code,
         sum(s.waste_kg) AS waste_kg,
         (array_agg(s.problem ORDER BY s.waste_kg DESC))[1] AS first_problem
  FROM public.import_excel_2569 s JOIN import_2569_map m USING (sheet)
  WHERE s.waste_kg > 0
  GROUP BY s.sheet, s.work_date, s.shift, m.code;

  INSERT INTO public.daily_waste_reports (
    id, report_date, incident_datetime, department_code, department, machine_no,
    shift, work_shift, product_name, problem_type, waste_weight_kg,
    reported_by, note, status, accounting_status, production_kg, accounting_checked_at, created_at
  )
  SELECT r.id, r.work_date, (r.work_date + time '08:00') AT TIME ZONE 'Asia/Bangkok',
         r.code, d.name, r.sheet,
         r.shift, r.shift, 'ปัญหาการผลิต', r.first_problem, r.waste_kg,
         'นำเข้า Excel 2569', 'IMPORT:EXCEL2569',
         CASE WHEN dy.prod_kg > 0 THEN 'accounting_checked' ELSE 'sent_accounting' END,
         CASE WHEN dy.prod_kg > 0 THEN 'accounting_checked' END,
         nullif(dy.prod_kg, 0),
         CASE WHEN dy.prod_kg > 0 THEN now() END,
         (r.work_date + time '08:00') AT TIME ZONE 'Asia/Bangkok'
  FROM import_2569_rep r
  JOIN import_2569_dept d ON d.code = r.code
  JOIN import_2569_day dy ON dy.sheet = r.sheet AND dy.work_date = r.work_date;

  INSERT INTO public.daily_waste_report_items (report_id, item_no, problem_type, waste_weight_kg, detail)
  SELECT r.id,
         row_number() OVER (PARTITION BY r.id ORDER BY s.waste_kg DESC, s.problem),
         s.problem, s.waste_kg, s.note
  FROM public.import_excel_2569 s
  JOIN import_2569_rep r ON r.sheet = s.sheet AND r.work_date = s.work_date AND r.shift IS NOT DISTINCT FROM s.shift
  WHERE s.waste_kg > 0;

  -- -----------------------------------------------------
  -- 6) วันที่มียอดผลิตแต่ไม่มีของเสีย → สถานะเครื่อง "ไม่มีของเสีย"
  -- -----------------------------------------------------
  INSERT INTO public.daily_machine_status (
    work_date, department_code, machine_no, operation_status,
    supervisor_name, confirmed_at, sent_accounting, sent_at, production_kg, accounting_checked_at
  )
  SELECT dy.work_date, dy.code, dy.sheet, 'no_waste',
         'นำเข้า Excel 2569', now(), true, now(), dy.prod_kg, now()
  FROM import_2569_day dy
  WHERE dy.prod_kg > 0 AND dy.waste_kg = 0
    AND NOT EXISTS (
      SELECT 1 FROM public.daily_machine_status x
      WHERE x.work_date = dy.work_date AND x.department_code = dy.code AND x.machine_no = dy.sheet
    );

  -- ลบตารางช่วย
  DROP TABLE IF EXISTS import_2569_rep, import_2569_day, import_2569_prob, import_2569_map, import_2569_dept;
END $import$;

-- ตรวจผล
SELECT 'รายงานของเสีย' AS what, count(*) AS rows, round(sum(waste_weight_kg), 2) AS kg
FROM public.daily_waste_reports WHERE note = 'IMPORT:EXCEL2569'
UNION ALL
SELECT 'รายการย่อย', count(*), round(sum(i.waste_weight_kg), 2)
FROM public.daily_waste_report_items i JOIN public.daily_waste_reports r ON r.id = i.report_id
WHERE r.note = 'IMPORT:EXCEL2569'
UNION ALL
SELECT 'วันที่ไม่มีของเสีย', count(*), round(sum(production_kg), 2)
FROM public.daily_machine_status WHERE supervisor_name = 'นำเข้า Excel 2569';
