/**
 * US CPI Macro Analysis Dashboard - Regional CPI Module
 */

window.CPI_REGIONS = (function () {
  const state = window.CPI_STATE;
  const utils = window.CPI_UTILS;

  function renderRegions() {
    renderRegionChart();
    renderRegionalTable();
  }

  function renderRegionChart() {
    const ctx = document.getElementById('chart-regions-main');
    if (!ctx) return;

    if (state.charts.regionsMain) state.charts.regionsMain.destroy();

    const { startIdx, endIdx } = utils.getDateIndices(state.regions.years);
    const labels = state.db.dates.slice(startIdx, endIdx + 1);
    const { gridColor, textColor } = utils.getThemeColors();

    const regionsList = [
      { code: '0000', name: 'US City Average', color: '#38bdf8', width: 3 },
      { code: '0100', name: 'Northeast Urban', color: '#f43f5e', width: 2 },
      { code: '0200', name: 'Midwest Urban', color: '#10b981', width: 2 },
      { code: '0300', name: 'South Urban', color: '#f59e0b', width: 2 },
      { code: '0400', name: 'West Urban', color: '#a855f7', width: 2 }
    ];

    const datasets = regionsList.map(r => {
      const s = utils.getSeries('SA0', r.code, 'U');
      return {
        label: r.name,
        data: s ? s.yoy.slice(startIdx, endIdx + 1) : [],
        borderColor: r.color,
        borderWidth: r.width,
        pointRadius: 0,
        spanGaps: true
      };
    });

    state.charts.regionsMain = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: textColor } } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor, maxTicksLimit: 12 } },
          y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => utils.fmtTick(v) } }
        }
      }
    });
  }

  function renderRegionalTable() {
    const tbody = document.getElementById('regional-table-body');
    if (!tbody) return;

    const areaCodes = ['0000', '0100', '0200', '0300', '0400', 'S12A', 'S12B', 'S23A', 'S23B', 'S35A', 'S35B', 'S35C', 'S37A', 'S37B', 'S49A', 'S49B', 'S49D', 'S49E'];

    tbody.innerHTML = areaCodes.map(aCode => {
      const areaName = state.db.areas[aCode] || aCode;
      const s = utils.getSeries('SA0', aCode, 'U') || utils.getSeries('SA0', aCode, 'S');
      const stats = s ? s.stats : null;

      return `
        <tr>
          <td class="font-mono">${aCode}</td>
          <td style="font-weight: 600;">${areaName}</td>
          <td>${stats ? stats.latest_date : '--'}</td>
          <td class="${utils.getValColorClass(stats?.latest_yoy)} font-mono">${utils.fmtPct(stats?.latest_yoy)}</td>
          <td class="${utils.getValColorClass(stats?.latest_mom)} font-mono">${utils.fmtPct(stats?.latest_mom, true)}</td>
          <td class="font-mono">${stats?.latest_val ? stats.latest_val.toFixed(3) : '--'}</td>
          <td class="sparkline-col">
            <canvas class="sparkline-canvas" id="spark-region-${aCode}"></canvas>
          </td>
        </tr>
      `;
    }).join('');

    areaCodes.forEach(aCode => {
      const s = utils.getSeries('SA0', aCode, 'U') || utils.getSeries('SA0', aCode, 'S');
      if (s && s.stats) {
        utils.drawSparkline(`spark-region-${aCode}`, s.stats.spark_yoy);
      }
    });
  }

  return {
    renderRegions,
    renderRegionChart,
    renderRegionalTable
  };
})();
