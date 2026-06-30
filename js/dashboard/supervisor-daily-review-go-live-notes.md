# Supervisor Daily Review Go Live Patch

## สิ่งที่แก้

- หน้า Supervisor แสดงรายการปัญหาเป็นตาราง
- ดึงข้อมูลปัญหาย่อยจาก `daily_waste_report_items`
- ถ้ารายการเก่าไม่มี items จะ fallback จาก `daily_waste_reports`
- กด `ตรวจแล้ว / ส่งบัญชี` แล้ว status เป็น `sent_accounting`
- หน้า Accounting ควรแสดงเฉพาะ status = `sent_accounting`

## วิธีใช้เร็วที่สุด

1. เอาโค้ดใน `supervisor-daily-review-go-live-patch.js` ไปวางท้ายไฟล์:

```text
/js/dashboard/supervisor-daily-review.js
```

2. เอาโค้ดใน `supervisor-daily-review-go-live-patch.css` ไปวางท้ายไฟล์:

```text
/css/supervisor-daily-review.css
```

3. แก้ตัวเลือกใน HTML ตรงสถานะจาก `resolved` เป็น `sent_accounting`:

```html
<option value="sent_accounting">ส่งบัญชีแล้ว</option>
```

4. ถ้า Accounting ยังไม่เห็นข้อมูล ให้เช็กว่า JS หน้า Accounting โหลดเฉพาะ:

```js
.eq("status", "sent_accounting")
```

หรือรองรับชุดสถานะ `sent_accounting` ใน filter แล้ว
