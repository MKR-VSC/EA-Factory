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