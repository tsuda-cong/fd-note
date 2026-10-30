// 訪問先の一覧（並び替え・絞り込み・検索）

import { loadAll, getSettings } from '../db.js';
import { formatDate, formatDateTime, relativeLabel, sortKey } from '../dates.js';
import { summarizePeople, displayName, fullAddress, placeLabel, STATUS } from '../model.js';
import { setTitle, esc, options } from '../ui.js';

// 並び替えと絞り込みの選択は、この端末に覚えておく（キーは fd-note: で始める）
const PREFS_KEY = 'fd-note:visits-list';

const SORTS = [
  ['recent', '最終訪問が新しい順'],
  ['oldest', '最終訪問が古い順'],
  ['next', '次回の予定が近い順'],
  ['address', '住所順'],
  ['name', '名前順'],
];
const FILTERS = [
  ['all', 'すべて'],
  ['student', 'レッスン生'],
  ['planned', '次回予定あり'],
  ['stale', 'しばらく訪問なし'],
];

const DEFAULT_PREFS = { sort: 'recent', filter: 'all', place: '' };

function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* 保存できなくても動作には影響しない */ }
}

const lastKey = (p) => (p.lastVisit ? sortKey(p.lastVisit.date, p.lastVisit.time) : '');

const sorters = {
  recent: (a, b) => lastKey(b).localeCompare(lastKey(a)),
  oldest: (a, b) => lastKey(a).localeCompare(lastKey(b)),
  next: (a, b) => {
    const ka = a.nextPlan ? sortKey(a.nextPlan.date, a.nextPlan.time) : '~';
    const kb = b.nextPlan ? sortKey(b.nextPlan.date, b.nextPlan.time) : '~';
    return ka.localeCompare(kb);
  },
  name: (a, b) => displayName(a).localeCompare(displayName(b), 'ja'),
  // 市区町村ごとにまとめ、その中は町名・番地の順（番地の数字は数として比べる）。住所なしは最後。
  address: (a, b) => (!fullAddress(a) - !fullAddress(b))
    || placeLabel(a).localeCompare(placeLabel(b), 'ja')
    || (a.address || '').localeCompare(b.address || '', 'ja', { numeric: true }),
};

const matchers = {
  all: () => true,
  student: (p) => p.isStudent,
  planned: (p) => !!p.nextPlan,
  stale: (p) => p.status === 'stale',
};

function rowHtml(p) {
  const last = p.lastVisit ? `最終 ${formatDate(p.lastVisit.date)}（${relativeLabel(p.lastVisit.date)}）` : '訪問の記録なし';
  return `
    <a class="list-item" href="#/person/${esc(p.id)}">
      <span class="dot" style="background:${STATUS[p.status].color}" title="${esc(STATUS[p.status].label)}"></span>
      <div class="li-main">
        <div class="li-title">${esc(displayName(p))}
          ${p.isStudent ? '<span class="badge student">レッスン生</span>' : ''}
          ${p.lat == null ? '<span class="badge">位置なし</span>' : ''}</div>
        ${fullAddress(p) ? `<div class="li-sub">${esc(fullAddress(p))}</div>` : ''}
        <div class="li-sub">${last}</div>
        ${p.nextPlan ? `<div class="li-sub next">次回 ${esc(formatDateTime(p.nextPlan.date, p.nextPlan.time))}</div>` : ''}
      </div>
    </a>`;
}

export async function render(el) {
  setTitle('訪問');
  const [all, settings] = await Promise.all([loadAll(), getSettings()]);
  const people = summarizePeople(all, settings);
  // 絞り込み用の市区町村: よく使う市区町村を先に、残りは訪問先にあるものを五十音順で
  const favs = settings.favoriteCities.map((f) => `${f.pref}${f.city}`);
  const used = [...new Set(people.map(placeLabel).filter(Boolean))];
  const places = [...favs.filter((f) => used.includes(f)), ...used.filter((u) => !favs.includes(u)).sort((a, b) => a.localeCompare(b, 'ja'))];
  const prefs = loadPrefs();
  if (!sorters[prefs.sort]) prefs.sort = 'recent';
  if (!matchers[prefs.filter]) prefs.filter = 'all';
  if (!places.includes(prefs.place)) prefs.place = '';

  el.innerHTML = `
    <a class="btn btn-primary btn-block btn-big" href="#/visit/new">＋ 新しい訪問を記録</a>
    ${people.length ? `
    <div class="card list-tools">
      <input type="search" class="search" placeholder="名前・住所・メモで探す" aria-label="検索" autocomplete="off">
      <div class="chips" role="group" aria-label="絞り込み">
        ${FILTERS.map(([v, l]) => `<button type="button" class="chip ${prefs.filter === v ? 'on' : ''}" data-filter="${v}">${l}</button>`).join('')}
      </div>
      ${places.length ? `<label class="field inline"><span>市区町村</span>
        <select class="place">${options([['', 'すべて'], ...places.map((t) => [t, t])], prefs.place)}</select></label>` : ''}
      <label class="field inline"><span>並び順</span><select class="sort">${options(SORTS, prefs.sort)}</select></label>
    </div>
    <p class="muted small count"></p>
    <div class="list card people-list"></div>` : `
    <section class="card">
      <p>まだ訪問先がありません。</p>
      <p class="muted">「新しい訪問を記録」から、最初の訪問を入れてください。</p>
    </section>`}`;

  if (!people.length) return;

  const listEl = el.querySelector('.people-list');
  const countEl = el.querySelector('.count');
  const searchEl = el.querySelector('.search');

  function draw() {
    const q = searchEl.value.trim();
    const rows = people
      .filter(matchers[prefs.filter])
      .filter((p) => !prefs.place || placeLabel(p) === prefs.place)
      .filter((p) => !q || [p.name, fullAddress(p), p.memo].some((s) => (s || '').includes(q)))
      .sort(sorters[prefs.sort]);
    countEl.textContent = `${rows.length}件 ／ 全${people.length}件`;
    listEl.innerHTML = rows.length ? rows.map(rowHtml).join('') : '<p class="muted">当てはまる訪問先はありません</p>';
  }

  el.querySelector('.chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]');
    if (!b) return;
    prefs.filter = b.dataset.filter;
    for (const c of el.querySelectorAll('.chip')) c.classList.toggle('on', c === b);
    savePrefs(prefs);
    draw();
  });
  el.querySelector('.sort').addEventListener('change', (e) => {
    prefs.sort = e.target.value;
    savePrefs(prefs);
    draw();
  });
  el.querySelector('.place')?.addEventListener('change', (e) => {
    prefs.place = e.target.value;
    savePrefs(prefs);
    draw();
  });
  searchEl.addEventListener('input', draw);
  draw();
}
