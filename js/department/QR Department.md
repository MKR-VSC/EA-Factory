# EA Factory - QR Department + QR Machine

ชุดนี้มี 3 ไฟล์พร้อมใช้งาน:

- `form-department.html`
- `form-department.css`
- `form-department.js`

## วิธีวางไฟล์

```text
/pages/form-department.html
/css/form-department.css
/js/department/form-department.js
```

## ตัวอย่างลิงก์ QR

QR แยกแผนก:

```text
/pages/form-department.html?dept=blow
```

QR รายเครื่อง:

```text
/pages/form-department.html?dept=blow&machine=BLOW-01
```

## หลักการทำงาน

- ถ้ามี `dept` ใน URL ระบบจะเลือกแผนกนั้น
- ถ้ามี `machine` ใน URL ระบบจะเลือกเครื่องนั้นและล็อกช่องเครื่อง
- ถ้าไม่มี `machine` ระบบยังให้เลือกเครื่องเองได้เหมือนเดิม
- ถ้า master data ยังไม่มีเครื่องจาก QR ระบบจะเพิ่ม option ชั่วคราวให้บันทึกได้ก่อน

## หมายเหตุ

ไฟล์ JS ใส่คอมเมนท์ละเอียดไว้ตามส่วน เช่น URL/QR, User, Auto Logout, Master Data, Submit, Duplicate Check
