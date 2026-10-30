// バックアップファイル（JSON）の作成と読み込み

import { loadAll, importSnapshot, setMeta, migrateData, SCHEMA_VERSION, DATA_STORES } from './db.js';
import { nowStamp } from './dates.js';

export const STORE_LABELS = {
  people: '訪問先',
  visits: '訪問の記録',
  plans: '次回の予定',
  lessonSchedules: 'レッスンの予定',
  lessonRecords: 'レッスンの実施記録',
  serviceTimes: '奉仕時間の記録',
  otherTimes: '野外奉仕以外の時間',
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

export async function restoreBackup(data, mode) {
  await importSnapshot(data, mode);
}
