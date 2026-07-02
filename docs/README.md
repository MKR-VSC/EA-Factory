
/============================= DATE 25 JUN 2026 =============================/

-- ======================================================
-- ADMIN RLS POLICY
-- ให้ role = admin แก้ไขได้ทุกตารางหลักของ Daily Defect
-- ======================================================

-- 1) ฟังก์ชันตรวจสอบว่า user ปัจจุบันเป็น admin หรือไม่
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and lower(role) = 'admin'
      and lower(coalesce(status, 'active')) = 'active'
  );
$$;


-- ======================================================
-- daily_waste_reports
-- ======================================================
alter table public.daily_waste_reports enable row level security;

drop policy if exists "admin_all_daily_waste_reports" on public.daily_waste_reports;

create policy "admin_all_daily_waste_reports"
on public.daily_waste_reports
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());


-- ======================================================
-- profiles
-- ======================================================
alter table public.profiles enable row level security;

drop policy if exists "admin_all_profiles" on public.profiles;

create policy "admin_all_profiles"
on public.profiles
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());


-- ======================================================
-- master_departments
-- ======================================================
alter table public.master_departments enable row level security;

drop policy if exists "admin_all_master_departments" on public.master_departments;

create policy "admin_all_master_departments"
on public.master_departments
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());


-- ======================================================
-- master_machines
-- ======================================================
alter table public.master_machines enable row level security;

drop policy if exists "admin_all_master_machines" on public.master_machines;

create policy "admin_all_master_machines"
on public.master_machines
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());


-- ======================================================
-- master_problems
-- ======================================================
alter table public.master_problems enable row level security;

drop policy if exists "admin_all_master_problems" on public.master_problems;

create policy "admin_all_master_problems"
on public.master_problems
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());


-- ======================================================
-- master_shifts
-- ======================================================
alter table public.master_shifts enable row level security;

drop policy if exists "admin_all_master_shifts" on public.master_shifts;

create policy "admin_all_master_shifts"
on public.master_shifts
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

/============================= DATE 25 JUN 2026 =============================/

-- ======================================================
-- OPTIONAL SQL: MASTER DATA TABLES
-- ใช้เมื่อใน Supabase ยังไม่มีตาราง Master Data
-- ======================================================

create table if not exists master_departments (
  id uuid primary key default gen_random_uuid(),
  department_code text not null unique,
  department_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists master_machines (
  id uuid primary key default gen_random_uuid(),
  department_code text,
  department text,
  machine_no text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists master_problems (
  id uuid primary key default gen_random_uuid(),
  department_code text,
  department text,
  problem_type text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists master_shifts (
  id uuid primary key default gen_random_uuid(),
  shift_name text not null,
  shift_time text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into master_departments (department_code, department_name)
values
  ('BLOW', 'เป่าถุง'),
  ('PIPE', 'ท่อ'),
  ('SHEET', 'ตัดผืน'),
  ('MONO', 'โมโน'),
  ('TAPE', 'เทป / สแลน'),
  ('CUTTING', 'ตัดเจาะ')
on conflict (department_code) do nothing;

insert into master_shifts (shift_name, shift_time)
values
  ('กะ A (กลางวัน)', '08:00 - 17:00'),
  ('กะ B (กลางคืน/OT)', '18:00 - 20:00');



/============================= DATE 02 JUL 2026 =============================/

แก้ที่ Supabase RLS ของตาราง daily_waste_report_items ค่ะ
ตอนนี้บันทึกหัวรายงานได้ แต่บันทึกรายการปัญหาย่อยไม่ได้ เพราะตารางนี้ยังไม่อนุญาต insert

ให้ไปที่ Supabase → SQL Editor แล้วรันชุดนี้ค่ะ


-- เปิด RLS
alter table public.daily_waste_report_items enable row level security;

-- ลบ policy เก่าถ้ามี
drop policy if exists "daily_waste_report_items_select_all" on public.daily_waste_report_items;
drop policy if exists "daily_waste_report_items_insert_all" on public.daily_waste_report_items;
drop policy if exists "daily_waste_report_items_update_all" on public.daily_waste_report_items;
drop policy if exists "daily_waste_report_items_delete_admin" on public.daily_waste_report_items;

-- อนุญาตอ่าน
create policy "daily_waste_report_items_select_all"
on public.daily_waste_report_items
for select
to anon, authenticated
using (true);

-- อนุญาตเพิ่มข้อมูล
create policy "daily_waste_report_items_insert_all"
on public.daily_waste_report_items
for insert
to anon, authenticated
with check (true);

-- อนุญาตแก้ไข
create policy "daily_waste_report_items_update_all"
on public.daily_waste_report_items
for update
to anon, authenticated
using (true)
with check (true);

ถ้าหน้าฟอร์ม QR ใช้งานแบบ ไม่ login ต้องมี to anon แบบด้านบนค่ะ ไม่งั้นจะเจอ permission denied เหมือนรูปนี้เลย

รันแล้วลองกรอกใหม่อีกครั้งค่ะ น่าจะผ่านแล้วค่ะ.