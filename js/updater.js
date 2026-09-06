/**
 * US CPI Macro Analysis Dashboard - In-Browser Data Updater & Storage Module
 * Features:
 * 1. Drag & Drop parsing of BLS `cu.data.0.Current` files via HTML5 FileReader
 * 2. Pure client-side calculations (YoY, MoM, 3M/6M Ann, Stats, Sparklines)
 * 3. IndexedDB persistence across sessions with fallback/reset to bundled data
 */

window.CPI_UPDATER = (function () {
  const DB_NAME = 'US_CPI_DASHBOARD_DB';
  const DB_VERSION = 1;
  const STORE_NAME = 'custom_database_store';
  const RECORD_KEY = 'active_cpi_db';

  // Open IndexedDB
  function openIDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        return reject(new Error('IndexedDB not supported in this browser.'));
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Load custom database from IndexedDB if available
  async function loadFromStorage() {
    try {
      const db = await openIDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(RECORD_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('Could not read from IndexedDB:', err);
      return null;
    }
  }

  // Save parsed custom database to IndexedDB
  async function saveToStorage(dbObj) {
    try {
      const db = await openIDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(dbObj, RECORD_KEY);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.error('Could not save to IndexedDB:', err);
      return false;
    }
  }

  // Clear custom database from IndexedDB
  async function clearStorage() {
    try {
      const db = await openIDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(RECORD_KEY);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.error('Could not clear IndexedDB:', err);
      return false;
    }
  }

  // Initialize Updater: Check for stored DB
  async function init() {
    // Preserve default database bundle
    if (!window.CPI_DATABASE_DEFAULT && window.CPI_DATABASE) {
      window.CPI_DATABASE_DEFAULT = window.CPI_DATABASE;
    }

    let customDb = await loadFromStorage();
    if (customDb && customDb.dates && customDb.dates.length > 0 && customDb.items && customDb.series) {
      // Auto-migrate: check if cached database is missing weights or contributions
      const defaultItems = window.CPI_DATABASE_DEFAULT ? window.CPI_DATABASE_DEFAULT.items : null;
      if (defaultItems) {
        const needsSync = !customDb.items['SA0'] || customDb.items['SA0'].weight_u === undefined || customDb.items['SA0'].weight_u === null;
        if (needsSync) {
          console.log('Migrating cached CPI database: syncing weights and computing contributions...');
          for (const [code, it] of Object.entries(customDb.items)) {
            if (defaultItems[code]) {
              if (defaultItems[code].weight_u !== undefined) it.weight_u = defaultItems[code].weight_u;
              if (defaultItems[code].weight_w !== undefined) it.weight_w = defaultItems[code].weight_w;
            }
          }

          if (customDb.series) {
            for (const [sId, s] of Object.entries(customDb.series)) {
              const itemCode = s.item;
              const weightU = customDb.items[itemCode] ? customDb.items[itemCode].weight_u : null;
              if (weightU !== null && weightU !== undefined && Array.isArray(s.yoy)) {
                s.contrib = s.yoy.map(y => y !== null ? Math.round((weightU * y) / 100 * 100) / 100 : null);
                if (s.stats) {
                  s.stats.latest_contrib = s.contrib[s.contrib.length - 1] !== undefined ? s.contrib[s.contrib.length - 1] : null;
                }
              }
            }
          }

          await saveToStorage(customDb);
          console.log('Cached CPI database successfully migrated and saved.');
        }
      }

      console.log('Loaded custom CPI database from IndexedDB (Updated:', customDb.last_updated, ')');
      window.CPI_STATE.db = customDb;
    } else {
      window.CPI_STATE.db = window.CPI_DATABASE_DEFAULT || window.CPI_DATABASE;
    }

    updateDataSourceBadge();
    setupDropZoneAndModal();
  }

  // Update UI Badge showing data source (Bundled vs Custom)
  function updateDataSourceBadge() {
    const badge = document.getElementById('badge-data-source');
    const resetBtn = document.getElementById('btn-reset-data');
    const db = window.CPI_STATE.db;

    if (badge) {
      if (db && db.is_custom) {
        badge.innerHTML = `
          <span class="pulse-indicator" style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#10b981; margin-right:4px;"></span>
          <span>Custom Upload: <strong>${db.dates[db.dates.length - 1]}</strong></span>
        `;
        badge.className = 'badge badge-success cursor-pointer';
        badge.title = `Source: ${db.source_filename || 'cu.data.0.Current'} (Imported: ${db.last_updated})`;
        badge.onclick = openModal;
        if (resetBtn) resetBtn.style.display = 'inline-flex';
      } else {
        badge.innerHTML = `
          <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#38bdf8; margin-right:4px;"></span>
          <span>Bundled Base</span>
        `;
        badge.className = 'badge badge-subtle cursor-pointer';
        badge.title = 'Using default baseline cpi_data.js. Click to update with a new cu.data.0.Current file.';
        badge.onclick = openModal;
        if (resetBtn) resetBtn.style.display = 'none';
      }
    }
  }

  // High Performance In-Browser Parser & Calculator for BLS cu.data.0.Current
  async function processBLSDataFile(file, progressCb) {
    const defaultDb = window.CPI_DATABASE_DEFAULT || window.CPI_STATE.db;
    if (!defaultDb) {
      throw new Error('Baseline metadata not found. Please ensure cpi_data.js is loaded.');
    }

    progressCb(5, 'Reading file contents...');
    const text = await readFileAsText(file);

    progressCb(20, 'Scanning monthly observations (filtering M01-M12)...');
    
    // Series definitions from baseline metadata
    const seriesMeta = defaultDb.series;
    const items = defaultDb.items;
    const areas = defaultDb.areas;
    const seriesMap = defaultDb.series_map;
    const major8 = defaultDb.major_8;
    const specialAggregates = defaultDb.special_aggregates;

    // Fast parsing
    const rawObs = {};
    const allDatesSet = new Set();
    const lines = text.split(/\r?\n/);
    const totalLines = lines.length;

    let obsCount = 0;
    const stepSize = Math.max(100000, Math.floor(totalLines / 20));

    for (let i = 1; i < totalLines; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Extract whitespace/tab separated columns: series_id, year, period, value
      const parts = line.split(/\s+/);
      if (parts.length < 4) continue;

      const sId = parts[0];
      const yr = parts[1];
      const per = parts[2];
      const valStr = parts[3];

      // Only process series in our metadata
      if (!seriesMeta[sId]) continue;

      // Strictly monthly M01 - M12
      if (per.startsWith('M') && per !== 'M13') {
        const mNum = parseInt(per.slice(1), 10);
        if (mNum >= 1 && mNum <= 12) {
          const val = parseFloat(valStr);
          if (!isNaN(val)) {
            const dateStr = `${yr}-${String(mNum).padStart(2, '0')}`;
            allDatesSet.add(dateStr);
            if (!rawObs[sId]) {
              rawObs[sId] = {};
            }
            rawObs[sId][dateStr] = val;
            obsCount++;
          }
        }
      }

      if (i % stepSize === 0) {
        const pct = 20 + Math.floor((i / totalLines) * 35);
        progressCb(pct, `Extracted ${obsCount.toLocaleString()} observations (${Math.floor((i / totalLines) * 100)}%)...`);
        await new Promise(r => setTimeout(r, 0)); // Yield to keep UI responsive
      }
    }

    progressCb(60, `Sorting timeline for ${allDatesSet.size} months...`);
    const sortedDates = Array.from(allDatesSet).sort();
    const dateToIdx = {};
    sortedDates.forEach((d, idx) => {
      dateToIdx[d] = idx;
    });

    progressCb(70, 'Calculating YoY, MoM, and 3M/6M Annualized metrics...');
    const processedSeries = {};

    const seriesKeys = Object.keys(seriesMeta);
    const totalSeries = seriesKeys.length;

    for (let sIdx = 0; sIdx < totalSeries; sIdx++) {
      const sId = seriesKeys[sIdx];
      const sInfo = seriesMeta[sId];
      const obsMap = rawObs[sId];

      if (!obsMap) continue;

      const sDates = Object.keys(obsMap).sort();
      if (sDates.length === 0) continue;

      const firstD = sDates[0];
      const lastD = sDates[sDates.length - 1];
      const startIdx = dateToIdx[firstD];
      const endIdx = dateToIdx[lastD];

      const vals = [];
      for (let i = startIdx; i <= endIdx; i++) {
        const d = sortedDates[i];
        vals.push(obsMap[d] !== undefined ? obsMap[d] : null);
      }

      const n = vals.length;
      const yoy = new Array(n).fill(null);
      const mom = new Array(n).fill(null);
      const ann3m = new Array(n).fill(null);
      const ann6m = new Array(n).fill(null);

      for (let i = 0; i < n; i++) {
        const vCurr = vals[i];
        if (vCurr === null || vCurr <= 0) continue;

        // MoM Change
        if (i >= 1 && vals[i - 1] !== null && vals[i - 1] > 0) {
          mom[i] = Math.round(((vCurr - vals[i - 1]) / vals[i - 1]) * 10000) / 100;
        }
        // 3-Month Annualized Momentum
        if (i >= 3 && vals[i - 3] !== null && vals[i - 3] > 0) {
          ann3m[i] = Math.round((Math.pow(vCurr / vals[i - 3], 4) - 1) * 10000) / 100;
        }
        // 6-Month Annualized
        if (i >= 6 && vals[i - 6] !== null && vals[i - 6] > 0) {
          ann6m[i] = Math.round((Math.pow(vCurr / vals[i - 6], 2) - 1) * 10000) / 100;
        }
        // YoY Inflation
        if (i >= 12 && vals[i - 12] !== null && vals[i - 12] > 0) {
          yoy[i] = Math.round(((vCurr - vals[i - 12]) / vals[i - 12]) * 10000) / 100;
        }
      }

      const itemCode = sInfo.item;
      const weightU = items[itemCode] ? items[itemCode].weight_u : null;
      const contrib = yoy.map(y => (weightU !== null && y !== null) ? Math.round((weightU * y) / 100 * 100) / 100 : null);

      const latestVal = vals[n - 1];
      const latestYoY = yoy[n - 1];
      const latestMoM = mom[n - 1];
      const latestAnn3m = ann3m[n - 1];
      const latestAnn6m = ann6m[n - 1];
      const latestContrib = contrib[n - 1] !== undefined ? contrib[n - 1] : null;
      const prevYoY = n >= 2 ? yoy[n - 2] : null;
      const prevMoM = n >= 2 ? mom[n - 2] : null;
      const yoy1yAgo = n >= 13 ? yoy[n - 13] : null;

      const sparkSlice = yoy.slice(-24);
      const sparkYoY = sparkSlice.filter(y => y !== null);
      const sparkIdxSlice = vals.slice(-24);
      const sparkIdx = sparkIdxSlice.filter(v => v !== null);

      processedSeries[sId] = {
        id: sId,
        area: sInfo.area,
        item: sInfo.item,
        seas: sInfo.seas,
        title: sInfo.title,
        base: sInfo.base,
        vals: vals,
        yoy: yoy,
        mom: mom,
        ann3m: ann3m,
        ann6m: ann6m,
        contrib: contrib,
        stats: {
          latest_date: lastD,
          latest_val: latestVal,
          latest_yoy: latestYoY,
          latest_mom: latestMoM,
          latest_ann3m: latestAnn3m,
          latest_ann6m: latestAnn6m,
          latest_contrib: latestContrib,
          prev_yoy: prevYoY,
          prev_mom: prevMoM,
          yoy_1y_ago: yoy1yAgo,
          spark_yoy: sparkYoY,
          spark_idx: sparkIdx
        }
      };
    }

    progressCb(90, 'Saving compiled database to browser IndexedDB...');

    const newDb = {
      is_custom: true,
      source_filename: file.name,
      last_updated: new Date().toLocaleString(),
      dates: sortedDates,
      items: items,
      areas: areas,
      series_map: seriesMap,
      series: processedSeries,
      major_8: major8,
      special_aggregates: specialAggregates
    };

    await saveToStorage(newDb);

    progressCb(100, 'Data updated successfully!');
    return newDb;
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(new Error('Failed to read file.'));
      reader.readAsText(file);
    });
  }

  // Setup Drag-and-Drop & Modal Events
  function setupDropZoneAndModal() {
    // Open Modal button
    const openBtn = document.getElementById('btn-open-data-updater');
    if (openBtn) openBtn.addEventListener('click', openModal);

    // Close Modal button
    const closeBtn = document.getElementById('modal-updater-close');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);

    // Modal background click
    const modal = document.getElementById('modal-data-updater');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }

    // Reset Data button
    const resetBtn = document.getElementById('btn-modal-reset-data');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        if (confirm('Möchten Sie den benutzerdefinierten Datenstand löschen und auf die Standarddaten (cpi_data.js) zurücksetzen?')) {
          await clearStorage();
          window.CPI_STATE.db = window.CPI_DATABASE_DEFAULT;
          updateDataSourceBadge();
          closeModal();
          reRenderApp();
          alert('Auf Standarddaten zurückgesetzt.');
        }
      });
    }

    // File Input change
    const fileInput = document.getElementById('file-input-updater');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleDroppedFile(e.target.files[0]);
        }
      });
    }

    // Modal Drop Zone
    const dropZone = document.getElementById('modal-drop-zone');
    if (dropZone) {
      ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropZone.classList.add('drag-active');
        }, false);
      });

      ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropZone.classList.remove('drag-active');
        }, false);
      });

      dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
          handleDroppedFile(files[0]);
        }
      }, false);
    }

    // Global Window Drag & Drop Overlay
    const globalOverlay = document.getElementById('global-drag-overlay');
    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (globalOverlay && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
        globalOverlay.style.display = 'flex';
      }
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0 && globalOverlay) {
        globalOverlay.style.display = 'none';
        dragCounter = 0;
      }
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      if (globalOverlay) globalOverlay.style.display = 'none';
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        openModal();
        handleDroppedFile(e.dataTransfer.files[0]);
      }
    });
  }

  async function handleDroppedFile(file) {
    const progressBar = document.getElementById('updater-progress-bar');
    const progressFill = document.getElementById('updater-progress-fill');
    const statusText = document.getElementById('updater-status-text');
    const dropZone = document.getElementById('modal-drop-zone');
    const resultBox = document.getElementById('updater-result-box');

    if (!file) return;

    if (!file.name.toLowerCase().includes('cu.data') && !file.name.toLowerCase().endsWith('.current') && !file.name.toLowerCase().endsWith('.txt') && !file.name.toLowerCase().endsWith('.tsv')) {
      if (!confirm(`Die Datei "${file.name}" scheint keine BLS-Datendatei (cu.data.0.Current) zu sein. Möchten Sie trotzdem fortfahren?`)) {
        return;
      }
    }

    if (progressBar) progressBar.style.display = 'block';
    if (dropZone) dropZone.style.display = 'none';
    if (resultBox) resultBox.style.display = 'none';

    try {
      const newDb = await processBLSDataFile(file, (pct, msg) => {
        if (progressFill) progressFill.style.width = `${pct}%`;
        if (statusText) statusText.textContent = `${pct}% - ${msg}`;
      });

      window.CPI_STATE.db = newDb;
      updateDataSourceBadge();

      if (resultBox) {
        resultBox.innerHTML = `
          <div style="color: #10b981; font-weight: 600; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Daten erfolgreich eingelesen und im Browser gespeichert!
          </div>
          <div style="font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6;">
            <div>• Datei: <strong>${file.name}</strong> (${(file.size / (1024 * 1024)).toFixed(1)} MB)</div>
            <div>• Neuer Stand: <strong>${newDb.dates[newDb.dates.length - 1]}</strong> (Insgesamt ${newDb.dates.length} Monate)</div>
            <div>• Aktive Zeitreihen: <strong>${Object.keys(newDb.series).length.toLocaleString()}</strong></div>
          </div>
          <button class="btn btn-primary btn-sm" style="margin-top: 1rem; width: 100%;" onclick="CPI_UPDATER.closeModal()">
            Dashboard anzeigen
          </button>
        `;
        resultBox.style.display = 'block';
      }

      if (progressBar) progressBar.style.display = 'none';
      reRenderApp();

    } catch (err) {
      console.error(err);
      if (statusText) statusText.textContent = `Fehler: ${err.message}`;
      if (progressBar) progressBar.style.display = 'none';
      if (dropZone) dropZone.style.display = 'block';
      alert(`Fehler beim Verarbeiten der Datei: ${err.message}`);
    }
  }

  function reRenderApp() {
    const db = window.CPI_STATE.db;
    const latestDate = db.dates[db.dates.length - 1];
    const headerLatest = document.getElementById('header-latest-month');
    const footerTimestamp = document.getElementById('footer-data-timestamp');

    if (headerLatest) headerLatest.textContent = latestDate;
    if (footerTimestamp) footerTimestamp.textContent = `Database: ${db.is_custom ? 'Custom Upload (' + db.source_filename + ')' : 'Bundled'} • Updated: ${db.last_updated}`;

    // Re-render all views
    window.CPI_OVERVIEW.renderOverview();
    window.CPI_DRILLDOWN.renderDrilldown();
    window.CPI_TIMESERIES.renderTimeseriesStudio();
    window.CPI_HEATMAP.renderHeatmap();
    window.CPI_THEMES.renderThemes();
    window.CPI_SPECIAL.renderSpecialAggregates();
    window.CPI_REGIONS.renderRegions();
  }

  function openModal() {
    const modal = document.getElementById('modal-data-updater');
    const dropZone = document.getElementById('modal-drop-zone');
    const progressBar = document.getElementById('updater-progress-bar');
    const resultBox = document.getElementById('updater-result-box');
    const currentInfo = document.getElementById('updater-current-info');
    const db = window.CPI_STATE.db;

    if (modal) {
      if (currentInfo && db) {
        currentInfo.innerHTML = `
          <div>Aktiver Datenstand: <strong>${db.dates[db.dates.length - 1]}</strong> (${db.is_custom ? 'Benutzer-Upload: ' + (db.source_filename || 'cu.data.0.Current') : 'Standard-Bundle'})</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Zuletzt aktualisiert: ${db.last_updated}</div>
        `;
      }
      if (dropZone) dropZone.style.display = 'block';
      if (progressBar) progressBar.style.display = 'none';
      if (resultBox) resultBox.style.display = 'none';
      modal.style.display = 'flex';
    }
  }

  function closeModal() {
    const modal = document.getElementById('modal-data-updater');
    if (modal) modal.style.display = 'none';
  }

  return {
    init,
    openModal,
    closeModal,
    handleDroppedFile,
    clearStorage
  };
})();
