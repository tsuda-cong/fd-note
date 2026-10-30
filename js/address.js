// 住所入力: 都道府県（選択）→ 市区町村（選択。一覧にないときは手入力）→ 町名以下（自由入力）
// 都道府県・市区町村の一覧は data/municipalities.json（総務省の全国地方公共団体コードをもとに作成）。
// アプリに同梱しているので、外部への通信はしない。

import { esc, options } from './ui.js';

// 最後に選んだ都道府県・市区町村（次の入力の初期値にする）
const LAST_PLACE_KEY = 'fd-note:last-place';

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

// 住所欄の HTML。値は初期値。muni は loadMunicipalities() の結果。
export function addressFieldsHtml(muni, { pref = '', city = '', address = '' }, favorites = [], { label = '住所' } = {}) {
  const manual = !!city && !muni.citiesOf(pref).includes(city);
  return `
    <fieldset class="field stack addr-fields" data-mode="${manual ? 'manual' : 'list'}">
      <legend>${label}</legend>
      ${favoriteButtons(favorites)}
      <select name="pref" aria-label="都道府県">${prefOptions(muni, pref)}</select>
      <select name="city" aria-label="市区町村" ${manual ? 'hidden' : ''} ${pref ? '' : 'disabled'}>${cityOptions(muni, pref, manual ? '' : city, favorites)}</select>
      <input type="text" name="cityManual" aria-label="市区町村（手入力）" placeholder="市区町村を入力" value="${manual ? esc(city) : ''}" ${manual ? '' : 'hidden'}>
      <button type="button" class="link-btn" data-action="city-mode">${manual ? '市区町村を一覧から選ぶ' : '一覧にないときは市区町村を手入力'}</button>
      <textarea name="address" rows="2" aria-label="町名以下" placeholder="町名・番地・建物名など">${esc(address)}</textarea>
    </fieldset>`;
}

// 住所欄の動き（都道府県を変えたら市区町村の選択肢を入れ替える、手入力への切り替えなど）
export function bindAddressFields(root, muni, favorites = []) {
  const box = root.querySelector('.addr-fields');
  const prefSel = box.querySelector('[name="pref"]');
  const citySel = box.querySelector('[name="city"]');
  const cityText = box.querySelector('[name="cityManual"]');
  const modeBtn = box.querySelector('[data-action="city-mode"]');

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

  prefSel.addEventListener('change', () => fillCities());
  modeBtn.addEventListener('click', () => {
    const toManual = box.dataset.mode !== 'manual';
    if (toManual) cityText.value = cityText.value || citySel.value;
    else fillCities(muni.citiesOf(prefSel.value).includes(cityText.value.trim()) ? cityText.value.trim() : '');
    setMode(toManual);
    (toManual ? cityText : citySel).focus();
  });
  box.querySelector('.fav-places')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fav]');
    if (!b) return;
    const f = favorites[Number(b.dataset.fav)];
    prefSel.innerHTML = prefOptions(muni, f.pref);
    fillCities(f.city);
    setMode(false);
    box.querySelector('[name="address"]').focus();
  });
}

// フォームから住所を読み取る
export function readAddressFields(root) {
  const box = root.querySelector('.addr-fields');
  const val = (name) => String(box.querySelector(`[name="${name}"]`).value || '').trim();
  return {
    pref: val('pref'),
    city: box.dataset.mode === 'manual' ? val('cityManual') : val('city'),
    address: val('address'),
  };
}
