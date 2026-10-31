# 野外奉仕記録（fd-note）

野外奉仕の記録・訪問の管理・聖書レッスンの管理を、スマホの中だけで行う PWA（ホーム画面に追加して使う Web アプリ）です。

- 公開先: https://tsuda-cong.github.io/fd-note/
- データは端末内の IndexedDB（`fd-note-db`）にだけ保存し、外部へ送信しません。
- 外部との通信は、地図を表示したときの地図タイル（OpenStreetMap）の取得だけです。`index.html` の Content-Security-Policy で、通信先をアプリ自身とタイルサーバーに限っています。
- ビルド工程はありません。HTML / CSS / JavaScript（ES モジュール）をそのまま置くだけで動きます。

## ファイル構成

```
index.html            画面の土台
manifest.json         PWA の設定（アプリ名・アイコン・表示モード）
sw.js                 Service Worker（全ファイルをキャッシュ。キャッシュ名 fd-note-v<版>）
css/style.css         見た目（ダークモード対応）
js/app.js             起動処理・画面の切り替え（#/〜）
js/db.js              IndexedDB・スキーマ版数・マイグレーション
js/dates.js           日付・時刻（ローカル時間の文字列で扱う）
js/calc.js            月の集計・繰り越し・レッスン件数
js/model.js           区分・訪問先の状態（ピンの色）
js/backup.js          バックアップの作成と読み込み
js/address.js         住所入力（都道府県・市区町村の選択、町名以下の自由入力）
js/publications.js    出版物と、聖書レッスンの教材・進み具合（配布した出版物の入力部品も）
data/lesson-courses.json  レッスン型の教材の構成（番号とセクションの区切りだけ。ポイント数を足せる欄あり）
data/municipalities.json  都道府県・市区町村の一覧（総務省「全国地方公共団体コード」令和6年1月1日更新をもとに作成）
data/build_municipalities.py  上の JSON を作り直すスクリプト（アプリの動作には使わない）
towns/index.json      町名データを持つ市区町村の一覧（対応地域の設定）
towns/<コード>.json   市区町村ごとの町名一覧（国土交通省「位置参照情報」をもとに作成し、市の公式文書と照合）
data/build_towns.py   町名 JSON を作るスクリプト（アプリの動作には使わない）
js/ui.js              画面の共通部品
js/views/*.js         画面ごとの処理
vendor/leaflet/       地図ライブラリ Leaflet 1.9.4（BSD-2-Clause、LICENSE 同梱）icons/                アプリのアイコン
```

## 更新するとき

1. コードを直す
2. `sw.js` の `VERSION` を上げる（例 `1.0.0` → `1.0.1`）
3. ファイルを増やしたときは、`sw.js` の `ASSETS` にも足す
4. push すると、利用者の画面に「新しい版があります」と出て、新しい版に切り替わる

## 項目を追加・変更するとき（データの形が変わるとき）

1. `js/db.js` の `SCHEMA_VERSION` を 1 つ上げる
2. 同じファイルの `dataMigrations` に、古い形から新しい形への変換を書く
3. ストア（表）や索引を増やすときは、`DB_VERSION` を上げて `structureUpgrades` に追記する

古いバックアップファイルを読み込んだときも、同じ変換が通ります。

## 町名を選べる市区町村を増やすとき

出典表示: 町名データは「位置参照情報」（国土交通省）を加工して作成している（アプリの「使い方」にも表示）。

1. 国土交通省「位置参照情報」（大字・町丁目レベル）の CSV と、その市の公式な町名一覧（テキストにしたもの）を用意する
2. `python data/build_towns.py <CSV> <市区町村コード> towns/<市区町村コード>.json <公式文書.txt> "<入手元の説明>"` を実行し、「公式文書に見当たらない町名」が出たら確かめる
3. `towns/index.json` の `cities` に1行足す（例 `{ "pref": "大阪府", "city": "寝屋川市", "file": "27215.json" }`）
4. `sw.js` の `VERSION` を上げて push する（町名 JSON は index.json を見て自動でキャッシュされる）

## 画面を追加するとき

`js/views/` にファイルを作り、`js/app.js` の `routes` に 1 行足し、`sw.js` の `ASSETS` に加えます。

## 同じオリジンの他アプリとの分離

- IndexedDB の名前: `fd-note-db`
- localStorage のキー: `fd-note:` で始める
- キャッシュ名: `fd-note-` で始める（古い版を消すときも、この接頭辞のものだけを消す）
- Service Worker の scope: `./`（このフォルダの中だけ）

## 個人情報について

このリポジトリには、アプリのコードだけを入れます。実在の住所・氏名などのデータは入れません。動作確認には架空のデータを使ってください。
