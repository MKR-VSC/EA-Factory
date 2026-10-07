-- =====================================================
-- EA Factory / 08-fix-login-accounts.sql
-- แก้ปัญหา "เข้าระบบไม่ได้" หลังปิดช่องโหว่ล็อกอิน
--
-- สาเหตุ: ระบบเดิมยอมให้เข้าได้แม้ตรวจรหัสผ่านกับ Supabase Auth ไม่ผ่าน
-- ผู้ใช้ที่มีรหัสผ่านอยู่แค่ในตาราง profiles (ยังไม่มีบัญชีใน Supabase Auth)
-- หรืออีเมลใน profiles ไม่ตรงกับบัญชี Auth จึงเข้าไม่ได้แล้ว
--
-- วิธีใช้: Supabase → SQL Editor
--   ขั้นที่ 1 รันส่วน "ตรวจสอบ" ก่อน เพื่อดูว่าแต่ละ user ติดตรงไหน
--   ขั้นที่ 2 รันส่วน "ซ่อม" (รันซ้ำได้ ไม่ลบข้อมูล)
--   ขั้นที่ 3 รันส่วน "ตรวจสอบ" อีกครั้ง ทุกแถวควรเป็น OK
-- =====================================================


-- =====================================================
-- ขั้นที่ 1) ตรวจสอบ
-- =====================================================
SELECT * FROM (
SELECT
  p.username,
  p.role,
  p.status,
  p.email                         AS profile_email,
  u.email                         AS auth_email,
  CASE
    WHEN lower(coalesce(p.status, 'active')) <> 'active'
      THEN 'ปิดใช้งานอยู่ (status = ' || p.status || ')'
    WHEN u.id IS NULL AND ue.id IS NOT NULL
      THEN 'มีบัญชี Auth อีเมลเดียวกันแต่ id ไม่ตรงกับ profiles — ต้องแก้ด้วยมือ'
    WHEN u.id IS NULL AND coalesce(p.password, '') = ''
      THEN 'ไม่มีบัญชี Auth และไม่มีรหัสเดิม — ตั้งรหัสใหม่ด้วยการลบ/เพิ่มผู้ใช้ในหน้า Admin'
    WHEN u.id IS NULL
      THEN 'ไม่มีบัญชี Auth — ส่วนซ่อมจะสร้างให้ด้วยรหัสเดิมใน profiles'
    WHEN u.email_confirmed_at IS NULL
      THEN 'บัญชี Auth ยังไม่ยืนยันอีเมล — ส่วนซ่อมจะยืนยันให้'
    WHEN lower(coalesce(p.email, '')) <> lower(u.email)
      THEN 'อีเมลใน profiles ไม่ตรงกับ Auth — ส่วนซ่อมจะแก้ให้ตรง'
    ELSE 'OK'
  END AS login_check
FROM public.profiles p
LEFT JOIN auth.users u  ON u.id = p.id
LEFT JOIN auth.users ue ON u.id IS NULL
                        AND lower(ue.email) = lower(coalesce(nullif(p.email, ''), lower(p.username) || '@pvt.local'))

) chk
ORDER BY (chk.login_check <> 'OK') DESC, chk.username;


-- =====================================================
-- ขั้นที่ 2) ซ่อม
-- =====================================================
BEGIN;

-- 2.1 status ว่าง → active
UPDATE public.profiles SET status = 'active' WHERE status IS NULL OR trim(status) = '';

-- 2.2 สร้างบัญชี Supabase Auth ให้ profile ที่ยังไม่มี (ใช้ id เดิม + รหัสผ่านเดิมใน profiles)
--     ข้ามแถวที่อีเมลนี้ถูกใช้โดยบัญชี Auth อื่นอยู่แล้ว
WITH todo AS (
  SELECT
    p.id,
    lower(coalesce(nullif(trim(p.email), ''), lower(p.username) || '@pvt.local')) AS email,
    p.password,
    p.username, p.display_name, p.full_name, p.role, p.department, p.department_code
  FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
    AND coalesce(p.password, '') <> ''
)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
SELECT
  '00000000-0000-0000-0000-000000000000', t.id, 'authenticated', 'authenticated', t.email,
  extensions.crypt(t.password, extensions.gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object(
    'username', t.username, 'display_name', t.display_name, 'full_name', t.full_name,
    'role', t.role, 'department', t.department, 'department_code', t.department_code
  ),
  now(), now(),
  '', '', '', ''
FROM todo t
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = t.email);

-- 2.3 identity แบบ email ให้ทุกบัญชีที่ยังไม่มี (จำเป็นต่อการล็อกอินด้วยรหัสผ่าน)
INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT
  gen_random_uuid(), u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
);

-- 2.4 ยืนยันอีเมลให้บัญชีของระบบที่ยังไม่ยืนยัน (ระบบใช้อีเมล @pvt.local ซึ่งรับเมลไม่ได้)
UPDATE auth.users u
SET email_confirmed_at = now()
FROM public.profiles p
WHERE p.id = u.id AND u.email_confirmed_at IS NULL;

-- 2.5 ให้อีเมลใน profiles ตรงกับบัญชี Auth (หน้า Login ใช้อีเมลนี้ล็อกอิน)
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id AND lower(coalesce(p.email, '')) <> lower(u.email);

COMMIT;
