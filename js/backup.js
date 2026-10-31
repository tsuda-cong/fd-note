// バックアップファイル（JSON）の作成と読み込み

import { loadAll, importSnapshot, setMeta, migrateData, getSettings, saveSettings, SCHEMA_VERSION, DATA_STORES } from './db.js';
import { nowStamp } from './dates.js';

export const STORE_LABELS = {
  people: '訪問先',
  visits: '訪問の記録',
  plans: '次回の予定',
  lessonSchedules: 'レッスンの予定',
  lessonRecords: 'レッスンの実施記録',
  serviceTimes: '奉仕時間の記録',
  otherTimes: '野外奉仕以外の時間',
  publications: '出版物',
  visitPublications: '渡した出版物の記録',
  lessonMaterials: 'レッスンの教材',
  lessonProgress: 'レッスンの進み具合',
};

export async function buildBackupFile() {
  const data = await loadAll();
  const payload = { app: 'fd-note', schemaVersion: SCHEMA_VERSION, exportedAt: nowStamp(), data };
  const stamp = nowStamp().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const name = `fd-note-backup-${stamp}.json`;
  const json = JSON.stringify(payload, null, 1);
  return { name, json, counts: countRecords(data) };
}

export function countRecords(data) {
  return DATA_STORES.map((name) => ({ name, label: STORE_LABELS[name], count: (data[name] || []).length }));
}

export async function markBackedUp() {
  await setMeta('lastBackupAt', nowStamp());
}

// ファイルの中身を確認して、今の形に変換したデータを返す。おかしければ Error を投げる。
export function parseBackup(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('ファイルを読めませんでした。このアプリで書き出したバックアップファイルを選んでください。');
  }
  if (!obj || obj.app !== 'fd-note' || typeof obj.data !== 'object' || !Number.isInteger(obj.schemaVersion)) {
    throw new Error('このアプリのバックアップファイルではありません。');
  }
  if (obj.schemaVersion > SCHEMA_VERSION) {
    throw new Error('新しい版のアプリで作られたファイルです。アプリを最新にしてから読み込んでください。（アプリを一度閉じて開き直すと更新されます）');
  }
  const data = { settings: obj.data.settings && typeof obj.data.settings === 'object' ? obj.data.settings : null };
  for (const name of DATA_STORES) {
    const list = Array.isArray(obj.data[name]) ? obj.data[name] : [];
    data[name] = list.filter((r) => r && typeof r === 'object' && typeof r.id === 'string' && r.id);
  }
  return { exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : '', data: migrateData(data, obj.schemaVersion) };
}

// ---- パスワードによる暗号化 ----
// 端末のブラウザに入っている Web Crypto だけを使う（外部への通信なし）。
//   鍵: パスワードから PBKDF2（SHA-256）で作る。総当たりで試されにくいよう、わざと時間がかかる回数にする。
//   暗号: AES-GCM 256bit。パスワードが違えば復号に失敗する（改ざんも検出できる）。
// パスワードはどこにも保存しない。
const KDF_ITERATIONS = 600000;
const utf8 = new TextEncoder();

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(str) {
  const s = atob(str);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

// 全角・半角の違い（「１２３」と「123」など）で戻せなくならないよう、NFKC でそろえてから使う
function normalizePassword(pw) {
  return pw.normalize('NFKC');
}

export function canEncrypt() {
  return !!globalThis.crypto?.subtle;
}

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', utf8.encode(normalizePassword(password)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

// 書き出したバックアップ（JSON の文字列）を、パスワード付きのファイルの中身にする
export async function encryptBackup(json, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, KDF_ITERATIONS);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8.encode(json));
  return JSON.stringify({
    app: 'fd-note',
    encrypted: true,
    format: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: KDF_ITERATIONS, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    data: toBase64(data),
  });
}

export function isEncryptedBackup(text) {
  try {
    const obj = JSON.parse(text);
    return obj?.app === 'fd-note' && obj.encrypted === true;
  } catch {
    return false;
  }
}

// パスワード付きのファイルを元のバックアップ（JSON の文字列）に戻す。違うパスワードなら Error。
export async function decryptBackup(text, password) {
  const obj = JSON.parse(text);
  if (obj.format !== 1 || obj.kdf?.name !== 'PBKDF2' || obj.cipher?.name !== 'AES-GCM') {
    throw new Error('このアプリの新しい版で作られたファイルかもしれません。アプリを最新にしてから読み込んでください。');
  }
  const key = await deriveKey(password, fromBase64(obj.kdf.salt), obj.kdf.iterations);
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(obj.cipher.iv) }, key, fromBase64(obj.data));
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error('パスワードが違います（またはファイルが壊れています）。');
  }
}

export async function restoreBackup(data, mode) {
  await importSnapshot(data, mode);
  // 「追加」では設定は今のままにするが、よく使う市区町村だけはファイルの分も足す
  const incoming = data.settings?.favoriteCities || [];
  if (mode === 'merge' && incoming.length) {
    const { favoriteCities } = await getSettings();
    const key = (f) => `${f.pref}\n${f.city}`;
    const have = new Set(favoriteCities.map(key));
    await saveSettings({ favoriteCities: [...favoriteCities, ...incoming.filter((f) => !have.has(key(f)))] });
  }
}
