/**
 * US CPI Macro Analysis Dashboard - Hierarchical Drilldown Module
 */

window.CPI_DRILLDOWN = (function () {
  const state = window.CPI_STATE;
  const utils = window.CPI_UTILS;

  function navigateToDrilldown(itemCode) {
    state.drilldown.itemCode = itemCode;
    state.drilldown.chartItemCode = itemCode; // Initially plot the opened branch
    App.switchTab('drilldown');
    renderDrilldown();
  }

  function selectChartSeries(itemCode) {
    state.drilldown.chartItemCode = itemCode;

    // Highlight selected row in table
    document.querySelectorAll('#drilldown-table-body tr').forEach(tr => {
      const code = tr.getAttribute('data-code');
      tr.classList.toggle('selected-row', code === itemCode);
    });

    renderDrilldownChart();
  }

  function toggleTreeNavigator() {
    state.treePanelOpen = !state.treePanelOpen;
    const panel = document.getElementById('tree-navigator-panel');
    if (panel) {
      panel.style.display = state.treePanelOpen ? 'block' : 'none';
      if (state.treePanelOpen) renderFullTreeNavigator();
    }
  }

  function renderFullTreeNavigator() {
    const container = document.getElementById('full-tree-container');
    if (!container) return;

    function buildNodeHtml(code, depth = 0) {
      const it = state.db.items[code];
      if (!it) return '';
      const s = utils.getSeries(code, '0000', state.drilldown.seas);
      const yoy = s?.stats?.latest_yoy;
      const isCurrent = state.drilldown.itemCode === code || state.drilldown.chartItemCode === code;
      const hasChildren = it.children && it.children.length > 0;

      const indent = depth * 18;

      let html = `
        <div class="tree-node" style="margin-left: ${indent}px;">
          <div class="tree-node-row ${isCurrent ? 'active' : ''}" onclick="App.navigateToDrilldown('${code}')">
            <div style="display: flex; align-items: center; gap: 0.35rem;">
              <span class="level-badge" style="font-size: 0.65rem;">#${it.seq}</span>
              <span style="font-weight: ${depth <= 1 ? '700' : '400'}; color: ${isCurrent ? 'var(--accent-blue)' : 'var(--text-primary)'};">
                ${it.name}
              </span>
              <code style="font-size: 0.7rem; color: var(--text-muted);">(${code})</code>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span class="${utils.getValColorClass(yoy)}" style="font-size: 0.75rem; font-family: monospace;">${utils.fmtPct(yoy)}</span>
              ${hasChildren ? `<span class="badge" style="font-size: 0.65rem; background: var(--bg-card);">${it.children.length} ›</span>` : ''}
            </div>
          </div>
        </div>
      `;

      if (hasChildren) {
        const sortedChildren = [...it.children].sort((a, b) => state.db.items[a].seq - state.db.items[b].seq);
        sortedChildren.forEach(childCode => {
          html += buildNodeHtml(childCode, depth + 1);
        });
      }

      return html;
    }

    container.innerHTML = buildNodeHtml('SA0', 0);
  }

  function renderDrilldown() {
    const item = state.db.items[state.drilldown.itemCode] || state.db.items['SA0'];
    const seas = state.drilldown.seas;
    const s = utils.getSeries(item.code, '0000', seas);
    const stats = s ? s.stats : null;

    // 1. Render Breadcrumbs
    renderBreadcrumbs(item);

    // 2. Render Item Header Details Card
    document.getElementById('drilldown-item-seq').textContent = `Seq #${item.seq}`;
    document.getElementById('drilldown-item-code').textContent = item.code;
    document.getElementById('drilldown-item-level').textContent = `Level ${item.level}`;
    document.getElementById('drilldown-item-name').textContent = item.name;
    document.getElementById('drilldown-item-category-type').textContent = item.category_type.replace('_', ' ').toUpperCase();
    document.getElementById('drilldown-item-title').textContent = s ? s.title : `CPI Series for ${item.name}`;

    const elYoY = document.getElementById('drilldown-val-yoy');
    const elMoM = document.getElementById('drilldown-val-mom');
    const elAnn3m = document.getElementById('drilldown-val-ann3m');
    const elIndex = document.getElementById('drilldown-val-index');
    const elWeight = document.getElementById('drilldown-val-weight');
    const elContrib = document.getElementById('drilldown-val-contrib');

    if (stats) {
      elYoY.textContent = utils.fmtPct(stats.latest_yoy);
      elYoY.className = utils.getValColorClass(stats.latest_yoy);
      elMoM.textContent = utils.fmtPct(stats.latest_mom, true);
      elMoM.className = utils.getValColorClass(stats.latest_mom);
      elAnn3m.textContent = utils.fmtPct(stats.latest_ann3m, true);
      elIndex.textContent = stats.latest_val ? stats.latest_val.toFixed(3) : '--';
      if (elWeight) elWeight.textContent = utils.fmtWeight(item.weight_u);
      if (elContrib) elContrib.textContent = utils.fmtContrib(stats.latest_contrib);
    } else {
      elYoY.textContent = '--%';
      elMoM.textContent = '--%';
      elAnn3m.textContent = '--%';
      elIndex.textContent = '--';
      if (elWeight) elWeight.textContent = utils.fmtWeight(item.weight_u);
      if (elContrib) elContrib.textContent = '--';
    }

    // 3. Render Sub-Components Breakdown Table
    const childrenCodes = item.children || [];
    document.getElementById('drilldown-children-count').textContent = `${childrenCodes.length} sub-items`;
    document.getElementById('drilldown-children-title').textContent = childrenCodes.length > 0 
      ? `Sub-Components of ${item.name}` 
      : `No Sub-Components (Leaf Item: Level ${item.level})`;

    renderDrilldownTable(childrenCodes);

    // 4. Render Chart
    renderDrilldownChart();

    // 5. Update Tree Navigator if open
    if (state.treePanelOpen) {
      renderFullTreeNavigator();
    }
  }

  function renderBreadcrumbs(item) {
    const breadcrumbsBar = document.getElementById('drilldown-breadcrumbs');
    if (!breadcrumbsBar) return;

    const chain = [];
    let curr = item;
    while (curr) {
      chain.unshift(curr);
      curr = curr.parent ? state.db.items[curr.parent] : null;
    }

    if (chain[0].code !== 'SA0' && chain[0].category_type === 'special_aggregate') {
      chain.unshift(state.db.items['SA0']);
    }

    breadcrumbsBar.innerHTML = chain.map((node, i) => {
      const isLast = i === chain.length - 1;
      if (isLast) {
        return `<span class="breadcrumb-item current">[#${node.seq}] ${node.name} (<code>${node.code}</code>)</span>`;
      } else {
        return `
          <span class="breadcrumb-item" onclick="App.navigateToDrilldown('${node.code}')">
            [#${node.seq}] ${node.name}
          </span>
          <span class="breadcrumb-separator">›</span>
        `;
      }
    }).join('');
  }

  function renderDrilldownTable(childrenCodes) {
    const tbody = document.getElementById('drilldown-table-body');
    if (!tbody) return;

    ['seq', 'name', 'weight', 'yoy', 'contrib', 'mom', 'ann3m'].forEach(col => {
      const el = document.getElementById(`sort-indicator-${col}`);
      if (el) {
        if (state.drilldown.sortCol === col) {
          el.textContent = state.drilldown.sortAsc ? '▲' : '▼';
        } else {
          el.textContent = '';
        }
      }
    });

    if (!childrenCodes || childrenCodes.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
            <div style="font-size: 1.05rem; font-weight: 600; margin-bottom: 0.3rem;">Endebene der BLS-Hierarchie</div>
            <div>Für diese Position existieren keine weiteren Unterkategorien. Die Zeitreihe wird rechts im Chart dargestellt.</div>
          </td>
        </tr>
      `;
      return;
    }

    const rows = childrenCodes.map(code => {
      const it = state.db.items[code];
      const s = utils.getSeries(code, '0000', state.drilldown.seas);
      const stats = s ? s.stats : null;
      const hasChildren = it.children && it.children.length > 0;
      return {
        seq: it.seq,
        code: code,
        name: it.name,
        level: it.level,
        weight: it.weight_u !== undefined ? it.weight_u : null,
        hasChildren: hasChildren,
        childrenCount: it.children ? it.children.length : 0,
        yoy: stats ? stats.latest_yoy : null,
        contrib: stats ? stats.latest_contrib : null,
        mom: stats ? stats.latest_mom : null,
        ann3m: stats ? stats.latest_ann3m : null,
        spark: stats ? stats.spark_yoy : []
      };
    });

    const col = state.drilldown.sortCol;
    const asc = state.drilldown.sortAsc;
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

    const activeChartCode = state.drilldown.chartItemCode || state.drilldown.itemCode;

    tbody.innerHTML = rows.map(r => {
      const isSelected = activeChartCode === r.code;
      const contribColor = r.contrib > 0.5 ? '#f43f5e' : (r.contrib > 0.1 ? '#f59e0b' : (r.contrib < 0 ? '#38bdf8' : 'var(--text-secondary)'));
      return `
        <tr class="${isSelected ? 'selected-row' : ''}" data-code="${r.code}" onclick="App.selectChartSeries('${r.code}')" style="cursor: pointer;" title="Klicken, um Zeitreihe in den Chart zu laden">
          <td class="seq-col">#${r.seq}</td>
          <td style="max-width: 170px;">
            <div style="font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${r.name}">
              ${r.name}
            </div>
            <div class="code-col" style="white-space: nowrap;">
              <span class="level-badge">L${r.level}</span> ${r.code}
              ${r.hasChildren ? `• <span class="badge cursor-pointer" onclick="event.stopPropagation(); App.navigateToDrilldown('${r.code}')" style="background: rgba(56, 189, 248, 0.15); color: var(--accent-blue); padding: 0.05rem 0.35rem; font-size: 0.68rem;" title="Hier klicken zum Drilldown">${r.childrenCount} sub ›</span>` : ''}
            </div>
          </td>
          <td class="font-mono text-muted" style="font-size: 0.78rem;">${utils.fmtWeight(r.weight)}</td>
          <td class="${utils.getValColorClass(r.yoy)} font-mono" style="font-size: 0.78rem;">${utils.fmtPct(r.yoy)}</td>
          <td class="font-mono" style="font-weight: 600; color: ${contribColor}; font-size: 0.78rem; white-space: nowrap;">
            ${utils.fmtContrib(r.contrib)}
          </td>
          <td class="${utils.getValColorClass(r.mom)} font-mono" style="font-size: 0.78rem;">${utils.fmtPct(r.mom, true)}</td>
          <td class="${utils.getValColorClass(r.ann3m)} font-mono" style="font-size: 0.78rem;">${utils.fmtPct(r.ann3m, true)}</td>
          <td class="sparkline-col">
            <canvas class="sparkline-canvas" id="spark-drill-${r.code}"></canvas>
          </td>
          <td class="action-col" style="text-align: right;">
            ${r.hasChildren && r.childrenCount > 0 ? `
              <button class="btn-toggle btn-drilldown" onclick="event.stopPropagation(); App.navigateToDrilldown('${r.code}')" title="Drilldown in tiefere Ebene öffnen">
                Drill (${r.childrenCount}) ›
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');

    rows.forEach(r => {
      utils.drawSparkline(`spark-drill-${r.code}`, r.spark);
    });
  }

  function sortDrilldownTable(column) {
    if (state.drilldown.sortCol === column) {
      state.drilldown.sortAsc = !state.drilldown.sortAsc;
    } else {
      state.drilldown.sortCol = column;
      state.drilldown.sortAsc = (column === 'seq' || column === 'name');
    }
    const item = state.db.items[state.drilldown.itemCode];
    if (item) renderDrilldownTable(item.children || []);
  }

  function renderDrilldownChart() {
    const ctx = document.getElementById('chart-drilldown-series');
    if (!ctx) return;

    if (state.charts.drilldownSeries) {
      state.charts.drilldownSeries.destroy();
    }

    const chartCode = state.drilldown.chartItemCode || state.drilldown.itemCode || 'SA0';
    const item = state.db.items[chartCode] || state.db.items[state.drilldown.itemCode] || state.db.items['SA0'];
    const seas = state.drilldown.seas;
    const hasWeight = item && item.weight_u !== undefined && item.weight_u !== null;

    // Toggle visibility of Contrib button based on whether weight exists
    const contribBtn = document.getElementById('btn-drill-metric-contrib');
    if (contribBtn) {
      contribBtn.style.display = hasWeight ? 'inline-block' : 'none';
    }

    // Fallback if metric is contrib but item has no weight
    if (state.drilldown.metric === 'contrib' && !hasWeight) {
      state.drilldown.metric = 'yoy';
    }

    // Update active class on metric buttons
    document.querySelectorAll('#drilldown-metric-toggle .btn-toggle').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-metric') === state.drilldown.metric);
    });

    const metric = state.drilldown.metric;
    const s = utils.getSeries(item.code, '0000', seas);

    const titleSuffix = metric === 'contrib' ? 'YOY CONTRIB (pp)' : metric.toUpperCase();
    document.getElementById('drilldown-chart-title').textContent = `${item.name} (${titleSuffix})`;
    document.getElementById('drilldown-chart-subtitle').textContent = s ? s.title : `Time Series for ${item.name} (#${item.seq})`;

    if (!s) return;

    // Apply Timeframe Filter (Default 3Y)
    const { startIdx, endIdx } = utils.getDateIndices(state.drilldown.years);
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

    const metricLabel = metric === 'yoy' ? 'Year-over-Year Inflation (%)'
      : metric === 'contrib' ? 'Contribution to Headline YoY (pp)'
      : metric === 'mom' ? 'Month-over-Month Change (%)'
      : metric === 'ann3m' ? '3-Month Annualized Rate (%)'
      : 'Index Level (1982-84=100)';

    const isContrib = metric === 'contrib';
    const borderColor = isContrib ? '#c084fc' : '#38bdf8';
    const bgColor = isContrib ? 'rgba(192, 132, 252, 0.15)' : 'rgba(56, 189, 248, 0.1)';

    state.charts.drilldownSeries = new Chart(ctx, {
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
    navigateToDrilldown,
    selectChartSeries,
    toggleTreeNavigator,
    renderFullTreeNavigator,
    renderDrilldown,
    renderBreadcrumbs,
    renderDrilldownTable,
    sortDrilldownTable,
    renderDrilldownChart
  };
})();
