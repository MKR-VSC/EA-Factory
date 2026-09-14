/* ======================================================
   Waste Standard Service
   ใช้ร่วมกันทั้งระบบ
   - Accounting
   - Supervisor
   - Dashboard
   - Factory Settings
====================================================== */

window.WasteStandardService = (() => {
  const DEPT_TABLE = "master_departments";
  const WASTE_STD_TABLE = "waste_standards";
  const MACHINE_TABLE = "master_machines";
  const LOCAL_STORAGE_MACHINE_STANDARDS = "pvtt_machine_waste_standards";

  // Default Factory Fallback (e.g. 2.0% per machine/month, 1.5% warning)
  const SYSTEM_DEFAULTS = {
    max: 2.00,
    warning: 1.50,
  };

  function getLocalMachineStandards() {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_MACHINE_STANDARDS);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function setLocalMachineStandards(data) {
    try {
      localStorage.setItem(LOCAL_STORAGE_MACHINE_STANDARDS, JSON.stringify(data));
    } catch (e) {
      console.warn("Cannot save machine standards to localStorage", e);
    }
  }

  async function getAll() {
    const supabase = window.supabaseClient || window.supabase;
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from(DEPT_TABLE)
        .select("department_code, department_name, max_waste_percent, warning_percent, is_active, sort_order")
        .eq("is_active", true)
        .order("sort_order");

      if (!error && data && data.length > 0) return data;
    } catch (e) {
      // fallback to waste_standards table
    }

    try {
      const { data, error } = await supabase
        .from(WASTE_STD_TABLE)
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn("WasteStandardService.getAll failed:", err);
      return [];
    }
  }

  async function getByDepartment(departmentCode) {
    if (!departmentCode) return null;
    const all = await getAll();
    const clean = String(departmentCode).trim().toLowerCase();
    return all.find(d => String(d.department_code || "").trim().toLowerCase() === clean) || null;
  }

  function getMachineStandard(departmentCode, machineNo) {
    const local = getLocalMachineStandards();
    const key = `${String(departmentCode).toLowerCase()}__${String(machineNo).trim().toUpperCase()}`;
    return local[key] || null;
  }

  function getAllMachineStandards() {
    return getLocalMachineStandards();
  }

  async function saveMachineStandard(departmentCode, machineNo, config) {
    const local = getLocalMachineStandards();
    const key = `${String(departmentCode).toLowerCase()}__${String(machineNo).trim().toUpperCase()}`;
    
    if (!config || config.isInherited) {
      delete local[key];
    } else {
      local[key] = {
        department: String(departmentCode).toLowerCase(),
        machine_no: String(machineNo).trim().toUpperCase(),
        max_waste_percent: Number(config.max_waste_percent ?? SYSTEM_DEFAULTS.max),
        warning_percent: Number(config.warning_percent ?? SYSTEM_DEFAULTS.warning),
        monthly_target_percent: Number(config.monthly_target_percent ?? config.max_waste_percent ?? SYSTEM_DEFAULTS.max),
        is_custom: true,
        updated_at: new Date().toISOString()
      };
    }
    
    setLocalMachineStandards(local);
    return local[key] || null;
  }

  async function saveAllMachineStandardsForDept(departmentCode, machineConfigs) {
    const local = getLocalMachineStandards();
    const dept = String(departmentCode).toLowerCase();

    Object.entries(machineConfigs).forEach(([machineNo, config]) => {
      const key = `${dept}__${String(machineNo).trim().toUpperCase()}`;
      if (!config || config.isInherited) {
        delete local[key];
      } else {
        local[key] = {
          department: dept,
          machine_no: String(machineNo).trim().toUpperCase(),
          max_waste_percent: Number(config.max_waste_percent ?? SYSTEM_DEFAULTS.max),
          warning_percent: Number(config.warning_percent ?? SYSTEM_DEFAULTS.warning),
          monthly_target_percent: Number(config.monthly_target_percent ?? config.max_waste_percent ?? SYSTEM_DEFAULTS.max),
          is_custom: true,
          updated_at: new Date().toISOString()
        };
      }
    });

    setLocalMachineStandards(local);
    return true;
  }

  // Resolves the effective waste standard for a machine with full fallback
  async function getEffectiveStandard(departmentCode, machineNo) {
    // 1. Check machine-specific custom standard
    if (departmentCode && machineNo) {
      const custom = getMachineStandard(departmentCode, machineNo);
      if (custom && custom.is_custom) {
        return {
          max: Number(custom.max_waste_percent || SYSTEM_DEFAULTS.max),
          warning: Number(custom.warning_percent || SYSTEM_DEFAULTS.warning),
          monthlyTarget: Number(custom.monthly_target_percent || custom.max_waste_percent || SYSTEM_DEFAULTS.max),
          isCustom: true,
          source: `เครื่องจักร ${machineNo}`
        };
      }
    }

    // 2. Fallback to Department standard
    if (departmentCode) {
      const dept = await getByDepartment(departmentCode);
      if (dept) {
        return {
          max: Number(dept.max_waste_percent || SYSTEM_DEFAULTS.max),
          warning: Number(dept.warning_percent || SYSTEM_DEFAULTS.warning),
          monthlyTarget: Number(dept.max_waste_percent || SYSTEM_DEFAULTS.max),
          isCustom: false,
          source: `แผนก ${dept.department_name || departmentCode}`
        };
      }
    }

    // 3. System fallback
    return {
      max: SYSTEM_DEFAULTS.max,
      warning: SYSTEM_DEFAULTS.warning,
      monthlyTarget: SYSTEM_DEFAULTS.max,
      isCustom: false,
      source: "ค่ามาตรฐานโรงงาน"
    };
  }

  return {
    getAll,
    getByDepartment,
    getMachineStandard,
    getAllMachineStandards,
    saveMachineStandard,
    saveAllMachineStandardsForDept,
    getEffectiveStandard,
    SYSTEM_DEFAULTS,
  };
})();
