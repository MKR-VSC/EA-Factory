src/
│
├─ auth/
│   ├─ README.md
│   ├─ login.js
│   └─ protect-page.js
│
├─ core/
│   ├─ README.md
│   ├─ supabase.js
│   └─ roles.js
│
├─ pages/
│   ├─ README.md
│   ├─ dashboard/
│   └─ production/



EA-FACTORY/
│
├─ auth/
├─ core/
├─ html/
├─ css/
├─ js/
    ├─ services/
    ├─ components/
    └─ pages/

├─ assets/
│
├─ index.html
└─ login.html


// {
//   "name": "EA Factory",
//   "short_name": "EA Factory",
//   "start_url": "login.html",
//   "display": "standalone",
//   "background_color": "#ffffff",
//   "theme_color": "#222A38",
//   "icons": [
//     {
//       "src": "/icons/Ea_Factory_192.png",
//       "sizes": "192x192",
//       "type": "image/png"
//     },
//     {
//       "src": "/icons/Ea_Factory_512.png",
//       "sizes": "512x512",
//       "type": "image/png"
//     }
//   ]
// }


ตอนเปิดหน้า

login.html
   ↓
auth/login.js
   ↓
core/supabaseClient.js
   ↓
services/userService.js
   ↓
pages/dashboard/index.js




เรียงตามความสำคัญ
1. core
2. auth
3. services
4. components
5. pages
6. assets

เพราะลำดับการทำงานจริงของระบบคือ

core
 ↓
auth
 ↓
services
 ↓
components
 ↓
pages
 ↓
assets



โปรเจกต์ EA Factory / Workforce Hub / Daily Defect ที่เริ่มใหญ่แล้ว ผมแนะนำแบบนี้

src/
│
├─ core/               ⭐ แกนหลักของระบบ
│   ├─ supabaseClient.js
│   ├─ roleConfig.js
│   ├─ permissions.js
│   ├─ constants.js
│   ├─ helpers.js
│   └─ README.md
│
├─ auth/               ⭐ ระบบ Login / Session
│   ├─ auth.js
│   ├─ login.js
│   ├─ protectPage.js
│   ├─ qr-login.js
│   └─ README.md
│
├─ services/           ⭐ ติดต่อ Supabase/API
│   ├─ userService.js
│   ├─ reportService.js
│   ├─ claimService.js
│   └─ approvalService.js
│
├─ components/         ⭐ UI ที่ใช้ซ้ำ
│   ├─ sidebar.js
│   ├─ topbar.js
│   ├─ modal.js
│   ├─ toast.js
│   └─ loading.js
│
├─ pages/              ⭐ Logic ของแต่ละหน้า
│   ├─ dashboard/
│   ├─ claims/
│   ├─ approval/
│   ├─ accounting/
│   ├─ workforce/
│   └─ admin/
│
├─ assets/
│   ├─ css/
│   │   ├─ root.css
│   │   ├─ theme.css
│   │   └─ components.css
│   │
│   ├─ images/
│   ├─ icons/
│   └─ sounds/
│
└─ index.js





จำง่ายกว่า:

auth      = ระบบ login / register / reset password
core      = ของกลาง เช่น Supabase, role, permission
services  = คุยกับฐานข้อมูล
pages     = ไฟล์ HTML ของหน้าต่าง ๆ
js        = JavaScript ของแต่ละหน้า
css       = CSS ของแต่ละหน้า
images    = รูปภาพ
icons     = ไอคอน / PWA
database  = SQL



EA-Factory/
│
├─ index.html
├─ login.html
├─ register.html
├─ manifest.json
├─ README.md
│
├─ auth/
│  ├─ login.js
│  ├─ register.js
│  ├─ reset-password.js
│  └─ README.md
│
├─ core/
│  ├─ supabaseClient.js
│  ├─ auth.js
│  ├─ roleConfig.js
│  ├─ permissions.js
│  ├─ helpers.js
│  └─ README.md
│
├─ services/
│  ├─ userService.js
│  ├─ departmentService.js
│  └─ reportService.js
│
├─ pages/
│  ├─ admin-panel.html
│  ├─ accounting-panel.html
│  ├─ form-department.html
│  ├─ pr-form.html
│  └─ reset-password.html
│
├─ js/
│  ├─ dashboard/
│  │  └─ index.js
│  ├─ admin/
│  │  └─ admin-panel.js
│  ├─ accounting/
│  │  └─ accounting-panel.js
│  ├─ department/
│  │  └─ form-department.js
│  └─ pr/
│     └─ pr-form.js
│
├─ css/
│  ├─ root.css     ✅ เก็บสีกลางทั้งหมด     เรียก root ก่อน CSS หน้าอื่น ต้องอยู่บนสุดเสมอ เพราะไฟล์อื่นจะเรียกใช้ตัวแปรสีจากไฟล์นี้<link rel="stylesheet" href="/css/root.css" />
│  ├─ login.css
│  ├─ index.css
│  ├─ admin-panel.css
│  ├─ accounting-panel.css
│  ├─ form-department.css
│  ├─ pr-form.css
│  └─ reset-password.css
│
├─ images/
│  └─ EA_Factory.png
│
├─ icons/
│  ├─ logo_192.png
│  └─ logo_512.png
│
├─ docs/
│  └─ schema.md
│
├─ supabase/
└─ .vscode/



Date : 23 / 06 / 69

1. ย้ายศูนย์กลางแผนกทั้งหมดไปที่ master_departments

เดิมระบบมี 2 ตาราง

departments
master_departments

ทำให้ข้อมูลแผนกซ้ำกัน

วันนี้ตัดสินใจว่า

master_departments

จะเป็น Master Table หลักของทั้งระบบ

2. ตรวจสอบ FK ของ profiles

ตรวจพบว่า

profiles

ยังไม่ได้ผูก FK เลย

มีเพียง

profiles_pkey
profiles_username_key
3. แก้ข้อมูล department_code ใน profiles

พบข้อมูลเก่า

บัญชี
IT SUPPORT
โมโน
ตัดเจาะ
แผนก A
แผนก B

แก้ให้เป็นมาตรฐานใหม่

MONO
CUT_PUNCH

และล้างค่าที่ไม่มีใน master

บัญชี
IT SUPPORT
แผนก A
แผนก B
4. ผูก FK profiles → master_departments

สร้างความสัมพันธ์

profiles.department_code
        ↓
master_departments.department_code

ทำให้ User จะอยู่ได้เฉพาะแผนกที่มีจริง

5. ย้าย daily_waste_reports ไปใช้ master_departments

ลบ FK เก่า

daily_waste_reports
    ↓
departments

แล้วเปลี่ยนเป็น

daily_waste_reports
    ↓
master_departments

ตรวจสอบแล้วสำเร็จ

daily_waste_reports_department_code_fkey
6. พบสาเหตุ Error ตอนบันทึกข้อมูล

ฐานข้อมูลใช้

MONO
BLOW
PIPE
CUT_PUNCH

แต่ JS ยังส่ง

mono
blow
pipe
drill

ทำให้

violates foreign key constraint

ทุกครั้ง

7. วิเคราะห์ไฟล์ form-department.js

พบว่ามี Hardcode แผนกไว้

VALID_DEPARTMENTS
DEPARTMENT_NAMES
normalizeDept()

ซึ่งจะมีปัญหาทุกครั้งเมื่อเพิ่มแผนกใหม่

8. ปรับแนวคิดใหม่

จากเดิม

JS เป็นคนกำหนดแผนก

เปลี่ยนเป็น

master_departments เป็นคนกำหนดแผนก

ทั้งหมด

9. สร้างไฟล์ใหม่

สร้างเวอร์ชัน

form-department-master-departments.js

และ

form-department-dynamic-master-departments.js

เพื่อให้รองรับ

MONO
BLOW
PIPE
CUT_PUNCH
RAIN_TAPE
SHADE_NET
...

จากฐานข้อมูล

10. แก้ปัญหา Auto Logout

ปัญหาเดิม

หมดเวลาใช้งาน
↓
ออกจากระบบ
↓
ยังค้างที่ form-department.html
↓
เด้ง popup กรอกชื่อ

ผู้ใช้เข้าใจผิดว่ายังใช้งานได้

11. ปรับระบบ Logout ใหม่

แก้ให้

หมดเวลา
↓
SignOut
↓
ล้าง Session
↓
Redirect Login

และ

window.location.replace("/login.html")

เพื่อกันกด Back กลับมา