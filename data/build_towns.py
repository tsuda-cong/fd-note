# towns/<市区町村コード>.json（町名の一覧）を作るためのスクリプト（アプリの動作には使わない）
#
# 元データ:
#   国土交通省「位置参照情報」大字・町丁目レベル（都道府県単位の CSV）
#   https://nlftp.mlit.go.jp/isj/ から取得する（例: 27000-19.0b.zip → 27_2025.csv）
#
# 作り方:
#   - 指定した市区町村の行を取り出し、「〇丁目」の行は丁目を除いた町名にまとめる
#     （例: 香里ケ丘一丁目〜十二丁目 → 香里ケ丘）。「大字〇〇」はそのまま残す。
#   - 同じ町名は1つにまとめる。
#   - 並び順: 照合に使った市の公式文書（テキストにしたもの）に出てくる順。
#     公式文書に見当たらない町名は後ろに付け、標準エラーに出す（人が確認するため）。
#
# 使い方:
#   python build_towns.py <位置参照情報.csv> <市区町村コード5桁> <出力.json> <公式文書.txt> <source の説明>
#   その後 towns/index.json に1行足し、sw.js の VERSION を上げる。
# 必要なもの: Python 3

import csv, io, json, re, sys, unicodedata

src, code, out, official_path, source_note = sys.argv[1:6]

rows = list(csv.reader(io.StringIO(open(src, 'rb').read().decode('cp932'))))
header, rows = rows[0], rows[1:]
# 列: 都道府県コード, 都道府県名, 市区町村コード, 市区町村名, 大字町丁目コード, 大字町丁目名, 緯度, 経度, 原典資料コード, 大字・字・丁目区分コード
mine = [r for r in rows if r[2] == code]
if not mine:
    sys.exit(f'{code} の行がありません')
pref, city = mine[0][1], mine[0][3]

CHOME = re.compile(r'[一二三四五六七八九十]+丁目$')
towns = []
for r in mine:
    name = r[5].strip()
    if r[9] == '3':          # 丁目
        name = CHOME.sub('', name)
    if name and name not in towns:
        towns.append(name)

def norm(s):
    return unicodedata.normalize('NFKC', s).replace('ヶ', 'ケ').replace('ヵ', 'カ')

official = norm(open(official_path, encoding='utf-8').read())
def position(t):
    # 「杉」が「杉山手」の中で見つからないよう、後ろに町名の続きの文字がない位置を探す
    for m in re.finditer(re.escape(norm(t)), official):
        nxt = official[m.end():m.end() + 1]
        if not nxt or not re.match(r'[^\s\d０-９(（｛{、,=＝の]', nxt) or nxt in '丁':
            return m.start()
    return None

found = [(position(t), i, t) for i, t in enumerate(towns)]
missing = [t for p, _, t in found if p is None]
ordered = [t for p, i, t in sorted(x for x in found if x[0] is not None)] + missing
for t in missing:
    print(f'公式文書に見当たらない町名: {t}', file=sys.stderr)

data = {
    'pref': pref,
    'city': city,
    'code': code,
    'source': source_note,
    'towns': ordered,
}
with open(out, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=1)
print(f'{pref}{city}: {len(ordered)} 町名（公式文書に見当たらないもの {len(missing)}）', file=sys.stderr)
