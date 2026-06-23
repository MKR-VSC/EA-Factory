EA Factory - Supervisor Dashboard

ไฟล์ในชุดนี้:
1. supervisor-dashboard.html
   วางที่ /pages/supervisor-dashboard.html

2. supervisor-dashboard.css
   วางที่ /css/supervisor-dashboard.css

3. supervisor-dashboard.js
   วางที่ /js/dashboard/supervisor-dashboard.js

สิ่งที่แก้เพิ่ม:
- แก้บั๊ก currentProfile ถูกเรียกก่อนตรวจสอบ null
- เพิ่มคอมเมนท์ละเอียดใน HTML และ JS
- KPI 4 ช่องสำหรับหัวหน้างาน
- เครื่องที่ของเสียสูงสุดใช้ยอด kg ไม่ใช่จำนวนครั้ง
- Top 5 จุดที่ควรแก้ก่อนเรียงตามน้ำหนักของเสีย
- กราฟเครื่องจักรเปลี่ยนเป็น kg
- รองรับสถานะ pending / checking / progress / resolved / approved / rejected
