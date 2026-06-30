/* ======================================================
   Waste Standard Service
   ใช้ร่วมกันทั้งระบบ
   - Accounting
   - Supervisor
   - Dashboard
====================================================== */

window.WasteStandardService = (() => {
  const TABLE = "waste_standards";

  async function getAll() {
    const supabase = window.supabaseClient || window.supabase;

    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("is_active", true)
      .order("sort_order");

    if (error) throw error;

    return data || [];
  }

  async function getByDepartment(departmentCode) {
    const supabase = window.supabaseClient || window.supabase;

    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("department_code", departmentCode)
      .single();

    if (error) throw error;

    return data;
  }

  async function updatePercent(id, percent) {
    const supabase = window.supabaseClient || window.supabase;

    return supabase
      .from(TABLE)
      .update({
        max_waste_percent: percent,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
  }

  return {
    getAll,
    getByDepartment,
    updatePercent,
  };
})();