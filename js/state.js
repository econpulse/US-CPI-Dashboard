/**
 * US CPI Macro Analysis Dashboard - State & Utilities Module
 */

window.CPI_STATE = {
  db: window.CPI_DATABASE || window.CPI_DATABASE_DEFAULT || null,
  currentTab: 'overview',
  theme: localStorage.getItem('cpi_theme') || 'dark',
  treePanelOpen: false,
  drilldown: {
    itemCode: 'SA0',             // Active drilldown branch (parent node)
    chartItemCode: 'SA0',        // Time series currently plotted in the chart view
    seas: 'S',
    metric: 'yoy',
    years: 3,                    // Default 3Y lookback
    sortCol: 'seq',              // Strictly default to BLS sort_sequence!
    sortAsc: true
  },
  timeseries: {
    activeItems: ['SA0', 'SA0L1E', 'SAH1', 'SASLE'],
    seas: 'S',
    metric: 'yoy',
    years: 3,                    // Default 3Y lookback
    preset: 'headline_core_supercore'
  },
  overview: {
    years: 3                     // Default 3Y lookback
  },
  themes: {
    years: 3                     // Default 3Y lookback
  },
  heatmap: {
    metric: 'yoy',
    level: '1',                  // Default: only main groupings (Level 0-1)
    months: 24,
    filter: ''
  },
  special: {
    category: 'all',
    search: '',
    seas: 'S',
    metric: 'yoy',
    years: 3,                    // Default 3Y lookback
    chartItemCode: 'SA0L1E',     // Default to Core CPI
    sortCol: 'seq',              // Strictly default to BLS sort_sequence!
    sortAsc: true
  },
  regions: {
    years: 3                     // Default 3Y lookback
  },
  charts: {}
};

window.CPI_UTILS = (function () {
  const SERIES_COLORS = [
    '#38bdf8', // Sky blue
    '#f43f5e', // Rose
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#a855f7', // Purple
    '#06b6d4', // Cyan
    '#ec4899', // Pink
    '#84cc16', // Lime
    '#6366f1', // Indigo
    '#e11d48', // Crimson
    '#14b8a6', // Teal
    '#eab308'  // Yellow
  ];

  // Helper: Format Percentage with strict precision
  function fmtPct(val, plus = false) {
    if (val === null || val === undefined || isNaN(val)) return '--';
    const num = Number(val);
    const sign = plus && num > 0 ? '+' : '';
    return `${sign}${num.toFixed(2)}%`;
  }

  // Helper: Format Weight Percentage
  function fmtWeight(val) {
    if (val === null || val === undefined || isNaN(val)) return '--';
    const num = Number(val);
    return `${num.toFixed(3)}%`;
  }

  // Helper: Format Contribution in Percentage Points (pp)
  function fmtContrib(val, plus = true) {
    if (val === null || val === undefined || isNaN(val)) return '--';
    const num = Number(val);
    const sign = plus && num > 0 ? '+' : '';
    return `${sign}${num.toFixed(2)} pp`;
  }

  // Helper: Clean tick formatter (eliminates IEEE 754 floating point artifacts like 3.8000000000000007%)
  function fmtTick(val, isPercentage = true, unit = '%') {
    if (val === null || val === undefined || isNaN(val)) return '';
    const num = Number(val);
    const rounded = Math.round(num * 100) / 100;
    return isPercentage ? `${rounded}${unit}` : `${rounded}`;
  }

  // Helper: Get Value Color Class
  function getValColorClass(val) {
    if (val === null || val === undefined || isNaN(val)) return '';
    const num = Number(val);
    if (num > 4.5) return 'val-hot';
    if (num > 2.5) return 'val-warm';
    if (num >= 0) return 'val-cool';
    return 'val-cold';
  }

  // Helper: Heatmap Cell Color
  function getHeatmapColor(val, metric = 'yoy') {
    if (val === null || val === undefined || isNaN(val)) return 'transparent';
    const num = Number(val);
    if (metric === 'mom') {
      if (num > 0.6) return 'rgba(239, 68, 68, 0.75)';
      if (num > 0.3) return 'rgba(249, 115, 22, 0.65)';
      if (num > 0.15) return 'rgba(234, 179, 8, 0.55)';
      if (num >= 0) return 'rgba(16, 185, 129, 0.45)';
      return 'rgba(56, 189, 248, 0.6)';
    } else if (metric === 'contrib') {
      if (num > 0.8) return 'rgba(239, 68, 68, 0.85)';    // Major inflation driver (>0.8 pp)
      if (num > 0.3) return 'rgba(249, 115, 22, 0.75)';    // High driver (0.3 - 0.8 pp)
      if (num > 0.1) return 'rgba(234, 179, 8, 0.6)';     // Moderate driver (0.1 - 0.3 pp)
      if (num >= 0) return 'rgba(16, 185, 129, 0.5)';     // Low / neutral (0.0 - 0.1 pp)
      return 'rgba(56, 189, 248, 0.65)';                  // Disinflationary drag (<0 pp)
    } else {
      if (num > 5.0) return 'rgba(239, 68, 68, 0.8)';
      if (num > 3.5) return 'rgba(249, 115, 22, 0.7)';
      if (num > 2.0) return 'rgba(234, 179, 8, 0.55)';
      if (num >= 0) return 'rgba(16, 185, 129, 0.5)';
      return 'rgba(56, 189, 248, 0.65)';
    }
  }

  // Find Series Object for Item, Area, and Seasonality
  function getSeries(itemCode, areaCode = '0000', seas = 'S') {
    const db = window.CPI_STATE.db;
    if (!db) return null;
    const key = `${itemCode}_${areaCode}_${seas}`;
    let sId = db.series_map[key];
    // Fallback if seasonal not found, try unadjusted
    if (!sId && seas === 'S') {
      sId = db.series_map[`${itemCode}_${areaCode}_U`];
    }
    return sId ? db.series[sId] : null;
  }

  // Draw Mini Sparkline on HTML5 Canvas
  function drawSparkline(canvasId, dataPoints) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.clientWidth || 120;
    const height = canvas.clientHeight || 36;
    
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    
    ctx.clearRect(0, 0, width, height);

    if (!dataPoints || dataPoints.length < 2) return;

    const min = Math.min(...dataPoints);
    const max = Math.max(...dataPoints);
    const range = (max - min) === 0 ? 1 : (max - min);

    const padding = 4;
    const plotH = height - (padding * 2);
    const plotW = width - (padding * 2);

    ctx.beginPath();
    for (let i = 0; i < dataPoints.length; i++) {
      const x = padding + (i / (dataPoints.length - 1)) * plotW;
      const y = padding + plotH - ((dataPoints[i] - min) / range) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    const lastVal = dataPoints[dataPoints.length - 1];
    const strokeColor = lastVal > 3.0 ? '#f87171' : (lastVal > 2.0 ? '#fb923c' : '#34d399');

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // End point dot
    const lastX = padding + plotW;
    const lastY = padding + plotH - ((lastVal - min) / range) * plotH;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    ctx.fillStyle = strokeColor;
    ctx.fill();
  }

  // Get Filtered Date Indices based on Years Lookback
  function getDateIndices(years = 'all') {
    const db = window.CPI_STATE.db;
    const totalDates = db.dates.length;
    if (years === 'all' || !years) {
      return { startIdx: 0, endIdx: totalDates - 1 };
    }
    const count = Math.min(Number(years) * 12, totalDates);
    return { startIdx: totalDates - count, endIdx: totalDates - 1 };
  }

  // Helper for Chart theme colors
  function getThemeColors() {
    const isDark = window.CPI_STATE.theme === 'dark';
    return {
      isDark,
      gridColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
      textColor: isDark ? '#94a3b8' : '#64748b'
    };
  }

  return {
    SERIES_COLORS,
    fmtPct,
    fmtWeight,
    fmtContrib,
    fmtTick,
    getValColorClass,
    getHeatmapColor,
    getSeries,
    drawSparkline,
    getDateIndices,
    getThemeColors
  };
})();
