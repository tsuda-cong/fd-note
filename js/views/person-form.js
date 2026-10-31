// 新しい訪問の入力 ／ 訪問先の基本情報の編集

import { get, getAll, put, write, newRecord, getSettings } from '../db.js';
import { publicationsByUsage, pubPickerHtml, bindPubPicker, readPubPicker } from '../publications.js';
import { isDateStr, isTimeStr, nowStamp } from '../dates.js';
import { GENDERS } from '../model.js';
import { setTitle, esc, toast, dateTimeFields } from '../ui.js';
import { loadMunicipalities, loadLastPlace, saveLastPlace, addressFieldsHtml, bindAddressFields, readAddressFields } from '../address.js';

// 一覧を読めなかったときは、都道府県・市区町村も手入力にする
const NO_LIST = { prefs: [], citiesOf: () => [] };

function genderRadios(selected) {
  return GENDERS.map((g) => `
    <label><input type="radio" name="gender" value="${g.value}" ${g.value === selected ? 'checked' : ''}><span>${g.label}</span></label>`).join('');
}

const text = (fd, name) => String(fd.get(name) || '').trim();

export async function render(el, { params: [id] }) {
  const editing = !!id;
  const p = editing ? await get('people', id) : null;
  if (editing && !p) {
    setTitle('訪問先', '#/visits');
    el.innerHTML = '<section class="card"><p>この訪問先は見つかりません。</p></section>';
    return;
  }
  setTitle(editing ? '訪問先を編集' : '新しい訪問', editing ? `#/person/${id}` : '#/visits');
  const [{ favoriteCities, defaultPlace }, muni, pubs, given] = await Promise.all([
    getSettings(),
    loadMunicipalities().catch((e) => { toast(e.message); return NO_LIST; }),
    editing ? [] : getAll('publications'),
    editing ? [] : getAll('visitPublications'),
  ]);
  const pickable = publicationsByUsage(pubs, given);
  // 編集ではその人の住所。新しい訪問では、設定の「住所の初期値」、なければ最後に選んだ都道府県・市区町村
  const initial = editing
    ? { pref: p.pref || '', city: p.city || '', town: p.town || '', address: p.address || '' }
    : { ...(defaultPlace || loadLastPlace() || {}), town: '', address: '' };

  el.innerHTML = `
    <form class="card" data-form="person" autocomplete="off">
      ${editing ? '' : dateTimeFields({ dateLabel: '訪問日', timeLabel: '時刻' })}
      <label class="field"><span>名前</span>
        <input type="text" name="name" value="${esc(p?.name)}" placeholder="わかる範囲で（空欄でも可）"></label>
      <fieldset class="field"><legend>性別</legend>
        <div class="segmented">${genderRadios(p?.gender ?? '')}</div></fieldset>
      ${addressFieldsHtml(muni, initial, favoriteCities)}
      <label class="field"><span>メモ</span>
        <textarea name="memo" rows="3" placeholder="話した内容、関心など">${esc(p?.memo)}</textarea></label>
      ${editing ? '' : `
      ${pubPickerHtml(pickable)}
      <label class="check"><input type="checkbox" name="isStudent"><span>レッスン生</span></label>
      <fieldset class="sub">
        <legend>次回の予定（任意）</legend>
        ${dateTimeFields({ date: '', time: '', dateName: 'nextDate', timeName: 'nextTime', required: false })}
        <label class="field"><span>予定のメモ</span><input type="text" name="nextMemo"></label>
      </fieldset>`}
      <button class="btn btn-primary btn-block btn-big" name="after" value="">保存する</button>
      ${editing ? '' : '<button class="btn btn-block" name="after" value="map">保存して、地図で位置を指定する</button>'}
    </form>`;

  const form = el.querySelector('form');
  bindAddressFields(form, muni, favoriteCities);
  bindPubPicker(form, pickable);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const fields = {
      name: text(fd, 'name'),
      gender: text(fd, 'gender'),
      ...readAddressFields(form),
      memo: text(fd, 'memo'),
    };
    if (fields.pref || fields.city) saveLastPlace(fields.pref, fields.city);

    if (editing) {
      await put('people', { ...p, ...fields, updatedAt: nowStamp() });
      toast('保存しました');
      location.replace(`#/person/${id}`);
      return;
    }

    const date = text(fd, 'date');
    if (!isDateStr(date)) return toast('訪問日を入れてください');
    const time = isTimeStr(text(fd, 'time')) ? text(fd, 'time') : '';
    const person = newRecord({ ...fields, isStudent: fd.get('isStudent') === 'on', lat: null, lng: null });
    person.updatedAt = person.createdAt;
    const visit = newRecord({ personId: person.id, date, time, memo: '' });
    const nd = text(fd, 'nextDate');
    const plan = isDateStr(nd)
      ? newRecord({ personId: person.id, date: nd, time: isTimeStr(text(fd, 'nextTime')) ? text(fd, 'nextTime') : '', memo: text(fd, 'nextMemo'), done: false })
      : null;
    const distributed = readPubPicker(form).map((d) => newRecord({ personId: person.id, visitId: visit.id, date, ...d }));
    await write(['people', 'visits', 'plans', 'visitPublications'], (s) => {
      s('people').put(person);
      s('visits').put(visit);
      if (plan) s('plans').put(plan);
      for (const d of distributed) s('visitPublications').put(d);
    });
    toast('保存しました');
    const toMap = e.submitter?.value === 'map';
    location.replace(toMap ? `#/map?pick=${person.id}` : `#/person/${person.id}`);
  });
}
