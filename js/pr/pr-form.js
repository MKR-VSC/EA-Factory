// --- ส่วนควบคุมลายเซ็น (Signature Canvas Logic) ---
const signaturePads = {};

function initSignaturePad(role) {
    const canvas = document.getElementById(`${role}-canvas`);
    const ctx = canvas.getContext('2d');
    
    // ตั้งค่าเส้นปากกา
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--sig-pen-color').trim();
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;

    // เก็บบันทึกข้อมูล Pad นี้ไว้
    signaturePads[role] = { canvas, ctx, hasDrawn: false };

    // ฟังก์ชันวาดเส้น
    function draw(newX, newY) {
        if (!isDrawing) return;
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(newX, newY);
        ctx.stroke();
        lastX = newX;
        lastY = newY;
        signaturePads[role].hasDrawn = true; // บันทึกว่ามีการวาดแล้ว
    }

    // --- Events สำหรับเมาส์ (คอมพิวเตอร์) ---
    canvas.addEventListener('mousedown', (e) => {
        isDrawing = true;
        [lastX, lastY] = [e.offsetX, e.offsetY];
    });
    canvas.addEventListener('mousemove', (e) => draw(e.offsetX, e.offsetY));
    canvas.addEventListener('mouseup', () => isDrawing = false);
    canvas.addEventListener('mouseout', () => isDrawing = false);

    // --- Events สำหรับระบบสัมผัส (มือถือ/แท็บเล็ต) ---
    // มองหาโค้ดส่วน touchstart และ touchmove ใน pr-form.js แล้วเปลี่ยนเป็นแบบนี้:
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        isDrawing = true;
        // ปรับให้คำนวณพิกัดตามสเกลจริงของ Canvas
        lastX = (touch.clientX - rect.left) * (canvas.width / rect.width);
        lastY = (touch.clientY - rect.top) * (canvas.height / rect.height);
    });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const currentX = (touch.clientX - rect.left) * (canvas.width / rect.width);
        const currentY = (touch.clientY - rect.top) * (canvas.height / rect.height);
        draw(currentX, currentY);
    });
    canvas.addEventListener('touchend', () => isDrawing = false);
}

// ฟังก์ชันล้างลายเซ็น
function clearSignature(role) {
    const pad = signaturePads[role];
    pad.ctx.clearRect(0, 0, pad.canvas.width, pad.canvas.height);
    pad.hasDrawn = false;
}

// ฟังก์ชันล็อกลายเซ็น (เปลี่ยนเป็นรูปภาพและแสตมป์เวลา)
function lockSignature(role) {
    const pad = signaturePads[role];
    if (!pad.hasDrawn) {
        alert('กรุณาวาดลายเซ็นก่อนกดลงชื่อครับ');
        return;
    }

    // 1. แปลง Canvas เป็น Image Data (Base64)
    const dataURL = pad.canvas.toDataURL('image/png');
    const resultImg = document.getElementById(`${role}-sig-image`);
    resultImg.src = dataURL;
    resultImg.style.display = 'block'; // แสดงรูปภาพลายเซ็น

    // 2. ซ่อน Canvas
    pad.canvas.style.display = 'none';

    // 3. บันทึกเวลา
    const now = new Date();
    const formattedDateTime = now.toLocaleDateString('th-TH') + ' ' + now.toLocaleTimeString('th-TH');
    document.getElementById(`${role}-time-display`).innerText = formattedDateTime;

    // 4. ล็อก Container (ซ่อนปุ่ม)
    document.getElementById(`sig-container-${role}`).classList.add('locked');
}
// ----------------------------------------------------

// --- ส่วนควบคุมฟอร์มหลัก (PR Form Main Logic) ---
document.addEventListener('DOMContentLoaded', () => {
    // กำหนดวันที่ปัจจุบัน
    const dateInput = document.getElementById('req-date');
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;

    // เพิ่มแถวรายการแรก
    addItemRow();

    // เปิดใช้งานระบบลายเซ็นสำหรับ ผู้ซื้อ และ ผู้ตรวจสอบ
    initSignaturePad('buyer');
    initSignaturePad('checker');
});

const tableBody = document.getElementById('table-body');
document.getElementById('add-item-btn').addEventListener('click', addItemRow);

function addItemRow() {
    const rowCount = tableBody.children.length + 1;
    const row = document.createElement('tr');
    row.innerHTML = `
        <td class="row-number" style="text-align:center; font-weight:bold;">${rowCount}</td>
        <td><input type="text" class="item-name" style="width:100%;" placeholder="ชื่อรายการ" required></td>
        <td><input type="number" class="item-qty" style="width:100%; text-align:center;" min="1" value="1" required></td>
        <td><input type="text" class="item-location" style="width:100%;" placeholder="จุดที่ใช้"></td>
        <td style="text-align:center;"><button type="button" class="btn-danger" onclick="removeItemRow(this)">ลบ</button></td>
    `;
    tableBody.appendChild(row);
    updateRowNumbers();
}

function removeItemRow(button) {
    if (tableBody.children.length > 1) {
        button.closest('tr').remove();
        updateRowNumbers();
    } else {
        alert('ต้องมีรายการอย่างน้อย 1 รายการ');
    }
}

function updateRowNumbers() {
    const rows = tableBody.querySelectorAll('tr');
    rows.forEach((row, index) => {
        row.querySelector('.row-number').innerText = index + 1;
    });
}

// ฟังก์ชันรวบรวมข้อมูลทั้งหมด
function submitForm() {
    const department = document.getElementById('department').value;
    if (!department) { alert('กรุณาเลือกแผนก'); return; }

    // ตรวจสอบลายเซ็นว่าเซ็นครบหรือยัง (สมมติว่าต้องครบทั้ง 2 คน)
    if (!document.getElementById('sig-container-buyer').classList.contains('locked') ||
        !document.getElementById('sig-container-checker').classList.contains('locked')) {
        alert('กรุณาลงชื่อและบันทึกเวลาให้ครบทั้ง ผู้ซื้อ และ ผู้ตรวจสอบ ครับ');
        return;
    }

    const items = [];
    const rows = tableBody.querySelectorAll('tr');
    rows.forEach(row => {
        items.push({
            name: row.querySelector('.item-name').value,
            qty: row.querySelector('.item-qty').value
        });
    });

    const finalData = {
        department: department,
        date: document.getElementById('req-date').value,
        items: items,
        remarks: document.getElementById('remarks').value,
        // เก็บลายเซ็นเป็นรูป Base64
        buyerSignature: document.getElementById('buyer-sig-image').src, 
        buyerTime: document.getElementById('buyer-time-display').innerText,
        checkerSignature: document.getElementById('checker-sig-image').src,
        checkerTime: document.getElementById('checker-time-display').innerText
    };

    console.log('--- ข้อมูลพร้อมลายเซ็น (Base64) ---', finalData);
    alert('บันทึกข้อมูลใบขอซื้อและลายเซ็นเรียบร้อยแล้ว!');
}