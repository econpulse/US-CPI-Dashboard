/**
 * US CPI Macro Analysis Dashboard - Time Series Studio Module
 */

window.CPI_TIMESERIES = (function () {
  const state = window.CPI_STATE;
  const utils = window.CPI_UTILS;

  function renderTimeseriesStudio() {
    renderStudioActiveTags();
    renderStudioChart();
  }

  function renderStudioActiveTags() {
    const tagsContainer = document.getElementById('studio-active-tags');
    if (!tagsContainer) return;

    tagsContainer.innerHTML = state.timeseries.activeItems.map((code, idx) => {
      const item = state.db.items[code] || { name: code, code: code, seq: 999 };
      const color = utils.SERIES_COLORS[idx % utils.SERIES_COLORS.length];
      return `
        <span class="tag-pill" style="border-left: 4px solid ${color};">
          <span class="level-badge" style="font-size: 0.65rem;">#${item.seq}</span>
          <strong>${item.name}</strong> <code>(${code})</code>
          <span class="tag-close" onclick="App.removeStudioSeries('${code}')">&times;</span>
        </span>
      `;
    }).join('');
  }

  function addStudioSeries(code) {
    if (!state.timeseries.activeItems.includes(code)) {
      state.timeseries.activeItems.push(code);
      renderStudioActiveTags();
      renderStudioChart();
    }
    document.getElementById('studio-search-results').style.display = 'none';
    document.getElementById('studio-add-series-input').value = '';
  }

  function removeStudioSeries(code) {
    state.timeseries.activeItems = state.timeseries.activeItems.filter(c => c !== code);
    renderStudioActiveTags();
    renderStudioChart();
  }

  function applyStudioPreset(presetKey) {
    if (presetKey === 'headline_core_supercore') {
      state.timeseries.activeItems = ['SA0', 'SA0L1E', 'SASLE'];
    } else if (presetKey === 'goods_vs_services') {
      state.timeseries.activeItems = ['SACL1E', 'SAS', 'SA0'];
    } else if (presetKey === 'shelter_dynamics') {
      state.timeseries.activeItems = ['SAH1', 'SEHA', 'SEHC'];
    } else if (presetKey === 'food_categories') {
      state.timeseries.activeItems = ['SAF112', 'SEFH', 'SAF113', 'SEFJ'];
    } else if (presetKey === 'energy_auto') {
      state.timeseries.activeItems = ['SETB01', 'SETA01', 'SETA02', 'SETG01'];
    } else if (presetKey === 'food_at_home_away') {
      state.timeseries.activeItems = ['SAF1', 'SAF11', 'SAF12'];
    } else if (presetKey === 'big8_all') {
      state.timeseries.activeItems = [...state.db.major_8].sort((a, b) => state.db.items[a].seq - state.db.items[b].seq);
    } else if (presetKey === 'special_core_variants') {
      state.timeseries.activeItems = ['SA0', 'SA0L1E', 'SA0LE', 'SA0L12E', 'SA0L12E4'];
    } else if (presetKey === 'special_goods_services') {
      state.timeseries.activeItems = ['SAC', 'SAS', 'SAD', 'SAN', 'SACL1E'];
    }
    renderStudioActiveTags();
    renderStudioChart();
  }

  function renderStudioChart() {
    const ctx = document.getElementById('chart-studio-main');
    if (!ctx) return;

    if (state.charts.studioMain) {
      state.charts.studioMain.destroy();
    }

    const { startIdx, endIdx } = utils.getDateIndices(state.timeseries.years);
    const labels = state.db.dates.slice(startIdx, endIdx + 1);
    const metric = state.timeseries.metric;
    const seas = state.timeseries.seas;

    const datasets = state.timeseries.activeItems.map((code, idx) => {
      const item = state.db.items[code] || { name: code };
      const s = utils.getSeries(code, '0000', seas);
      const color = utils.SERIES_COLORS[idx % utils.SERIES_COLORS.length];

      if (!s) return null;

      let rawData = [];
      const hasWeight = item.weight_u !== undefined && item.weight_u !== null;
      if (metric === 'rebased') {
        const sliceVals = s.vals.slice(startIdx, endIdx + 1);
        const baseVal = sliceVals.find(v => v !== null && v > 0) || 100;
        rawData = sliceVals.map(v => v !== null ? Number(((v / baseVal) * 100).toFixed(2)) : null);
      } else if (metric === 'contrib') {
        const contribArr = (hasWeight && Array.isArray(s.contrib)) ? s.contrib : new Array(s.vals ? s.vals.length : 0).fill(null);
        rawData = contribArr.slice(startIdx, endIdx + 1);
      } else if (metric === 'vals') {
        rawData = (s.vals || []).slice(startIdx, endIdx + 1);
      } else {
        const metricArr = s[metric] || [];
        rawData = metricArr.slice(startIdx, endIdx + 1);
      }

      return {
        label: `${item.name} (${code})`,
        data: rawData,
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2.2,
        tension: 0.2,
        fill: false,
        pointRadius: 0,
        pointHoverRadius: 5,
        spanGaps: true
      };
    }).filter(d => d !== null);

    const { gridColor, textColor } = utils.getThemeColors();

    state.charts.studioMain = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: textColor } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (metric === 'contrib') return `${ctx.dataset.label}: ${utils.fmtContrib(ctx.raw)}`;
                if (metric === 'vals' || metric === 'rebased') return `${ctx.dataset.label}: ${ctx.raw}`;
                return `${ctx.dataset.label}: ${utils.fmtPct(ctx.raw)}`;
              }
            }
          }
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor, maxTicksLimit: 14 } },
          y: { 
            grid: { color: gridColor }, 
            ticks: { 
              color: textColor,
              callback: (v) => {
                if (metric === 'contrib') return utils.fmtTick(v, true, ' pp');
                return utils.fmtTick(v, metric !== 'vals' && metric !== 'rebased');
              }
            } 
          }
        }
      }
    });
  }

  function exportStudioCSV() {
    const { startIdx, endIdx } = utils.getDateIndices(state.timeseries.years);
    const dates = state.db.dates.slice(startIdx, endIdx + 1);
    const metric = state.timeseries.metric;
    const seas = state.timeseries.seas;

    let csv = 'Date,' + state.timeseries.activeItems.map(c => `"${state.db.items[c]?.name || c} (${c})"`).join(',') + '\n';

    for (let i = 0; i < dates.length; i++) {
      const d = dates[i];
      const globalIdx = startIdx + i;
      const row = [d];
      state.timeseries.activeItems.forEach(code => {
        const s = utils.getSeries(code, '0000', seas);
        const valArr = s ? (s[metric] || s.vals) : null;
        const val = valArr ? valArr[globalIdx] : '';
        row.push(val !== null && val !== undefined ? val : '');
      });
      csv += row.join(',') + '\n';
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `US_CPI_${metric}_${state.timeseries.years}Y.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    renderTimeseriesStudio,
    renderStudioActiveTags,
    addStudioSeries,
    removeStudioSeries,
    applyStudioPreset,
    renderStudioChart,
    exportStudioCSV
  };
})();
