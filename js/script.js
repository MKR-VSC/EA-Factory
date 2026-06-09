let reportsData = [];

async function loadReports() {

    try {

        const { data, error } = await supabase
    .from('production_reports')
    .select('*')
    .order('incident_datetime', { ascending: false });

if (error) throw error;

records = data;(
            "http://localhost:3000/api/reports"
        );

        const result = await response.json();

        reportsData = result.data || [];

    } catch(error) {

        console.error(error);

        reportsData = [];
    }

}