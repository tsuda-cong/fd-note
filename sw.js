// Service Worker: アプリの全ファイルを端末に保存し、オフラインでも開けるようにする。
//
// 更新の手順:
//   1. ファイルを直したら、下の VERSION を上げる（例 1.0.0 → 1.0.1）
//   2. ファイルを増やしたときは ASSETS にも足す
//      （町名データ towns/*.json は towns/index.json に載っているものを自動で保存するので、ここに足さなくてよい）
//   3. push すると、利用者の画面に「新しい版があります」と出て切り替わる

const VERSION = '1.4.1';
const CACHE_PREFIX = 'fd-note-';
const CACHE = `${CACHE_PREFIX}v${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './data/lesson-courses.json',
  './data/municipalities.json',
  './js/address.js',
  './js/publications.js',
  './js/app.js',
  './js/backup.js',
  './js/calc.js',
  './js/dates.js',
  './js/db.js',
  './js/model.js',
  './js/ui.js',
  './js/views/backup.js',
  './js/views/help.js',
  './js/views/home.js',
  './js/views/map.js',
  './js/views/person-form.js',
  './js/views/person.js',
  './js/views/publications.js',
  './js/views/record.js',
  './js/views/report.js',
  './js/views/settings.js',
  './js/views/visits.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './vendor/qrcode-generator/qrcode.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

// 町名データを持つ市区町村の一覧。ここに載っている towns/*.json も保存する。
const TOWN_INDEX = './towns/index.json';

const fresh = (url) => new Request(url, { cache: 'reload' });

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([...ASSETS, TOWN_INDEX].map(fresh));
    const index = await (await cache.match(TOWN_INDEX)).json();
    await cache.addAll(index.cities.map((c) => fresh(`./towns/${c.file}`)));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 消すのはこのアプリ（fd-note-）の古い版だけ。同じ場所にある他のアプリのキャッシュには触れない。
    for (const key of await caches.keys()) {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 地図タイルなど外部への通信は扱わない（ブラウザにそのまま任せる）
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match(new URL('./index.html', self.location).href, { cacheName: CACHE }).then((res) => res || fetch(req)),
    );
    return;
  }
  event.respondWith(
    caches.match(req, { cacheName: CACHE, ignoreSearch: true }).then((res) => res || fetch(req)),
  );
});
