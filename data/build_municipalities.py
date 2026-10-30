# municipalities.json を作り直すためのスクリプト（アプリの動作には使わない）
#
# 使い方:
#   1. 総務省「全国地方公共団体コード」https://www.soumu.go.jp/denshijiti/code.html から
#      「都道府県コード及び市区町村コード」の Excel ファイルを取得する
#   2. python build_municipalities.py <取得した.xlsx> municipalities.json
#   3. 下の source / updated を、取得したファイルの更新日に合わせて直す
#   4. sw.js の VERSION を上げる
# 必要なもの: Python 3、openpyxl

import json, sys, openpyxl

src, out = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src, read_only=True)
current, designated = [list(ws.iter_rows(values_only=True))[1:] for ws in wb.worksheets[:2]]

def code(v):
    return str(v).zfill(6)

prefs = []          # [{name, cities: [...]}]
by_pref = {}
for row in current:
    c, pref, city = code(row[0]), row[1], row[2]
    if not pref:
        continue
    if city is None:
        by_pref[pref] = {'name': pref, 'cities': []}
        prefs.append(by_pref[pref])
    else:
        by_pref[pref]['cities'].append(city)

# 政令指定都市は区の単位にする（例: 大阪市 → 大阪市北区, 大阪市都島区, ...）
wards = {}
parent = None
for row in designated:
    if not row[0] or not row[2]:
        continue
    pref, name = row[1], row[2]
    if name in by_pref[pref]['cities']:
        parent = (pref, name)
        wards[parent] = []
    else:
        wards[parent].append(name)

for (pref, city), ws in wards.items():
    cities = by_pref[pref]['cities']
    i = cities.index(city)
    cities[i:i + 1] = ws

# 同じ名前の町村（北海道の泊村など）は選択肢では1つにまとめる
for p in prefs:
    p['cities'] = list(dict.fromkeys(p['cities']))

data = {
    'source': '総務省「全国地方公共団体コード」都道府県コード及び市区町村コード（令和6年1月1日更新）をもとに作成。政令指定都市は区の単位。',
    'updated': '2024-01-01',
    'prefectures': prefs,
}
with open(out, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, separators=(',', ':'))

n = sum(len(p['cities']) for p in prefs)
summary = {
    'prefs': len(prefs), 'cities': n, 'designated': len(wards),
    'first': prefs[0]['cities'][:3], 'osaka_sample': [c for c in by_pref['大阪府']['cities'] if c.startswith('大阪市')][:3],
    'tokyo_first': by_pref['東京都']['cities'][:3], 'okinawa_last': prefs[-1]['cities'][-1],
}
print(json.dumps(summary, ensure_ascii=False))
