/**
 * US CPI Macro Analysis Dashboard
 * Pure HTML/JS/CSS client-side dashboard engine
 * Main Orchestrator & UI Controller
 */

window.App = (function () {
  const state = window.CPI_STATE;

  async function init() {
    state.db = window.CPI_DATABASE || window.CPI_DATABASE_DEFAULT || state.db;
    if (!state.db) {
      console.error('CPI_DATABASE not loaded!');
      return;
    }

    if (!window.CPI_DATABASE_DEFAULT && window.CPI_DATABASE) {
      window.CPI_DATABASE_DEFAULT = window.CPI_DATABASE;
    }

    // Initialize updater and check IndexedDB for custom database
    if (window.CPI_UPDATER) {
      try {
        await window.CPI_UPDATER.init();
      } catch (err) {
        console.warn('CPI_UPDATER initialization failed, fallback to default:', err);
      }
    }
    if (!state.db) {
      state.db = window.CPI_DATABASE_DEFAULT || window.CPI_DATABASE;
    }

    // Apply Theme
    document.documentElement.setAttribute('data-theme', state.theme);

    // Setup Header Stats
    const latestDate = state.db.dates[state.db.dates.length - 1];
    document.getElementById('header-latest-month').textContent = latestDate;
    document.getElementById('footer-data-timestamp').textContent = `Database: ${state.db.is_custom ? 'Custom Upload (' + (state.db.source_filename || 'cu.data.0.Current') + ')' : 'Bundled Base'} • Updated: ${state.db.last_updated}`;

    // Attach Event Listeners
    setupEventListeners();

    // Render Initial Views
    window.CPI_OVERVIEW.renderOverview();
    window.CPI_DRILLDOWN.renderDrilldown();
    window.CPI_TIMESERIES.renderTimeseriesStudio();
    window.CPI_HEATMAP.renderHeatmap();
    window.CPI_THEMES.renderThemes();
    window.CPI_SPECIAL.renderSpecialAggregates();
    window.CPI_REGIONS.renderRegions();
  }

  function setupEventListeners() {
    // Theme Toggle
    document.getElementById('btn-theme-toggle').addEventListener('click', () => {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', state.theme);
      localStorage.setItem('cpi_theme', state.theme);
      // Re-render active charts
      window.CPI_OVERVIEW.renderOverviewTrajectoryChart();
      window.CPI_OVERVIEW.renderOverviewMomentumChart();
      window.CPI_DRILLDOWN.renderDrilldownChart();
      window.CPI_TIMESERIES.renderStudioChart();
      window.CPI_THEMES.renderThemeCharts();
      window.CPI_SPECIAL.renderSpecialChart();
      window.CPI_REGIONS.renderRegionChart();
    });

    // Nav Tabs
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.getAttribute('data-tab');
        switchTab(targetTab);
      });
    });

    // Overview Timeframe Toggle
    document.querySelectorAll('#toggle-overview-range .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#toggle-overview-range .btn-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.overview.years = btn.getAttribute('data-years');
        window.CPI_OVERVIEW.renderOverviewTrajectoryChart();
      });
    });

    // Drilldown Timeframe Range Toggle
    document.querySelectorAll('#drilldown-range-toggle .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#drilldown-range-toggle .btn-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.drilldown.years = btn.getAttribute('data-years');
        window.CPI_DRILLDOWN.renderDrilldownChart();
      });
    });

    // Drilldown Search Input & Dropdown
    const drilldownSearch = document.getElementById('drilldown-search');
    const searchDropdown = document.getElementById('search-results-dropdown');
    drilldownSearch.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        searchDropdown.style.display = 'none';
        return;
      }
      const matches = Object.values(state.db.items)
        .filter(it => it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q))
        .sort((a, b) => a.seq - b.seq)
        .slice(0, 15);

      if (matches.length === 0) {
        searchDropdown.innerHTML = '<div style="padding: 0.75rem; color: var(--text-muted); font-size: 0.85rem;">No matching items found</div>';
      } else {
        searchDropdown.innerHTML = matches.map(it => {
          const hasChildren = it.children && it.children.length > 0;
          return `
            <div class="search-result-item" onclick="App.navigateToDrilldown('${it.code}')">
              <div>
                <div class="item-title">
                  <span class="level-badge">Seq #${it.seq}</span>
                  <strong>${it.name}</strong>
                </div>
                <div class="item-path">Level ${it.level} • Code: <code>${it.code}</code> • ${hasChildren ? `${it.children.length} sub-items` : 'Leaf Item'}</div>
              </div>
              <span class="badge badge-primary">${hasChildren ? 'Drill Down ›' : 'Select'}</span>
            </div>
          `;
        }).join('');
      }
      searchDropdown.style.display = 'block';
    });

    document.addEventListener('click', (e) => {
      if (!drilldownSearch.contains(e.target) && !searchDropdown.contains(e.target)) {
        searchDropdown.style.display = 'none';
      }
      const studioInput = document.getElementById('studio-add-series-input');
      const studioDropdown = document.getElementById('studio-search-results');
      if (studioInput && studioDropdown && !studioInput.contains(e.target) && !studioDropdown.contains(e.target)) {
        studioDropdown.style.display = 'none';
      }
    });

    // Drilldown Seasonality Toggle
    document.querySelectorAll('#drilldown-seas-toggle .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#drilldown-seas-toggle .btn-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.drilldown.seas = btn.getAttribute('data-seas');
        window.CPI_DRILLDOWN.renderDrilldown();
      });
    });

    // Drilldown Metric Toggle
    document.querySelectorAll('#drilldown-metric-toggle .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#drilldown-metric-toggle .btn-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.drilldown.metric = btn.getAttribute('data-metric');
        window.CPI_DRILLDOWN.renderDrilldownChart();
      });
    });

    // Studio Metric Toggle
    document.querySelectorAll('#studio-metric-toggle .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#studio-metric-toggle .btn-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.timeseries.metric = btn.getAttribute('data-metric');
        window.CPI_TIMESERIES.renderStudioChart();
      });
    });

    // Studio Range Toggle
    document.querySelectorAll('#studio-range-toggle .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#studio-range-toggle .btn-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.timeseries.years = btn.getAttribute('data-years');
        window.CPI_TIMESERIES.renderStudioChart();
      });
    });

    // Studio Seasonality Toggle
    document.querySelectorAll('#studio-seas-toggle .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#studio-seas-toggle .btn-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.timeseries.seas = btn.getAttribute('data-seas');
        window.CPI_TIMESERIES.renderStudioChart();
      });
    });

    // Studio Add Series Search
    const studioInput = document.getElementById('studio-add-series-input');
    const studioDropdown = document.getElementById('studio-search-results');
    studioInput.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        studioDropdown.style.display = 'none';
        return;
      }
      const matches = Object.values(state.db.items)
        .filter(it => it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q))
        .sort((a, b) => a.seq - b.seq)
        .slice(0, 15);

      if (matches.length === 0) {
        studioDropdown.innerHTML = '<div style="padding: 0.75rem; color: var(--text-muted); font-size: 0.85rem;">No matching series found</div>';
      } else {
        studioDropdown.innerHTML = matches.map(it => `
          <div class="search-result-item" onclick="App.addStudioSeries('${it.code}')">
            <div>
              <div class="item-title">
                <span class="level-badge">Seq #${it.seq}</span>
                <strong>${it.name}</strong>
              </div>
              <div class="item-path">Code: <code>${it.code}</code> • Level ${it.level}</div>
            </div>
            <span class="badge badge-primary">+ Add</span>
          </div>
        `).join('');
      }
      studioDropdown.style.display = 'block';
    });

    // Heatmap Metric Toggle
    document.querySelectorAll('#heatmap-metric-toggle .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#heatmap-metric-toggle .btn-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.heatmap.metric = btn.getAttribute('data-metric');
        window.CPI_HEATMAP.renderHeatmap();
      });
    });

    // Heatmap Level Toggle
    document.querySelectorAll('#heatmap-level-toggle .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#heatmap-level-toggle .btn-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.heatmap.level = btn.getAttribute('data-level');
        window.CPI_HEATMAP.renderHeatmap();
      });
    });

    // Heatmap Months Toggle
    document.querySelectorAll('#heatmap-months-toggle .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#heatmap-months-toggle .btn-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.heatmap.months = Number(btn.getAttribute('data-months'));
        window.CPI_HEATMAP.renderHeatmap();
      });
    });

    // Theme Timeframe Toggle
    document.querySelectorAll('#theme-range-toggle .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#theme-range-toggle .btn-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.themes.years = btn.getAttribute('data-years');
        window.CPI_THEMES.renderThemeCharts();
      });
    });

    // Region Range Toggle
    document.querySelectorAll('#region-range-toggle .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#region-range-toggle .btn-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.regions.years = btn.getAttribute('data-years');
        window.CPI_REGIONS.renderRegionChart();
      });
    });

    // Special Aggregates Seasonality Toggle
    document.querySelectorAll('#special-seas-toggle .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#special-seas-toggle .btn-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.special.seas = btn.getAttribute('data-seas');
        window.CPI_SPECIAL.renderSpecialAggregates();
      });
    });

    // Special Aggregates Metric Toggle
    document.querySelectorAll('#special-metric-toggle .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#special-metric-toggle .btn-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.special.metric = btn.getAttribute('data-metric');
        window.CPI_SPECIAL.renderSpecialAggregates();
      });
    });

    // Special Aggregates Category Filter
    document.querySelectorAll('#special-category-filter .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#special-category-filter .btn-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.special.category = btn.getAttribute('data-cat');
        window.CPI_SPECIAL.renderSpecialTable();
      });
    });

    // Special Aggregates Timeframe Range Toggle
    document.querySelectorAll('#special-range-toggle .btn-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#special-range-toggle .btn-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.special.years = btn.getAttribute('data-years');
        window.CPI_SPECIAL.renderSpecialChart();
      });
    });

    // Special Aggregates Search Input
    const specialSearch = document.getElementById('special-search');
    if (specialSearch) {
      specialSearch.addEventListener('input', (e) => {
        state.special.search = e.target.value.trim().toLowerCase();
        window.CPI_SPECIAL.renderSpecialTable();
      });
    }
  }

  function switchTab(tabId) {
    state.currentTab = tabId;
    document.querySelectorAll('.nav-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tabId}`);
    });

    setTimeout(() => {
      if (tabId === 'overview') {
        window.CPI_OVERVIEW.renderOverviewTrajectoryChart();
        window.CPI_OVERVIEW.renderOverviewMomentumChart();
      } else if (tabId === 'drilldown') {
        window.CPI_DRILLDOWN.renderDrilldownChart();
      } else if (tabId === 'timeseries') {
        window.CPI_TIMESERIES.renderStudioChart();
      } else if (tabId === 'themes') {
        window.CPI_THEMES.renderThemeCharts();
      } else if (tabId === 'special') {
        window.CPI_SPECIAL.renderSpecialChart();
      } else if (tabId === 'regions') {
        window.CPI_REGIONS.renderRegionChart();
      }
    }, 50);
  }

  return {
    init,
    switchTab,
    navigateToDrilldown: (code) => window.CPI_DRILLDOWN.navigateToDrilldown(code),
    selectChartSeries: (code) => window.CPI_DRILLDOWN.selectChartSeries(code),
    getCurrentDrilldownCode: () => state.drilldown.itemCode,
    toggleTreeNavigator: () => window.CPI_DRILLDOWN.toggleTreeNavigator(),
    sortDrilldownTable: (col) => window.CPI_DRILLDOWN.sortDrilldownTable(col),
    addStudioSeries: (code) => window.CPI_TIMESERIES.addStudioSeries(code),
    removeStudioSeries: (code) => window.CPI_TIMESERIES.removeStudioSeries(code),
    applyStudioPreset: (preset) => window.CPI_TIMESERIES.applyStudioPreset(preset),
    exportStudioCSV: () => window.CPI_TIMESERIES.exportStudioCSV(),
    filterHeatmapRows: (q) => window.CPI_HEATMAP.filterHeatmapRows(q),
    selectSpecialSeries: (code) => window.CPI_SPECIAL.selectSpecialSeries(code),
    sortSpecialTable: (col) => window.CPI_SPECIAL.sortSpecialTable(col),
    openDataUpdater: () => window.CPI_UPDATER.openModal(),
    closeDataUpdater: () => window.CPI_UPDATER.closeModal()
  };
})();

// Initialize on DOM ready or immediately if already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.App.init();
  });
} else {
  window.App.init();
}
