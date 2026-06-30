# EA Factory Deployment Kit

ชุดไฟล์สำหรับเตรียม Production / MAIN ของ EA Factory

## วิธีใช้แบบปลอดภัย

ให้รันใน Supabase SQL Editor ของโปรเจกต์ MAIN ตามลำดับนี้:

1. `01-reset-transaction-data.sql`
2. `02-seed-master-data-template.sql`
3. `03-seed-users-template.sql`
4. `04-rls-policies-basic.sql`
5. `05-check-system.sql`

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
