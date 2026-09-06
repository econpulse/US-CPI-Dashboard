/**
 * US CPI Macro Analysis Dashboard - Thematic Deep Dives Module
 */

window.CPI_THEMES = (function () {
  const state = window.CPI_STATE;
  const utils = window.CPI_UTILS;

  function renderThemes() {
    renderThemeCharts();
  }

  function renderThemeCharts() {
    const { startIdx, endIdx } = utils.getDateIndices(state.themes.years);
    const labels = state.db.dates.slice(startIdx, endIdx + 1);
    const { gridColor, textColor } = utils.getThemeColors();

    // 1. Shelter Dynamics
    const ctxShelter = document.getElementById('chart-theme-shelter');
    if (ctxShelter) {
      if (state.charts.themeShelter) state.charts.themeShelter.destroy();
      const sRent = utils.getSeries('SEHA', '0000', 'S');
      const sOER = utils.getSeries('SEHC', '0000', 'S');
      const sTotalShelter = utils.getSeries('SAH1', '0000', 'S');

      state.charts.themeShelter = new Chart(ctxShelter, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Total Shelter (SAH1)', data: sTotalShelter?.yoy.slice(startIdx, endIdx + 1), borderColor: '#38bdf8', borderWidth: 2.5, pointRadius: 0, spanGaps: true },
            { label: 'Rent of Primary Residence (SEHA)', data: sRent?.yoy.slice(startIdx, endIdx + 1), borderColor: '#f43f5e', borderWidth: 2, pointRadius: 0, spanGaps: true },
            { label: "Owners' Equivalent Rent (SEHC)", data: sOER?.yoy.slice(startIdx, endIdx + 1), borderColor: '#10b981', borderWidth: 2, pointRadius: 0, spanGaps: true }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: textColor } } },
          scales: { x: { grid: { color: gridColor }, ticks: { color: textColor } }, y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => utils.fmtTick(v) } } }
        }
      });
    }

    // 2. Supercore Inflation
    const ctxSupercore = document.getElementById('chart-theme-supercore');
    if (ctxSupercore) {
      if (state.charts.themeSupercore) state.charts.themeSupercore.destroy();
      const sSuper = utils.getSeries('SASLE', '0000', 'S');
      const sHeadline = utils.getSeries('SA0', '0000', 'S');
      const sCore = utils.getSeries('SA0L1E', '0000', 'S');

      state.charts.themeSupercore = new Chart(ctxSupercore, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Supercore (Core Services Ex Energy)', data: sSuper?.yoy.slice(startIdx, endIdx + 1), borderColor: '#f59e0b', borderWidth: 2.5, pointRadius: 0, spanGaps: true },
            { label: 'Core CPI (Ex Food & Energy)', data: sCore?.yoy.slice(startIdx, endIdx + 1), borderColor: '#f43f5e', borderWidth: 2, borderDash: [4, 4], pointRadius: 0, spanGaps: true },
            { label: 'Headline CPI', data: sHeadline?.yoy.slice(startIdx, endIdx + 1), borderColor: '#38bdf8', borderWidth: 2, borderDash: [2, 2], pointRadius: 0, spanGaps: true }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: textColor } } },
          scales: { x: { grid: { color: gridColor }, ticks: { color: textColor } }, y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => utils.fmtTick(v) } } }
        }
      });
    }

    // 3. Goods vs Services
    const ctxGoods = document.getElementById('chart-theme-goods-services');
    if (ctxGoods) {
      if (state.charts.themeGoods) state.charts.themeGoods.destroy();
      const sGoods = utils.getSeries('SACL1E', '0000', 'S');
      const sServices = utils.getSeries('SAS', '0000', 'S');

      state.charts.themeGoods = new Chart(ctxGoods, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Commodities / Core Goods (SACL1E)', data: sGoods?.yoy.slice(startIdx, endIdx + 1), borderColor: '#06b6d4', borderWidth: 2.5, pointRadius: 0, spanGaps: true },
            { label: 'Services (SAS)', data: sServices?.yoy.slice(startIdx, endIdx + 1), borderColor: '#a855f7', borderWidth: 2.5, pointRadius: 0, spanGaps: true }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: textColor } } },
          scales: { x: { grid: { color: gridColor }, ticks: { color: textColor } }, y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => utils.fmtTick(v) } } }
        }
      });
    }

    // 4. Food & Energy Volatility
    const ctxFoodEnergy = document.getElementById('chart-theme-food-energy');
    if (ctxFoodEnergy) {
      if (state.charts.themeFoodEnergy) state.charts.themeFoodEnergy.destroy();
      const sFoodHome = utils.getSeries('SAF11', '0000', 'S');
      const sFoodAway = utils.getSeries('SAF12', '0000', 'S');
      const sGas = utils.getSeries('SETB01', '0000', 'S');

      state.charts.themeFoodEnergy = new Chart(ctxFoodEnergy, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Gasoline (SETB01)', data: sGas?.yoy.slice(startIdx, endIdx + 1), borderColor: '#ef4444', borderWidth: 2.5, pointRadius: 0, spanGaps: true },
            { label: 'Food at Home (SAF11)', data: sFoodHome?.yoy.slice(startIdx, endIdx + 1), borderColor: '#10b981', borderWidth: 2, pointRadius: 0, spanGaps: true },
            { label: 'Food Away from Home (SAF12)', data: sFoodAway?.yoy.slice(startIdx, endIdx + 1), borderColor: '#f59e0b', borderWidth: 2, pointRadius: 0, spanGaps: true }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: textColor } } },
          scales: { x: { grid: { color: gridColor }, ticks: { color: textColor } }, y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => utils.fmtTick(v) } } }
        }
      });
    }
  }

  return {
    renderThemes,
    renderThemeCharts
  };
})();
