/**
 * US CPI Macro Analysis Dashboard - Heatmap & Matrix Module
 */

window.CPI_HEATMAP = (function () {
  const state = window.CPI_STATE;
  const utils = window.CPI_UTILS;

  function renderHeatmap() {
    const monthsCount = state.heatmap.months || 24;
    const metric = state.heatmap.metric || 'yoy';
    const levelSetting = state.heatmap.level || '1';

    // Update dynamic color legend
    updateHeatmapLegend(metric);

    const dates = state.db.dates.slice(-monthsCount);
    const thead = document.getElementById('heatmap-table-head');
    const tbody = document.getElementById('heatmap-table-body');
    if (!thead || !tbody) return;

    thead.innerHTML = `
      <tr>
        <th class="sticky-col" style="width: 48px; min-width: 48px; max-width: 48px; left: 0;">Seq</th>
        <th class="sticky-col sticky-edge" style="width: 230px; min-width: 230px; max-width: 230px; left: 48px;">Component / Category</th>
        <th style="width: 70px; min-width: 70px; text-align: right;">Weight</th>
        <th style="width: 50px; min-width: 50px; text-align: center;">Level</th>
        ${dates.map(d => `<th>${d}</th>`).join('')}
      </tr>
    `;

    const itemsToShow = Object.values(state.db.items)
      .filter(it => {
        // Hierarchy Level Filtering
        if (levelSetting === '1') {
          // Main Groupings: Level 0 and Level 1
          if (it.level > 1 && it.category_type !== 'headline') return false;
        } else if (levelSetting === '2') {
          if (it.level > 2) return false;
        } else if (levelSetting === '3') {
          if (it.level > 3) return false;
        }
        // 'all' includes everything

        // Text Search Filtering
        if (state.heatmap.filter) {
          const q = state.heatmap.filter.toLowerCase();
          return it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q) || String(it.seq).includes(q);
        }
        return true;
      })
      .sort((a, b) => a.seq - b.seq);

    if (itemsToShow.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${dates.length + 4}" style="text-align: center; padding: 2rem; color: var(--text-muted);">
            Keine Zeitreihen für die ausgewählte Filterkombination gefunden.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = itemsToShow.map(it => {
      const s = utils.getSeries(it.code, '0000', 'S');
      const hasWeight = it.weight_u !== undefined && it.weight_u !== null;

      let valsArr = [];
      if (s) {
        if (metric === 'contrib') {
          valsArr = (hasWeight && Array.isArray(s.contrib)) ? s.contrib : [];
        } else if (metric === 'vals') {
          valsArr = s.vals || [];
        } else {
          valsArr = s[metric] || [];
        }
      }

      const totalMonths = dates.length;
      const recentVals = valsArr.length > 0 ? valsArr.slice(-monthsCount) : new Array(totalMonths).fill(null);

      // Visual tree connector and indentation logic
      const lvl = it.level || 0;
      let treePrefix = '';
      let indentPx = 0;
      let fontColor = 'var(--text-primary)';
      let fontWeight = '500';
      let rowClass = '';

      if (lvl === 0) {
        fontWeight = '800';
        fontColor = 'var(--accent-blue)';
        treePrefix = '';
        indentPx = 0;
        rowClass = 'heatmap-row-l0';
      } else if (lvl === 1) {
        fontWeight = '700';
        fontColor = 'var(--text-primary)';
        treePrefix = '<span style="color: var(--accent-blue); font-weight: bold; margin-right: 5px; font-size: 0.75rem;">■</span>';
        indentPx = 2;
        rowClass = 'heatmap-row-l1';
      } else if (lvl === 2) {
        fontWeight = '600';
        fontColor = 'var(--text-primary)';
        treePrefix = '<span style="color: var(--text-muted); font-family: monospace; font-size: 0.8rem; margin-right: 4px;">├── </span>';
        indentPx = 14;
      } else if (lvl === 3) {
        fontWeight = '500';
        fontColor = 'var(--text-secondary)';
        treePrefix = '<span style="color: var(--text-muted); font-family: monospace; font-size: 0.75rem; margin-right: 4px; opacity: 0.75;">│&nbsp;&nbsp;└── </span>';
        indentPx = 24;
      } else {
        fontWeight = '400';
        fontColor = 'var(--text-muted)';
        const depthIndent = Math.min(lvl - 3, 4) * 8;
        treePrefix = '<span style="color: var(--text-muted); font-family: monospace; font-size: 0.7rem; margin-right: 3px; opacity: 0.5;">└── </span>';
        indentPx = 28 + depthIndent;
      }

      // Level Badge Styling
      let levelBadgeHtml = '';
      if (lvl === 0) {
        levelBadgeHtml = '<span class="level-badge badge-primary">L0</span>';
      } else if (lvl === 1) {
        levelBadgeHtml = '<span class="level-badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); font-weight: 700;">L1</span>';
      } else if (lvl === 2) {
        levelBadgeHtml = '<span class="level-badge" style="background: rgba(129, 140, 248, 0.15); color: #818cf8; border: 1px solid rgba(129, 140, 248, 0.3);">L2</span>';
      } else if (lvl === 3) {
        levelBadgeHtml = '<span class="level-badge" style="background: rgba(192, 132, 252, 0.15); color: #c084fc; border: 1px solid rgba(192, 132, 252, 0.3);">L3</span>';
      } else {
        levelBadgeHtml = `<span class="level-badge" style="background: var(--bg-card); color: var(--text-muted); border: 1px solid var(--border-subtle);">L${lvl}</span>`;
      }

      return `
        <tr class="${rowClass}">
          <td class="sticky-col seq-col" style="left: 0; width: 48px; min-width: 48px; max-width: 48px;">#${it.seq}</td>
          <td class="sticky-col sticky-edge" style="left: 48px; width: 230px; min-width: 230px; max-width: 230px;">
            <div style="display: flex; align-items: center; padding-left: ${indentPx}px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${treePrefix}
              <a href="javascript:void(0)" onclick="App.navigateToDrilldown('${it.code}')" style="color: ${fontColor}; text-decoration: none; font-weight: ${fontWeight}; overflow: hidden; text-overflow: ellipsis;" title="${it.name} (${it.code})">
                ${it.name}
              </a>
            </div>
            <div class="code-col" style="padding-left: ${indentPx + (lvl >= 1 ? 14 : 0)}px;">${it.code}</div>
          </td>
          <td class="font-mono text-muted" style="text-align: right; font-size: 0.75rem;">
            ${utils.fmtWeight(it.weight_u)}
          </td>
          <td style="text-align: center;">
            ${levelBadgeHtml}
          </td>
          ${recentVals.map((val, idx) => {
            const dateStr = dates[idx];

            if (metric === 'contrib' && !hasWeight) {
              return `
                <td class="heatmap-cell" style="background: transparent; color: var(--text-muted); opacity: 0.35; cursor: default;" title="${it.name} (${dateStr}): Kein BLS-Warenkorbgewicht verfügbar">
                  -
                </td>
              `;
            }

            const cellColor = utils.getHeatmapColor(val, metric);
            let displayVal = '-';
            let titleVal = '--';

            if (val !== null && val !== undefined && !isNaN(val)) {
              if (metric === 'contrib') {
                displayVal = val > 0 ? `+${val.toFixed(2)}` : val.toFixed(2);
                titleVal = utils.fmtContrib(val);
              } else if (metric === 'mom') {
                displayVal = val > 0 ? `+${val.toFixed(1)}` : val.toFixed(1);
                titleVal = utils.fmtPct(val, true);
              } else {
                displayVal = val.toFixed(1);
                titleVal = utils.fmtPct(val);
              }
            }

            return `
              <td class="heatmap-cell" style="background: ${cellColor}; color: #ffffff;" title="${it.name} (${dateStr}): ${titleVal}">
                ${displayVal}
              </td>
            `;
          }).join('')}
        </tr>
      `;
    }).join('');
  }

  function updateHeatmapLegend(metric) {
    const legendEl = document.getElementById('heatmap-legend');
    if (!legendEl) return;

    if (metric === 'contrib') {
      legendEl.innerHTML = `
        <span style="font-weight: 600;">YoY Contribution (pp):</span>
        <span style="display:inline-block; width:14px; height:14px; background:#0284c7; border-radius:3px; margin-left:4px;"></span> &lt; 0 pp (Drag)
        <span style="display:inline-block; width:14px; height:14px; background:#059669; border-radius:3px; margin-left:4px;"></span> 0.0 - 0.1 pp
        <span style="display:inline-block; width:14px; height:14px; background:#ca8a04; border-radius:3px; margin-left:4px;"></span> 0.1 - 0.3 pp
        <span style="display:inline-block; width:14px; height:14px; background:#ea580c; border-radius:3px; margin-left:4px;"></span> 0.3 - 0.8 pp
        <span style="display:inline-block; width:14px; height:14px; background:#dc2626; border-radius:3px; margin-left:4px;"></span> &gt; 0.8 pp (Driver)
      `;
    } else if (metric === 'mom') {
      legendEl.innerHTML = `
        <span style="font-weight: 600;">MoM Change (%):</span>
        <span style="display:inline-block; width:14px; height:14px; background:#0284c7; border-radius:3px; margin-left:4px;"></span> &lt; 0%
        <span style="display:inline-block; width:14px; height:14px; background:#059669; border-radius:3px; margin-left:4px;"></span> 0% - 0.15%
        <span style="display:inline-block; width:14px; height:14px; background:#ca8a04; border-radius:3px; margin-left:4px;"></span> 0.15% - 0.3%
        <span style="display:inline-block; width:14px; height:14px; background:#ea580c; border-radius:3px; margin-left:4px;"></span> 0.3% - 0.6%
        <span style="display:inline-block; width:14px; height:14px; background:#dc2626; border-radius:3px; margin-left:4px;"></span> &gt; 0.6% Hot
      `;
    } else {
      legendEl.innerHTML = `
        <span style="font-weight: 600;">YoY Inflation (%):</span>
        <span style="display:inline-block; width:14px; height:14px; background:#0284c7; border-radius:3px; margin-left:4px;"></span> &lt; 0%
        <span style="display:inline-block; width:14px; height:14px; background:#059669; border-radius:3px; margin-left:4px;"></span> 0% - 2%
        <span style="display:inline-block; width:14px; height:14px; background:#ca8a04; border-radius:3px; margin-left:4px;"></span> 2% - 3.5%
        <span style="display:inline-block; width:14px; height:14px; background:#ea580c; border-radius:3px; margin-left:4px;"></span> 3.5% - 5%
        <span style="display:inline-block; width:14px; height:14px; background:#dc2626; border-radius:3px; margin-left:4px;"></span> &gt; 5% Hot
      `;
    }
  }

  function filterHeatmapRows(q) {
    state.heatmap.filter = q.trim();
    renderHeatmap();
  }

  return {
    renderHeatmap,
    filterHeatmapRows
  };
})();
