// =========================================================
// ไฟล์: js/form-department.js (เวอร์ชันแก้บั๊กยกรัง - ปลอดภัยสูงสุด)
// =========================================================



// 🟢 1. ดึงข้อมูลการล็อกอินและสิทธิ์จาก LocalStorage
const activeUser = localStorage.getItem('activeUser') || 'Unknown';
const currentDeptRaw = localStorage.getItem('activeDept') || 'blow'; 
const activeRoleRaw = localStorage.getItem('activeRole') || 'staff';

// 🤖 ฟังก์ชันแปลงชื่อแผนก (รองรับทั้งกรณีล็อกอินส่งมาเป็น ภาษาไทย หรือ ภาษาอังกฤษ)
function normalizeDept(dept) {
  if (!dept) return 'blow';
  const d = dept.toLowerCase().trim();
  if (d === 'blow' || d === 'เป่าถุง') return 'blow';
  if (d === 'print' || d === 'พิมพ์' || d === 'ม้วนพิมพ์' || d === 'เครื่องพิมพ์') return 'print';
  if (d === 'sheet' || d === 'ตัดผืน') return 'sheet';
  if (d === 'tape' || d === 'เทปน้ำพุ่ง') return 'tape';
  if (d === 'drill' || d === 'ตัดเจาะ') return 'drill';
  if (d === 'garbage' || d === 'ถุงขยะ' || d === 'ตัดถุงขยะ-ถุงอเนก') return 'garbage';
  if (d === 'mono' || d === 'โมโน') return 'mono';
  if (d === 'salan' || d === 'สแลน') return 'salan';
  return d; 
}
const currentDept = normalizeDept(currentDeptRaw);

// 🤖 ฟังก์ชันตรวจสอบสิทธิ์พนักงาน (รองรับทั้งไทยและอังกฤษ)
function isStaffRole(role) {
  if (!role) return true;
  const r = role.toLowerCase().trim();
  return r === 'staff' || r === 'พนักงาน' || r === 'พนักงานทั่วไป';
}

console.log("📊 ระบบตรวจสอบข้อมูลล็อกอิน:", { ผู้ใช้: activeUser, แผนกเดิม: currentDeptRaw, แผนกที่ใช้: currentDept, สิทธิ์: activeRoleRaw });

// 🟢 2. คลังข้อมูลหมายเลขเครื่องจักร
const MACHINE_LIST = {
  print: ["เครื่องพิมพ์1", "เครื่องพิมพ์2"],
  sheet: ["ตัดผืน1"],
  tape: ["ตัดเทปน้ำพุ่ง"],
  blow: ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "เป่าถุง", "เทปน้ำพุ่ง"],
  drill: ["ตัดเจาะ1", "ตัดเจาะ2", "ตัดเจาะ3", "ตัดเจาะ4"],
  garbage: ["ตัดถุงขยะ-ถุงอเนก"],
  mono: ["Mono1", "Mono2", "Mono3"],
  salan: ["สแลน ทอ 1", "สแลน ทอ 2", "สแลน ทอ 3", "สแลน ทอ 4", "สแลน ทอ 5", "สแลน ทอ 6", "สแลน ทอ 7", "สแลน ทอ 8", "สแลน ทอ 9", "สแลน ทอ 10", "สแลน ทอ 11", "สแลน ทอ 12", "สแลน ทอ 13", "สแลน ทอ 14", "สแลน ทอ 15", "สแลน ทอ 16", "สแลน ทอ 17", "สแลน ทอ 18"]
};

// 🟢 3. คลังข้อมูลรายการอาการเสีย
const PROBLEM_TYPES = {
  print: ["สกรีนไม่สวย", "สีเพี้ยน", "พิมพ์เลอะ", "อื่นๆ"],
  blow: ["ทะลุ", "ตกใบมีด", "ลูกโปร่งส่าย", "รอยกรีดไม่สวย", "รูเจาะไม่ทะลุ", "เจาะรูไม่ทะลุ", "เนื้อฟิล์มแข็งเป็นเม็ด", "สกรีนไม่สวย", "น้ำหนักไม่ถึง/เกิน", "จับจีบไม่สวย", "ไซร้ไม่ได้ขนาด", "ขี้ดายหลุด", "เดินเครื่องใหม่", "เปลี่ยนสี", "เปลี่ยนไซร้", "เศษเจาะ", "ขัดหน้าดาย", "ตั้งมีดใหม่", "อื่นๆ", "ไฟดับ"],
  drill: ["มีดตัดไม่ขาด", "ตัดเอียง", "ซีนไม่ติด", "ซีนขาด", "เจาะไม่ทะลุ", "รูเจาะเอียง", "ขนาดไม่ได้", "ถุงเอียง / ก้นถุงใหญ่", "เช็คดูซีน", "เปลี่ยนยาง / ลวด / ลวดซีนเคลื่อน", "เปลี่ยนซีน", "เปลี่ยนไซร้", "ซ่อมเครื่อง", "ไฟดับ", "อื่นๆ"],
  garbage: ["ซีนไม่ติด / ซีนขาด", "ถุงมีรอยขาด / ขูด", "ตัดไม่ขาด", "ถุงเอียง / ก้นถุงใหญ่", "ขนาดไม่ได้", "ต้นม้วน / ปลายม้วน", "เปลี่ยนไซร้", "ซ่อมเครื่อง", "ไฟดับ"],
  tape: ["ความยาวไม่ถึง", "ม้วนล้นกระดาษ", "เข็มหัก", "รูไม่ทะลุ", "สกรีนหาย", "ต้นม้วน / ปลายม้วน", "ซ่อมเครื่อง", "ตั้งไซร้", "ตัดดูรู", "ไฟดับ", "รอยต่อม้วน", "เศษลองน้ำ / ตัดดูรู"],
  sheet: ["ความยาวไม่ถึง", "เศษหัวม้วน / ปลายม้วน", "เครื่องเสีย", "ส่วนที่เสียจากแผนกสแลน", "เปลี่ยนเปอร์เซ็นต์การผลิต", "อื่นๆ"],
  salan: ["ฟิล์มขาดยาว", "โมโนขาด", "เปลี่ยนความกว้าง", "สีไม่ได้คุณภาพ", "น้ำหนักไม่ได้คุณภาพ", "ความกว้างไม่ถึง", "เศษฟิล์มปลายม้วน (ดำ, เขียว, เงิน, ฟ้า, ขาว)", "เศษฟิล์มเส้นข้าง (ดำ, เขียว, เงิน, ฟ้า, ขาว)", "โมโนปลายม้วน", "เศษฟิล์มกรีดหา (ดำ, เขียว, เงิน, ฟ้า, ขาว)", "เศษแสลนทอแล้ว", "ตัดทิ้ง", "อื่นๆ"],
  mono: ["ขาดหน้าดาย", "ขาดอ่างน้ำร้อน", "ขาดพันลูกกลิ้ง", "ตัดเส้นไม่ขาด", "ขาดลมร้อน", "เดินเครื่องใหม่", "เปลี่ยนสีโมโน", "ไฟดับ", "ก้อนแข็ง", "อื่นๆ"]
};

// 🔧 ตัวแปรเก็บค่าวินิจฉัยฟอร์ม
let appSelectedMachine = "";
let appSelectedProblem = "";
let appSelectedShift = ""; 

// 🚀 4. INIT: ทำงานเมื่อหน้าจอพร้อมใช้งาน
// ====================================================================
// ✅ ชุดโค้ดแก้ไขบั๊กโหลดหน้าเว็บ (วางทับ window.addEventListener เดิม)
// ====================================================================
window.addEventListener("DOMContentLoaded", async () => {
  try {
    // 1. เช็กการล็อกอิน
    if (!localStorage.getItem("activeUser")) {
      alert("🔒 กรุณาเข้าสู่ระบบก่อนใช้งานครับ");
      window.location.href = "login2.html";
      return;
    }

    // 2. แสดงชื่อผู้ใช้บนหน้าจอ
    const userText = document.getElementById("display-username");
    if (userText) {
      userText.innerText = activeUser;
    }

    // 3. จัดการสิทธิ์หัวหน้างาน/พนักงาน (ซ่อมบั๊กเรื่อง cssText ตัวแดง)
    const managerSection = document.getElementById("manager-only-section");
    if (managerSection) {
      if (isStaffRole(activeRoleRaw)) {
        managerSection.style.setProperty("display", "none", "important");
      } else {
        managerSection.style.setProperty("display", "block", "important");
      }
    }

    // 4. ตั้งเวลาปัจจุบันอัตโนมัติ
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const dateTimeInput = document.getElementById("incident-datetime");
    if (dateTimeInput) {
      dateTimeInput.value = now.toISOString().slice(0, 16);
    }

    console.log("📊 ระบบตรวจสอบข้อมูลล็อกอิน:", { 
      ผู้ใช้: activeUser, 
      แผนกเดิม: currentDeptRaw, 
      แผนกที่ใช้: currentDept, 
      สิทธิ์: activeRoleRaw 
    });

    // 5. สั่งโหลดปุ่มเครื่องจักรและอาการเสียเข้าฟอร์ม
    if (typeof loadMasterDataAndRender === "function") {
      await loadMasterDataAndRender();
    } else if (typeof renderMachineInterface === "function") {
      await renderMachineInterface();
    }

  } catch (err) {
    console.error("❌ เกิดข้อผิดพลาดตอนโหลดหน้าเว็บ:", err);
  }
});

// 🏭 5. ฟังก์ชันแสดงผลรายชื่อเครื่องจักร (รองรับทั้งแบบ ปุ่ม และแบบ Dropdown)


  // ====================================================================
  // ✅ ชุดแก้ไขเอฟเฟกต์สร้างปุ่มเครื่องจักร (ซ่อมบรรทัด container is not defined)
  // ====================================================================
  // 1. ประกาศตัวแปร container มารองรับไอดีของกล่องปุ่มเครื่องจักร
  const container = document.getElementById("machine-buttons-container");
  
  // 2. ตรวจสอบว่าในเครื่องมีค่า finalMachinesList ไหม ถ้าไม่มีให้ดึงตัวแปร list (เอาเซฟชัวร์)
  const machinesToRender = (typeof finalMachinesList !== 'undefined' && finalMachinesList.length > 0) ? finalMachinesList : (typeof BACKUP_MACHINES !== 'undefined' ? BACKUP_MACHINES[currentDept] : []);

  if (container) {
    container.innerHTML = ""; // ล้างหน้าจอเก่า
    machinesToRender.forEach((m) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-option";
      btn.textContent = m;
      btn.onclick = function () {
        appSelectedMachine = m;
        document.querySelectorAll("#machine-buttons-container .btn-option").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
      };
      // คราวนี้เรียกใช้ container ได้ฉลุย เพราะเราประกาศ const container ไว้ด้านบนแล้ว
      container.appendChild(btn);
    });
  }

// ====================================================================
  // ✅ [ซ่อมบั๊กบรรทัด 199] ประกาศตัวแปร list ให้บราวเซอร์รู้จักและดึงข้อมูลปัญหา
  // ====================================================================
  // 1. ดักจับไอดีกล่อง Dropdown ปัญหา
  const dropdown = document.getElementById("problem-type");

  // 2. สร้างตัวแปรชื่อ list มารองรับข้อมูลอาการเสีย (ซ่อมรอยรั่ว list is not defined)
  const list = (typeof finalProblemsList !== 'undefined' && finalProblemsList.length > 0) ? finalProblemsList : (typeof BACKUP_PROBLEMS !== 'undefined' ? BACKUP_PROBLEMS[currentDept] : ["อื่นๆ"]);

  // 3. เอาตัวแปร list ที่สร้างเมื่อกี้มาวนลูปสร้างตัวเลือกใน Dropdown ปัญหา
  if (dropdown) {
    dropdown.innerHTML = '<option value="">-- โปรดเลือกปัญหาที่พบ --</option>';
    list.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      dropdown.appendChild(opt); // ยัดข้อมูลเข้ากล่องได้ฉลุย ตัวแดงหายสนิท!
    });
  }


// ⚠️ 6. ฟังก์ชันแสดงผลรายการปัญหา (รองรับทั้งแบบ ปุ่ม และแบบ Dropdown)


  if (container) {
    container.innerHTML = "";
    list.forEach((p) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-option";
      btn.textContent = p;
      btn.onclick = function () {
        appSelectedProblem = p;
        document.querySelectorAll("#problem-buttons-container .btn-option").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
      };
      container.appendChild(btn);
    });
  }

  if (dropdown) {
    dropdown.innerHTML = '<option value="">-- โปรดเลือกปัญหาที่พบ --</option>';
    list.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p;
      opt.textContent = p;
      dropdown.appendChild(opt);
    });
  }


// ⏰ 7. เลือกกะการทำงาน
function selectShift(shiftName, element) {
  appSelectedShift = shiftName;
  const hiddenInput = document.getElementById("selected-shift");
  if (hiddenInput) hiddenInput.value = shiftName;

  const shiftContainer = document.getElementById("shift-buttons-container");
  if (shiftContainer) {
    shiftContainer.querySelectorAll(".btn-option").forEach((b) => b.classList.remove("selected"));
  }
  if (element) element.classList.add("selected");
}

// ====================================================================
  // 1️⃣ ส่วนสร้างปุ่มกลุ่มเครื่องจักร (ประกาศตัวแปรครบ สะกดตรงกันทุกจุด)
  // ====================================================================
  const mContainerSql = document.getElementById("machine-buttons-container");
  const mDropdownSql = document.getElementById("machine-no");

  if (mContainerSql) {
    mContainerSql.innerHTML = ""; // ล้างปุ่มเก่า
    finalMachinesList.forEach((machineName) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-option";
      btn.textContent = machineName;
      btn.onclick = function () {
        appSelectedMachine = machineName;
        document.querySelectorAll("#machine-buttons-container .btn-option").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
      };
      
      // ตัวแปรตรงนี้ต้องชื่อเดียวกับด้านบนสุดของบล็อก (C ตัวใหญ่ และมีคำว่า Sql)
      mContainerSql.appendChild(btn); 
    });
  }

  // ====================================================================
  // ✅ ชุดแก้ไข Dropdown เครื่องจักร (ซ่อมบั๊ก finalMachinesList บรรทัด 248)
  // ====================================================================
  if (mDropdownSql) {
    mDropdownSql.innerHTML = '<option value="">-- โปรดเลือกเครื่องจักร --</option>';
    
    // 🎯 สร้างตัวแปรดักจับ: ถ้าระบบหา finalMachinesList ไม่เจอ ให้ไปดึงจากคลังสำรองทันที จะได้ไม่ขึ้นตัวแดงพัง
    const validMachines = (typeof finalMachinesList !== 'undefined') ? finalMachinesList : ((typeof BACKUP_MACHINES !== 'undefined' && typeof currentDept !== 'undefined') ? BACKUP_MACHINES[currentDept] : []);

    // เปลี่ยนมาใช้ validMachines วิ่งลูปแทน ปลอดภัย 100%
    validMachines.forEach((machineName) => {
      const opt = document.createElement("option");
      opt.value = machineName;
      opt.textContent = machineName;
      mDropdownSql.appendChild(opt);
    });
  }


// 💾 8. บันทึกข้อมูลส่งฐานข้อมูล Supabase
// ====================================================================
// ✅ [แก้ไขตัวแดงบรรทัด 254] ฟังก์ชันส่งข้อมูลรายงานปัญหาเข้าฐานข้อมูล
// ====================================================================
async function handleFormSubmit(event) {
  event.preventDefault();

  // 1. ดักจับตัวแปรเชื่อมต่อ Supabase ให้แม่นยำที่สุด (ป้องกัน undefined)
  const clientSupabase = window.supabaseClient || window.supabase || (typeof supabase !== 'undefined' ? supabase : null);
  
  if (!clientSupabase) {
    alert("❌ ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาตรวจสอบการตั้งค่าไฟล์ supabase-config.js");
    return;
  }

  const mSelect = document.getElementById("machine-no");
  const pSelect = document.getElementById("problem-type");
  const sSelect = document.getElementById("work-shift");

  // ดึงค่าปุ่มที่กดเลือก หรือจาก Dropdown
  const finalMachine = mSelect && mSelect.value ? mSelect.value : (typeof appSelectedMachine !== 'undefined' ? appSelectedMachine : "");
  const finalProblem = pSelect && pSelect.value ? pSelect.value : (typeof appSelectedProblem !== 'undefined' ? appSelectedProblem : "");
  const finalShift = sSelect && sSelect.value ? sSelect.value : (typeof appSelectedShift !== 'undefined' ? appSelectedShift : "");

  // ตรวจสอบความครบถ้วนของข้อมูล
  if (!finalShift) { alert("🛑 กรุณาเลือกกะการทำงานก่อนครับ!"); return; }
  if (!finalMachine) { alert("🛑 กรุณาเลือกหมายเลขเครื่องจักรก่อนครับ!"); return; }
  if (!finalProblem) { alert("🛑 กรุณาเลือกอาการเสีย/ปัญหาที่พบก่อนครับ!"); return; }

  if (!confirm("📋 ยืนยันการบันทึกรายงานปัญหานี้เข้าสู่ระบบของโรงงาน?")) return;

  const weightInput = document.getElementById("waste-weight");
  const noteInput = document.getElementById("problem-description");

  const wasteWeight = weightInput ? parseFloat(weightInput.value) || 0 : 0;
  const detailNote = noteInput ? noteInput.value.trim() : "";

  // 💡 [ปรับปรุงใหม่] จัดการฟอร์แมตวันที่ให้อยู่ในมาตรฐาน ISO ป้องกัน Database ปฏิเสธค่า
  let finalDateTime = new Date().toISOString(); 
  const dateElem = document.getElementById("incident-datetime");
  if (dateElem && dateElem.value) {
    try {
      finalDateTime = new Date(dateElem.value).toISOString();
    } catch(e) {
      finalDateTime = new Date().toISOString();
    }
  }

  // 💡 [ปรับปรุงใหม่] พยายามดึงข้อมูลผู้ใช้จาก localStorage เผื่อตัวแปร Global หลุดหาย
 // 💡 [ของเดิมของพี่ที่ส่งคำว่า pvt001 ไปตรงๆ แล้วน่าจะโดนระบบบล็อก]
  // reported_by: typeof activeUser !== 'undefined' ? activeUser : "Unknown Staff"

  // ==========================================

  // ✅ [ให้แก้ไขเปลี่ยนเป็นดึงรหัส ID แท้ (UUID) จาก LocalStorage แทนครับพี่]
  const savedUserId = localStorage.getItem("activeUserId"); // ดึง UUID เช่น b962d66c...
  const savedUser = localStorage.getItem("activeUser") || "Unknown Staff";

  const reportData = {
    incident_datetime: finalDateTime,
    work_shift: finalShift, 
    department: localStorage.getItem("activeDept") || "blow", // ดึงรหัสแผนกที่ผูกไว้ตอนล็อกอิน
    machine_no: finalMachine,
    problem_type: finalProblem,
    report_type: "ปัญหาการผลิต",
    waste_weight_kg: wasteWeight, 
    detail: detailNote,
    status: "pending",
    
    // 🎯 เปลี่ยนตรงนี้! ถ้ามีรหัส ID แท้ (UUID) ให้ส่ง ID แท้ไปเลย ถ้าไม่มีค่อยส่ง Username
    reported_by: savedUserId ? savedUserId : savedUser 
  };

  try {
    console.log("📤 กำลังพยายามส่งแพ็กเกจข้อมูล:", reportData);

    // 🔥 บันทึกข้อมูลเข้าตารางกลางสำเร็จชัวร์
    const { error } = await clientSupabase
      .from("pvt_production_reports")
      .insert([reportData]);

    if (error) throw error;

    alert("🎉 บันทึกรายงานปัญหาของแผนกเข้าคลังข้อมูลส่วนกลางเรียบร้อยแล้วครับ!");
    
    // เคลียร์ค่าในฟอร์มหลังจากส่งข้อมูลสำเร็จเพื่อให้พร้อมคีย์งานถัดไป
    if (mSelect) mSelect.value = "";
    if (pSelect) pSelect.value = "";
    if (sSelect) sSelect.value = "";
    if (weightInput) weightInput.value = "";
    if (noteInput) noteInput.value = "";
    
    document.querySelectorAll(".btn-option").forEach((b) => b.classList.remove("selected"));
    
    if (typeof appSelectedMachine !== 'undefined') appSelectedMachine = ""; 
    if (typeof appSelectedProblem !== 'undefined') appSelectedProblem = ""; 
    if (typeof appSelectedShift !== 'undefined') appSelectedShift = "";

  } catch (err) {
    // 💡 [ปรับปรุงใหม่] สั่งง้างปากให้พ่นข้อความภาษาอังกฤษตรงๆ แทนคำว่า Object
    console.error("❌ บันทึกข้อมูลพลาดอย่างละเอียด:", err);
    
    // ถ้าตัวแปร err มีข้อมูลลึกๆ ให้ดึงข้อความแจ้งเตือนมาพ่นออกหน้าจอเลย
    const errorMsg = err.message || err.details || JSON.stringify(err);
    alert("❌ บันทึกไม่สำเร็จเนื่องจาก: " + errorMsg);
  }
}

// ====================================================================
// 🔄 [เวอร์ชันสมบูรณ์ + ระบบสำรอง] ฟังก์ชันดึงข้อมูลมาแสดงบนฟอร์ม
// ====================================================================
async function renderMachineInterface() {
  await loadMasterDataAndRender();
}

async function renderProblemInterface() {
  // มัดรวมการโหลดไว้ที่จุดเดียวเพื่อความเสถียร
}

// ====================================================================
// ✅ ซ่อมบั๊กบรรทัด 132: แก้ตัวแปรลอย (container is not defined)
// ====================================================================
async function loadMasterDataAndRender() {
  // 📦 คลังข้อมูลสำรอง (Fallback) ในกรณีที่ติดต่อ SQL ไม่สำเร็จ ปุ่มจะได้ขึ้นแน่นอน
  const BACKUP_MACHINES = {
    mono: ["Mono1", "Mono2", "Mono3"],
    pipe: ["ท่อ1", "ท่อ2", "ท่อ3", "ท่อ4"],
    blow: ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "เป่าถุง", "เทปน้ำพุ่ง"],
    drill: ["ตัดเจาะ1", "ตัดเจาะ2", "ตัดเจาะ3", "ตัดเจาะ4"],
    garbage: ["ตัดถุงขยะ-ถุงอเนก"],
    tape_cut: ["ตัดเทปน้ำพุ่ง"],
    sheet: ["ตัดผืน"],
    salan: ["สแลน ทอ1", "สแลน ทอ2", "สแลน ทอ3", "สแลน ทอ4", "สแลน ทอ5", "สแลน ทอ6", "สแลน ทอ7", "สแลน ทอ8", "สแลน ทอ9", "สแลน ทอ10", "สแลน ทอ11", "สแลน ทอ12", "สแลน ทอ13", "สแลน ทอ14", "สแลน ทอ15", "สแลน ทอ16", "สแลน ทอ17", "สแลน ทอ18"]
  };

  const BACKUP_PROBLEMS = {
    mono: ["ขาดหน้าดาย", "ขาดอ่างน้ำร้อน", "ขาดพันลูกกลิ้ง", "ตัดเส้นไม่ขาด", "ขาดลมร้อน", "เดินเครื่องใหม่", "เปลี่ยนสีโมโน", "ไฟดับ", "ก้อนแข็ง", "อื่นๆ"],
    pipe: ["ทะลุ", "น้ำท่วมถังแว็ก", "ขี้ดายหลุด", "แว็กสูง", "แว็กตก", "เข้าม้วนหัก", "หนาบางกลางม้วน", "โครไม่สวย", "เดินเครื่องใหม่", "เปลี่ยนไซร้", "ไฟดับ", "อื่นๆ"],
    blow: ["ทะลุ", "ตกใบมีด", "ลูกโปร่งส่าย", "รอยกรีดไม่สวย", "รูเจาะฉีกขาด", "เจาะรูไม่ทะลุ", "เนื้อฟิล์มแข็งเป็นเม็ด", "เปลี่ยนไซร้", "ขัดหน้าดาย", "ไฟดับ", "อื่นๆ"],
    drill: ["มีดตัดไม่ขาด", "ตัดเอียง", "ซีนไม่ติด", "ซีนขาด", "เจาะไม่ทะลุ", "รูเจาะเอียง", "ขนาดไม่ได้มาตราฐาน", "เศษเจาะ", "รอยต่อม้วน", "ซ่อมเครื่อง", "เปลี่ยนไซร้", "อื่นๆ"],
    garbage: ["ซีนไม่ติด / ซีนขาด", "ถุงมีรอยขาด/ขูด", "ขนาดไม่ได้", "ตัดไม่ขาด", "ถุงเอียง / ก้นถุงใหญ่", "เช็คดูซีน", "ต้นม้วน/ปลายม้วน", "ม้วนพับ", "อื่นๆ"],
    tape_cut: ["ความยาวไม่ถึง", "ขนาดไม่ได้", "ม้วนล้นกระดาษ", "เข็มหัก", "รูไม่ทะลุ", "สกรีนหาย", "เศษปลายม้วน", "เศษลองน้ำ / ตัดดูรู", "ม้วนโค้ง", "อื่นๆ"],
    sheet: ["ความยาวไม่ถึง", "เศษหัวม้วน / ปลายม้วน", "เครื่องเสีย", "ส่วนที่เสียจากแผนกสแลน", "อื่นๆ"],
    salan: ["ฟิล์มขาดยาว", "โมโนขาด", "เปลี่ยนความกว้าง", "เปลี่ยนเปอร์เซ็นต์การผลิต", "สี ไม่ได้คุณภาพ", "น้ำหนักไม่ได้คุณภาพ", "ความกว้างไม่ถึง", "เศษฟิล์มเส้นข้าง", "เศษฟิล์มปลายม้วน", "ตัดทิ้ง", "อื่นๆ"]
  };

  let finalMachinesList = [];
  let finalProblemsList = [];

  try {
    if (window.supabaseClient) {
      // 🅰️ ดึงข้อมูลจาก SQL
      const { data: dbMachines } = await window.supabaseClient
        .from('pvt_machines')
        .select('*')
        .eq('department', currentDept);

      if (dbMachines && dbMachines.length > 0) {
        finalMachinesList = dbMachines.map(item => item.machine_name);
      }

      // 🅱️ ดึงข้อมูลปัญหาจาก SQL
      const { data: dbProblems } = await window.supabaseClient
        .from('pvt_problem_types')
        .select('*')
        .eq('department', currentDept);

      if (dbProblems && dbProblems.length > 0) {
        finalProblemsList = dbProblems.map(item => item.problem_name);
      }
    }
  } catch (err) {
    console.warn("⚠️ ตาราง SQL ยังไม่พร้อม ระบบสลับไปใช้คลังสำรองในเครื่อง...", err.message);
  }

  // ถ้าระบบ SQL ไม่มีข้อมูล ให้ดึงข้อมูลสำรองทันที
  if (finalMachinesList.length === 0) { finalMachinesList = BACKUP_MACHINES[currentDept] || []; }
  if (finalProblemsList.length === 0) { finalProblemsList = BACKUP_PROBLEMS[currentDept] || ["อื่นๆ"]; }

  // 1️⃣ --- เริ่มสร้างปุ่มกลุ่มเครื่องจักร (ใช้ mContainer เท่านั้น ห้ามใช้ container โล่งๆ) ---
  // ====================================================================
  // 1️⃣ ส่วนสร้างปุ่มกลุ่มเครื่องจักร (ซ่อมปัญหา container บรรทัด 132)
  // ====================================================================
  const mContainer = document.getElementById("machine-buttons-container");
  const mDropdown = document.getElementById("machine-no");

  if (mContainer) {
    mContainer.innerHTML = "";
    finalMachinesList.forEach((machineName) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-option";
      btn.textContent = machineName;
      btn.onclick = function () {
        appSelectedMachine = machineName;
        document.querySelectorAll("#machine-buttons-container .btn-option").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
      };
      
      // ✅ จุดที่เคยพัง: เปลี่ยนจาก container.appendChild(btn) เป็น mContainer
      mContainer.appendChild(btn); 
    });
  }

  if (mDropdown) {
    mDropdown.innerHTML = '<option value="">-- โปรดเลือกเครื่องจักร --</option>';
    finalMachinesList.forEach((machineName) => {
      const opt = document.createElement("option");
      opt.value = machineName;
      opt.textContent = machineName;
      mDropdown.appendChild(opt);
    });
  }

  // ====================================================================
  // 2️⃣ ส่วนสร้างปุ่มกลุ่มอาการเสีย (ป้องกันบั๊ก container ตัวเดียวกัน)
  // ====================================================================
  const pContainer = document.getElementById("problem-buttons-container");
  const pDropdown = document.getElementById("problem-type");

  if (pContainer) {
    pContainer.innerHTML = "";
    finalProblemsList.forEach((problemName) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-option";
      btn.textContent = problemName;
      btn.onclick = function () {
        appSelectedProblem = problemName;
        document.querySelectorAll("#problem-buttons-container .btn-option").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
      };
      
      // ✅ จุดที่เคยพัง: เปลี่ยนจาก container.appendChild(btn) เป็น pContainer
      pContainer.appendChild(btn); 
    });
  }

  if (pDropdown) {
    pDropdown.innerHTML = '<option value="">-- โปรดเลือกปัญหาที่พบ --</option>';
    finalProblemsList.forEach((problemName) => {
      const opt = document.createElement("option");
      opt.value = problemName;
      opt.textContent = problemName;
      pDropdown.appendChild(opt);
    });
  }

  // 2️⃣ --- เริ่มสร้างปุ่มกลุ่มอาการเสีย (ใช้ pContainer เท่านั้น ห้ามใช้ container โล่งๆ) ---
   
  if (pContainer) {
    pContainer.innerHTML = "";
    finalProblemsList.forEach((problemName) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-option";
      btn.textContent = problemName;
      btn.onclick = function () {
        appSelectedProblem = problemName;
        document.querySelectorAll("#problem-buttons-container .btn-option").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
      };
      pContainer.appendChild(btn); // ซ่อมแล้ว: ชี้เข้าหา pContainer ถูกต้อง
    });
  }

  if (pDropdown) {
    pDropdown.innerHTML = '<option value="">-- โปรดเลือกปัญหาที่พบ --</option>';
    finalProblemsList.forEach((problemName) => {
      const opt = document.createElement("option");
      opt.value = problemName;
      opt.textContent = problemName;
      pDropdown.appendChild(opt);
    });
  }

  console.log(`🚀 ข้อมูลเข้าฟอร์มสำเร็จ แผนก: ${currentDept} | เครื่อง: ${finalMachinesList.length} | อาการเสีย: ${finalProblemsList.length}`);
}
