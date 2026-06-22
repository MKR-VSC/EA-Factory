// ======================================================
// supervisor-daily-review.js
// หน้าให้หัวหน้าตรวจสอบข้อมูลของเสียรายวัน
//
// Flow จริงของระบบ:
// pending  = พนักงานส่งแล้ว / รอหัวหน้าตรวจสอบ
// progress = หัวหน้ารับเรื่อง / กำลังตรวจสอบ
// resolved = หัวหน้าตรวจแล้ว / ส่งบัญชีแล้ว
//
// สิทธิ์:
// admin      = เห็นทุกแผนก
// management = เห็นทุกแผนก
// supervisor = เห็นเฉพาะแผนกตัวเอง
// ======================================================

let currentProfile = null;

const STATUS = {
  PENDING: "pending",
  PROGRESS: "progress",
  RESOLVED: "resolved",
};

document.addEventListener("DOMContentLoaded", async () => {
  await initPage();
});

async function initPage() {
  const today = new Date().toISOString().slice(0, 10);

  const filterDate = document.getElementById("filterDate");
  const filterStatus = document.getElementById("filterStatus");

  if (filterDate) filterDate.value = today;
  if (filterStatus) filterStatus.value = STATUS.PENDING;

  currentProfile = getLocalProfile();
  
  renderLoginUserInfo();


  console.log("=== CURRENT PROFILE ===", currentProfile);

  if (!currentProfile) {
    alert("ไม่พบข้อมูลผู้ใช้งาน กรุณา Login ใหม่");
    window.location.href = "/login.html";
    return;
  }

  const allowedRoles = ["admin", "management", "supervisor", "manager"];

  if (!allowedRoles.includes(currentProfile.role)) {
    alert("สิทธิ์การเข้าถึงล้มเหลว: เฉพาะหัวหน้างานหรือผู้ดูแลระบบ");
    window.location.href = "/login.html";
    return;
  }

  if (!canSeeAllDepartments() && !currentProfile.department_code) {
    alert("User นี้ยังไม่ได้กำหนดแผนก กรุณาไปเพิ่ม department_code ในหน้า Admin");
    return;
  }

  await loadRecords();
}

/* ======================================================
   อ่าน session จากระบบ Login เดิมของ EA Factory
====================================================== */

function getLocalProfile() {
  const role = localStorage.getItem("activeRole");

  if (!role) return null;

  return {
    id: localStorage.getItem("activeUserId") || "",
    username: localStorage.getItem("activeUser") || "",
    display_name: localStorage.getItem("activeName") || "",
    department_code:
  (localStorage.getItem("activeDept") || "").toLowerCase(),
    department_name: localStorage.getItem("activeDeptName") || "",
    role: String(role).toLowerCase(),
  };
}

/* ======================================================
   admin / management เห็นทุกแผนก
   supervisor / manager เห็นเฉพาะแผนกตัวเอง
====================================================== */

function canSeeAllDepartments() {
  return ["admin", "management"].includes(currentProfile.role);
}

function applyDepartmentFilter(query) {
  if (canSeeAllDepartments()) {
    return query;
  }

  return query.eq("department_code", currentProfile.department_code);
}

/* ======================================================
   โหลดรายการ
====================================================== */

async function loadRecords() {
  const list = document.getElementById("recordList");

  if (!list) return;

  list.innerHTML = `<p class="empty">กำลังโหลดข้อมูล...</p>`;

  const filterDate = document.getElementById("filterDate")?.value;
  const filterStatus =
    document.getElementById("filterStatus")?.value || STATUS.PENDING;

  if (!filterDate) {
    list.innerHTML = `<p class="empty">กรุณาเลือกวันที่</p>`;
    return;
  }

  try {
    let query = supabaseClient
      .from("daily_waste_reports")
      .select("*")
      .eq("report_date", filterDate)
      .eq("status", filterStatus)
      .order("created_at", { ascending: false });

    query = applyDepartmentFilter(query);

    const { data, error } = await query;

    if (error) throw error;

    await loadSummary(filterDate);

    if (!data || data.length === 0) {
      list.innerHTML = `<p class="empty">ไม่พบข้อมูลรายการของเสีย</p>`;
      return;
    }

    list.innerHTML = data.map(renderRecordCard).join("");
  } catch (error) {
    console.error("โหลดข้อมูลไม่สำเร็จ:", error);
    list.innerHTML = `<p class="empty">โหลดข้อมูลไม่สำเร็จ: ${safeText(error.message)}</p>`;
  }
}

/* ======================================================
   โหลดตัวเลขสรุป
====================================================== */

async function loadSummary(reportDate) {
  try {
    let query = supabaseClient
      .from("daily_waste_reports")
      .select("status")
      .eq("report_date", reportDate);

    query = applyDepartmentFilter(query);

    const { data, error } = await query;

    if (error) throw error;

    const pending = data.filter((x) => x.status === STATUS.PENDING).length;
    const progress = data.filter((x) => x.status === STATUS.PROGRESS).length;
    const resolved = data.filter((x) => x.status === STATUS.RESOLVED).length;

    setText("countPending", pending);
    setText("countReturned", progress);
    setText("countApproved", resolved);
  } catch (error) {
    console.error("โหลดสรุปไม่สำเร็จ:", error);
  }
}

/* ======================================================
   แสดงการ์ดรายการ
====================================================== */

function renderRecordCard(record) {
  const isPending = record.status === STATUS.PENDING;
  const isProgress = record.status === STATUS.PROGRESS;
  const isResolved = record.status === STATUS.RESOLVED;

  return `
    <article class="record-card">
      <div class="record-top">
        <div>
          <div class="record-title">
            แผนก: ${safeText(record.department_code || "-")}
          </div>

          <div class="record-meta">
            วันที่: ${safeText(record.report_date || "-")}
            | กะ: ${safeText(record.shift || "-")}
            | เครื่องจักร: ${safeText(record.machine_no || "-")}
          </div>
        </div>

        <div class="record-meta">
          ผู้กรอก: ${safeText(record.reported_by || "-")}
        </div>
      </div>

      <div class="record-detail">
        <div class="detail-box">
          <span>ปัญหา</span>
          <strong>${safeText(record.problem_type || "-")}</strong>
        </div>

        <div class="detail-box">
          <span>รายละเอียด</span>
          <strong>${safeText(record.detail || "-")}</strong>
        </div>

        <div class="detail-box">
          <span>น้ำหนักของเสีย</span>
          <strong>${safeText(record.waste_weight_kg || "0")} kg</strong>
        </div>

        <div class="detail-box">
          <span>สถานะ</span>
          <strong>${getStatusLabel(record.status)}</strong>
        </div>
      </div>

      <div class="note-box">
        <label>หมายเหตุหัวหน้า</label>
        <textarea
          id="note-${record.id}"
          rows="2"
          placeholder="ใส่หมายเหตุถ้ามี"
          ${isResolved ? "disabled" : ""}
        >${safeText(record.supervisor_note || "")}</textarea>
      </div>

      <div class="action-row">
        ${
          isPending
            ? `
              <button class="btn warning" onclick="takeRecord('${record.id}')">
                รับเรื่องตรวจสอบ
              </button>
            `
            : ""
        }

        ${
          isPending || isProgress
            ? `
              <button class="btn success" onclick="approveRecord('${record.id}')">
                ตรวจแล้ว / ส่งบัญชี
              </button>
            `
            : ""
        }

        ${
          isResolved
            ? `
              <span class="record-meta">รายการนี้ส่งบัญชีแล้ว</span>
            `
            : ""
        }
      </div>
    </article>
  `;
}

/* ======================================================
   รับเรื่องตรวจสอบ
====================================================== */

async function takeRecord(id) {
  const note = document.getElementById(`note-${id}`)?.value || "";

  try {
    let query = supabaseClient
      .from("daily_waste_reports")
      .update({
        status: STATUS.PROGRESS,
        checked_by: currentProfile.id,
        checked_by_name: currentProfile.display_name || currentProfile.username,
        checked_at: new Date().toISOString(),
        supervisor_note: note,
      })
      .eq("id", id);

    query = applyDepartmentFilter(query);

    const { error } = await query;

    if (error) throw error;

    alert("รับเรื่องตรวจสอบแล้ว");
    await loadRecords();
  } catch (error) {
    console.error("รับเรื่องไม่สำเร็จ:", error);
    alert("รับเรื่องไม่สำเร็จ: " + error.message);
  }
}


/* ======================================================
   ตรวจแล้ว / ส่งบัญชี
====================================================== */

async function approveRecord(id) {
  const confirmApprove = confirm("ยืนยันตรวจแล้ว และส่งข้อมูลให้บัญชีใช่ไหม?");
  if (!confirmApprove) return;

  const note = document.getElementById(`note-${id}`)?.value || "";

  try {
    let query = supabaseClient
      .from("daily_waste_reports")
      .update({
        status: STATUS.RESOLVED,
        checked_by: currentProfile.id,
        checked_by_name: currentProfile.display_name || currentProfile.username,
        checked_at: new Date().toISOString(),
        supervisor_note: note,
      })
      .eq("id", id);

    query = applyDepartmentFilter(query);

    const { error } = await query;

    if (error) throw error;

    alert("ส่งข้อมูลให้บัญชีเรียบร้อยแล้ว");
    await loadRecords();
  } catch (error) {
    console.error("ส่งบัญชีไม่สำเร็จ:", error);
    alert("ส่งบัญชีไม่สำเร็จ: " + error.message);
  }
}

/* ======================================================
   Helper
====================================================== */

function getStatusLabel(status) {
  const labels = {
    pending: "รอตรวจสอบ",
    progress: "กำลังตรวจสอบ",
    resolved: "ส่งบัญชีแล้ว",
  };

  return labels[status] || status || "-";
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function safeText(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}




function logout() {
  const confirmLogout = confirm("ต้องการออกจากระบบใช่ไหม?");
  if (!confirmLogout) return;

  localStorage.removeItem("loginType");
  localStorage.removeItem("activeUserId");
  localStorage.removeItem("activeUser");
  localStorage.removeItem("activeName");
  localStorage.removeItem("activeDept");
  localStorage.removeItem("activeDeptName");
  localStorage.removeItem("activeRole");

  window.location.href = "/login.html";
}

function renderLoginUserInfo() {
  if (!currentProfile) return;

  setText(
    "userName",
    currentProfile.display_name || currentProfile.username || "-"
  );

  setText(
    "userDept",
    currentProfile.department_name || currentProfile.department_code || "-"
  );
}