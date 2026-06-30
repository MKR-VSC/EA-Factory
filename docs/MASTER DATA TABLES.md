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
