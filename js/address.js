// 住所入力: 都道府県（選択）→ 市区町村（選択。一覧にないときは手入力）→ 町名 → 番地・建物名など（自由入力）
// 都道府県・市区町村の一覧は data/municipalities.json（総務省の全国地方公共団体コードをもとに作成）。
// 町名は、towns/index.json に載っている市区町村だけ一覧から選べる（それ以外は自由入力）。
// どれもアプリに同梱しているので、外部への通信はしない。

import { esc, options } from './ui.js';

// 最後に選んだ都道府県・市区町村（次の入力の初期値にする）
const LAST_PLACE_KEY = 'fd-note:last-place';
const TOWN_INDEX_URL = './towns/index.json';

let dataPromise = null;

export function loadMunicipalities() {
  dataPromise ||= fetch('./data/municipalities.json')
    .then((res) => {
      if (!res.ok) throw new Error(`市区町村の一覧を読み込めませんでした（${res.status}）`);
      return res.json();
    })
    .then((json) => {
      const byPref = new Map(json.prefectures.map((p) => [p.name, p.cities]));
      return { prefs: [...byPref.keys()], citiesOf: (pref) => byPref.get(pref) || [] };
    })
    .catch((e) => {
      dataPromise = null;
      throw e;
    });
  return dataPromise;
}

// 町名データを持つ市区町村の一覧（towns/index.json）。読めないときは空にして、町名は自由入力にする。
let townIndexPromise = null;
function loadTownIndex() {
  townIndexPromise ||= fetch(TOWN_INDEX_URL)
    .then((res) => (res.ok ? res.json() : { cities: [] }))
    .then((json) => (Array.isArray(json.cities) ? json.cities : []))
    .catch(() => {
      townIndexPromise = null;
      return [];
    });
  return townIndexPromise;
}

// その市区町村の町名の一覧。データがない市区町村や、読めなかったときは null。
const townLists = new Map();
export async function loadTowns(pref, city) {
  if (!pref || !city) return null;
  const entry = (await loadTownIndex()).find((c) => c.pref === pref && c.city === city);
  if (!entry) return null;
  const key = `${pref}\n${city}`;
  if (!townLists.has(key)) {
    townLists.set(key, fetch(`./towns/${entry.file}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => (Array.isArray(json?.towns) ? json.towns : null))
      .catch(() => null)
      .then((list) => {
        if (!list) townLists.delete(key);
        return list;
      }));
  }
  return townLists.get(key);
}

export function loadLastPlace() {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_PLACE_KEY) || 'null');
    return v && typeof v.pref === 'string' && typeof v.city === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function saveLastPlace(pref, city) {
  try { localStorage.setItem(LAST_PLACE_KEY, JSON.stringify({ pref, city })); } catch { /* 覚えられなくても動作には影響しない */ }
}

function prefOptions(muni, selected) {
  const list = muni.prefs.map((p) => [p, p]);
  // 一覧にない値（以前の版で入れたものなど）も消さずに残す
  if (selected && !muni.prefs.includes(selected)) list.push([selected, selected]);
  return options([['', '（都道府県を選ぶ）'], ...list], selected);
}

function cityOptions(muni, pref, selected, favorites) {
  if (!pref) return '<option value="">（先に都道府県を選ぶ）</option>';
  const all = muni.citiesOf(pref);
  const favs = favorites.filter((f) => f.pref === pref && all.includes(f.city)).map((f) => f.city);
  const head = options([['', '（市区町村を選ぶ）']], selected);
  if (!favs.length) return head + options(all.map((c) => [c, c]), selected);
  // よく使うものは上にも出す（同じ市区町村が2か所に並ぶので、選ばれた印は片方だけに付ける）
  const favSelected = favs.includes(selected);
  return `${head}<optgroup label="よく使う">${options(favs.map((c) => [c, c]), favSelected ? selected : '')}</optgroup>`
    + `<optgroup label="すべての市区町村">${options(all.map((c) => [c, c]), favSelected ? '' : selected)}</optgroup>`;
}

function favoriteButtons(favorites) {
  if (!favorites.length) return '';
  return `<div class="chips fav-places" role="group" aria-label="よく使う市区町村">${favorites.map((f, i) =>
    `<button type="button" class="chip" data-fav="${i}">${esc(f.pref)}${esc(f.city)}</button>`).join('')}</div>`;
}

// 絞り込み用の正規化（全角・半角や「ヶ／ケ」の違いを同じに扱う）
function normalize(s) {
  return s.normalize('NFKC').replace(/ヶ/g, 'ケ').replace(/ヵ/g, 'カ').replace(/\s/g, '');
}

// 住所欄の HTML。値は初期値。muni は loadMunicipalities() の結果。
// detail: false のときは都道府県・市区町村だけ（設定の「よく使う市区町村」の登録用）。
export function addressFieldsHtml(muni, { pref = '', city = '', town = '', address = '' }, favorites = [],
  { label = '住所', detail = true } = {}) {
  const manual = !!city && !muni.citiesOf(pref).includes(city);
  return `
    <fieldset class="field stack addr-fields" data-mode="${manual ? 'manual' : 'list'}">
      <legend>${label}</legend>
      ${favoriteButtons(favorites)}
      <select name="pref" aria-label="都道府県">${prefOptions(muni, pref)}</select>
      <select name="city" aria-label="市区町村" ${manual ? 'hidden' : ''} ${pref ? '' : 'disabled'}>${cityOptions(muni, pref, manual ? '' : city, favorites)}</select>
      <input type="text" name="cityManual" aria-label="市区町村（手入力）" placeholder="市区町村を入力" value="${manual ? esc(city) : ''}" ${manual ? '' : 'hidden'}>
      <button type="button" class="link-btn" data-action="city-mode">${manual ? '市区町村を一覧から選ぶ' : '一覧にないときは市区町村を手入力'}</button>
      ${detail ? `
      <div class="town-pick">
        <input type="text" name="town" aria-label="町名" placeholder="町名" value="${esc(town)}"
          autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false">
        <div class="town-list" role="listbox" aria-label="町名の候補" hidden></div>
        <p class="town-hint muted small" hidden></p>
      </div>
      <textarea name="address" rows="2" aria-label="番地・建物名など" placeholder="番地・建物名など">${esc(address)}</textarea>` : ''}
    </fieldset>`;
}

// 住所欄の動き（都道府県を変えたら市区町村の選択肢を入れ替える、手入力への切り替え、町名の候補など）
export function bindAddressFields(root, muni, favorites = []) {
  const box = root.querySelector('.addr-fields');
  const prefSel = box.querySelector('[name="pref"]');
  const citySel = box.querySelector('[name="city"]');
  const cityText = box.querySelector('[name="cityManual"]');
  const modeBtn = box.querySelector('[data-action="city-mode"]');
  const townInput = box.querySelector('[name="town"]');
  const townList = box.querySelector('.town-list');
  const townHint = box.querySelector('.town-hint');
  let towns = null;   // いま選んでいる市区町村の町名一覧（ないときは null）
  let townsFor = '';

  const currentCity = () => (box.dataset.mode === 'manual' ? cityText.value.trim() : citySel.value);

  // 町名の候補を、入力中の文字で絞り込んで出す
  const showTowns = () => {
    if (!towns || document.activeElement !== townInput) return hideTowns();
    const q = normalize(townInput.value);
    const hits = q ? towns.filter((t) => normalize(t).includes(q)) : towns;
    if (hits.length === 1 && hits[0] === townInput.value) return hideTowns();
    townList.innerHTML = hits.length
      ? hits.map((t) => `<button type="button" role="option" data-town="${esc(t)}">${esc(t)}</button>`).join('')
      : '<p class="town-empty">一覧にありません。このまま入力できます。</p>';
    townList.hidden = false;
    townInput.setAttribute('aria-expanded', 'true');
  };
  const hideTowns = () => {
    townList.hidden = true;
    townInput.setAttribute('aria-expanded', 'false');
  };

  // 市区町村が変わったら、その町名一覧を読み込む（データがなければ自由入力のまま）
  const updateTowns = async () => {
    if (!townInput) return;
    const key = `${prefSel.value}\n${currentCity()}`;
    townsFor = key;
    const list = await loadTowns(prefSel.value, currentCity());
    if (townsFor !== key) return;
    towns = list;
    townHint.hidden = !towns;
    townHint.textContent = towns ? `町名は一覧から選べます（${towns.length}件。文字を入れると絞り込み）。一覧にない町名もそのまま入力できます。` : '';
    townInput.placeholder = towns ? '町名（一覧から選ぶか入力）' : '町名';
    showTowns();
  };

  const setMode = (manual) => {
    box.dataset.mode = manual ? 'manual' : 'list';
    citySel.hidden = manual;
    cityText.hidden = !manual;
    modeBtn.textContent = manual ? '市区町村を一覧から選ぶ' : '一覧にないときは市区町村を手入力';
  };
  const fillCities = (selected = '') => {
    citySel.innerHTML = cityOptions(muni, prefSel.value, selected, favorites);
    citySel.disabled = !prefSel.value;
  };

  prefSel.addEventListener('change', () => { fillCities(); updateTowns(); });
  citySel.addEventListener('change', updateTowns);
  cityText.addEventListener('change', updateTowns);
  modeBtn.addEventListener('click', () => {
    const toManual = box.dataset.mode !== 'manual';
    if (toManual) cityText.value = cityText.value || citySel.value;
    else fillCities(muni.citiesOf(prefSel.value).includes(cityText.value.trim()) ? cityText.value.trim() : '');
    setMode(toManual);
    updateTowns();
    (toManual ? cityText : citySel).focus();
  });
  box.querySelector('.fav-places')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fav]');
    if (!b) return;
    const f = favorites[Number(b.dataset.fav)];
    prefSel.innerHTML = prefOptions(muni, f.pref);
    fillCities(f.city);
    setMode(false);
    updateTowns();
    (townInput || prefSel).focus();
  });

  if (townInput) {
    townInput.addEventListener('focus', showTowns);
    townInput.addEventListener('input', showTowns);
    townInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTowns(); });
    // 候補を押したときに入力欄からフォーカスが外れないようにする
    townList.addEventListener('pointerdown', (e) => e.preventDefault());
    townList.addEventListener('click', (e) => {
      const b = e.target.closest('[data-town]');
      if (!b) return;
      townInput.value = b.dataset.town;
      hideTowns();
      box.querySelector('[name="address"]').focus();
    });
    townInput.addEventListener('blur', () => setTimeout(() => {
      if (document.activeElement !== townInput) hideTowns();
    }, 150));
    updateTowns();
  }
}

// フォームから住所を読み取る
export function readAddressFields(root) {
  const box = root.querySelector('.addr-fields');
  const val = (name) => String(box.querySelector(`[name="${name}"]`)?.value || '').trim();
  return {
    pref: val('pref'),
    city: box.dataset.mode === 'manual' ? val('cityManual') : val('city'),
    town: val('town'),
    address: val('address'),
  };
}
