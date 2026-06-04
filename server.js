const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

// อนุญาตให้หน้าบ้าน (Frontend พอร์ต 5500) เชื่อมต่อมายังหลังบ้านได้
app.use(cors());
app.use(express.json());

// 🗄️ ตัวอย่างฐานข้อมูลจำลองบน Server (ปรับคีย์โครงสร้างให้แมตช์กับระบบฟอร์มและแดชบอร์ดเวอร์ชันใหม่)
let globalReportsData = [
    { 
        id: 1, 
        datetime: "2026-06-02 10:30", 
        department: "blow", 
        type: "ฟิล์มเป็นเจล", 
        reportType: "ชิ้นงานชำรุด/ไม่ได้ขนาด (Defect)",
        detail: "เครื่องเป่า 02 เม็ดสิวสะสมสูง",
        status: "pending"
    },
    { 
        id: 2, 
        datetime: "2026-06-02 11:15", 
        department: "pipe", 
        type: "ขนาดท่อไม่ได้มาตรฐาน", 
        reportType: "ชิ้นงานชำรุด/ไม่ได้ขนาด (Defect)",
        detail: "ท่อ PE 2 นิ้ว หนาเกินเกณฑ์",
        status: "pending"
    }
];

// ----------------------------------------------------
// [MIDDLEWARE] ระบบตรวจสิทธิ์หลังบ้าน (Role Authorization)
// ----------------------------------------------------
function checkManagementPermission(req, res, next) {
    // ดึงค่าสิทธิ์ที่ส่งมาจากหน้าบ้านผ่าน Headers
    const userRole = req.headers['user-role']; 
    const secretKey = req.headers['x-pvt-secure-key']; // รหัสลับภายในองค์กรสำหรับล้างระบบ

    if (userRole === 'management' && secretKey === 'PVT_SECRET_2026') {
        next(); // สิทธิ์ถูกต้อง อนุญาตให้ไปทำงานในฟังก์ชันถัดไป (เช่น ล้างข้อมูล)
    } else {
        res.status(403).json({ 
            success: false, 
            message: "🔴 ล้มเหลว: คุณไม่มีสิทธิ์เข้าถึงคำสั่งนี้ หรือรหัสความปลอดภัยไม่ถูกต้อง!" 
        });
    }
}

// ----------------------------------------------------
// [API ROUTES]
// ----------------------------------------------------

// 1. API สำหรับดึงข้อมูลไปโชว์ที่แดชบอร์ด (สิทธิ์: หัวหน้า/ผู้บริหาร)
app.get('/api/reports', (req, res) => {
    res.json({ success: true, data: globalReportsData });
});

// 2. API สำหรับพนักงานส่งข้อมูลปัญหาเข้ามาจากหน้าฟอร์ม (สิทธิ์: พนักงานทุกคน)
app.post('/api/reports', (req, res) => {
    // ดึงเวลาที่พนักงานเลือกจากหน้างาน ถ้าไม่มีให้ใช้เวลาปัจจุบันของเซิร์ฟเวอร์
    const eventDateTime = req.body.datetime || new Date().toISOString().replace('T', ' ').substring(0, 16);

    const newReport = {
        id: globalReportsData.length + 1,
        datetime: eventDateTime,
        department: req.body.department || 'unknown',
        type: req.body.type || 'อื่นๆ',
        reportType: req.body.reportType || 'ไม่ได้ระบุหมวดหมู่', // รับค่าหมวดหมู่หลักไปคำนวณกราฟวงกลม
        detail: req.body.detail || '',
        status: req.body.status || 'pending' // บันทึกสถานะตั้งต้นเป็นรอดำเนินการ
    };

    globalReportsData.push(newReport);
    console.log("📥 [NEW REPORT RECEIVED]:", newReport); // โชว์ข้อมูลที่พนักงานส่งมาบนหน้าจอ Terminal หลังบ้าน
    
    res.status(201).json({ 
        success: true, 
        message: "บันทึกข้อมูลเข้าเซิร์ฟเวอร์กลางแล้ว", 
        data: newReport 
    });
});

// 3. API สำหรับล้างข้อมูลทั้งหมดในระบบ (สิทธิ์: เฉพาะผู้บริหารที่ผ่านการตรวจสิทธิ์)
app.delete('/api/reports/clear-all', checkManagementPermission, (req, res) => {
    // สั่งเซ็ตซีโร่ฐานข้อมูลบน Server
    globalReportsData = []; 
    
    console.log("⚠️ [SYSTEM ALERT]: ฐานข้อมูลถูกล้างประวัติโดยผู้บริหาร");
    res.json({ 
        success: true, 
        message: "🗑️ หลังบ้านทำการล้างประวัติข้อมูลทั้งหมดของ บจก.พี.วี.ที.แอนด์ ที.พลาส เรียบร้อยแล้ว!" 
    });
});

// เปิด Server พอร์ต 3000
app.listen(PORT, () => {
    console.log(`🚀 Cyber Factory Backend running on http://localhost:${PORT}`);
});