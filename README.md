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
data/municipalities.json  都道府県・市区町村の一覧（総務省「全国地方公共団体コード」令和6年1月1日更新をもとに作成）
data/build_municipalities.py  上の JSON を作り直すスクリプト（アプリの動作には使わない）
js/ui.js              画面の共通部品
js/views/*.js         画面ごとの処理
vendor/leaflet/       地図ライブラリ Leaflet 1.9.4（BSD-2-Clause、LICENSE 同梱）
vendor/qrcode-generator/  QR コード作成 qrcode-generator 1.4.4（MIT、LICENSE 同梱）
icons/                アプリのアイコン
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

## 画面を追加するとき

`js/views/` にファイルを作り、`js/app.js` の `routes` に 1 行足し、`sw.js` の `ASSETS` に加えます。

## 同じオリジンの他アプリとの分離

- IndexedDB の名前: `fd-note-db`
- localStorage のキー: `fd-note:` で始める
- キャッシュ名: `fd-note-` で始める（古い版を消すときも、この接頭辞のものだけを消す）
- Service Worker の scope: `./`（このフォルダの中だけ）

## 個人情報について

このリポジトリには、アプリのコードだけを入れます。実在の住所・氏名などのデータは入れません。動作確認には架空のデータを使ってください。
