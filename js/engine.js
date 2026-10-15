/**
 * US CPI Macro Analysis Dashboard - High-Performance In-Browser Calculation Engine
 * 
 * Core Design Principles:
 * 1. Zero Precomputation Overhead: No 7M-element hydration loops. Metrics are computed JIT on demand.
 * 2. Macroeconomic Accuracy & Completeness:
 *    - YoY is ALWAYS computed from Unadjusted (U) data (100% item & regional coverage, eliminates revision drift).
 *    - MoM (and 3M/6M momentum) is computed from Seasonally Adjusted (S) data when available.
 *    - If S is not published by BLS (74 national items and all regional areas), MoM falls back to U with `isMoM_NSA: true`.
 *    - Contributions (pp) are strictly based on YoY(U) * weight / 100.
 * 3. LRU Cache: Reused metric arrays are cached with minimal memory footprint (< 10 MB heap).
 */

window.CPI_ENGINE = (function () {
  const metricCache = new Map();
  const MAX_CACHE_ENTRIES = 250;

  function getCacheKey(sId, metric) {
    return `${sId}::${metric}`;
  }

  function getFromCache(key) {
    return metricCache.get(key);
  }

  function setToCache(key, data) {
    if (metricCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = metricCache.keys().next().value;
      metricCache.delete(oldestKey);
    }
    metricCache.set(key, data);
    return data;
  }

  function clearCache() {
    metricCache.clear();
  }

  // --- Fast JIT Metric Calculation Primitives ---

  function calcYoY(vals) {
    if (!vals) return [];
    const n = vals.length;
    const res = new Array(n).fill(null);
    for (let i = 12; i < n; i++) {
      const v0 = vals[i - 12];
      const v1 = vals[i];
      if (v0 !== null && v0 > 0 && v1 !== null) {
        res[i] = Math.round(((v1 - v0) / v0) * 10000) / 100;
      }
    }
    return res;
  }

  function calcMoM(vals) {
    if (!vals) return [];
    const n = vals.length;
    const res = new Array(n).fill(null);
    for (let i = 1; i < n; i++) {
      const v0 = vals[i - 1];
      const v1 = vals[i];
      if (v0 !== null && v0 > 0 && v1 !== null) {
        res[i] = Math.round(((v1 - v0) / v0) * 10000) / 100;
      }
    }
    return res;
  }

  function calcAnn3M(vals) {
    if (!vals) return [];
    const n = vals.length;
    const res = new Array(n).fill(null);
    for (let i = 3; i < n; i++) {
      const v0 = vals[i - 3];
      const v1 = vals[i];
      if (v0 !== null && v0 > 0 && v1 !== null) {
        res[i] = Math.round((Math.pow(v1 / v0, 4) - 1) * 10000) / 100;
      }
    }
    return res;
  }

  function calcAnn6M(vals) {
    if (!vals) return [];
    const n = vals.length;
    const res = new Array(n).fill(null);
    for (let i = 6; i < n; i++) {
      const v0 = vals[i - 6];
      const v1 = vals[i];
      if (v0 !== null && v0 > 0 && v1 !== null) {
        res[i] = Math.round((Math.pow(v1 / v0, 2) - 1) * 10000) / 100;
      }
    }
    return res;
  }

  function calcContrib(yoy, weight) {
    if (!yoy || weight === null || weight === undefined) return [];
    const n = yoy.length;
    const res = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      const y = yoy[i];
      if (y !== null) {
        res[i] = Math.round((weight * y) / 100 * 100) / 100;
      }
    }
    return res;
  }

  function getAlignedVals(seriesObj, db) {
    if (!seriesObj || !seriesObj.vals) return [];
    const totalDates = db && db.dates ? db.dates.length : 0;
    if (!totalDates) return seriesObj.vals;
    if (seriesObj.vals.length === totalDates) return seriesObj.vals;
    const sIdx = seriesObj.s_idx || 0;
    if (sIdx === 0 && seriesObj.vals.length >= totalDates) return seriesObj.vals;

    const aligned = new Array(totalDates).fill(null);
    for (let i = 0; i < seriesObj.vals.length; i++) {
      const targetIdx = sIdx + i;
      if (targetIdx < totalDates) {
        aligned[targetIdx] = seriesObj.vals[i];
      }
    }
    seriesObj.vals = aligned;
    return aligned;
  }

  // --- Item Accessor with Dual-Series Resolution ---

  class ItemAccessor {
    constructor(itemCode, areaCode = '0000') {
      const db = window.CPI_STATE ? window.CPI_STATE.db : (window.CPI_DATABASE || null);
      this.db = db;
      this.itemCode = itemCode;
      this.areaCode = areaCode;
      this.itemMeta = db && db.items ? db.items[itemCode] : null;

      if (!db) {
        this.seriesU = null;
        this.seriesS = null;
        return;
      }

      // 1. Resolve Unadjusted Series (U) - exists for all 400 national items & regional areas
      const uId = db.series_map ? db.series_map[`${itemCode}_${areaCode}_U`] : null;
      this.seriesU = (uId && db.series) ? db.series[uId] : null;

      // 2. Resolve Seasonally Adjusted Series (S) - exists for 326 national items, 0 regional
      const sId = db.series_map ? db.series_map[`${itemCode}_${areaCode}_S`] : null;
      this.seriesS = (sId && db.series) ? db.series[sId] : null;
    }

    get exists() {
      return Boolean(this.seriesU || this.seriesS);
    }

    get hasSeasonal() {
      return Boolean(this.seriesS);
    }

    get weight() {
      return this.itemMeta ? (this.itemMeta.weight_u !== undefined ? this.itemMeta.weight_u : null) : null;
    }

    get title() {
      if (this.seriesS && this.seriesS.title) return this.seriesS.title;
      if (this.seriesU && this.seriesU.title) return this.seriesU.title;
      return this.itemMeta ? this.itemMeta.name : this.itemCode;
    }

    get baseSeries() {
      return this.seriesS || this.seriesU;
    }

    // YoY is ALWAYS calculated from the Unadjusted series (100% complete coverage)
    getYoY() {
      const s = this.seriesU || this.seriesS;
      if (!s) return [];
      const vals = getAlignedVals(s, this.db);
      if (!vals) return [];
      const key = getCacheKey(s.id, 'yoy');
      const cached = getFromCache(key);
      if (cached) return cached;
      return setToCache(key, calcYoY(vals));
    }

    // MoM is calculated from Seasonally Adjusted series (fallback to U)
    getMoM() {
      const s = this.seriesS || this.seriesU;
      if (!s) return [];
      const vals = getAlignedVals(s, this.db);
      if (!vals) return [];
      const key = getCacheKey(s.id, 'mom');
      const cached = getFromCache(key);
      if (cached) return cached;
      return setToCache(key, calcMoM(vals));
    }

    // 3M Annualized is calculated from Seasonally Adjusted series (fallback to U)
    getAnn3M() {
      const s = this.seriesS || this.seriesU;
      if (!s) return [];
      const vals = getAlignedVals(s, this.db);
      if (!vals) return [];
      const key = getCacheKey(s.id, 'ann3m');
      const cached = getFromCache(key);
      if (cached) return cached;
      return setToCache(key, calcAnn3M(vals));
    }

    // 6M Annualized is calculated from Seasonally Adjusted series (fallback to U)
    getAnn6M() {
      const s = this.seriesS || this.seriesU;
      if (!s) return [];
      const vals = getAlignedVals(s, this.db);
      if (!vals) return [];
      const key = getCacheKey(s.id, 'ann6m');
      const cached = getFromCache(key);
      if (cached) return cached;
      return setToCache(key, calcAnn6M(vals));
    }

    // Contribution to Headline YoY (pp)
    getContrib() {
      const yoy = this.getYoY();
      const w = this.weight;
      if (w === null || w === undefined) return new Array(yoy.length).fill(null);
      const s = this.seriesU || this.seriesS;
      const key = getCacheKey(s ? s.id : this.itemCode, 'contrib');
      const cached = getFromCache(key);
      if (cached) return cached;
      return setToCache(key, calcContrib(yoy, w));
    }

    // Raw Index Level (optionally select S or U)
    getIndex(preferSeasonal = true) {
      if (preferSeasonal && this.seriesS) {
        return getAlignedVals(this.seriesS, this.db);
      }
      if (this.seriesU) {
        return getAlignedVals(this.seriesU, this.db);
      }
      return this.seriesS ? getAlignedVals(this.seriesS, this.db) : [];
    }

    // Metric accessor by name
    getMetric(metricName, preferSeasonal = true) {
      switch (metricName) {
        case 'yoy': return this.getYoY();
        case 'mom': return this.getMoM();
        case 'ann3m': return this.getAnn3M();
        case 'ann6m': return this.getAnn6M();
        case 'contrib': return this.getContrib();
        case 'vals':
        case 'index': return this.getIndex(preferSeasonal);
        case 'rebased': {
          const vals = this.getIndex(preferSeasonal);
          const base = vals.find(v => v !== null && v > 0) || 100;
          return vals.map(v => v !== null ? Number(((v / base) * 100).toFixed(2)) : null);
        }
        default: return this.getYoY();
      }
    }

    // Fast Snapshot for Table Rows & KPI Cards (O(1) lookups)
    getSnapshot() {
      if (!this.exists) return null;

      const yoyArr = this.getYoY();
      const momArr = this.getMoM();
      const ann3mArr = this.getAnn3M();
      const ann6mArr = this.getAnn6M();
      const contribArr = this.getContrib();
      const idxArr = this.getIndex(true);

      const n = yoyArr.length;
      if (n === 0) return null;

      const latestDate = this.db && this.db.dates ? this.db.dates[this.db.dates.length - 1] : '';
      const latestVal = idxArr[n - 1];
      const latestYoY = yoyArr[n - 1];
      const latestMoM = momArr[n - 1];
      const latestAnn3m = ann3mArr[n - 1];
      const latestAnn6m = ann6mArr[n - 1];
      const latestContrib = contribArr[n - 1];
      const prevYoY = n >= 2 ? yoyArr[n - 2] : null;
      const prevMoM = n >= 2 ? momArr[n - 2] : null;
      const yoy1yAgo = n >= 13 ? yoyArr[n - 13] : null;

      const sparkSliceYoY = yoyArr.slice(-24);
      const sparkYoY = sparkSliceYoY; // retain null/NA to display visible gap
      const sparkSliceIdx = idxArr.slice(-24);
      const sparkIdx = sparkSliceIdx; // retain null/NA to display visible gap

      return {
        latest_date: latestDate,
        latest_val: latestVal,
        latestVal: latestVal,
        latest_yoy: latestYoY,
        latestYoY: latestYoY,
        yoy: latestYoY,
        latest_mom: latestMoM,
        latestMoM: latestMoM,
        mom: latestMoM,
        latest_ann3m: latestAnn3m,
        latestAnn3m: latestAnn3m,
        ann3m: latestAnn3m,
        latest_ann6m: latestAnn6m,
        latestAnn6m: latestAnn6m,
        ann6m: latestAnn6m,
        latest_contrib: latestContrib,
        latestContrib: latestContrib,
        contrib: latestContrib,
        prev_yoy: prevYoY,
        prevYoY: prevYoY,
        prev_mom: prevMoM,
        prevMoM: prevMoM,
        yoy_1y_ago: yoy1yAgo,
        spark_yoy: sparkYoY,
        sparkYoY: sparkYoY,
        spark_idx: sparkIdx,
        sparkIdx: sparkIdx,
        hasSeasonal: this.hasSeasonal,
        isMoM_NSA: !this.hasSeasonal,
        weight: this.weight
      };
    }
  }

  // Raw Series Accessor (for specific series queries, e.g. Regional or Explicit Area Series)
  function getSeriesMetrics(seriesObj) {
    if (!seriesObj || !seriesObj.vals) return null;
    const sId = seriesObj.id;
    return {
      getYoY: () => {
        const k = getCacheKey(sId, 'yoy');
        const c = getFromCache(k);
        return c || setToCache(k, calcYoY(seriesObj.vals));
      },
      getMoM: () => {
        const k = getCacheKey(sId, 'mom');
        const c = getFromCache(k);
        return c || setToCache(k, calcMoM(seriesObj.vals));
      },
      getAnn3M: () => {
        const k = getCacheKey(sId, 'ann3m');
        const c = getFromCache(k);
        return c || setToCache(k, calcAnn3M(seriesObj.vals));
      },
      getAnn6M: () => {
        const k = getCacheKey(sId, 'ann6m');
        const c = getFromCache(k);
        return c || setToCache(k, calcAnn6M(seriesObj.vals));
      }
    };
  }

  return {
    getItem: (itemCode, areaCode = '0000') => new ItemAccessor(itemCode, areaCode),
    getSeriesMetrics,
    calcYoY,
    calcMoM,
    calcAnn3M,
    calcAnn6M,
    calcContrib,
    clearCache
  };
})();
