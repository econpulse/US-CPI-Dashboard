# -*- coding: utf-8 -*-
"""
US CPI Macro Database ETL Script
Transforms raw BLS text files into an optimized JavaScript data store for the dashboard.
Strict Sort-Sequence Ordering and Single-Pass Hierarchy Builder.
"""
import os
import sys
import csv
import json
import datetime

def build_database():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(base_dir, 'data')
    item_file = os.path.join(data_dir, 'cu.item')
    series_file = os.path.join(data_dir, 'cu.series')
    data_file = os.path.join(data_dir, 'cu.data.0.Current')
    output_file = os.path.join(base_dir, 'cpi_data.js')

    print(f"Reading items from {item_file}...")
    items = {}
    with open(item_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            c = {k.strip(): v.strip() for k, v in row.items()}
            code = c['item_code']
            items[code] = {
                'code': code,
                'name': c['item_name'],
                'level': int(c['display_level']),
                'seq': int(c['sort_sequence']) if c['sort_sequence'].isdigit() else 99999,
                'selectable': c.get('selectable', 'T') == 'T',
                'parent': None,
                'children': [],
                'category_type': 'standard'
            }

    # Major 8 headline expenditure categories
    major_8 = ['SAF', 'SAH', 'SAA', 'SAT', 'SAM', 'SAR', 'SAE', 'SAG']
    special_aggregates_list = [
        'SA0L1E', 'SA0E', 'SASLE', 'SAC', 'SAS', 
        'SAD', 'SAN', 'SA0L1', 'SA0L2', 'SA0L12', 'SA0L12E', 'SA0L12E4',
        'SA0L5', 'SA0LE', 'SACE', 'SACL1', 'SACL11', 'SACL1E', 'SACL1E4',
        'SAN1D', 'SANL1', 'SANL13', 'SANL11', 'SANL113', 'SAEC', 'SAES',
        'SAH31', 'SEEEC', 'SAGC', 'SAGS', 'SAS367', 'SARC', 'SARS',
        'SAS2RS', 'SASL5', 'SASL2RS', 'SATCLTB', 'SAS4', 'SAS24',
        'SERAC', 'SERAS', 'SA311', 'AA0', 'AA0R', 'SA0R'
    ]

    # Single-pass Clean Hierarchy Construction
    sorted_items = sorted(items.values(), key=lambda x: x['seq'])
    
    # Root: SA0 (Headline CPI)
    if 'SA0' in items:
        items['SA0']['category_type'] = 'headline'
        items['SA0']['parent'] = None
        items['SA0']['children'] = [m for m in major_8 if m in items]

    for m in major_8:
        if m in items:
            items[m]['parent'] = 'SA0'
            items[m]['category_type'] = 'major_8'

    stack = []
    for it in sorted_items:
        code = it['code']
        seq = it['seq']
        lvl = it['level']

        if code == 'SA0':
            continue

        # Special analytical series
        if seq >= 357 or (code in special_aggregates_list and code not in major_8 and code not in ['SAF1', 'SAH1']):
            it['category_type'] = 'special_aggregate'
            it['parent'] = None
            continue

        # Top of major branch
        if code in major_8:
            stack = [code] # stack at level 0
            continue

        # Sub-component inside major branch
        it['category_type'] = 'subcomponent'
        while len(stack) > lvl:
            stack.pop()

        if stack:
            parent_code = stack[-1]
            it['parent'] = parent_code
            if code not in items[parent_code]['children']:
                items[parent_code]['children'].append(code)

        stack.append(code)

    # Ensure all children arrays are strictly sorted by sort_sequence!
    for code, it in items.items():
        if it['children']:
            it['children'].sort(key=lambda ch_code: items[ch_code]['seq'])

    print(f"Total items structured: {len(items)}")

    # =========================================================================
    # Parse Relative Importance Weights from cpi-relative-importance.xlsx
    # =========================================================================
    weights_file = os.path.join(data_dir, 'cpi-relative-importance.xlsx')
    if not os.path.exists(weights_file):
        print(f"Downloading relative importance weights from BLS...")
        import urllib.request
        weights_url = 'https://www.bls.gov/web/cpi/cpi-relative-importance.xlsx'
        headers = {
            'User-Agent': 'US-CPI-Macro-Dashboard/1.0 (lukb-research@lukb.ch)',
            'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*'
        }
        try:
            req = urllib.request.Request(weights_url, headers=headers)
            with urllib.request.urlopen(req) as resp, open(weights_file, 'wb') as out_f:
                out_f.write(resp.read())
            print(f"Downloaded {weights_file} ({os.path.getsize(weights_file)} bytes)")
        except Exception as e:
            print(f"Warning: Could not download weights file: {e}")

    if os.path.exists(weights_file) and os.path.getsize(weights_file) > 2000:
        print(f"Parsing Table 1 relative importance weights from {weights_file}...")
        import zipfile
        import xml.etree.ElementTree as ET
        import re

        def norm_name(n):
            n = re.sub(r'\(\d+\)', '', n)
            return re.sub(r'[^a-z0-9]', '', n.lower())

        manual_aliases = {
            norm_name('Housing at school, excluding board'): 'SEHB02',
            norm_name('Other lodging away from home including hotels and motels'): 'SEHB01',
            norm_name('Unsampled owners equivalent rent of secondary residences'): 'SEHC02',
            norm_name('Motor oil, coolant, and other fluids'): 'SETB03',
            norm_name('State motor vehicle registration and license fees'): 'SETE01',
            norm_name('Parking and other fees'): 'SETE02',
            norm_name('Checking account and other bank services'): 'SEEE03',
            norm_name('Tax return preparation and other accounting fees'): 'SEEE04',
            norm_name('Stationery, stationery supplies, gift wrap'): 'SERE01'
        }

        try:
            with zipfile.ZipFile(weights_file, 'r') as z:
                shared_strings = []
                if 'xl/sharedStrings.xml' in z.namelist():
                    tree = ET.fromstring(z.read('xl/sharedStrings.xml'))
                    for si in tree.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
                        t = si.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                        if t is not None:
                            shared_strings.append(t.text)
                        else:
                            texts = [t.text for t in si.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t') if t.text]
                            shared_strings.append(''.join(texts))

                sheet_tree = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
                ns = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
                rows = sheet_tree.findall(f'{ns}sheetData/{ns}row')

            norm_to_item = {norm_name(it['name']): it for it in items.values()}
            matched_weights_count = 0

            for r in rows:
                row_dict = {}
                for c in r.findall(f'{ns}c'):
                    ref = c.attrib.get('r')
                    col = ''.join([ch for ch in ref if ch.isalpha()])
                    ctype = c.attrib.get('t')
                    val_el = c.find(f'{ns}v')
                    val = val_el.text if val_el is not None else None
                    if ctype == 's' and val is not None and int(val) < len(shared_strings):
                        val = shared_strings[int(val)]
                    row_dict[col] = val

                if 'B' in row_dict and row_dict['B'] and 'C' in row_dict and row_dict['C']:
                    name = row_dict['B'].strip()
                    try:
                        w_u = round(float(row_dict['C']), 3)
                        w_w = round(float(row_dict['D']), 3) if 'D' in row_dict and row_dict['D'] else None
                        n = norm_name(name)
                        code = None
                        if n in norm_to_item:
                            code = norm_to_item[n]['code']
                        elif n in manual_aliases:
                            code = manual_aliases[n]
                        
                        if code and code in items:
                            items[code]['weight_u'] = w_u
                            items[code]['weight_w'] = w_w
                            matched_weights_count += 1
                    except ValueError:
                        pass

            print(f"Successfully matched Relative Importance weights for {matched_weights_count} items.")
        except Exception as err:
            print(f"Error parsing weights: {err}")

    print(f"Reading series definitions from {series_file}...")
    series_meta = {}
    with open(series_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter='\t')
        for row in reader:
            c = {k.strip(): v.strip() for k, v in row.items()}
            s_id = c['series_id']
            series_meta[s_id] = {
                'id': s_id,
                'area': c['area_code'],
                'item': c['item_code'],
                'seas': c['seasonal'], # S or U
                'title': c['series_title'],
                'base': c['base_period']
            }

    print(f"Total series metadata loaded: {len(series_meta)}")

    print(f"Reading data from {data_file} (filtering strictly monthly M01-M12)...")
    raw_obs = {}
    all_dates = set()
    skipped_periods = 0
    total_obs = 0

    with open(data_file, 'r', encoding='utf-8') as f:
        f.readline()
        for line in f:
            parts = line.strip().split()
            if len(parts) >= 4:
                s_id, yr, per, val_str = parts[0], parts[1], parts[2], parts[3]
                if s_id not in series_meta:
                    continue
                # Strictly monthly M01 - M12
                if per.startswith('M') and per != 'M13':
                    try:
                        m_num = int(per[1:])
                        if 1 <= m_num <= 12:
                            val = float(val_str)
                            date_str = f"{yr}-{m_num:02d}"
                            all_dates.add(date_str)
                            if s_id not in raw_obs:
                                raw_obs[s_id] = {}
                            raw_obs[s_id][date_str] = val
                            total_obs += 1
                    except ValueError:
                        pass
                else:
                    skipped_periods += 1

    print(f"Total monthly observations extracted: {total_obs}, non-monthly rows skipped: {skipped_periods}")
    sorted_dates = sorted(list(all_dates))
    print(f"Global timeline: {len(sorted_dates)} months ({sorted_dates[0]} to {sorted_dates[-1]})")

    date_to_idx = {d: i for i, d in enumerate(sorted_dates)}

    area_names = {
        '0000': 'U.S. City Average',
        '0100': 'Northeast Urban',
        '0110': 'New England',
        '0120': 'Middle Atlantic',
        '0200': 'Midwest Urban',
        '0230': 'East North Central',
        '0240': 'West North Central',
        '0300': 'South Urban',
        '0350': 'South Atlantic',
        '0360': 'East South Central',
        '0370': 'West South Central',
        '0400': 'West Urban',
        '0480': 'Mountain',
        '0490': 'Pacific',
        'S100': 'Northeast - Size Class A',
        'S200': 'Midwest - Size Class A',
        'S300': 'South - Size Class A',
        'S400': 'West - Size Class A',
        'S12A': 'New York-Newark-Jersey City, NY-NJ-PA',
        'S12B': 'Philadelphia-Camden-Wilmington, PA-NJ-DE-MD',
        'S23A': 'Chicago-Naperville-Elgin, IL-IN-WI',
        'S23B': 'Detroit-Warren-Dearborn, MI',
        'S24A': 'Minneapolis-St.Paul-Bloomington, MN-WI',
        'S35A': 'Washington-Arlington-Alexandria, DC-VA-MD-WV',
        'S35B': 'Miami-Fort Lauderdale-West Palm Beach, FL',
        'S35C': 'Atlanta-Sandy Springs-Roswell, GA',
        'S37A': 'Dallas-Fort Worth-Arlington, TX',
        'S37B': 'Houston-The Woodlands-Sugar Land, TX',
        'S49A': 'Los Angeles-Long Beach-Anaheim, CA',
        'S49B': 'San Francisco-Oakland-Hayward, CA',
        'S49C': 'Riverside-San Bernardino-Ontario, CA',
        'S49D': 'Seattle-Tacoma-Bellevue, WA',
        'S49E': 'San Diego-Carlsbad, CA',
        'S49F': 'Urban Honolulu, HI',
        'S49G': 'Anchorage, AK',
        'N000': 'Size Class B/C (Non-metropolitan)',
        'S000': 'Size Class A (Metropolitan)'
    }

    processed_series = {}
    item_to_series_map = {}

    for s_id, s_info in series_meta.items():
        if s_id not in raw_obs:
            continue
        
        obs_map = raw_obs[s_id]
        s_dates = sorted(obs_map.keys())
        if not s_dates:
            continue

        first_d = s_dates[0]
        last_d = s_dates[-1]
        start_idx = date_to_idx[first_d]

        vals = []
        for i in range(start_idx, date_to_idx[last_d] + 1):
            d = sorted_dates[i]
            v = obs_map.get(d, None)
            vals.append(round(v, 3) if v is not None else None)

        n = len(vals)
        yoy = [None] * n
        mom = [None] * n
        ann3m = [None] * n
        ann6m = [None] * n

        for i in range(n):
            v_curr = vals[i]
            if v_curr is None or v_curr <= 0:
                continue
            if i >= 1 and vals[i-1] is not None and vals[i-1] > 0:
                mom[i] = round(((v_curr - vals[i-1]) / vals[i-1]) * 100, 2)
            if i >= 3 and vals[i-3] is not None and vals[i-3] > 0:
                ann3m[i] = round((((v_curr / vals[i-3]) ** 4) - 1) * 100, 2)
            if i >= 6 and vals[i-6] is not None and vals[i-6] > 0:
                ann6m[i] = round((((v_curr / vals[i-6]) ** 2) - 1) * 100, 2)
            if i >= 12 and vals[i-12] is not None and vals[i-12] > 0:
                yoy[i] = round(((v_curr - vals[i-12]) / vals[i-12]) * 100, 2)

        item_code = s_info['item']
        weight_u = items[item_code].get('weight_u', None)
        contrib = [round((weight_u * y) / 100, 2) if (weight_u is not None and y is not None) else None for y in yoy]

        latest_val = vals[-1]
        latest_yoy = yoy[-1]
        latest_mom = mom[-1]
        latest_ann3m = ann3m[-1]
        latest_ann6m = ann6m[-1]
        latest_contrib = contrib[-1] if contrib and contrib[-1] is not None else None
        prev_yoy = yoy[-2] if n >= 2 else None
        prev_mom = mom[-2] if n >= 2 else None
        yoy_1y_ago = yoy[-13] if n >= 13 else None

        sparkline_yoy = [y for y in yoy[-24:] if y is not None] if n >= 24 else [y for y in yoy if y is not None]
        sparkline_idx = [v for v in vals[-24:] if v is not None] if n >= 24 else [v for v in vals if v is not None]

        processed_series[s_id] = {
            'id': s_id,
            'item': s_info['item'],
            'area': s_info['area'],
            'seas': s_info['seas'],
            'title': s_info['title'],
            's_idx': start_idx,
            'vals': vals,
            'stats': {
                'latest_date': last_d,
                'latest_val': latest_val,
                'latest_yoy': latest_yoy,
                'latest_mom': latest_mom,
                'latest_ann3m': latest_ann3m,
                'latest_ann6m': latest_ann6m,
                'latest_contrib': latest_contrib,
                'prev_yoy': prev_yoy,
                'prev_mom': prev_mom,
                'yoy_1y_ago': yoy_1y_ago,
                'spark_yoy': sparkline_yoy,
                'spark_idx': sparkline_idx
            }
        }

        key = f"{s_info['item']}_{s_info['area']}_{s_info['seas']}"
        item_to_series_map[key] = s_id

    print(f"Processed {len(processed_series)} total series with computed metrics.")

    recessions = [
        {'name': '2001 Dot-Com Recession', 'start': '2001-03', 'end': '2001-11'},
        {'name': '2007-2009 Great Financial Crisis', 'start': '2007-12', 'end': '2009-06'},
        {'name': '2020 COVID-19 Recession', 'start': '2020-02', 'end': '2020-04'}
    ]

    output_data = {
        'last_updated': datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
        'dates': sorted_dates,
        'items': items,
        'major_8': major_8,
        'special_aggregates': special_aggregates_list,
        'areas': area_names,
        'series_map': item_to_series_map,
        'series': processed_series,
        'recessions': recessions
    }

    print(f"Writing JS bundle to {output_file}...")
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('// US CPI Macro Database - Auto-generated from raw BLS data\n')
        f.write('window.CPI_DATABASE = ')
        json.dump(output_data, f, separators=(',', ':'))
        f.write(';\n\n')
        f.write('''// Fast metric hydration for full backward compatibility
(function() {
  const db = window.CPI_DATABASE;
  if (!db || !db.series) return;
  for (const s of Object.values(db.series)) {
    const vals = s.vals;
    const n = vals.length;
    const yoy = new Array(n).fill(null);
    const mom = new Array(n).fill(null);
    const ann3m = new Array(n).fill(null);
    const ann6m = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      const v = vals[i];
      if (v === null || v <= 0) continue;
      if (i >= 1 && vals[i-1] !== null && vals[i-1] > 0) mom[i] = Math.round(((v - vals[i-1]) / vals[i-1]) * 10000) / 100;
      if (i >= 3 && vals[i-3] !== null && vals[i-3] > 0) ann3m[i] = Math.round((Math.pow(v / vals[i-3], 4) - 1) * 10000) / 100;
      if (i >= 6 && vals[i-6] !== null && vals[i-6] > 0) ann6m[i] = Math.round((Math.pow(v / vals[i-6], 2) - 1) * 10000) / 100;
      if (i >= 12 && vals[i-12] !== null && vals[i-12] > 0) yoy[i] = Math.round(((v - vals[i-12]) / vals[i-12]) * 10000) / 100;
    }
    s.yoy = yoy;
    s.mom = mom;
    s.ann3m = ann3m;
    s.ann6m = ann6m;
    const item = db.items[s.item];
    const w = item ? item.weight_u : null;
    s.contrib = (w !== null && w !== undefined) ? yoy.map(y => y !== null ? Math.round((w * y) / 100 * 100) / 100 : null) : new Array(n).fill(null);
  }
})();
''')

    file_size_mb = os.path.getsize(output_file) / 1024 / 1024
    print(f"Success! Generated {output_file} ({file_size_mb:.2f} MB).")


if __name__ == '__main__':
    build_database()
