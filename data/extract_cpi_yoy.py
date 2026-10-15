#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
US CPI Time Series Extraction & YoY Calculator
==============================================
Extrahiert Zeitreihendaten aus BLS-Quelldateien (cu.data.0.Current, cu.item, cu.series),
filtert hierarchische Blattkategorien (display_level >= 1 ohne Unterkategorien)
gemäß sort_sequence, berechnet die Jahresveränderungsraten (YoY in %) und
speichert die Daten im Wide-Format (Spalten = item_code, Zeilen = Datum).

Dieses Skript ist eigenständig und kein Bestandteil des Dashboards.
"""

import os
import sys
import csv
import argparse
from typing import Dict, List, Tuple, Optional


def load_and_filter_items(item_file: str) -> List[Dict[str, any]]:
    """
    Liest cu.item ein, sortiert nach sort_sequence und filtert die Blatt-Serien:
    - mindestens display_level 1 (display_level >= 1)
    - entfernt Zeitreihen, denen eine Reihe mit display_level + 1 folgt (Unterkategorien)
    - behält Zeitreihen, wenn display_level gleich bleibt (z.B. 1 gefolgt von 1) oder sinkt
    """
    if not os.path.exists(item_file):
        raise FileNotFoundError(f"Datei nicht gefunden: {item_file}")

    raw_items = []
    with open(item_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            cleaned = {k.strip(): v.strip() for k, v in row.items()}
            try:
                seq = int(cleaned["sort_sequence"])
            except (ValueError, KeyError):
                seq = 99999
            try:
                lvl = int(cleaned["display_level"])
            except (ValueError, KeyError):
                lvl = -1

            raw_items.append({
                "item_code": cleaned["item_code"],
                "item_name": cleaned.get("item_name", ""),
                "display_level": lvl,
                "sort_sequence": seq,
                "selectable": cleaned.get("selectable", "T") == "T"
            })

    # Streng nach sort_sequence sortieren
    raw_items.sort(key=lambda x: x["sort_sequence"])

    selected_items = []
    total = len(raw_items)
    for i in range(total):
        curr = raw_items[i]
        curr_lvl = curr["display_level"]

        # Kriterium 1: Mindestens display_level 1
        if curr_lvl < 1:
            continue

        # Kriterium 2: Hat die Reihe eine Unterkategorie?
        # Eine Unterkategorie liegt vor, wenn das nachfolgende Element ein Level höher ist (curr_lvl + 1).
        has_subcategory = False
        if i < total - 1:
            next_lvl = raw_items[i + 1]["display_level"]
            if next_lvl == curr_lvl + 1:
                has_subcategory = True

        if not has_subcategory:
            selected_items.append(curr)

    return selected_items


def load_series_mapping(
    series_file: str,
    target_item_codes: set,
    area_code: str = "0000",
    seasonal: str = "U",
    periodicity: str = "R"
) -> Dict[str, str]:
    """
    Liest cu.series ein und erstellt ein Mapping von item_code -> series_id
    für das gewünschte Gebiet (Standard 0000 = U.S. City Average),
    Saisonalität (Standard U = Not Seasonally Adjusted) und Periodizität (R = Monthly).
    """
    if not os.path.exists(series_file):
        raise FileNotFoundError(f"Datei nicht gefunden: {series_file}")

    item_to_series = {}
    with open(series_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            cleaned = {k.strip(): v.strip() for k, v in row.items()}
            it = cleaned.get("item_code")
            if it not in target_item_codes:
                continue

            if (cleaned.get("area_code") == area_code and
                cleaned.get("seasonal") == seasonal and
                cleaned.get("periodicity_code") == periodicity):
                item_to_series[it] = cleaned["series_id"]

    return item_to_series


def extract_monthly_data(
    data_file: str,
    series_to_item: Dict[str, str]
) -> Dict[str, Dict[Tuple[int, int], float]]:
    """
    Liest cu.data.0.Current ein und extrahiert monatliche Beobachtungen (M01-M12).
    Rückgabe: Dict[item_code, Dict[(year, month), value]]
    """
    if not os.path.exists(data_file):
        raise FileNotFoundError(f"Datei nicht gefunden: {data_file}")

    observations = {it: {} for it in series_to_item.values()}

    with open(data_file, "r", encoding="utf-8") as f:
        # Header überspringen
        f.readline()
        for line in f:
            parts = line.strip().split()
            if len(parts) < 4:
                continue

            sid, yr_str, per_str, val_str = parts[0], parts[1], parts[2], parts[3]
            if sid not in series_to_item:
                continue

            # Nur monatliche Perioden M01-M12 (M13 = Jahresdurchschnitt ignorieren)
            if per_str.startswith("M") and per_str != "M13":
                try:
                    month = int(per_str[1:])
                    year = int(yr_str)
                    val = float(val_str)
                    if 1 <= month <= 12:
                        it = series_to_item[sid]
                        observations[it][(year, month)] = val
                except ValueError:
                    continue

    return observations


def calculate_yoy(
    observations: Dict[str, Dict[Tuple[int, int], float]],
    rounding_digits: int = 2
) -> Tuple[Dict[str, Dict[str, float]], List[str]]:
    """
    Berechnet die Jahresveränderungsrate (YoY in %):
    YoY = ((Wert_t - Wert_{t-12}) / Wert_{t-12}) * 100

    Rückgabe:
    - yoy_by_item: Dict[item_code, Dict[datum_str, yoy_value]]
    - sorted_dates: Liste aller chronologisch sortierten Daten (YYYY-MM), für die mindestens
                    ein YoY-Wert berechnet werden konnte.
    """
    yoy_by_item = {it: {} for it in observations}
    all_dates = set()

    for it, date_vals in observations.items():
        for (year, month), val in date_vals.items():
            prev_val = date_vals.get((year - 1, month))
            if prev_val is not None and prev_val > 0:
                yoy = ((val - prev_val) / prev_val) * 100.0
                if rounding_digits is not None:
                    yoy = round(yoy, rounding_digits)
                date_str = f"{year}-{month:02d}"
                yoy_by_item[it][date_str] = yoy
                all_dates.add(date_str)

    sorted_dates = sorted(list(all_dates))
    return yoy_by_item, sorted_dates


def write_wide_csv(
    output_file: str,
    selected_items: List[Dict[str, any]],
    yoy_by_item: Dict[str, Dict[str, float]],
    sorted_dates: List[str]
) -> None:
    """
    Speichert die berechneten YoY-Werte im Wide-Format als CSV ab:
    Erste Spalte: date
    Folgespalten: item_codes in Reihenfolge der sort_sequence
    Zeilen: Datumsreihenfolge aufsteigend
    """
    item_codes = [it["item_code"] for it in selected_items]
    header = ["date"] + item_codes

    with open(output_file, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)

        for d in sorted_dates:
            row = [d]
            for it in item_codes:
                val = yoy_by_item.get(it, {}).get(d)
                if val is not None:
                    row.append(f"{val:.2f}" if isinstance(val, float) else str(val))
                else:
                    row.append("")
            writer.writerow(row)


def main():
    parser = argparse.ArgumentParser(
        description="Extrahiert US-CPI Zeitreihen auf Blattebene und berechnet YoY-Werte im Wide-Format."
    )
    data_dir_default = os.path.dirname(os.path.abspath(__file__))
    parser.add_argument(
        "--data-dir",
        default=data_dir_default,
        help="Verzeichnis mit den Quelldateien cu.item, cu.series, cu.data.0.Current (Standard: dieses Verzeichnis)."
    )
    parser.add_argument(
        "--output-file",
        default=os.path.join(data_dir_default, "cpi_yoy_wide.csv"),
        help="Pfad zur Ausgabe-CSV-Datei (Standard: <data-dir>/cpi_yoy_wide.csv)."
    )
    parser.add_argument(
        "--area",
        default="0000",
        help="Gebietscode aus cu.series (Standard: '0000' für U.S. City Average)."
    )
    parser.add_argument(
        "--seasonal",
        default="U",
        choices=["U", "S"],
        help="Saisonalität: 'U' (Not seasonally adjusted, Standard & vollständig für YoY) oder 'S' (Seasonally adjusted)."
    )
    parser.add_argument(
        "--round",
        type=int,
        default=2,
        help="Anzahl Nachkommastellen für die YoY-Berechnung (Standard: 2)."
    )

    args = parser.parse_args()

    data_dir = os.path.abspath(args.data_dir)
    item_file = os.path.join(data_dir, "cu.item")
    series_file = os.path.join(data_dir, "cu.series")
    data_file = os.path.join(data_dir, "cu.data.0.Current")
    output_file = os.path.abspath(args.output_file)

    print("=" * 70)
    print("US CPI Extraktion & Jahresveränderungsraten (YoY)")
    print("=" * 70)
    print(f"Quellverzeichnis:  {data_dir}")
    print(f"Ausgabedatei:      {output_file}")
    print(f"Filterkriterien:   area={args.area}, seasonal={args.seasonal}")

    # Schritt 1: Items filtern & sortieren
    print(f"\n[1/5] Lese und filtere Items aus '{os.path.basename(item_file)}'...")
    selected_items = load_and_filter_items(item_file)
    print(f"      -> {len(selected_items)} Blatt-Kategorien ausgewählt (display_level >= 1 ohne Unterkategorien).")

    target_item_codes = set(it["item_code"] for it in selected_items)

    # Schritt 2: Series-Mapping
    print(f"\n[2/5] Lese Zeitreihen-Zuordnung aus '{os.path.basename(series_file)}'...")
    item_to_series = load_series_mapping(
        series_file,
        target_item_codes,
        area_code=args.area,
        seasonal=args.seasonal,
        periodicity="R"
    )
    print(f"      -> {len(item_to_series)} Zeitreihen für area={args.area}, seasonal={args.seasonal} gefunden.")

    if len(item_to_series) < len(selected_items):
        missing = [it["item_code"] for it in selected_items if it["item_code"] not in item_to_series]
        print(f"      Hinweis: {len(missing)} Items haben keine Zeitreihe für diese Kombination (z.B. {missing[:5]}).")

    series_to_item = {sid: it for it, sid in item_to_series.items()}

    # Schritt 3: Zeitreihendaten laden
    print(f"\n[3/5] Lese Beobachtungen aus '{os.path.basename(data_file)}'...")
    observations = extract_monthly_data(data_file, series_to_item)
    total_obs = sum(len(v) for v in observations.values())
    print(f"      -> {total_obs:,} monatliche Beobachtungen geladen.")

    # Schritt 4: YoY berechnen
    print(f"\n[4/5] Berechne Jahresveränderungsraten (YoY) gruppiert nach Serie...")
    yoy_by_item, sorted_dates = calculate_yoy(observations, rounding_digits=args.round)
    print(f"      -> {len(sorted_dates)} Monate mit YoY-Werten ({sorted_dates[0]} bis {sorted_dates[-1]}).")

    # Schritt 5: Wide-Format CSV schreiben
    print(f"\n[5/5] Speichere Daten im Wide-Format nach '{output_file}'...")
    write_wide_csv(output_file, selected_items, yoy_by_item, sorted_dates)
    file_size_kb = os.path.getsize(output_file) / 1024
    print(f"      -> Fertig! CSV-Größe: {file_size_kb:.1f} KB")
    print(f"      -> {len(sorted_dates)} Zeilen (Daten) und {len(selected_items) + 1} Spalten (date + {len(selected_items)} Items).")
    print("=" * 70)


if __name__ == "__main__":
    main()
