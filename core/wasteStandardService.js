/* ======================================================
   Waste Standard Service — เกณฑ์ % ของเสีย (แผนก / รายเครื่อง)
   ใช้ร่วมกัน: หน้าตั้งค่าเกณฑ์, หน้าบัญชี

   - เกณฑ์รายแผนก : master_departments.max_waste_percent / warning_percent
   - เกณฑ์รายเครื่อง : ตาราง machine_waste_standards (ฐานข้อมูล — ทุกเครื่องเห็นเหมือนกัน)
       ถ้ายังไม่ได้รัน database/10-machine-waste-standards.sql จะใช้ค่าในเบราว์เซอร์ชั่วคราว
   - ไม่ได้ตั้งค่าเลย → ค่าตั้งต้นโรงงาน 2.00% (เตือน 1.50%) ต่อเดือน
====================================================== */

window.WasteStandardService = (() => {
  const DEPT_TABLE = "master_departments";
  const MACHINE_STD_TABLE = "machine_waste_standards";
  const LOCAL_KEY = "pvtt_machine_waste_standards"; // ที่เก็บเดิม (เฉพาะเบราว์เซอร์)

  const SYSTEM_DEFAULTS = {
    max: window.WASTE_FORMULA?.DEFAULT_LIMIT ?? 2.0,
    warning: window.WASTE_FORMULA?.DEFAULT_WARNING ?? 1.5,
  };

  let cache = new Map(); // "DEPT__MACHINE" → standard
  let dbAvailable = null; // null = ยังไม่ได้โหลด
  let loadingPromise = null;

  const client = () => window.supabaseClient || window.supabase || null;
  const normDept = (v) => String(v || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  const normMachine = (v) => String(v || "").trim().toUpperCase();
  const keyOf = (dept, machine) => `${normDept(dept)}__${normMachine(machine)}`;

  function readLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
      const out = new Map();
      Object.values(raw || {}).forEach((r) => {
        if (!r) return;
        out.set(keyOf(r.department, r.machine_no), toStd(r.department, r.machine_no, r));
      });
      return out;
    } catch (_) {
      return new Map();
    }
  }

  function writeLocal() {
    try {
      const obj = {};
      cache.forEach((v, k) => {
        obj[k] = { department: v.department_code, machine_no: v.machine_no, max_waste_percent: v.max_waste_percent, warning_percent: v.warning_percent };
      });
      localStorage.setItem(LOCAL_KEY, JSON.stringify(obj));
    } catch (_) {}
  }

  function toStd(dept, machine, r) {
    return {
      department_code: normDept(dept),
      machine_no: normMachine(machine),
      max_waste_percent: Number(r.max_waste_percent ?? SYSTEM_DEFAULTS.max),
      warning_percent: Number(r.warning_percent ?? SYSTEM_DEFAULTS.warning),
      monthly_target_percent: Number(r.max_waste_percent ?? SYSTEM_DEFAULTS.max),
      is_custom: true,
      updated_by_name: r.updated_by_name || null,
      updated_at: r.updated_at || null,
    };
  }

  /** โหลดเกณฑ์รายเครื่องทั้งหมดมาเก็บไว้ (เรียกครั้งเดียวก่อนใช้ getMachineStandard) */
  async function loadMachineStandards(force = false) {
    if (loadingPromise && !force) return loadingPromise;
    loadingPromise = (async () => {
      const sb = client();
      if (!sb) {
        cache = readLocal();
        dbAvailable = false;
        return cache;
      }
      try {
        const { data, error } = await sb
          .from(MACHINE_STD_TABLE)
          .select("department_code, machine_no, max_waste_percent, warning_percent, updated_by_name, updated_at");
        if (error) throw error;
        cache = new Map((data || []).map((r) => [keyOf(r.department_code, r.machine_no), toStd(r.department_code, r.machine_no, r)]));
        dbAvailable = true;
      } catch (err) {
        console.warn("[WasteStandardService] ยังไม่มีตาราง machine_waste_standards ใช้ค่าในเบราว์เซอร์ชั่วคราว:", err?.message || err);
        cache = readLocal();
        dbAvailable = false;
      }
      return cache;
    })();
    return loadingPromise;
  }

  function getMachineStandard(departmentCode, machineNo) {
    return cache.get(keyOf(departmentCode, machineNo)) || null;
  }

  /** คืน object key = "DEPT__MACHINE" (ตัวพิมพ์ใหญ่) */
  function getAllMachineStandards() {
    const obj = {};
    cache.forEach((v, k) => (obj[k] = v));
    return obj;
  }

  async function saveAllMachineStandardsForDept(departmentCode, machineConfigs) {
    const dept = normDept(departmentCode);
    const upserts = [];
    const removes = [];

    Object.entries(machineConfigs || {}).forEach(([machineNo, config]) => {
      const m = normMachine(machineNo);
      if (!config || config.isInherited) {
        removes.push(m);
        cache.delete(keyOf(dept, m));
      } else {
        const row = {
          department_code: dept,
          machine_no: m,
          max_waste_percent: Number(config.max_waste_percent ?? SYSTEM_DEFAULTS.max),
          warning_percent: Number(config.warning_percent ?? SYSTEM_DEFAULTS.warning),
        };
        upserts.push(row);
        cache.set(keyOf(dept, m), toStd(dept, m, row));
      }
    });

    if (dbAvailable === null) await loadMachineStandards();
    if (!dbAvailable) {
      writeLocal();
      return { stored: "local" };
    }

    const sb = client();
    if (upserts.length) {
      const { error } = await sb.from(MACHINE_STD_TABLE).upsert(upserts, { onConflict: "department_code,machine_no" });
      if (error) throw error;
    }
    if (removes.length) {
      const { error } = await sb.from(MACHINE_STD_TABLE).delete().eq("department_code", dept).in("machine_no", removes);
      if (error) throw error;
    }
    await loadMachineStandards(true);
    return { stored: "database" };
  }

  async function saveMachineStandard(departmentCode, machineNo, config) {
    return saveAllMachineStandardsForDept(departmentCode, { [machineNo]: config });
  }

  async function getAll() {
    const sb = client();
    if (!sb) return [];
    const { data, error } = await sb
      .from(DEPT_TABLE)
      .select("department_code, department_name, max_waste_percent, warning_percent, is_active, sort_order")
      .eq("is_active", true)
      .order("sort_order");
    if (error) {
      console.warn("WasteStandardService.getAll failed:", error);
      return [];
    }
    return data || [];
  }

  async function getByDepartment(departmentCode) {
    if (!departmentCode) return null;
    const all = await getAll();
    return all.find((d) => normDept(d.department_code) === normDept(departmentCode)) || null;
  }

  /** เกณฑ์ที่ใช้จริงของเครื่อง: รายเครื่อง → รายแผนก → ค่าตั้งต้นโรงงาน */
  function resolve(deptStd, departmentCode, machineNo) {
    const m = machineNo ? getMachineStandard(departmentCode, machineNo) : null;
    if (m) {
      return { max: m.max_waste_percent, warning: m.warning_percent, source: "machine" };
    }
    if (deptStd && Number(deptStd.max) > 0) {
      return { max: Number(deptStd.max), warning: Number(deptStd.warning) || 0, source: "department" };
    }
    return { max: SYSTEM_DEFAULTS.max, warning: SYSTEM_DEFAULTS.warning, source: "default" };
  }

  async function getEffectiveStandard(departmentCode, machineNo) {
    await loadMachineStandards();
    const dept = await getByDepartment(departmentCode);
    const r = resolve(
      dept ? { max: dept.max_waste_percent, warning: dept.warning_percent } : null,
      departmentCode,
      machineNo,
    );
    return {
      max: r.max,
      warning: r.warning,
      monthlyTarget: r.max,
      isCustom: r.source === "machine",
      source:
        r.source === "machine"
          ? `เครื่องจักร ${machineNo}`
          : r.source === "department"
            ? `แผนก ${dept?.department_name || departmentCode}`
            : "ค่ามาตรฐานโรงงาน",
    };
  }

  return {
    loadMachineStandards,
    getMachineStandard,
    getAllMachineStandards,
    saveMachineStandard,
    saveAllMachineStandardsForDept,
    getAll,
    getByDepartment,
    resolve,
    getEffectiveStandard,
    isDatabaseReady: () => dbAvailable === true,
    SYSTEM_DEFAULTS,
  };
})();
