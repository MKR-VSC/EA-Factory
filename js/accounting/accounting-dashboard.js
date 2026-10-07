/* ======================================================
   accounting-dashboard.js — Dashboard ของเสีย (หน้าบัญชี)
   สรุป รายวัน / รายสัปดาห์ / รายเดือน / รายปี
   ใช้ข้อมูลชุดเดียวกับตารางบัญชี (state.reports + state.machineStatuses
   จาก accounting-panel.js) ไม่ดึงข้อมูลซ้ำจากฐานข้อมูล

   นิยาม
   - น้ำหนักของเสีย  : ของเสียทุกรายการที่ส่งบัญชีแล้ว (ไม่รวมยกเลิก)
   - น้ำหนักผลิต     : เฉพาะที่บัญชีกรอกและบันทึกแล้ว
   - % ของเสีย      : ของเสีย ÷ (ผลิตดี + ของเสีย) × 100 (รวมยอดของช่วงก่อนแล้วค่อยหาร)
                      (รายการที่ยังไม่กรอกผลิตไม่นำมาคิด เพื่อไม่ให้ % สูงเกินจริง)
====================================================== */
(function () {
  "use strict";

  const PERIODS = {
    day: { count: 30, label: "รายวัน", unit: "วัน" },
    week: { count: 12, label: "รายสัปดาห์", unit: "สัปดาห์" },
    month: { count: 12, label: "รายเดือน", unit: "เดือน" },
    year: { count: 5, label: "รายปี", unit: "ปี" },
  };

  const COLOR = {
    bar: "#1e3a8a",
    barSelected: "#ea580c",
    line: "#0284c7",
    limit: "#dc2626",
    grid: "rgba(15, 23, 42, 0.06)",
    tick: "#64748b",
  };

  const dash = {
    period: "month",
    selected: null, // index ของช่วงที่เลือก (null = ช่วงล่าสุด)
    buckets: [],
    charts: { waste: null, pct: null },
    visible: false,
    bound: false,
  };

  /* ---------------- วันที่ ---------------- */
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => {
    const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
  const thMonth = (d, style = "short") => d.toLocaleDateString("th-TH", { month: style });
  const thYear = (d) => d.getFullYear() + 543;

  function bucketKey(period, d) {
    if (period === "day") return ymd(d);
    if (period === "week") return ymd(mondayOf(d));
    if (period === "month") return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    return String(d.getFullYear());
  }

  function makeBuckets(period, end) {
    const n = PERIODS[period].count;
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      let start;
      let finish;
      let short;
      let full;
      if (period === "day") {
        start = addDays(end, -i);
        finish = start;
        short = `${start.getDate()} ${thMonth(start)}`;
        full = start.toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
      } else if (period === "week") {
        start = addDays(mondayOf(end), -7 * i);
        finish = addDays(start, 6);
        short = `${start.getDate()} ${thMonth(start)}`;
        full = `${start.getDate()} ${thMonth(start)} – ${finish.getDate()} ${thMonth(finish)} ${thYear(finish)}`;
      } else if (period === "month") {
        start = new Date(end.getFullYear(), end.getMonth() - i, 1);
        finish = new Date(start.getFullYear(), start.getMonth() + 1, 0);
        short = `${thMonth(start)} ${String(thYear(start)).slice(2)}`;
        full = `${thMonth(start, "long")} ${thYear(start)}`;
      } else {
        start = new Date(end.getFullYear() - i, 0, 1);
        finish = new Date(start.getFullYear(), 11, 31);
        short = String(thYear(start));
        full = `ปี ${thYear(start)}`;
      }
      out.push({
        key: bucketKey(period, start),
        start,
        finish,
        short,
        full,
        waste: 0,
        wasteWithProd: 0,
        production: 0,
        count: 0,
        pending: 0,
        problems: new Map(),
        machines: new Map(),
      });
    }
    return out;
  }

  /* ---------------- รวมข้อมูล ---------------- */
  function collectGroups(dept) {
    if (typeof state === "undefined" || typeof buildGroups !== "function") return [];
    const reports = (state.reports || []).filter((r) => {
      if (getAccountingStatus(r) === STATUS_CANCELLED) return false;
      return dept === "all" || normalizeDept(r.department_code || r.department) === dept;
    });
    const machines = (state.machineStatuses || []).filter(
      (r) => dept === "all" || normalizeDept(r.department_code) === dept,
    );
    const groups = consolidateGroups([
      ...buildGroups(reports),
      ...buildMachineStatusGroups(machines),
    ]);
    return groups.filter((g) => {
      const st = normalizeText(g.status);
      return st !== STATUS_CANCELLED && st !== MACHINE_STATUS_NOT_RUNNING;
    });
  }

  function aggregate() {
    const dept = document.getElementById("dashDept")?.value || "all";
    const endInput = document.getElementById("dashEndDate")?.value;
    const end = parseYmd(endInput) || new Date();
    const buckets = makeBuckets(dash.period, end);
    const index = new Map(buckets.map((b, i) => [b.key, i]));

    collectGroups(dept).forEach((g) => {
      const d = parseYmd(g.date);
      if (!d) return;
      const i = index.get(bucketKey(dash.period, d));
      if (i === undefined) return;
      const b = buckets[i];
      const waste = Number(g.waste || 0);
      const prod = Number(g.production || 0);
      b.waste += waste;
      b.count += 1;
      if (normalizeText(g.status) === STATUS_SENT) b.pending += 1;
      if (prod > 0) {
        b.production += prod;
        b.wasteWithProd += waste;
      }
      (g.items || []).forEach((it) => {
        const name = it.problem_type || "ไม่ระบุ";
        b.problems.set(name, (b.problems.get(name) || 0) + Number(it.waste_weight_kg || 0));
      });
      if (waste > 0) {
        const mName = dept === "all" ? `${g.machine} · ${getDeptName(g.dept)}` : g.machine;
        b.machines.set(mName, (b.machines.get(mName) || 0) + waste);
      }
    });

    buckets.forEach((b) => {
      // % ของเสีย = ของเสีย ÷ (ผลิตดี + ของเสีย) × 100 (เฉพาะรายการที่กรอกผลิตแล้ว)
      b.pct = window.WASTE_FORMULA ? window.WASTE_FORMULA.percent(b.wasteWithProd, b.production) : (b.production > 0 ? (b.wasteWithProd / (b.production + b.wasteWithProd)) * 100 : null);
    });
    dash.buckets = buckets;
    if (dash.selected === null || dash.selected >= buckets.length) dash.selected = buckets.length - 1;
    return { dept, buckets };
  }

  /* ---------------- แสดงผล ---------------- */
  const fmt = (v) => (typeof formatNumber === "function" ? formatNumber(v) : Number(v || 0).toFixed(2));
  const esc = (v) => (typeof safeText === "function" ? safeText(v) : String(v ?? ""));

  function deltaHtml(cur, prev, { unit = "%", invert = false, points = false } = {}) {
    if (prev === null || prev === undefined || cur === null || cur === undefined) {
      return `<span class="acc-delta is-flat">ไม่มีข้อมูลช่วงก่อนหน้า</span>`;
    }
    let diff;
    let text;
    if (points) {
      diff = cur - prev;
      text = `${diff >= 0 ? "+" : "−"}${fmt(Math.abs(diff))} จุด`;
    } else {
      if (!prev) {
        return cur ? `<span class="acc-delta is-flat">ช่วงก่อนหน้าเป็น 0</span>` : `<span class="acc-delta is-flat">เท่าเดิม</span>`;
      }
      diff = ((cur - prev) / prev) * 100;
      text = `${diff >= 0 ? "+" : "−"}${fmt(Math.abs(diff))}${unit}`;
    }
    if (Math.abs(diff) < 0.005) return `<span class="acc-delta is-flat">เท่ากับช่วงก่อนหน้า</span>`;
    const up = diff > 0;
    // ของเสีย / % Waste: เพิ่ม = แย่ (แดง), ลด = ดี (เขียว) · ผลิต/จำนวน: สีกลาง
    const tone = invert ? (up ? "is-bad" : "is-good") : "is-flat";
    const icon = up ? "trending_up" : "trending_down";
    return `<span class="acc-delta ${tone}"><span class="material-symbols-outlined" aria-hidden="true">${icon}</span>${up ? "เพิ่มขึ้น" : "ลดลง"} ${text} <small>จากช่วงก่อน</small></span>`;
  }

  function renderKpis(dept) {
    const i = dash.selected;
    const b = dash.buckets[i];
    const p = i > 0 ? dash.buckets[i - 1] : null;
    if (!b) return;

    setTxt("dashPeriodLabel", `${PERIODS[dash.period].label}: ${b.full}`);
    setTxt("kpiWaste", fmt(b.waste));
    setTxt("kpiProd", fmt(b.production));
    setTxt("kpiPct", b.pct === null ? "-" : `${fmt(b.pct)}%`);
    setTxt("kpiCount", b.count.toLocaleString("th-TH"));
    setTxt("kpiPending", b.pending.toLocaleString("th-TH"));

    setHtml("kpiWasteDelta", deltaHtml(b.waste, p ? p.waste : null, { invert: true }));
    setHtml("kpiProdDelta", deltaHtml(b.production, p ? p.production : null));
    setHtml(
      "kpiPctDelta",
      b.pct === null
        ? `<span class="acc-delta is-flat">ยังไม่มีน้ำหนักผลิต</span>`
        : deltaHtml(b.pct, p ? p.pct : null, { invert: true, points: true }),
    );
    setHtml("kpiCountDelta", deltaHtml(b.count, p ? p.count : null));

    // เทียบเกณฑ์ของแผนก (ถ้าเลือกแผนก)
    // ทุกแผนก → ใช้เกณฑ์ตั้งต้นโรงงาน 2% · เลือกแผนก → เกณฑ์ของแผนกนั้น
    const std = window.WASTE_FORMULA.standard(dept !== "all" ? state.standards?.[dept] : null);
    const pctCard = document.getElementById("kpiPct")?.closest(".acc-kpi");
    if (pctCard) {
      pctCard.classList.remove("is-over", "is-warn");
      // เกณฑ์เป็น "ต่อเดือน" จึงแสดงผ่าน/เกินเฉพาะมุมมองรายเดือน
      if (std && b.pct !== null && dash.period === "month") {
        if (b.pct > std.max) pctCard.classList.add("is-over");
        else if (std.warning > 0 && b.pct >= std.warning) pctCard.classList.add("is-warn");
      }
    }

    const sub = b.full;
    setTxt("dashTopProblemSub", sub);
    setTxt("dashTopMachineSub", sub);
    renderRank("dashTopProblems", b.problems, b.waste);
    renderRank("dashTopMachines", b.machines, b.waste);
  }

  function renderRank(id, map, total) {
    const el = document.getElementById(id);
    if (!el) return;
    const rows = [...map.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (!rows.length) {
      el.innerHTML = `<li class="acc-rank-empty">ไม่มีของเสียในช่วงนี้</li>`;
      return;
    }
    const max = rows[0][1] || 1;
    el.innerHTML = rows
      .map(([name, v]) => {
        const share = total > 0 ? (v / total) * 100 : 0;
        return `<li>
          <div class="acc-rank-top">
            <span class="acc-rank-name">${esc(name)}</span>
            <span class="acc-rank-val"><strong>${fmt(v)}</strong> kg <small>(${fmt(share)}%)</small></span>
          </div>
          <div class="acc-rank-bar" aria-hidden="true"><span style="width:${Math.max(3, (v / max) * 100).toFixed(1)}%"></span></div>
        </li>`;
      })
      .join("");
  }

  function renderTable() {
    const body = document.getElementById("dashTableBody");
    if (!body) return;
    body.innerHTML = [...dash.buckets]
      .reverse()
      .map(
        (b) => `<tr>
          <td>${esc(b.full)}</td>
          <td class="text-right">${fmt(b.waste)}</td>
          <td class="text-right">${b.production ? fmt(b.production) : "-"}</td>
          <td class="text-right">${b.pct === null ? "-" : `${fmt(b.pct)}%`}</td>
          <td class="text-right">${b.count.toLocaleString("th-TH")}</td>
        </tr>`,
      )
      .join("");
  }

  function renderCharts(dept) {
    const canvasW = document.getElementById("dashWasteChart");
    const canvasP = document.getElementById("dashPctChart");
    if (!canvasW || !canvasP) return;

    if (typeof window.Chart !== "function") {
      // โหลดไลบรารีกราฟไม่ได้ (เช่น ไม่มีอินเทอร์เน็ต) → เปิดตารางแทน
      document.querySelector(".acc-dash-table")?.setAttribute("open", "");
      canvasW.parentElement.innerHTML = `<p class="muted acc-chart-fallback">โหลดกราฟไม่ได้ ดูข้อมูลในตารางด้านล่างแทน</p>`;
      canvasP.parentElement.innerHTML = `<p class="muted acc-chart-fallback">โหลดกราฟไม่ได้ ดูข้อมูลในตารางด้านล่างแทน</p>`;
      return;
    }

    const labels = dash.buckets.map((b) => b.short);
    const waste = dash.buckets.map((b) => Number(b.waste.toFixed(2)));
    const pct = dash.buckets.map((b) => (b.pct === null ? null : Number(b.pct.toFixed(2))));
    const barColors = dash.buckets.map((_, i) => (i === dash.selected ? COLOR.barSelected : COLOR.bar));
    // ทุกแผนก → ใช้เกณฑ์ตั้งต้นโรงงาน 2% · เลือกแผนก → เกณฑ์ของแผนกนั้น
    const std = window.WASTE_FORMULA.standard(dept !== "all" ? state.standards?.[dept] : null);

    setTxt("dashWasteSub", `${PERIODS[dash.period].count} ${PERIODS[dash.period].unit}ล่าสุด · กดแท่งเพื่อดูรายละเอียด`);
    setTxt(
      "dashPctSub",
      `เส้นประ = เกณฑ์ไม่เกิน ${fmt(std.max)}%${dept !== "all" ? " ของแผนกนี้" : " (ค่าตั้งต้นโรงงาน)"} · ประเมินผ่าน/เกินที่ "รายเดือน"`,
    );

    const tooltip = {
      backgroundColor: "#0f172a",
      padding: 10,
      cornerRadius: 10,
      titleFont: { family: "Kanit", size: 13, weight: "600" },
      bodyFont: { family: "Kanit", size: 12.5 },
      displayColors: false,
      callbacks: {
        title: (items) => dash.buckets[items[0].dataIndex]?.full || "",
        label: (item) => {
          const b = dash.buckets[item.dataIndex];
          return [
            `ของเสีย ${fmt(b.waste)} kg`,
            `ผลิต ${b.production ? `${fmt(b.production)} kg` : "-"}`,
            `% ของเสีย ${b.pct === null ? "-" : `${fmt(b.pct)}%`}`,
            `${b.count} รายการ`,
          ];
        },
      },
    };

    const scales = (yTitle, suggestedMax) => ({
      x: {
        grid: { display: false },
        ticks: { color: COLOR.tick, font: { family: "Kanit", size: 11 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 10 },
        border: { color: "rgba(15,23,42,0.15)" },
      },
      y: {
        beginAtZero: true,
        suggestedMax,
        grid: { color: COLOR.grid },
        border: { display: false },
        ticks: { color: COLOR.tick, font: { family: "Kanit", size: 11 }, maxTicksLimit: 5 },
        title: { display: true, text: yTitle, color: COLOR.tick, font: { family: "Kanit", size: 11 } },
      },
    });

    // กดตรงไหนของคอลัมน์ก็ได้ (รวมวันที่ไม่มีของเสีย) → เลือกช่วงนั้น
    const onClick = (e, _els, chart) => {
      const x = chart?.scales?.x;
      if (!x || e.x === undefined) return;
      const idx = Math.round(x.getValueForPixel(e.x));
      if (!Number.isInteger(idx) || idx < 0 || idx >= dash.buckets.length) return;
      dash.selected = idx;
      renderKpis(dept);
      updateSelection();
    };

    // กราฟแท่ง: น้ำหนักของเสีย
    if (dash.charts.waste) dash.charts.waste.destroy();
    dash.charts.waste = new Chart(canvasW, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "ของเสีย (kg)",
            data: waste,
            backgroundColor: barColors,
            hoverBackgroundColor: barColors.map((c) => (c === COLOR.bar ? "#2f4fb3" : "#f97316")),
            borderRadius: { topLeft: 4, topRight: 4 },
            borderSkipped: "bottom",
            maxBarThickness: 30,
            categoryPercentage: 0.8,
            barPercentage: 0.9,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false }, tooltip },
        scales: scales("kg"),
        onClick,
        onHover: (e, els) => {
          e.native.target.style.cursor = els.length ? "pointer" : "default";
        },
      },
    });

    // กราฟเส้น: % Waste (+ เส้นเกณฑ์ของแผนก)
    const datasets = [
      {
        label: "% ของเสีย",
        data: pct,
        borderColor: COLOR.line,
        backgroundColor: COLOR.line,
        borderWidth: 2,
        tension: 0.25,
        spanGaps: true,
        pointRadius: dash.buckets.map((_, i) => (i === dash.selected ? 6 : 3)),
        pointBackgroundColor: dash.buckets.map((_, i) => (i === dash.selected ? COLOR.barSelected : "#ffffff")),
        pointBorderColor: dash.buckets.map((_, i) => (i === dash.selected ? "#ffffff" : COLOR.line)),
        pointBorderWidth: 2,
        pointHoverRadius: 7,
      },
    ];
    if (std) {
      datasets.push({
        label: `เกณฑ์ ${fmt(std.max)}%`,
        data: labels.map(() => std.max),
        borderColor: COLOR.limit,
        borderWidth: 1.5,
        borderDash: [6, 5],
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
      });
    }
    const maxPct = Math.max(...pct.filter((v) => v !== null), std ? std.max : 0, 1);

    if (dash.charts.pct) dash.charts.pct.destroy();
    dash.charts.pct = new Chart(canvasP, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { ...tooltip, filter: (item) => item.datasetIndex === 0 },
        },
        scales: (() => {
          const s = scales("%", maxPct * 1.15);
          s.y.ticks.callback = (v) => `${v}%`;
          return s;
        })(),
        onClick,
      },
    });
  }

  function updateSelection() {
    const c = dash.charts.waste;
    if (c) {
      c.data.datasets[0].backgroundColor = dash.buckets.map((_, i) => (i === dash.selected ? COLOR.barSelected : COLOR.bar));
      c.update("none");
    }
    const p = dash.charts.pct;
    if (p) {
      const ds = p.data.datasets[0];
      ds.pointRadius = dash.buckets.map((_, i) => (i === dash.selected ? 6 : 3));
      ds.pointBackgroundColor = dash.buckets.map((_, i) => (i === dash.selected ? COLOR.barSelected : "#ffffff"));
      ds.pointBorderColor = dash.buckets.map((_, i) => (i === dash.selected ? "#ffffff" : COLOR.line));
      p.update("none");
    }
  }

  function render() {
    if (!dash.visible) return;
    const { dept } = aggregate();
    renderKpis(dept);
    renderCharts(dept);
    renderTable();
  }

  /* ---------------- ตัวควบคุม ---------------- */
  function renderDeptOptions() {
    const sel = document.getElementById("dashDept");
    if (!sel || typeof state === "undefined") return;
    const cur = sel.value || document.getElementById("filterDept")?.value || "all";
    sel.innerHTML =
      `<option value="all">ทุกแผนก</option>` +
      Object.entries(state.standards || {})
        .map(([c, d]) => `<option value="${esc(c)}">${esc(d.name)} (${esc(c)})</option>`)
        .join("");
    sel.value = [...sel.options].some((o) => o.value === cur) ? cur : "all";
  }

  function setPeriod(p) {
    dash.period = p;
    dash.selected = null;
    document.querySelectorAll(".acc-seg [data-period]").forEach((b) => {
      const on = b.dataset.period === p;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", String(on));
    });
    render();
  }

  function bind() {
    if (dash.bound) return;
    dash.bound = true;
    document.querySelectorAll(".acc-seg [data-period]").forEach((b) =>
      b.addEventListener("click", () => setPeriod(b.dataset.period)),
    );
    document.getElementById("dashDept")?.addEventListener("change", () => {
      dash.selected = null;
      render();
    });
    document.getElementById("dashEndDate")?.addEventListener("change", () => {
      dash.selected = null;
      render();
    });
    const endInput = document.getElementById("dashEndDate");
    if (endInput && !endInput.value) endInput.value = ymd(new Date());
    setPeriod(dash.period);
  }

  /* ---------------- สลับมุมมอง ---------------- */
  function showAccountingView(view) {
    const isDash = view === "dashboard";
    dash.visible = isDash;
    document.documentElement.classList.toggle("acc-view-dashboard", isDash);
    const section = document.getElementById("accDashboard");
    if (section) section.hidden = !isDash;
    if (isDash) {
      renderDeptOptions();
      bind();
      render();
    }
  }

  function setTxt(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  }

  function setHtml(id, v) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = v;
  }

  window.showAccountingView = showAccountingView;
  // เรียกหลังโหลดข้อมูลบัญชีใหม่ (รวมถึงรีเฟรชอัตโนมัติ)
  window.renderAccountingDashboard = function () {
    if (!dash.visible) return;
    renderDeptOptions();
    render();
  };
})();
