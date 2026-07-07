# คู่มือย้าย User จาก Custom Login → Supabase Auth
Version 1.0

---

# โครงสร้างระบบใหม่

ผู้ใช้ Login ด้วย Username เหมือนเดิม

Username
    │
    ▼
profiles
    │
    ▼
Email
    │
    ▼
Supabase Auth
    │
    ▼
Session
    │
    ▼
AUTH_GUARD
    │
    ▼
CURRENT_USER

ผู้ใช้ไม่จำเป็นต้องรู้ Email

---

# ขั้นตอนที่ 1 สร้าง User ใน Authentication

Supabase

Authentication

Users

Add User

กรอก

Email

adminacc@pvt.local

Password

********

Auto Confirm

เปิด

กด Create User

---

# ขั้นตอนที่ 2 คัดลอก Auth UID

Authentication

Users

ADMINACC

Copy UUID

ตัวอย่าง

b4cfe83d-03e0-491d-8819-d49ac964a316

---

# ขั้นตอนที่ 3 ดูข้อมูลใน Profiles

```sql

select id as old_profile_id, username, email
from profiles
where username = 'ADMINACC';

select id as new_auth_id, email
from auth.users
where email = 'adminacc@pvt.local';

```

จำ id เดิมไว้

---

# ขั้นตอนที่ 4 ลบข้อมูล user_departments ของ id เดิม

```sql

delete
from user_departments
where user_id='OLD_PROFILE_ID';

```

เช่น

```sql
delete
from user_departments
where user_id='xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
```

---

# ขั้นตอนที่ 5 เปลี่ยน Profiles ให้ตรงกับ Auth

```sql


update profiles
set

    id='NEW_AUTH_UID',

    email='adminacc@pvt.local',

    role='accounting',

    status='active'

where username='ADMINACC';


```

---

# ขั้นตอนที่ 6 เพิ่มสิทธิ์แผนกกลับ

ตัวอย่าง

```sql


insert into user_departments
(
    user_id,
    department_code
)
values
(
    'NEW_AUTH_UID',
    'ACCOUNTING'
);



```

ถ้ามีหลายแผนก

```sql
insert into user_departments
(user_id,department_code)

values

('NEW_AUTH_UID','BLOW'),

('NEW_AUTH_UID','PIPE'),

('NEW_AUTH_UID','SHEET');
```

---

# ขั้นตอนที่ 7 ตรวจสอบ

```sql


select
    p.id profile_id,
    p.username,
    u.id auth_id,
    u.email

from profiles p
join auth.users u
on p.id=u.id
where username='ADMINACC';

```

ผลลัพธ์ต้องเป็น

profile_id = auth_id

---

# ขั้นตอนที่ 8 ทดสอบ Login

Username

ADMINACC

Password

********

ระบบจะทำงานดังนี้

Username

↓

ค้นหา Email จาก Profiles

↓

Supabase Auth

↓

โหลด Profile

↓

AUTH_GUARD

↓

Redirect ตาม Role

---

# Error ที่พบบ่อย

## Invalid login credentials

สาเหตุ

- Password ไม่ถูก
- ยังไม่มี User ใน Authentication

---

## Profile ไม่พบ

สาเหตุ

profiles.id

ไม่ตรง

auth.users.id

---

## Foreign Key Error

เช่น

user_departments_user_id_fkey

วิธีแก้

1. DELETE user_departments
2. UPDATE profiles.id
3. INSERT user_departments ใหม่

---

# ตารางที่ต้องตรงกัน

auth.users

id
email

↓

profiles

id
email
username
role

↓

user_departments

user_id

ทุก UUID ต้องเป็นค่าเดียวกัน

---

# ระบบ Login ใหม่

ผู้ใช้กรอก

Username

Password

↓

ค้นหา Username ใน Profiles

↓

อ่าน Email

↓

Login ผ่าน Supabase Auth

↓

โหลด Profile

↓

AUTH_GUARD

↓

CURRENT_USER

↓

Redirect ตาม Role

---

# สิ่งที่ทำเสร็จแล้ว

✅ เปลี่ยนจาก Custom Login เป็น Supabase Auth

✅ Login ด้วย Username ได้

✅ ADMIN_T ใช้งานได้

✅ ADMINACC ใช้งานได้

✅ AUTH_GUARD เป็นศูนย์กลาง Authentication

✅ Admin Panel ใช้งานได้

✅ Accounting Panel ใช้งานได้

---

# แผนงานต่อไป

□ Supervisor

□ Staff

□ QR Login

□ Dashboard

□ User Management

□ Reset Password

□ Add User อัตโนมัติ (สร้าง Auth + Profiles + User Departments)

เมื่อเสร็จ ผู้ดูแลระบบจะไม่ต้องเข้า Supabase Dashboard อีกต่อไป


```sql

-- 1) ลบสิทธิ์แผนกของ id เก่าก่อน
delete from user_departments
where user_id = '8bee3b61-88ea-4953-bb71-7c7e703d6c19';

-- 2) เปลี่ยน profiles.id ให้ตรงกับ Auth UID
update profiles
set
  id = '3129c8ed-5d6f-400a-927a-7c2b1d07f401',
  email = 'h_blow@pvt.local',
  role = 'supervisor',
  status = 'active'
where username = 'HBLOW';

-- 3) เช็คผล
select
  p.id as profile_id,
  p.username,
  p.email,
  u.id as auth_id,
  u.email as auth_email
from profiles p
join auth.users u
  on p.id = u.id
where p.username = 'HBLOW';

```