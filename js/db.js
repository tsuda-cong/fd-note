// 端末内の IndexedDB への保存。外部には一切送信しない。
//
// 版数は2種類ある:
//   DB_VERSION     … ストア（表）の構成の版。ストアや索引を増やすときに上げる。
//   SCHEMA_VERSION … 保存するデータの形の版。項目の追加・変更で上げ、dataMigrations に変換を書く。
// バックアップファイルにも SCHEMA_VERSION を入れ、古いファイルの読み込み時も同じ変換を通す。

import { nowStamp } from './dates.js';

const DB_NAME = 'fd-note-db';
const DB_VERSION = 1;
export const SCHEMA_VERSION = 4;

// 訪問先ごとの記録（personId を持つ）
export const PERSON_STORES = ['visits', 'plans', 'lessonSchedules', 'lessonRecords'];
// バックアップの対象（settings は別扱い）
export const DATA_STORES = ['serviceTimes', 'otherTimes', 'people', ...PERSON_STORES];

export const DEFAULT_SETTINGS = {
  key: 'main',
  userType: null,          // 'publisher' | 'auxPioneer' | 'regularPioneer'（未選択は null）
  name: '',
  staleDays: 30,           // 最終訪問からこの日数以上で「しばらく訪問していない」
  backupReminderDays: 14,  // 最終バックアップからこの日数以上で促す
  theme: 'auto',           // 'auto' | 'light' | 'dark'
  mapCenter: null,         // { lat, lng, zoom }
  favoriteCities: [],      // よく使う市区町村 [{ pref, city }]（登録した順）
};

// ストア構成の変更。キーの版へ上げるときに実行される。
const structureUpgrades = {
  1(db) {
    db.createObjectStore('meta', { keyPath: 'key' });
    db.createObjectStore('settings', { keyPath: 'key' });
    for (const name of ['serviceTimes', 'otherTimes']) {
      db.createObjectStore(name, { keyPath: 'id' }).createIndex('date', 'date');
    }
    db.createObjectStore('people', { keyPath: 'id' });
    for (const name of PERSON_STORES) {
      db.createObjectStore(name, { keyPath: 'id' }).createIndex('personId', 'personId');
    }
  },
};

// データの形の変換。版 n-1 → 版 n の変換を n をキーにして登録する。
// data はバックアップの data 部分と同じ形 { settings, serviceTimes: [...], people: [...], ... }。
// 例:
//   4: (data) => {
//     for (const p of data.people) p.phone ??= '';
//     return data;
//   },
const dataMigrations = {
  // 版2: 訪問先に町名（town）を追加。これまでの住所は「番地・建物名など」(address) としてそのまま残す。
  2: (data) => {
    for (const p of data.people) p.town ??= '';
    return data;
  },
  // 版3: 住所を「都道府県(pref)・市区町村(city)・町名以下(address)」に。
  //   町名リストはやめ、町名(town)は町名以下の先頭につなげる。これまでの住所は町名以下にそのまま残る。
  3: (data) => {
    for (const p of data.people) {
      p.pref ??= '';
      p.city ??= '';
      p.address = `${p.town || ''}${p.address || ''}`;
      delete p.town;
    }
    if (data.settings) {
      delete data.settings.towns;
      data.settings.favoriteCities ??= [];
    }
    return data;
  },
  // 版4: 町名(town)を「番地・建物名など」(address) と分けて持つ。これまでの住所は address にそのまま残す。
  4: (data) => {
    for (const p of data.people) p.town ??= '';
    return data;
  },
};

export function migrateData(data, fromVersion) {
  for (let v = fromVersion + 1; v <= SCHEMA_VERSION; v++) {
    const fn = dataMigrations[v];
    if (fn) data = fn(data) ?? data;
  }
  return data;
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('保存が中断されました'));
  });
}

async function readSnapshot(db) {
  const tx = db.transaction(['settings', ...DATA_STORES]);
  const settings = reqP(tx.objectStore('settings').get('main'));
  const lists = DATA_STORES.map((name) => reqP(tx.objectStore(name).getAll()));
  const data = { settings: (await settings) || null };
  const values = await Promise.all(lists);
  DATA_STORES.forEach((name, i) => { data[name] = values[i]; });
  return data;
}

// mode: 'replace' は全部消してから書き込み（設定も置き換え）、'merge' は同じ id を上書きして追加
async function writeSnapshot(db, data, mode) {
  const tx = db.transaction(['settings', ...DATA_STORES], 'readwrite');
  const finished = done(tx);
  if (mode === 'replace') {
    tx.objectStore('settings').clear();
    for (const name of DATA_STORES) tx.objectStore(name).clear();
    if (data.settings) tx.objectStore('settings').put({ ...data.settings, key: 'main' });
  }
  for (const name of DATA_STORES) {
    const store = tx.objectStore(name);
    for (const rec of data[name] || []) store.put(rec);
  }
  await finished;
}

async function migrateStoredData(db) {
  const row = await reqP(db.transaction('meta').objectStore('meta').get('schemaVersion'));
  const current = row?.value;
  if (current === SCHEMA_VERSION) return;
  if (current > SCHEMA_VERSION) {
    throw new Error('新しい版のアプリで保存されたデータです。画面を閉じて開き直し、アプリを最新にしてください。');
  }
  if (current != null) {
    const snap = await readSnapshot(db);
    await writeSnapshot(db, migrateData(snap, current), 'replace');
  }
  const tx = db.transaction('meta', 'readwrite');
  tx.objectStore('meta').put({ key: 'schemaVersion', value: SCHEMA_VERSION });
  await done(tx);
}

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('この端末ではデータを保存できません（IndexedDB に対応していません）'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      for (let v = e.oldVersion + 1; v <= DB_VERSION; v++) structureUpgrades[v]?.(req.result, req.transaction);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        alert('アプリが更新されました。画面を開き直してください。');
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => alert('このアプリが別の画面でも開いています。ほかの画面を閉じてから開き直してください。');
  }).then(async (db) => {
    await migrateStoredData(db);
    return db;
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

export async function getAll(store) {
  const db = await openDB();
  return reqP(db.transaction(store).objectStore(store).getAll());
}

export async function get(store, key) {
  const db = await openDB();
  return reqP(db.transaction(store).objectStore(store).get(key));
}

// 複数ストアへの書き込みを1つのトランザクションで行う。fn には store(name) を返す関数が渡る。
export async function write(storeNames, fn) {
  const db = await openDB();
  const tx = db.transaction(storeNames, 'readwrite');
  const finished = done(tx);
  fn((name) => tx.objectStore(name));
  await finished;
}

export async function put(store, value) {
  await write([store], (s) => s(store).put(value));
  return value;
}

export async function remove(store, key) {
  await write([store], (s) => s(store).delete(key));
}

export async function getMeta(key) {
  return (await get('meta', key))?.value;
}

export async function setMeta(key, value) {
  await put('meta', { key, value });
}

export async function hasSavedSettings() {
  return !!(await get('settings', 'main'));
}

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...((await get('settings', 'main')) || {}) };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch, key: 'main' };
  await put('settings', next);
  return next;
}

// 全データをまとめて読む（個人用の量なので毎回読んでも十分速い）
export async function loadAll() {
  return readSnapshot(await openDB());
}

export async function importSnapshot(data, mode) {
  await writeSnapshot(await openDB(), data, mode);
}

// 訪問先と、その人に紐づく記録をまとめて削除
export async function deletePerson(id) {
  const db = await openDB();
  const related = {};
  for (const name of PERSON_STORES) {
    related[name] = await reqP(db.transaction(name).objectStore(name).index('personId').getAllKeys(id));
  }
  await write(['people', ...PERSON_STORES], (s) => {
    s('people').delete(id);
    for (const name of PERSON_STORES) for (const key of related[name]) s(name).delete(key);
  });
}

export function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// 新しい記録に id と作成日時を付ける
export function newRecord(fields) {
  return { id: newId(), ...fields, createdAt: nowStamp() };
}
