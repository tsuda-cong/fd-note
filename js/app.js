// 起動処理と画面の切り替え（#/〜 のハッシュで切り替える）

import { openDB, getSettings } from './db.js';
import { applyTheme, setRefresher, esc, toast } from './ui.js';
import * as home from './views/home.js';
import * as record from './views/record.js';
import * as report from './views/report.js';
import * as visits from './views/visits.js';
import * as personForm from './views/person-form.js';
import * as person from './views/person.js';
import * as map from './views/map.js';
import * as settings from './views/settings.js';
import * as backup from './views/backup.js';
import * as help from './views/help.js';
import * as publications from './views/publications.js';

// 画面を増やすときは、ここに1行足して views/ にファイルを追加する
const routes = [
  { re: /^\/$/, view: home, tab: 'home' },
  { re: /^\/record$/, view: record, tab: 'record' },
  { re: /^\/report$/, view: report, tab: 'record' },
  { re: /^\/visits$/, view: visits, tab: 'visits' },
  { re: /^\/visit\/new$/, view: personForm, tab: 'visits' },
  { re: /^\/person\/([\w-]+)$/, view: person, tab: 'visits' },
  { re: /^\/person\/([\w-]+)\/edit$/, view: personForm, tab: 'visits' },
  { re: /^\/map$/, view: map, tab: 'map' },
  { re: /^\/settings$/, view: settings, tab: 'settings' },
  { re: /^\/backup$/, view: backup, tab: 'settings' },
  { re: /^\/help$/, view: help, tab: 'settings' },
  { re: /^\/publications$/, view: publications, tab: 'settings' },
];

let cleanup = null;
let seq = 0;

async function route({ keepScroll = false } = {}) {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const r = routes.find((x) => x.re.test(path));
  if (!r) {
    location.replace('#/');
    return;
  }
  const params = path.match(r.re).slice(1);
  const query = new URLSearchParams(qs);

  if (cleanup) {
    try { cleanup(); } catch (e) { console.error(e); }
    cleanup = null;
  }
  const my = ++seq;
  const scrollY = window.scrollY;
  for (const a of document.querySelectorAll('.tabbar a')) {
    a.classList.toggle('active', a.dataset.tab === r.tab);
  }
  const el = document.createElement('div');
  el.className = 'page';
  document.getElementById('view').replaceChildren(el);
  try {
    const c = await r.view.render(el, { params, query });
    if (typeof c === 'function') {
      if (my === seq) cleanup = c;
      else c();
    }
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="card warn"><p>エラーが発生しました。</p><p class="small">${esc(e.message)}</p></div>`;
  }
  if (my === seq) window.scrollTo(0, keepScroll ? scrollY : 0);
}

let updateRequested = false;

function showUpdateBanner(worker) {
  const banner = document.getElementById('banner');
  banner.innerHTML = `
    <div class="update-banner">
      <span>新しい版があります</span>
      <button type="button" class="btn btn-primary">更新する</button>
    </div>`;
  banner.querySelector('button').addEventListener('click', () => {
    updateRequested = true;
    worker.postMessage('skipWaiting');
  });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  // 初めて開いたときの取り込み（前の版がない）では開き直さない。「更新する」を押したときは開き直す。
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if ((!hadController && !updateRequested) || reloading) return;
    reloading = true;
    location.reload();
  });
  const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  // 新しい版は、起動時点で「待機中」「取り込み中」、または後から見つかる、のどれかになる。
  // いま動いている版（controller）があるときだけ、「更新」としてお知らせを出す。
  const isUpdate = () => !!navigator.serviceWorker.controller;
  const track = (w) => {
    if (!w) return;
    if (w.state === 'installed') {
      if (isUpdate()) showUpdateBanner(w);
    } else {
      w.addEventListener('statechange', () => { if (w.state === 'installed' && isUpdate()) showUpdateBanner(w); });
    }
  };
  track(reg.waiting);
  track(reg.installing);
  reg.addEventListener('updatefound', () => track(reg.installing));
  // アプリに戻ってきたときにも更新を確かめる
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reg.update().catch(() => {});
  });
}

async function start() {
  document.getElementById('back').addEventListener('click', (e) => {
    const href = e.currentTarget.dataset.href;
    if (href) location.hash = href;
  });
  try {
    await openDB();
  } catch (e) {
    document.getElementById('view').innerHTML =
      `<div class="card warn"><p>データを開けませんでした。</p><p class="small">${esc(e.message)}</p></div>`;
    return;
  }
  applyTheme((await getSettings()).theme);
  setRefresher(route);
  window.addEventListener('hashchange', () => route());
  await route();

  registerServiceWorker().catch((e) => console.warn('Service Worker を登録できませんでした', e));
  // ブラウザに「このデータは自動で消さないで」と依頼する（端末によっては効かない）
  navigator.storage?.persist?.().catch(() => {});
  window.addEventListener('offline', () => toast('オフラインになりました（地図以外はそのまま使えます）'));
}

start();
