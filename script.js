let reportsData = [];

async function loadReports() {

    try {

        const response = await fetch(
            "http://localhost:3000/api/reports"
        );

        const result = await response.json();

        reportsData = result.data || [];

    } catch(error) {

        console.error(error);

        reportsData = [];
    }

}