# US CPI Macro Analysis Dashboard

Ein interaktives, rein HTML/JS-basiertes Dashboard zur Analyse der US-Verbraucherpreisdaten (Consumer Price Index - CPI) der US-amerikanischen Federal Reserve / Bureau of Labor Statistics (BLS).

## 🚀 Features & Highlights

- **100% Serverunabhängig & Offline-fähig**: Läuft direkt per Doppelklick auf `index.html` im Webbrowser (Chrome, Edge, Firefox, Safari) über das `file://`-Protokoll – keine Server-Installation, kein Node.js, keine Python-Laufzeit beim Betrieb erforderlich.
- **Hierarchischer Drilldown (Level 0 bis 8)**:
  - Vollständige hierarchische Baumstruktur aus `cu.item` über `sort_sequence` und `display_level`.
  - Direkter Drilldown von der Gesamtrate (*Headline CPI*) über die 8 Hauptausgabenkategorien bis auf tiefste Einzelpositionen (z. B. *Food → Food at Home → Meats → Beef & Veal → Ground Beef*).
  - Interaktive Breadcrumb-Navigation, Subkomponenten-Übersichten, Schnellsuche mit Autocomplete für alle 400+ CPI-Kategorien.
- **Reine Monatsdaten**:
  - Strikte Filterung auf die 12 Monatsperioden (`M01`–`M12`).
  - Jahresdurchschnitte (`M13`) und Semesterwerte (`S01`, `S02`, `S03`) werden automatisch ausgeschlossen.
- **Executive Macro Overview**:
  - KPI-Karten für Headline CPI, Core CPI (ex Food & Energy), Shelter, Supercore (Core Services ex Energy), Energy und Food.
  - Inflations-Momentum-Barometer: Gegenüberstellung von 12-Monats-Veränderung (YoY %) und 3-Monats-annualisierter Dynamik (3M Ann. %).
  - Übersichtskarten mit 24-Monats-Sparklines für die 8 BLS-Hauptausgabenkategorien.
  - 10-Jahres-Verlaufskurve mit Fed 2.0% Inflationsziel und NBER-Rezessionsbändern.
- **Interactive Time Series Studio**:
  - Beliebige Zeitreihen kombinieren und vergleichen.
  - Metrik-Transformationen: **YoY Inflation (%)**, **MoM Veränderung (%)**, **3M Annualized (%)**, **Index-Level** oder **Rebase auf 100**.
  - Saisonalitäts-Umschaltung: Saisonal bereinigt (*Seasonally Adjusted, SA*) vs. Unbereinigt (*NSA*).
  - Zeitfenster-Presets (1J, 3J, 5J, 10J, Max 1997–2026) und CSV-Exportfunktion.
  - Vordefinierte Makro-Baskets (z. B. Headline vs. Core vs. Supercore, Goods vs. Services, Shelter-Dynamik, Energie & Autos).
- **Inflation Heatmap & Matrix**:
  - Farbcodierte Matrix über die letzten 12, 24 oder 36 Monate zur schnellen Identifikation von Inflationstreibern und Abkühlungstendenzen.
  - Interaktive Tooltips und Filterung nach Kategorien.
- **Special Aggregates Explorer**:
  - Dedizierte Ansicht zur Erkundung aller synthetischen und analytischen BLS-Sonderaggregate (z. B. Core CPI, Ex-Food, Ex-Shelter, Ex-Medical, Supercore, Commodities, Services, Durables, Nondurables).
  - Schnellfilter nach Kategorien (*Core & Exclusions*, *Goods & Services*, *Energy & Commodities*, *Services Aggregates*).
  - Interaktive Tabelle mit 24-Monats-Trend-Sparklines, Sortierung nach BLS Sort-Sequence und synchronisiertem Zeitreihenchart mit frei wählbarem Zeithorizont (1Y, 3Y, 5Y, 10Y, Max) und Metriken (YoY %, MoM %, 3M Ann. %, Index).
- **Makro-Themen & Regionalanalyse**:
  - Deep-Dives für Shelter (Miete vs. kalkulatorische Eigentümermiete OER), Supercore-Dienstleistungen, Waren vs. Dienstleistungen und Nahrung/Energie.
  - Regionaler Vergleich über die 4 US-Zensus-Regionen (Northeast, Midwest, South, West) und US-Metropolregionen.

---

## 📁 Dateistruktur

```text
US-CPI/
├── data/
│   ├── cu.data.0.Current    # BLS CPI Zeitreihendaten (1997–2026)
│   ├── cu.item              # BLS Item-Definitionen, display_level & sort_sequence
│   ├── cu.series            # BLS Series-Metadaten & Titel
│   └── cu.txt               # BLS Datenbeschreibung
├── build_data.py            # Python ETL-Skript zur Datenaufbereitung
├── cpi_data.js              # Kompilierte & optimierte Offline-Datenbank
├── chart.min.js             # Lokale Chart.js-Bibliothek (100% offline)
├── index.html               # Haupt-Dashboard UI
├── app.js                   # Interaktive Dashboard-Logik, Charts & Drilldown-Engine
├── styles.css               # Modernes Financial/Macro-Design (Dark & Light Mode)
└── README.md                # Dokumentation
```

---

## 💡 Nutzung & Start

1. **Dashboard öffnen**:
   - Öffnen Sie einfach die Datei `index.html` per Doppelklick in einem beliebigen Browser (z. B. Chrome, Firefox, Edge, Safari).
   - Es ist kein Webserver erforderlich!

2. **Daten aktualisieren (bei neuen BLS-Releases)**:
   - Kopieren Sie die neuen BLS-Dateien in den Ordner `data/`.
   - Führen Sie im Projektordner folgenden Befehl aus:
     ```bash
     python build_data.py
     ```
   - Das Skript verarbeitet die Daten, berechnet alle Metriken (YoY, MoM, 3M Ann, Sparklines, Hierarchien) und aktualisiert `cpi_data.js` in wenigen Sekunden.
   - Laden Sie anschließend `index.html` im Browser neu.
