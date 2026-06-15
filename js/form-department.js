// =========================================================
// ไฟล์: js/form-department.js (เวอร์ชันแก้บั๊กยกรัง - ปลอดภัยสูงสุด 100%)
// =========================================================

// 🟢 1. ดึงข้อมูลการล็อกอินและสิทธิ์จาก LocalStorage แบบปลอดภัย
// =========================================================
// ไฟล์: js/form-department.js (เวอร์ชันล็อกโครงสร้างข้อมูลเข้าตารางเสถียร 100%)
// =========================================================

const activeUser = localStorage.getItem('activeUser') || 'Unknown';
const currentDeptRaw = localStorage.getItem('activeDept') || 'blow'; 
const activeRoleRaw = localStorage.getItem('activeRole') || 'staff';

function isStaffRole(role) {
  if (!role) return true;
  const r = role.toLowerCase().trim();
  // คืนค่าความเป็นจริง (true) หากตรงกับคำที่กำหนด
  return r === 'staff' || r === 'พนักงาน' || r === 'พนักงานทั่วไป';
}
window.isStaffRole = isStaffRole;

function normalizeDept(dept) {
  if (!dept) return 'blow';
  const d = dept.toLowerCase().trim();
  if (d === 'blow' || d === 'เป่าถุง') return 'blow';
  if (d === 'pipe' || d === 'ท่อ') return 'pipe';
  if (d === 'sheet' || d === 'ตัดผืน' || d === 'แผ่นหล่อ') return 'sheet';
  if (d === 'tape' || d === 'เทปน้ำพุ่ง' || d === 'เทปพัน') return 'tape';
  if (d === 'drill' || d === 'ตัดเจาะ' || d === 'เจาะรู') return 'drill';
  if (d === 'garbage' || d === 'ถุงขยะ') return 'garbage';
  if (d === 'mono' || d === 'โมโน') return 'mono';
  if (d === 'salan' || d === 'สแลน') return 'salan';
  return d;
}
window.normalizeDept = normalizeDept;
const currentDept = normalizeDept(currentDeptRaw);

let appSelectedMachine = "";
let appSelectedProblem = "";
let appSelectedShift = ""; 

window.addEventListener("DOMContentLoaded", async () => {
  try {
    // 🔒 1. ป้องกันความปลอดภัย: ถ้าไม่ได้ล็อกอิน ให้เด้งไปหน้า Login ทันที
    if (!localStorage.getItem("activeUser")) {
      alert("🔒 กรุณาเข้าสู่ระบบก่อนใช้งานครับ");
      window.location.href = "login2.html";
      return;
    }

    // 🏷️ 2. แปะชื่อพนักงานแสดงความโปร่งใสบนมุมขวา
    const userText = document.getElementById("display-username");
    if (userText) userText.innerText = activeUser;

    // ⚖️ 3. จัดการสิทธิ์ช่องน้ำหนักของเสีย (หากเป็น staff ทั่วไปจะถูกซ่อนแบบเด็ดขาด)
    const managerSection = document.getElementById("manager-only-section");
    if (managerSection) {
      if (isStaffRole(activeRoleRaw)) {
        managerSection.style.setProperty("display", "none", "important");
      } else {
        managerSection.style.setProperty("display", "block", "important");
      }
    }

    // 🕒 4. ใส่ค่าวันเวลาปัจจุบันเข้าสู่ช่องเลือกปฏิทินในหน้าจอแบบเรียลไทม์
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const dateTimeInput = document.getElementById("incident-datetime");
    if (dateTimeInput) {
      dateTimeInput.value = now.toISOString().slice(0, 16);
    }

    // 🔌 5. เรียกสั่งโหลดข้อมูล Master Data ปุ่มกดทั้งหมด
    if (typeof loadMasterDataAndRender === "function") {
      await loadMasterDataAndRender();
    }

    // 📥 6. ตรวจจับการกดส่งแบบฟอร์มเพื่อบันทึกข้อมูล
    const formElem = document.getElementById("department-waste-form");
    if (formElem) {
      formElem.addEventListener("submit", handleFormSubmit);
    }

  } catch (err) {
    console.error("❌ เกิดข้อผิดพลาดตอนตั้งค่าเริ่มต้นหน้าจอ:", err);
  }
});

function selectShift(shiftName, element) {
  // บันทึกชื่อกะลงตัวแปร Global เพื่อส่งต่อให้ระบบส่งข้อมูล
  appSelectedShift = shiftName;
  
  const hiddenInput = document.getElementById("selected-shift");
  if (hiddenInput) hiddenInput.value = shiftName;

  // 🧹 ล้างสีไฮไลท์เขียวของปุ่มกะตัวเก่าออกทั้งหมดก่อน
  const shiftContainer = document.getElementById("shift-buttons-container");
  if (shiftContainer) {
    shiftContainer.querySelectorAll(".btn-option").forEach((b) => b.classList.remove("selected"));
  }
  
  // 🟢 เติมสีไฮไลท์เขียวให้กับปุ่มล่าสุดที่นิ้วพนักงานกดจิ้มเลือก
  if (element) element.classList.add("selected");
}
window.selectShift = selectShift;

// 💾 4. ฟังก์ชันหลักในการบันทึกข้อมูลส่งไปยังฐานข้อมูล Supabase (เวอร์ชันซ่อมแซมระบบส่งข้อมูล)
async function handleFormSubmit(event) {
  event.preventDefault();
  const clientSupabase = window.supabaseClient || window.supabase;
  if (!clientSupabase) { alert("❌ ไม่สามารถเชื่อมต่อฐานข้อมูลได้"); return; }

  const mSelect = document.getElementById("machine-no");
  const pSelect = document.getElementById("problem-type");
  const finalMachine = mSelect && mSelect.value ? mSelect.value : appSelectedMachine;
  const finalProblem = pSelect && pSelect.value ? pSelect.value : appSelectedProblem;

  if (!appSelectedShift) { alert("🛑 กรุณาเลือกกะการทำงานก่อนครับ!"); return; }
  if (!finalMachine) { alert("🛑 กรุณาเลือกหมายเลขเครื่องจักรก่อนครับ!"); return; }
  if (!finalProblem) { alert("🛑 กรุณาเลือกอาการเสีย/ปัญหาที่พบก่อนครับ!"); return; }

  if (!confirm("📋 ยืนยันการบันทึกรายงานปัญหานี้เข้าสู่ระบบของโรงงาน?")) return;

  const weightInput = document.getElementById("waste-weight");
  const noteInput = document.getElementById("problem-description");
  const wasteWeight = weightInput ? parseFloat(weightInput.value) || 0 : 0;
  const detailNote = noteInput ? noteInput.value.trim() : "";

  let finalDateTime = new Date().toISOString();
  const dateElem = document.getElementById("incident-datetime");
  if (dateElem && dateElem.value) { finalDateTime = new Date(dateElem.value).toISOString(); }

  const savedUserId = localStorage.getItem("activeUserId");
  const savedUser = localStorage.getItem("activeUser") || "Unknown Staff";

  // 📦 ประกอบข้อมูลแบบกระจายลงฟิลด์แฝดตามสคีมาจริง เพื่อให้แดชบอร์ดดึงช่องไหนก็เจอ
  const reportData = {
    report_date: finalDateTime.slice(0, 10),
    incident_datetime: finalDateTime,
    
    // เรื่องกะ
    shift: appSelectedShift,
    work_shift: appSelectedShift,
    
    // เรื่องแผนก (NOT NULL ตัวสำคัญ)
    department_code: currentDept, 
    department: currentDept,
    
    // เรื่องเครื่องจักร
    machine_no: finalMachine,
    product_name: "ปัญหาการผลิต",
    
    // เรื่องปัญหา (ยัดเข้าฟิลด์ที่เป็นข้อความ text ทั้งหมด หลีกเลี่ยง reason_id ที่เป็น UUID)
    problem_type: finalProblem,
    reason_detail: finalProblem,
    
    // เรื่องรายละเอียดโน้ต
    note: detailNote,
    detail: detailNote,
    
    // เรื่องน้ำหนักของเสีย (กระจายลงคอลัมน์แฝดทุกช่องตามสคีมา)
    waste_qty: wasteWeight,
    waste_weight_kg: wasteWeight,
    total_qty: wasteWeight,
    unit: "kg",
    
    status: "pending",
    
    // เรื่องผู้บันทึกข้อมูล
    reported_by: savedUser,
    // ตรวจสอบ UUID ถ้าเป็นรหัสพนักงานที่ยาว 36 ตัวอักษรปกติถึงจะส่ง ถ้าไม่ใช่ส่งเป็น null ป้องกันตารางเอ๋อ
    created_by: savedUserId && savedUserId.length === 36 ? savedUserId : null
  };

  try {
    const { error } = await clientSupabase.from("daily_waste_reports").insert([reportData]);
    if (error) throw error;

    alert("🎉 บันทึกข้อมูลเข้าคลังเรียบร้อย แดชบอร์ดอัปเดตแน่นอนครับ!");
    window.location.reload();
  } catch (err) {
    console.error("❌ SQL Insert Error:", err);
    alert("❌ ข้อผิดพลาดสคีมาตาราง: " + err.message);
  }

async function loadMasterDataAndRender() {
  const BACKUP_MACHINES = {
    mono: ["Mono1", "Mono2", "Mono3"],
    pipe: ["ท่อ1", "ท่อ2", "ท่อ3", "ท่อ4"],
    blow: ["F1", "F2", "F3", "F4", "F5", "F6", "F7"],
    salan: ["สแลน ทอ 1", "สแลน ทอ 2"]
  };

  const BACKUP_PROBLEMS = {
    blow: ["ทะลุ", "ตกใบมีด", "ลูกโปร่งส่าย", "อื่นๆ"],
    pipe: ["ขี้ดายหลุด", "เข้าม้วนหัก", "อื่นๆ"]
  };

  let finalMachinesList = [];
  let finalProblemsList = [];

  try {
    const clientSupabase = window.supabaseClient || window.supabase;
    if (clientSupabase) {
      // 🛠️ ดึงจากตาราง master_machines โดยใช้คอลัมน์ machine_no ตามสคีมาจริง
      const { data: dbMachines } = await clientSupabase
        .from('master_machines')
        .select('machine_no')
        .eq('department', currentDept)
        .eq('is_active', true);
        
      if (dbMachines && dbMachines.length > 0) {
        finalMachinesList = dbMachines.map(item => item.machine_no);
      } else {
        // แผนสำรองถ้าตาราง master ว่าง ให้ลองดึงจาก pvt_machines
        const { data: pvtM } = await clientSupabase.from('pvt_machines').select('machine_name').eq('department', currentDept);
        if (pvtM) finalMachinesList = pvtM.map(item => item.machine_name);
      }

      // 🛠️ ดึงจากตาราง master_problems โดยใช้คอลัมน์ problem_type ตามสคีมาจริง
      const { data: dbProblems } = await clientSupabase
        .from('master_problems')
        .select('problem_type')
        .eq('department', currentDept)
        .eq('is_active', true);
        
      if (dbProblems && dbProblems.length > 0) {
        finalProblemsList = dbProblems.map(item => item.problem_type);
      } else {
        // แผนสำรองถ้าตาราง master ว่าง ให้ลองดึงจาก pvt_problem_types
        const { data: pvtP } = await clientSupabase.from('pvt_problem_types').select('problem_name').eq('department', currentDept);
        if (pvtP) finalProblemsList = pvtP.map(item => item.problem_name);
      }
    }
  } catch (err) {
    console.warn("⚠️ ระบบคิวรี่ฐานข้อมูลขัดข้อง สลับไปใช้ข้อมูลสำรองในสคริปต์");
  }

  if (finalMachinesList.length === 0) finalMachinesList = BACKUP_MACHINES[currentDept] || ["M1"];
  if (finalProblemsList.length === 0) finalProblemsList = BACKUP_PROBLEMS[currentDept] || ["อื่นๆ"];

  // --- ส่วนโครงสร้างเรนเดอร์ปุ่ม HTML ---
  const mContainer = document.getElementById("machine-buttons-container");
  const mDropdown = document.getElementById("machine-no");
  const pContainer = document.getElementById("problem-buttons-container");
  const pDropdown = document.getElementById("problem-type");

  if (mContainer) {
    mContainer.innerHTML = "";
    finalMachinesList.forEach((m) => {
      const btn = document.createElement("button"); btn.type = "button"; btn.className = "btn-option"; btn.textContent = m;
      btn.onclick = () => {
        appSelectedMachine = m;
        document.querySelectorAll("#machine-buttons-container .btn-option").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        if (mDropdown) mDropdown.value = m;
      };
      mContainer.appendChild(btn);
    });
  }
  if (mDropdown) {
    mDropdown.innerHTML = '<option value="">-- โปรดเลือกเครื่องจักร --</option>';
    finalMachinesList.forEach(m => { const opt = document.createElement("option"); opt.value = m; opt.textContent = m; mDropdown.appendChild(opt); });
  }
  if (pContainer) {
    pContainer.innerHTML = "";
    finalProblemsList.forEach((p) => {
      const btn = document.createElement("button"); btn.type = "button"; btn.className = "btn-option"; btn.textContent = p;
      btn.onclick = () => {
        appSelectedProblem = p;
        document.querySelectorAll("#problem-buttons-container .btn-option").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        if (pDropdown) pDropdown.value = p;
      };
      pContainer.appendChild(btn);
    });
  }
  if (pDropdown) {
    pDropdown.innerHTML = '<option value="">-- โปรดเลือกปัญหาที่พบ --</option>';
    finalProblemsList.forEach(p => { const opt = document.createElement("option"); opt.value = p; opt.textContent = p; pDropdown.appendChild(opt); });
  }
}

// ฟังก์ชันล้างค่าฟอร์มด้วยปุ่มเคลียร์
// 🧹 6. ฟังก์ชันล้างค่าฟอร์มด้วยปุ่มเคลียร์ (เวอร์ชันสมบูรณ์ปิดท้ายไฟล์)
function resetFormWithConfirm() {
  if (confirm("🧹 คุณต้องการล้างข้อมูลเพื่อกรอกรายงานใหม่ทั้งหมดใช่หรือไม่?")) {
    const form = document.getElementById("department-waste-form");
    if (form) form.reset();
    
    // ล้างสถานะไฮไลท์สีเขียวออกจากปุ่มตัวเลือกทั้งหมด
    document.querySelectorAll(".btn-option").forEach((b) => b.classList.remove("selected"));
    
    // รีเซ็ตค่าตัวแปรในระบบให้กลับเป็นค่าว่าง
    appSelectedMachine = ""; 
    appSelectedProblem = ""; 
    appSelectedShift = "";
    
    alert("🧹 ล้างข้อมูลบนหน้าฟอร์มเรียบร้อยแล้วครับ");
  }
}

// 8. สายไฟดักจับค่าเครื่องจักรจากกล่อง Dropdown
if (document.getElementById("machine-no")) {
  document.getElementById("machine-no").addEventListener("change", function(e) {
    appSelectedMachine = e.target.value;
  }); // 🔑 จบในตัวเองตรงนี้
}

// 9. สายไฟดักจับค่าปัญหาจากกล่อง Dropdown
if (document.getElementById("problem-type")) {
  document.getElementById("problem-type").addEventListener("change", function(e) {
    appSelectedProblem = e.target.value;
  }); // 🔑 จบในตัวเองตรงนี้
}

// ⚠️ บังคับผูกเข้ากับ window เพื่อให้หน้าจอ HTML เรียกใช้งานปุ่มกดได้แน่นอน
window.resetFormWithConfirm = resetFormWithConfirm;
}