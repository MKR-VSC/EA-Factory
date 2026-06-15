// =================================================================
// reset-password.js - ระบบยิงคำขอเปลี่ยนรหัสผ่านเข้าฐานข้อมูลตารางผลิต PVT
// =================================================================

// 🔑 การเชื่อมต่อ Supabase Client 
const SUPABASE_URL = "https://wkbahssqznlpkkghwffg.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrYmFoc3Nxem5scGtrZ2h3ZmZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwOTg2MDYsImV4cCI6MjA5NjY3NDYwNn0.c6XJi91bPcKNikUTw28KqJ4gi7yqPTdT4pUKKAhSsEM";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

document.getElementById('form-reset-password').addEventListener('submit', async function(event) {
    // หยุดการรีเฟรชหน้าเพื่อป้องกัน Handler ค้างหน่วงเวลา
    event.preventDefault();

    const username = document.getElementById('reset-username').value;
    const department = document.getElementById('reset-dept').value;
    const newPassword = document.getElementById('reset-new-password').value;
    const reason = document.getElementById('reset-reason').value;
    const submitBtn = document.getElementById('btn-submit-reset');

    // ปิดปุ่มชั่วคราวระงับการกดเบิ้ลซ้ำ
    submitBtn.disabled = true;
    submitBtn.innerText = "⏳ กำลังส่งคำขอไปยังไอที...";

    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());

    // ประกอบแพ็กเกจข้อมูลยิงเข้าตารางกลางเพื่อบันทึก log
    const resetPayload = {
        incident_datetime: now.toISOString().slice(0, 16),
        work_shift: "ระบบกลาง", 
        department: department,
        machine_no: "IT-SUPPORT", 
        problem_type: "ลืมรหัสผ่าน",
        report_type: "คำขอรีเซ็ทรหัสผ่าน",
        waste_weight_kg: 0,
        detail: `ขอเปลี่ยนรหัสใหม่เป็น: ${newPassword} | เหตุผล: ${reason}`,
        status: "pending",
        reported_by: username
    };

    try {
        const { error } = await supabase
            .from('pvt_production_reports')
            .insert([resetPayload]);

        if (error) throw error;

        alert(`📬 ส่งคำขอรีเซ็ทรหัสผ่านของ Username: ${username} สำเร็จ!\nกรุณาแจ้งฝ่ายไอทีให้ตรวจสอบและอนุมัติในระบบหลังบ้านครับ`);
        window.location.href = 'login2.html'; 

    } catch (err) {
        console.error("Reset Error:", err);
        alert("❌ เกิดข้อผิดพลาดในการส่งคำขอ: " + err.message);
    } finally {
        // เปิดใช้งานปุ่มคืนสถานะเดิมกรณีทำงานเสร็จหรือผิดพลาด
        submitBtn.disabled = false;
        submitBtn.innerText = "🚀 ส่งคำขอไปยังระบบไอที";
    }
});