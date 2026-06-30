# Authentication Module

โฟลเดอร์นี้ใช้สำหรับระบบยืนยันตัวตนทั้งหมด

## ไฟล์

### login.js
จัดการการเข้าสู่ระบบ

### protect-page.js
ตรวจสอบสิทธิ์ก่อนเข้าใช้งานหน้าเว็บ

### qr-login.js
รองรับการ Login ผ่าน QR Code

## หมายเหตุ

- ทุกหน้าที่ต้อง Login ต้องเรียก protectPage()
- ใช้งานร่วมกับ Supabase Auth




📁 /auth

ใช้เก็บไฟล์เกี่ยวกับการยืนยันตัวตน (Authentication)

ตัวอย่าง

/auth
├─ login.html
├─ login.js
├─ register.html
├─ forgot-password.html
├─ reset-password.html
├─ qr-login.html
├─ auth.js
└─ protect-page.js

หน้าที่

Login
Logout
Register
Reset Password
QR Login
ตรวจสอบ Session
ตรวจสอบสิทธิ์ (Role)