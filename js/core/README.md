# Core Module
ไฟล์ส่วนกลางที่ทุกระบบใช้งานร่วมกัน

## ไฟล์
### supabase.js
สร้าง Supabase Client

### roles.js
กำหนด Role ของผู้ใช้

### permissions.js
กำหนดสิทธิ์การเข้าถึง

### utils.js
ฟังก์ชันช่วยเหลือทั่วไป



📁 /core

ใช้เก็บไฟล์กลางของระบบ (Shared/Common)

ทุกหน้าเรียกใช้ร่วมกัน

ตัวอย่าง

/core
├─ supabase.js
├─ config.js
├─ constants.js
├─ roles.js
├─ permissions.js
├─ utils.js
├─ helpers.js
├─ notifications.js
├─ modal.js
└─ storage.js

หน้าที่

Config ระบบ
Supabase Client
Role และ Permission
Function กลาง
Toast
Modal
LocalStorage
Format วันที่
Format เงิน