// โค้ดที่ถูกต้องและสะอาดที่สุดสำหรับ script.js
let reportsData = [];
async function loadReports() {
    try {
        const { data, error } = await window.supabaseClient
            .from('pvt_production_reports') // 👈 ใช้ชื่อตารางหลักใหม่
            .select('*')
            .order('incident_datetime', { ascending: false });

        if (error) throw error;
        reportsData = data || [];
    } catch (error) {
        console.error("โหลดข้อมูลล้มเหลว:", error);
        reportsData = [];
    }
}