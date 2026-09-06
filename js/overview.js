/**
 * US CPI Macro Analysis Dashboard - Executive Overview Module
 */

window.CPI_OVERVIEW = (function () {
  const state = window.CPI_STATE;
  const utils = window.CPI_UTILS;

  function renderOverview() {
    // 1. Update Headline KPIs
    const kpiMap = [
      { id: 'headline', item: 'SA0' },
      { id: 'core', item: 'SA0L1E' },
      { id: 'shelter', item: 'SAH1' },
      { id: 'supercore', item: 'SASLE' },
      { id: 'energy', item: 'SA0E' },
      { id: 'food', item: 'SAF1' }
    ];

    kpiMap.forEach(({ id, item }) => {
      const s = utils.getSeries(item, '0000', 'S');
      if (s && s.stats) {
        const elYoY = document.getElementById(`kpi-${id}-yoy`);
        const elMoM = document.getElementById(`kpi-${id}-mom`);
        const elAnn3m = document.getElementById(`kpi-${id}-ann3m`);

        if (elYoY) {
          elYoY.textContent = utils.fmtPct(s.stats.latest_yoy);
          elYoY.className = `card-value ${utils.getValColorClass(s.stats.latest_yoy)}`;
        }
        if (elMoM) elMoM.textContent = utils.fmtPct(s.stats.latest_mom, true);
        if (elAnn3m) elAnn3m.textContent = utils.fmtPct(s.stats.latest_ann3m, true);

        utils.drawSparkline(`spark-${id}`, s.stats.spark_yoy);
      }
    });

    // 2. Render The Big 8 Grid Cards (strictly sorted by sort_sequence)
    const major8Container = document.getElementById('overview-major8-grid');
    if (major8Container && state.db.major_8) {
      const sortedMajor8 = [...state.db.major_8].sort((a, b) => state.db.items[a].seq - state.db.items[b].seq);
      
      major8Container.innerHTML = sortedMajor8.map(code => {
        const item = state.db.items[code];
        const s = utils.getSeries(code, '0000', 'S');
        const stats = s ? s.stats : null;
        const yoy = stats ? stats.latest_yoy : null;
        const mom = stats ? stats.latest_mom : null;
        const ann3m = stats ? stats.latest_ann3m : null;
        const contrib = stats ? stats.latest_contrib : null;
        const contribColor = contrib > 0.5 ? '#f43f5e' : (contrib < 0 ? '#38bdf8' : '#f59e0b');

        return `
          <div class="card card-hover cursor-pointer" onclick="App.navigateToDrilldown('${code}')">
            <div class="card-header">
              <span class="card-title" style="font-size: 0.9rem;">${item.name}</span>
              <span class="level-badge">Seq #${item.seq}</span>
            </div>
            <div class="card-value ${utils.getValColorClass(yoy)}" style="font-size: 1.5rem;">
              ${utils.fmtPct(yoy)}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.35rem; display: flex; justify-content: space-between;">
              <span>Weight: <strong>${utils.fmtWeight(item.weight_u)}</strong></span>
              <span>Contrib: <strong style="color: ${contribColor};">${utils.fmtContrib(contrib)}</strong></span>
            </div>
            <div class="card-meta">
              <span>MoM: <strong>${utils.fmtPct(mom, true)}</strong></span>
              <span>3M Ann: <strong>${utils.fmtPct(ann3m, true)}</strong></span>
            </div>
            <canvas class="sparkline-canvas" id="spark-major8-${code}"></canvas>
          </div>
        `;
      }).join('');

      sortedMajor8.forEach(code => {
        const s = utils.getSeries(code, '0000', 'S');
        if (s && s.stats) {
          utils.drawSparkline(`spark-major8-${code}`, s.stats.spark_yoy);
        }
      });
    }

    renderOverviewTrajectoryChart();
    renderOverviewMomentumChart();
  }

  function renderOverviewTrajectoryChart() {
    const ctx = document.getElementById('chart-overview-trajectory');
    if (!ctx) return;

    if (state.charts.overviewTrajectory) {
      state.charts.overviewTrajectory.destroy();
    }

    const { startIdx, endIdx } = utils.getDateIndices(state.overview.years);
    const labels = state.db.dates.slice(startIdx, endIdx + 1);

    const sHeadline = utils.getSeries('SA0', '0000', 'S');
    const sCore = utils.getSeries('SA0L1E', '0000', 'S');

    const dataHeadline = sHeadline ? sHeadline.yoy.slice(startIdx, endIdx + 1) : [];
    const dataCore = sCore ? sCore.yoy.slice(startIdx, endIdx + 1) : [];
    const target2Pct = labels.map(() => 2.0);

    const { gridColor, textColor } = utils.getThemeColors();

    state.charts.overviewTrajectory = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Headline CPI (YoY %)',
            data: dataHeadline,
            borderColor: '#38bdf8',
            backgroundColor: 'rgba(56, 189, 248, 0.08)',
            borderWidth: 2.5,
            tension: 0.25,
            fill: true,
            pointRadius: 0,
            pointHoverRadius: 5,
            spanGaps: true
          },
          {
            label: 'Core CPI (Ex Food & Energy YoY %)',
            data: dataCore,
            borderColor: '#f43f5e',
            borderWidth: 2.5,
            tension: 0.25,
            fill: false,
            pointRadius: 0,
            pointHoverRadius: 5,
            spanGaps: true
          },
          {
            label: 'Fed 2.0% Inflation Target',
            data: target2Pct,
            borderColor: '#facc15',
            borderWidth: 1.5,
            borderDash: [5, 5],
            fill: false,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: textColor, font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${utils.fmtPct(ctx.raw)}`
            }
          }
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor, maxTicksLimit: 12 } },
          y: { grid: { color: gridColor }, ticks: { color: textColor, callback: (v) => utils.fmtTick(v) } }
        }
      }
    });
  }

  function renderOverviewMomentumChart() {
    const ctx = document.getElementById('chart-overview-momentum');
    if (!ctx) return;

    if (state.charts.overviewMomentum) {
      state.charts.overviewMomentum.destroy();
    }

    const categories = [...(state.db.major_8 || [])].sort((a, b) => state.db.items[a].seq - state.db.items[b].seq);
    const labels = [];
    const yoyVals = [];
    const contribVals = [];
    const ann3mVals = [];

    categories.forEach(code => {
      const it = state.db.items[code];
      const s = utils.getSeries(code, '0000', 'S');
      if (it && s && s.stats) {
        labels.push(`${it.name} (${utils.fmtWeight(it.weight_u)})`);
        yoyVals.push(s.stats.latest_yoy);
        contribVals.push(s.stats.latest_contrib);
        ann3mVals.push(s.stats.latest_ann3m);
      }
    });

    const { gridColor, textColor } = utils.getThemeColors();

    state.charts.overviewMomentum = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: '12-Month YoY (%)',
            data: yoyVals,
            backgroundColor: '#38bdf8',
            borderRadius: 4
          },
          {
            label: 'YoY Contribution (pp)',
            data: contribVals,
            backgroundColor: '#c084fc',
            borderRadius: 4
          },
          {
            label: '3-Month Annualized Momentum (%)',
            data: ann3mVals,
            backgroundColor: '#f59e0b',
            borderRadius: 4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: textColor } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.dataset.label.includes('Contribution') ? utils.fmtContrib(ctx.raw) : utils.fmtPct(ctx.raw)}`
            }
          }
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor, callback: (v) => utils.fmtTick(v) } },
          y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } }
        }
      }
    });
  }

  return {
    renderOverview,
    renderOverviewTrajectoryChart,
    renderOverviewMomentumChart
  };
})();
