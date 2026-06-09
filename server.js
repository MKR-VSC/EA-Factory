const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

// 🔑 เปิดสิทธิ์ CORS และรองรับ JSON Payload (ให้หน้าบ้านดึงข้อมูลข้ามพอร์ตได้ปลอดภัย)
app.use(cors());
app.use(express.json());

// 🗄️ ฐานข้อมูลจำลองบน Server (คงรูปแบบตามที่พี่กำหนดไว้เป๊ะๆ)
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
    // ดึงค่าสิทธิ์และรหัสตรวจสอบความปลอดภัยจาก Headers ที่หน้าบ้านส่งมา
    const userRole = req.headers['user-role']; 
    const secretKey = req.headers['x-pvt-secure-key']; // รหัสลับภายในองค์กรสำหรับล้างระบบ

    if (userRole === 'management' && secretKey === 'PVT_SECRET_2026') {
        next(); // สิทธิ์ถูกต้อง ผ่านมิดเดิ้ลแวร์ไปทำงานฟังก์ชันถัดไปได้
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

// 1. API GET: ดึงข้อมูลรายงานปัญหาทั้งหมดไปโชว์ที่หน้าบ้าน
app.get('/api/reports', (req, res) => {
    // ส่งออก Object ที่มี success และข้อมูล data เป็นอาร์เรย์
    res.json({ success: true, data: globalReportsData });
});

// 2. API POST: รับข้อมูลรายงานข้อบกพร่องใหม่เข้ามาจากพนักงานหน้างาน
app.post('/api/reports', (req, res) => {
    // ตรวจสอบวันเวลาเกิดเหตุ ถ้าไม่มีส่งมาให้ใช้เวลาปัจจุบันของเซิร์ฟเวอร์
    const eventDateTime = req.body.datetime || new Date().toISOString().replace('T', ' ').substring(0, 16);

    const newReport = {
        id: globalReportsData.length + 1,
        datetime: eventDateTime,
        department: req.body.department || 'unknown',
        type: req.body.type || 'อื่นๆ',
        reportType: req.body.reportType || 'ไม่ได้ระบุหมวดหมู่', 
        detail: req.body.detail || '',
        status: req.body.status || 'pending'
    };

    globalReportsData.push(newReport);
    console.log("📥 [NEW REPORT RECEIVED]:", newReport); // แฟลชประวัติขึ้นที่หน้า Console จอดำหลังบ้าน
    
    res.status(201).json({ 
        success: true, 
        message: "บันทึกข้อมูลเข้าเซิร์ฟเวอร์กลางแล้ว", 
        data: newReport 
    });
});

// 3. API DELETE: คำสั่งล้างฐานข้อมูลระบบทั้งหมด (ต้องผ่านด่านตรวจสิทธิ์)
app.delete('/api/reports/clear-all', checkManagementPermission, (req, res) => {
    // ทำลายอาร์เรย์ เคลียร์ค่าฐานข้อมูลจำลองบน RAM
    globalReportsData = []; 
    
    console.log("⚠️ [SYSTEM ALERT]: ฐานข้อมูลถูกล้างประวัติโดยผู้บริหาร");
    res.json({ 
        success: true, 
        message: "🗑️ หลังบ้านทำการล้างประวัติข้อมูลทั้งหมดของ บจก.พี.วี.ที.แอนด์ ที.พลาส เรียบร้อยแล้ว!" 
    });
});

// 🚀 รันเปิดเซิร์ฟเวอร์ Node.js ฟังคำขอที่พอร์ต 3000
app.listen(PORT, () => {
    console.log(`🚀 Cyber Factory Backend running on http://localhost:${PORT}`);
});