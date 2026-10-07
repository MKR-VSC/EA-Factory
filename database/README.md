# EA Factory Deployment Kit

ชุดไฟล์สำหรับเตรียม Production / MAIN ของ EA Factory

## วิธีใช้แบบปลอดภัย

ให้รันใน Supabase SQL Editor ของโปรเจกต์ MAIN ตามลำดับนี้:

1. `01-reset-transaction-data.sql`
2. `02-seed-master-data-template.sql`
3. `03-seed-users-template.sql`
4. `04-rls-policies-basic.sql`
5. `05-check-system.sql`

### ไฟล์อัปเกรด (รันกับฐานข้อมูลที่ใช้งานอยู่แล้วได้ ไม่ลบข้อมูล รันซ้ำได้)

6. `07-ensure-app-schema.sql` — ตาราง/คอลัมน์ที่หน้าเว็บใช้ (รายการปัญหา, สถานะเครื่อง, คอลัมน์บัญชี)
7. `08-fix-login-accounts.sql` — แก้บัญชีผู้ใช้ที่ login ไม่ได้
8. `09-accounting-controls.sql` — department_code ของเครื่อง/ปัญหา, ประวัติการแก้ยอดผลิต, ปิดงวดบัญชีรายเดือน
9. `10-machine-waste-standards.sql` — เกณฑ์ % ของเสียรายเครื่องเก็บในฐานข้อมูล, ค่าตั้งต้นแผนกใหม่ 2% / 1.5%

> สูตรที่ระบบใช้: **% ของเสีย = ของเสีย ÷ (ผลิตดี + ของเสีย) × 100** — เก็บข้อมูลรายวัน ประเมินผ่าน/เกินจากยอดรวมทั้งเดือน

หลังรันแล้ว ทดสอบตาม `CHECKLIST-ทดสอบกับฐานข้อมูลจริง.md`

> หมายเหตุ: ไฟล์ `02` และ `03` เป็น template ต้องเติมข้อมูลจริงจาก DEV ก่อนรัน
> ถ้า MAIN มีข้อมูลจริงแล้ว ห้ามรันไฟล์ reset โดยไม่ backup ก่อน

## ตารางที่ควรย้ายจาก DEV ไป MAIN

- master_departments
- master_machines
- master_problems
- master_shifts
- factory_settings
- user_departments
- profiles

## ตารางที่ไม่ควรย้ายก่อน Go Live

- daily_waste_reports
- logs
- transaction/history ต่าง ๆ
