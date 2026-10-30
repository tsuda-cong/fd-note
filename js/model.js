// 区分・訪問先の状態など、画面をまたいで使う決まりごと

import { todayStr, daysBetween, sortKey } from './dates.js';

export const USER_TYPES = {
  publisher: {
    label: '伝道者',
    desc: 'レッスン件数を記録します（時間の入力はありません）',
    hours: false,
    other: false,
  },
  auxPioneer: {
    label: '補助開拓者',
    desc: '奉仕時間とレッスン件数を記録します',
    hours: true,
    other: false,
  },
  regularPioneer: {
    label: '正規開拓者',
    desc: '奉仕時間・レッスン件数・野外奉仕以外の時間を記録します',
    hours: true,
    other: true,
  },
};

export function typeInfo(userType) {
  return USER_TYPES[userType] || USER_TYPES.publisher;
}

export const GENDERS = [
  { value: 'male', label: '男性' },
  { value: 'female', label: '女性' },
  { value: '', label: '不明' },
];

export function genderLabel(v) {
  return GENDERS.find((g) => g.value === v)?.label || '';
}

// 地図のピンと一覧の色。上から順に優先して判定する。
export const STATUS = {
  student: { label: 'レッスン生', color: '#8e3fc4' },
  planned: { label: '次回の予定あり', color: '#1565d8' },
  stale: { label: 'しばらく訪問していない', color: '#e06c00' },
  recent: { label: '最近訪問した', color: '#1b9a4b' },
};

export function displayName(p) {
  return (p.name || '').trim() || '（名前未記入）';
}

// 都道府県・市区町村・町名以下をつなげた住所（以前の自由入力の住所は町名以下にそのまま入っている）
export function fullAddress(p) {
  return `${p.pref || ''}${p.city || ''}${p.address || ''}`;
}

// 「都道府県＋市区町村」の表示名（一覧の絞り込みなどに使う）
export function placeLabel(p) {
  return `${p.pref || ''}${p.city || ''}`;
}

function groupBy(list, key) {
  const m = new Map();
  for (const r of list) {
    if (!m.has(r[key])) m.set(r[key], []);
    m.get(r[key]).push(r);
  }
  return m;
}

// 同じ日時なら、先に入力したものを前にする
const asc = (a, b) => sortKey(a.date, a.time).localeCompare(sortKey(b.date, b.time))
  || (a.createdAt || '').localeCompare(b.createdAt || '');
const desc = (a, b) => asc(b, a);

// 訪問先ごとに、最終訪問・次回予定・レッスン予定などをまとめる
export function summarizePeople(all, settings, today = todayStr()) {
  const visits = groupBy(all.visits, 'personId');
  const plans = groupBy(all.plans.filter((p) => !p.done), 'personId');
  const schedules = groupBy(all.lessonSchedules, 'personId');
  const lessons = groupBy(all.lessonRecords, 'personId');

  return all.people.map((p) => {
    const vs = (visits.get(p.id) || []).sort(desc);
    const openPlans = (plans.get(p.id) || []).sort(asc);
    const lastVisit = vs[0] || null;
    const lastDate = lastVisit?.date || (p.createdAt || today).slice(0, 10);
    const daysSince = daysBetween(lastDate, today);
    let status = 'recent';
    if (p.isStudent) status = 'student';
    else if (openPlans.length) status = 'planned';
    else if (daysSince >= settings.staleDays) status = 'stale';
    return {
      ...p,
      visits: vs,
      lastVisit,
      daysSince,
      openPlans,
      nextPlan: openPlans[0] || null,
      schedules: (schedules.get(p.id) || []).sort((a, b) => a.weekday - b.weekday || a.time.localeCompare(b.time)),
      lessons: (lessons.get(p.id) || []).sort(desc),
      status,
    };
  });
}
