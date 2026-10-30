// 新しい訪問の入力 ／ 訪問先の基本情報の編集

import { get, put, write, newRecord, getSettings } from '../db.js';
import { isDateStr, isTimeStr, nowStamp } from '../dates.js';
import { GENDERS } from '../model.js';
import { setTitle, esc, toast, dateTimeFields, options } from '../ui.js';

// 新しい訪問では、前回選んだ町名を最初から選んでおく（同じ町を続けて回ることが多いため）
const LAST_TOWN_KEY = 'fd-note:last-town';

function genderRadios(selected) {
  return GENDERS.map((g) => `
    <label><input type="radio" name="gender" value="${g.value}" ${g.value === selected ? 'checked' : ''}><span>${g.label}</span></label>`).join('');
}

function townSelect(towns, selected) {
  // リストから外した町名でも、登録済みの訪問先のものは消さずに選べるようにする
  const list = selected && !towns.includes(selected) ? [...towns, selected] : towns;
  if (!list.length) {
    return '<p class="muted small">設定の「町名リスト」に町名を登録すると、ここで選べます。</p>';
  }
  return `<select name="town" aria-label="町名">${options([['', '（町名を選ぶ）'], ...list.map((t) => [t, t])], selected)}</select>`;
}

function lastTown(towns) {
  try {
    const t = localStorage.getItem(LAST_TOWN_KEY) || '';
    return towns.includes(t) ? t : '';
  } catch {
    return '';
  }
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
  const { towns } = await getSettings();

  el.innerHTML = `
    <form class="card" data-form="person" autocomplete="off">
      ${editing ? '' : dateTimeFields({ dateLabel: '訪問日', timeLabel: '時刻' })}
      <label class="field"><span>名前</span>
        <input type="text" name="name" value="${esc(p?.name)}" placeholder="わかる範囲で（空欄でも可）"></label>
      <fieldset class="field"><legend>性別</legend>
        <div class="segmented">${genderRadios(p?.gender ?? '')}</div></fieldset>
      <fieldset class="field stack"><legend>住所</legend>
        ${townSelect(towns, editing ? p.town || '' : lastTown(towns))}
        <textarea name="address" rows="2" aria-label="番地・建物名など" placeholder="番地・建物名など">${esc(p?.address)}</textarea>
      </fieldset>
      <label class="field"><span>メモ</span>
        <textarea name="memo" rows="3" placeholder="話した内容、関心など">${esc(p?.memo)}</textarea></label>
      ${editing ? '' : `
      <label class="check"><input type="checkbox" name="isStudent"><span>レッスン生</span></label>
      <fieldset class="sub">
        <legend>次回の予定（任意）</legend>
        ${dateTimeFields({ date: '', time: '', dateName: 'nextDate', timeName: 'nextTime', required: false })}
        <label class="field"><span>予定のメモ</span><input type="text" name="nextMemo"></label>
      </fieldset>`}
      <button class="btn btn-primary btn-block btn-big" name="after" value="">保存する</button>
      ${editing ? '' : '<button class="btn btn-block" name="after" value="map">保存して、地図で位置を指定する</button>'}
    </form>`;

  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const fields = {
      name: text(fd, 'name'),
      gender: text(fd, 'gender'),
      town: text(fd, 'town'),
      address: text(fd, 'address'),
      memo: text(fd, 'memo'),
    };

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
    await write(['people', 'visits', 'plans'], (s) => {
      s('people').put(person);
      s('visits').put(visit);
      if (plan) s('plans').put(plan);
    });
    if (fields.town) {
      try { localStorage.setItem(LAST_TOWN_KEY, fields.town); } catch { /* 覚えられなくても動作には影響しない */ }
    }
    toast('保存しました');
    const toMap = e.submitter?.value === 'map';
    location.replace(toMap ? `#/map?pick=${person.id}` : `#/person/${person.id}`);
  });
}
