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