// 地図: 訪問先のピン表示と、ピン位置の指定（?pick=訪問先id）
// 外部に出るのは地図タイル画像の取得だけ。住所や名前は送らない（ジオコーディングは使わない）。

import { loadAll, getSettings, saveSettings, put } from '../db.js';
import { formatDate, formatDateTime, nowStamp } from '../dates.js';
import { summarizePeople, displayName, STATUS } from '../model.js';
import { setTitle, esc, toast, confirmDialog, refresh } from '../ui.js';

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const JAPAN = { lat: 36.2, lng: 138.25, zoom: 5 };

// Leaflet は地図を開いたときにだけ読み込む（ファイルはアプリに同梱）
let leafletPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  leafletPromise ||= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = './vendor/leaflet/leaflet.css';
    const cssLoaded = new Promise((r) => { css.onload = r; css.onerror = r; });
    document.head.append(css);
    const js = document.createElement('script');
    js.src = './vendor/leaflet/leaflet.js';
    js.onload = () => cssLoaded.then(() => resolve(window.L));
    js.onerror = () => {
      leafletPromise = null;
      reject(new Error('地図の部品を読み込めませんでした'));
    };
    document.head.append(js);
  });
  return leafletPromise;
}

function popupHtml(p) {
  return `
    <div class="popup">
      <strong>${esc(displayName(p))}</strong><br>
      <span style="color:${STATUS[p.status].color}">●</span> ${STATUS[p.status].label}<br>
      ${p.lastVisit ? `最終 ${esc(formatDate(p.lastVisit.date))}<br>` : ''}
      ${p.nextPlan ? `次回 ${esc(formatDateTime(p.nextPlan.date, p.nextPlan.time))}<br>` : ''}
      <a href="#/person/${esc(p.id)}">カルテを開く</a>
    </div>`;
}

function legendHtml() {
  return `<div class="legend">${Object.values(STATUS).map((s) =>
    `<span><i style="background:${s.color}"></i>${s.label}</span>`).join('')}</div>`;
}

export async function render(el, { query }) {
  const pickId = query.get('pick');
  const [all, settings] = await Promise.all([loadAll(), getSettings()]);
  const people = summarizePeople(all, settings);
  const target = pickId ? people.find((p) => p.id === pickId) : null;
  setTitle(target ? '位置を指定' : '地図', target ? `#/person/${pickId}` : null);

  if (!navigator.onLine) {
    el.innerHTML = `
      <section class="card warn">
        <h2>地図を表示できません</h2>
        <p>オフラインのため、地図は表示できません。電波のある場所で開いてください。</p>
        <p>地図以外の機能（記録・訪問・レッスン）は、そのまま使えます。</p>
        ${target ? `<a class="btn btn-block" href="#/person/${esc(target.id)}">カルテへ戻る</a>` : ''}
      </section>`;
    const onOnline = () => refresh();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }

  el.classList.add('page-map');
  el.innerHTML = `
    ${target ? `<div class="map-banner">地図をタップして「${esc(displayName(target))}」の位置にピンを置いてください。ピンは指で動かせます。</div>` : ''}
    <div class="map-box">
      <div class="map"></div>
      <div class="map-alert" hidden>地図を読み込めません。電波の状態を確かめてください。</div>
    </div>
    <div class="map-tools">
      ${target ? `
        <button type="button" class="btn btn-primary" data-action="save-pin" disabled>この位置で保存</button>
        <button type="button" class="btn" data-action="locate">現在地</button>
        ${target.lat != null ? '<button type="button" class="btn btn-ghost-danger" data-action="clear-pin">位置を削除</button>' : ''}`
      : `
        <button type="button" class="btn" data-action="locate">現在地</button>
        <button type="button" class="btn" data-action="save-view">この範囲を最初に表示</button>`}
    </div>
    ${target ? '' : legendHtml()}
    <p class="map-note">地図を表示すると、表示している範囲のおおよその位置が地図サービス（OpenStreetMap）に伝わります。住所や名前は送りません。</p>`;

  let L;
  try {
    L = await loadLeaflet();
  } catch (e) {
    el.querySelector('.map-alert').hidden = false;
    el.querySelector('.map-alert').textContent = e.message;
    return undefined;
  }
  if (!el.isConnected) return undefined;

  const alertEl = el.querySelector('.map-alert');
  const map = L.map(el.querySelector('.map'), { zoomControl: true });
  const tiles = L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
  let errors = 0;
  tiles.on('tileerror', () => { if (++errors >= 3) alertEl.hidden = false; });
  tiles.on('tileload', () => { errors = 0; alertEl.hidden = true; });

  const pinned = people.filter((p) => p.lat != null && p.lng != null);
  for (const p of pinned) {
    if (target && p.id === target.id) continue;
    L.circleMarker([p.lat, p.lng], {
      radius: target ? 7 : 11,
      color: '#ffffff',
      weight: 3,
      fillColor: STATUS[p.status].color,
      fillOpacity: target ? 0.6 : 1,
    }).addTo(map).bindPopup(popupHtml(p));
  }

  if (target?.lat != null) map.setView([target.lat, target.lng], 17);
  else if (settings.mapCenter) map.setView([settings.mapCenter.lat, settings.mapCenter.lng], settings.mapCenter.zoom);
  else if (pinned.length) map.fitBounds(L.latLngBounds(pinned.map((p) => [p.lat, p.lng])), { maxZoom: 16, padding: [40, 40] });
  else map.setView([JAPAN.lat, JAPAN.lng], JAPAN.zoom);
  setTimeout(() => map.invalidateSize(), 0);

  // ピン位置の指定
  let marker = null;
  const saveBtn = el.querySelector('[data-action="save-pin"]');
  const place = (latlng, changed = true) => {
    if (!marker) {
      marker = L.marker(latlng, { draggable: true, autoPan: true }).addTo(map);
      marker.on('dragend', () => { saveBtn.disabled = false; });
    } else {
      marker.setLatLng(latlng);
    }
    if (changed) saveBtn.disabled = false;
  };
  if (target) {
    if (target.lat != null) place([target.lat, target.lng], false);
    map.on('click', (e) => place(e.latlng));
  }

  let here = null;
  el.querySelector('.map-tools').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    switch (b.dataset.action) {
      case 'locate':
        if (!navigator.geolocation) return toast('この端末では現在地を使えません');
        toast('現在地を調べています…');
        navigator.geolocation.getCurrentPosition((pos) => {
          const ll = [pos.coords.latitude, pos.coords.longitude];
          map.setView(ll, Math.max(map.getZoom(), 17));
          if (here) here.setLatLng(ll);
          else here = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#2b7fff', fillOpacity: 1 }).addTo(map);
        }, () => toast('現在地を取得できませんでした（位置情報の許可を確かめてください）'),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
        break;
      case 'save-view': {
        const c = map.getCenter();
        await saveSettings({ mapCenter: { lat: +c.lat.toFixed(6), lng: +c.lng.toFixed(6), zoom: map.getZoom() } });
        toast('いまの範囲を、地図を開いたときの表示にしました');
        break;
      }
      case 'save-pin': {
        if (!marker) return toast('地図をタップしてピンを置いてください');
        const ll = marker.getLatLng();
        const raw = all.people.find((p) => p.id === target.id);
        await put('people', { ...raw, lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6), updatedAt: nowStamp() });
        toast('位置を保存しました');
        location.replace(`#/person/${target.id}`);
        break;
      }
      case 'clear-pin': {
        if (!(await confirmDialog('地図の位置を削除しますか？', { ok: '削除する', danger: true }))) return;
        const raw = all.people.find((p) => p.id === target.id);
        await put('people', { ...raw, lat: null, lng: null, updatedAt: nowStamp() });
        toast('位置を削除しました');
        location.replace(`#/person/${target.id}`);
        break;
      }
      default:
    }
  });

  return () => map.remove();
}
