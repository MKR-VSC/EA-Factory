// =================================================================
// register.js - ระบบสมัครและแมปฐานข้อมูลเข้าโครงสร้างสิทธิ์โรงงาน PVT
// =================================================================

// 🔑 การเชื่อมต่อ Supabase Client 
const SUPABASE_URL = "https://wkbahssqznlpkkghwffg.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrYmFoc3Nxem5scGtrZ2h3ZmZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwOTg2MDYsImV4cCI6MjA5NjY3NDYwNn0.c6XJi91bPcKNikUTw28KqJ4gi7yqPTdT4pUKKAhSsEM";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ดักจับ Event ตอนผู้ใช้กดส่งข้อมูลสมัครสมาชิก
document.getElementById('form-register-pvt').addEventListener('submit', async function(event) {
    // 1️⃣ หยุดการทำงานเริ่มต้นทันทีเพื่อแก้ปัญหาเบราว์เซอร์ค้างหน่วงเวลา
    event.preventDefault();

    const username = document.getElementById('username').value;
    const department = document.getElementById('department').value;
    const role = document.getElementById('role').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const submitBtn = document.getElementById('btn-submit-pvt');

    // 2️⃣ ป้องกันการกดปุ่มซ้ำซ้อนระหว่างคุยฐานข้อมูล
    submitBtn.disabled = true;
    submitBtn.innerText = "⏳ กำลังบันทึกข้อมูลสมาชิก...";

    try {
        // ขั้นตอนที่ 1: สมัครเข้าสู่ระบบตรวจสอบสิทธิ์ของ Supabase Auth
        const { data, error } = await supabase.auth.signUp({
            email: email,
            password: password
        });

        if (error) throw error;

        // ขั้นตอนที่ 2: บันทึกข้อมูลแผนกและสิทธิ์เสริมลงตารางโปรไฟล์ภายในของโรงงาน
        if (data.user) {
            const { error: profileError } = await supabase
                .from('profiles')
                .insert([{
                    id: data.user.id,
                    username: username.toUpperCase().trim(), 
                    department: department,
                    role: role
                }]);
            
            if (profileError) {
                console.error("Profile saving note:", profileError.message);
            }
        }

        alert("🎉 สมัครสมาชิกสำเร็จเรียบร้อย! สามารถนำบัญชีไปล็อกอินเข้าใช้งานระบบได้ทันทีครับ");
        window.location.href = "login.html"; 

    } catch (err) {
        alert("❌ สมัครไม่สำเร็จ: " + err.message);
    } finally {
        // ปลดล็อกปุ่มหลังจากทำงานเสร็จสิ้นเรียบร้อย
        submitBtn.disabled = false;
        submitBtn.innerText = "✅ ยืนยันการสมัครสมาชิก";
    }
});

async function handleRegister(event) {
    event.preventDefault(); // ป้องกันหน้าเว็บรีเฟรชตัวเอง

    // ดึงค่าจาก input ในหน้าสมัครสมาชิก (ตรวจสอบ id ให้ตรงกับหน้า HTML ของคุณ)
    const usernameInput = document.getElementById('username').value.trim().toUpperCase();
    const passwordInput = document.getElementById('password').value;
    const departmentInput = document.getElementById('department').value; // เช่น blow, pipe, mono

    if (!usernameInput || !passwordInput || !departmentInput) {
        alert("❌ กรุณากรอกข้อมูลให้ครบถ้วนทุกช่องครับ");
        return;
    }

    if (passwordInput.length < 6) {
        alert("❌ รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษรขึ้นไป (ข้อบังคับความปลอดภัยของ Supabase)");
        return;
    }

    // 🟢 แปลงรหัสพนักงานเป็นอีเมลจำลองเพื่อให้ระบบ Supabase Auth ยอมรับ
    const emailPayload = `${usernameInput}@pvt.com`;

    try {
        // ขั้นตอนที่ 1: สร้างบัญชีในระบบระบบความปลอดภัยหลัก (Supabase Auth)
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: emailPayload,
            password: passwordInput,
        });

        if (authError) throw authError;

        if (authData.user) {
            // ขั้นตอนที่ 2: นำข้อมูลไปบันทึกลงตาราง profiles (เพื่อเก็บแผนกและตำแหน่งพนักงาน)
            const { error: profileError } = await supabase
                .from('profiles')
                .insert([
                    {
                        id: authData.user.id, // ใช้ ID เดียวกับที่ Auth สร้างให้
                        username: usernameInput,
                        department: departmentInput,
                        role: 'staff' // ค่าเริ่มต้นให้เป็นพนักงานทั่วไป (ถ้าจะให้เป็นแอดมินค่อยไปแก้ในเว็บ)
                    }
                ]);

            if (profileError) throw profileError;

            alert(`🎉 สมัครสมาชิกสำเร็จ! รหัสพนักงานของคุณคือ: ${usernameInput}`);
            
            // วาร์ปพนักงานกลับไปหน้าล็อกอินหลัก
            window.location.href = "login.html";
        }

    } catch (error) {
        console.error("เกิดข้อผิดพลาด:", error);
        alert(`❌ สมัครไม่สำเร็จ: ${error.message}`);
    }
}