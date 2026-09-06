/**
 * US CPI Macro Analysis Dashboard - Special Aggregates Module
 */

window.CPI_SPECIAL = (function () {
  const state = window.CPI_STATE;
  const utils = window.CPI_UTILS;

  function renderSpecialAggregates() {
    renderSpecialTable();
    renderSpecialChart();
  }

  function getSpecialAggregateItems() {
    const items = Object.values(state.db.items).filter(it => {
      return it.category_type === 'special_aggregate' || it.seq >= 357 || (state.db.special_aggregates && state.db.special_aggregates.includes(it.code));
    });

    const countAllEl = document.getElementById('special-count-all');
    if (countAllEl) countAllEl.textContent = items.length;

    return items;
  }

  function filterSpecialItems(items) {
    const cat = state.special.category;
    const search = state.special.search;

    let filtered = items;

    if (cat === 'core_exclusion') {
      filtered = items.filter(it => 
        it.code.includes('SA0L') || it.code.includes('SA0LE') || it.code === 'SA0L1E' || it.code === 'SA0L2' || it.name.toLowerCase().includes('less')
      );
    } else if (cat === 'goods_services') {
      filtered = items.filter(it => 
        it.code === 'SAC' || it.code === 'SAS' || it.code === 'SAD' || it.code === 'SAN' || it.name.toLowerCase().includes('commodities') || it.name.toLowerCase().includes('services') || it.name.toLowerCase().includes('durables')
      );
    } else if (cat === 'energy_commodities') {
      filtered = items.filter(it => 
        it.code.includes('SACE') || it.code.includes('SA0E') || it.code.includes('SEEEC') || it.name.toLowerCase().includes('energy')
      );
    } else if (cat === 'services_sub') {
      filtered = items.filter(it => 
        it.code.startsWith('SAS') || it.code.startsWith('SAES') || it.code.startsWith('SARS') || it.code.startsWith('SAGS') || it.code.startsWith('SERAS')
      );
    }

    if (search) {
      filtered = filtered.filter(it => 
        it.name.toLowerCase().includes(search) || it.code.toLowerCase().includes(search) || String(it.seq).includes(search)
      );
    }

    return filtered;
  }

  function renderSpecialTable() {
    const tbody = document.getElementById('special-table-body');
    const countBadge = document.getElementById('special-active-count');
    if (!tbody) return;

    const allItems = getSpecialAggregateItems();
    const items = filterSpecialItems(allItems);

    if (countBadge) countBadge.textContent = `${items.length} items`;

    // Update sort indicators
    ['seq', 'name', 'weight', 'yoy', 'contrib', 'mom', 'ann3m'].forEach(col => {
      const el = document.getElementById(`sort-indicator-special-${col}`);
      if (el) {
        if (state.special.sortCol === col) {
          el.textContent = state.special.sortAsc ? '▲' : '▼';
        } else {
          el.textContent = '';
        }
      }
    });

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            No special aggregates match the active filter or search query.
          </td>
        </tr>
      `;
      return;
    }

    const rows = items.map(it => {
      const s = utils.getSeries(it.code, '0000', state.special.seas);
      const stats = s ? s.stats : null;
      return {
        seq: it.seq,
        code: it.code,
        name: it.name,
        level: it.level,
        weight: it.weight_u !== undefined ? it.weight_u : null,
        yoy: stats ? stats.latest_yoy : null,
        contrib: stats ? stats.latest_contrib : null,
        mom: stats ? stats.latest_mom : null,
        ann3m: stats ? stats.latest_ann3m : null,
        val: stats ? stats.latest_val : null,
        spark: stats ? stats.spark_yoy : []
      };
    });

    const col = state.special.sortCol;
    const asc = state.special.sortAsc;
    rows.sort((a, b) => {
      let va = a[col];
      let vb = b[col];
      if (va === null || va === undefined) va = asc ? 999999 : -999999;
      if (vb === null || vb === undefined) vb = asc ? 999999 : -999999;
      if (typeof va === 'string') {
        return asc ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return asc ? (va - vb) : (vb - va);
    });

    const activeCode = state.special.chartItemCode;

    tbody.innerHTML = rows.map(r => {
      const isSelected = activeCode === r.code;
      const contribColor = r.contrib > 0.5 ? '#f43f5e' : (r.contrib > 0.1 ? '#f59e0b' : (r.contrib < 0 ? '#38bdf8' : 'var(--text-secondary)'));
      return `
        <tr class="${isSelected ? 'selected-row' : ''}" data-code="${r.code}" onclick="App.selectSpecialSeries('${r.code}')" style="cursor: pointer;" title="Click to view time series chart">
          <td class="seq-col">#${r.seq}</td>
          <td>
            <div style="font-weight: 600; color: var(--text-primary);">${r.name}</div>
            <div class="code-col"><span class="level-badge">L${r.level}</span> ${r.code}</div>
          </td>
          <td class="font-mono text-muted">${utils.fmtWeight(r.weight)}</td>
          <td class="${utils.getValColorClass(r.yoy)} font-mono">${utils.fmtPct(r.yoy)}</td>
          <td class="font-mono" style="font-weight: 600; color: ${contribColor};">${utils.fmtContrib(r.contrib)}</td>
          <td class="${utils.getValColorClass(r.mom)} font-mono">${utils.fmtPct(r.mom, true)}</td>
          <td class="${utils.getValColorClass(r.ann3m)} font-mono">${utils.fmtPct(r.ann3m, true)}</td>
          <td class="sparkline-col">
            <canvas class="sparkline-canvas" id="spark-special-${r.code}"></canvas>
          </td>
        </tr>
      `;
    }).join('');

    rows.forEach(r => {
      utils.drawSparkline(`spark-special-${r.code}`, r.spark);
    });
  }

  function selectSpecialSeries(code) {
    state.special.chartItemCode = code;
    document.querySelectorAll('#special-table-body tr').forEach(tr => {
      tr.classList.toggle('selected-row', tr.getAttribute('data-code') === code);
    });
    renderSpecialChart();
  }

  function sortSpecialTable(col) {
    if (state.special.sortCol === col) {
      state.special.sortAsc = !state.special.sortAsc;
    } else {
      state.special.sortCol = col;
      state.special.sortAsc = (col === 'seq' || col === 'name');
    }
    renderSpecialTable();
  }

  function renderSpecialChart() {
    const ctx = document.getElementById('chart-special-main');
    if (!ctx) return;

    if (state.charts.specialMain) {
      state.charts.specialMain.destroy();
    }

    const code = state.special.chartItemCode || 'SA0L1E';
    const item = state.db.items[code] || { name: code, code: code, seq: '--' };
    const seas = state.special.seas;
    const hasWeight = item && item.weight_u !== undefined && item.weight_u !== null;

    // Toggle visibility of Contrib button based on whether weight exists
    const contribBtn = document.getElementById('btn-special-metric-contrib');
    if (contribBtn) {
      contribBtn.style.display = hasWeight ? 'inline-block' : 'none';
    }

    // Fallback if metric is contrib but item has no weight
    if (state.special.metric === 'contrib' && !hasWeight) {
      state.special.metric = 'yoy';
    }

    // Update active class on metric buttons
    document.querySelectorAll('#special-metric-toggle .btn-toggle').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-metric') === state.special.metric);
    });

    const metric = state.special.metric;
    const s = utils.getSeries(code, '0000', seas);

    // Update meta footer
    const elCode = document.getElementById('special-meta-code');
    const elSeq = document.getElementById('special-meta-seq');
    const elVal = document.getElementById('special-meta-val');
    const titleEl = document.getElementById('special-chart-title');
    const subTitleEl = document.getElementById('special-chart-subtitle');

    if (elCode) elCode.textContent = code;
    if (elSeq) elSeq.textContent = `#${item.seq}`;
    if (elVal) elVal.textContent = s && s.stats && s.stats.latest_val ? s.stats.latest_val.toFixed(3) : '--';

    const metricLabel = metric === 'yoy' ? 'Year-over-Year Inflation (%)'
      : metric === 'contrib' ? 'Contribution to Headline YoY (pp)'
      : metric === 'mom' ? 'Month-over-Month Change (%)'
      : metric === 'ann3m' ? '3-Month Annualized Rate (%)'
      : 'Index Level (1982-84=100)';

    const titleSuffix = metric === 'contrib' ? 'YOY CONTRIB (pp)' : metric.toUpperCase();
    if (titleEl) titleEl.textContent = `${item.name} (${titleSuffix})`;
    if (subTitleEl) subTitleEl.textContent = s ? s.title : `Time series for ${item.name} (Seq #${item.seq})`;

    if (!s) return;

    const { startIdx, endIdx } = utils.getDateIndices(state.special.years);
    const labels = state.db.dates.slice(startIdx, endIdx + 1);
    let metricArr = [];
    if (metric === 'contrib') {
      metricArr = (hasWeight && Array.isArray(s.contrib)) ? s.contrib : [];
    } else if (metric === 'vals') {
      metricArr = s.vals || [];
    } else {
      metricArr = s[metric] || [];
    }
    const dataVals = metricArr.slice(startIdx, endIdx + 1);

    const { gridColor, textColor } = utils.getThemeColors();

    const isContrib = metric === 'contrib';
    const borderColor = isContrib ? '#c084fc' : '#38bdf8';
    const bgColor = isContrib ? 'rgba(192, 132, 252, 0.15)' : 'rgba(56, 189, 248, 0.12)';

    state.charts.specialMain = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: `${item.name} (${metricLabel})`,
            data: dataVals,
            borderColor: borderColor,
            backgroundColor: bgColor,
            borderWidth: 2.5,
            tension: 0.2,
            fill: metric === 'yoy' || metric === 'mom' || metric === 'contrib',
            pointRadius: 0,
            pointHoverRadius: 5,
            spanGaps: true
          }
        ]
      },
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
                if (metric === 'vals') return `${ctx.dataset.label}: ${ctx.raw ? ctx.raw.toFixed(3) : '--'}`;
                return `${ctx.dataset.label}: ${utils.fmtPct(ctx.raw)}`;
              }
            }
          }
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor, maxTicksLimit: 12 } },
          y: { 
            grid: { color: gridColor }, 
            ticks: { 
              color: textColor,
              callback: (v) => {
                if (metric === 'contrib') return utils.fmtTick(v, true, ' pp');
                return utils.fmtTick(v, metric !== 'vals');
              }
            } 
          }
        }
      }
    });
  }

  return {
    renderSpecialAggregates,
    getSpecialAggregateItems,
    filterSpecialItems,
    renderSpecialTable,
    selectSpecialSeries,
    sortSpecialTable,
    renderSpecialChart
  };
})();
