// 日付・時刻はすべて端末のローカル時間の文字列で扱う。
//   日付: "2026-10-30"   時刻: "14:30"   月: "2026-10"
// Date#toISOString() は UTC に変換されて日付がずれるので使わない。

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

const pad = (n) => String(n).padStart(2, '0');

export function toDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toTimeStr(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function todayStr() {
  return toDateStr(new Date());
}

export function currentYm() {
  return todayStr().slice(0, 7);
}

// 現在時刻を step 分単位に切り捨てたもの（入力欄の初期値用）
export function nowTimeStr(step = 5) {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(Math.floor(d.getMinutes() / step) * step)}`;
}

// 作成日時などの記録用（ローカル時刻）
export function nowStamp() {
  const d = new Date();
  return `${toDateStr(d)}T${toTimeStr(d)}:${pad(d.getSeconds())}`;
}

export function isDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function isTimeStr(s) {
  return typeof s === 'string' && /^\d{2}:\d{2}$/.test(s);
}

export function isYm(s) {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

// b - a の日数（夏時間などの影響を受けないよう UTC の暦日で計算）
export function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function weekdayOf(s) {
  return parseDate(s).getDay();
}

export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function formatYm(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${y}年${m}月`;
}

// 今年なら年を省略して「10月30日(金)」
export function formatDate(s) {
  if (!isDateStr(s)) return '';
  const d = parseDate(s);
  const year = d.getFullYear() === new Date().getFullYear() ? '' : `${d.getFullYear()}年`;
  return `${year}${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})`;
}

export function formatDateTime(date, time) {
  return formatDate(date) + (time ? ` ${time}` : '');
}

// 「今日」「明日」「3日前」などの添え書き
export function relativeLabel(s, today = todayStr()) {
  const diff = daysBetween(today, s);
  if (diff === 0) return '今日';
  if (diff === 1) return '明日';
  if (diff === -1) return '昨日';
  if (diff < 0) return `${-diff}日前`;
  return `${diff}日後`;
}

// 並び替え用のキー。時刻が空なら同じ日の最後に並べる
export function sortKey(date, time) {
  return `${date}T${time || '99:99'}`;
}
