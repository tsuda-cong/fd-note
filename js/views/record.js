// 奉仕の記録: 奉仕時間（開拓者）と野外奉仕以外の時間（正規開拓者）

import { loadAll, getSettings, put, remove, newRecord } from '../db.js';
import { todayStr, currentYm, isYm, isDateStr, addMonths, formatYm, formatDate } from '../dates.js';
import { typeInfo } from '../model.js';
import { formatMinutes } from '../calc.js';
import { setTitle, esc, toast, confirmDialog, refresh, options } from '../ui.js';

const HOUR_OPTS = Array.from({ length: 13 }, (_, i) => [i, String(i)]);
const MIN_OPTS = Array.from({ length: 12 }, (_, i) => [i * 5, String(i * 5)]);
const OTHER_HOUR_OPTS = Array.from({ length: 12 }, (_, i) => [i + 1, String(i + 1)]);

function monthNav(ym) {
  return `
    <div class="month-nav">
      <a class="btn" href="#/record?ym=${addMonths(ym, -1)}" aria-label="前の月">‹</a>
      <strong>${formatYm(ym)}</strong>
      <a class="btn" href="#/record?ym=${addMonths(ym, 1)}" aria-label="次の月">›</a>
    </div>`;
}

export async function render(el, { query }) {
  setTitle('奉仕の記録');
  const [all, settings] = await Promise.all([loadAll(), getSettings()]);
  const info = typeInfo(settings.userType);
  const ym = isYm(query.get('ym')) ? query.get('ym') : currentYm();
  const defaultDate = ym === currentYm() ? todayStr() : `${ym}-01`;

  if (!info.hours) {
    el.innerHTML = `
      <section class="card">
        <h2>${esc(info.label)}の記録</h2>
        <p>${settings.userType ? '伝道者の区分では、時間の入力はありません。' : 'まだ区分が選ばれていません。開拓者の方は、設定で区分を選ぶと時間を記録できます。'}</p>
        <p>聖書レッスンの件数は、訪問先のカルテで「レッスンを記録」した内容から自動で数えます。</p>
        <a class="btn btn-primary btn-block" href="#/report">月の報告を見る</a>
        <a class="btn btn-block" href="#/settings">区分を変える</a>
      </section>`;
    return;
  }

  const times = all.serviceTimes.filter((r) => r.date.slice(0, 7) === ym).sort((a, b) => b.date.localeCompare(a.date));
  const others = all.otherTimes.filter((r) => r.date.slice(0, 7) === ym).sort((a, b) => b.date.localeCompare(a.date));
  const titles = [...new Set(all.otherTimes.map((r) => r.title))];
  const monthTotal = times.reduce((s, r) => s + r.minutes, 0);

  el.innerHTML = `
    <form class="card" data-form="time">
      <h2>奉仕時間を記録</h2>
      <label class="field"><span>日付</span><input type="date" name="date" value="${defaultDate}" required></label>
      <div class="field"><span>時間</span>
        <div class="hm">
          <select name="h" aria-label="時間">${options(HOUR_OPTS, 1)}</select><span>時間</span>
          <select name="m" aria-label="分">${options(MIN_OPTS, 0)}</select><span>分</span>
        </div>
      </div>
      <label class="field"><span>メモ（任意）</span><input type="text" name="memo" autocomplete="off"></label>
      <button class="btn btn-primary btn-block btn-big">記録する</button>
    </form>

    ${info.other ? `
    <form class="card" data-form="other">
      <h2>野外奉仕以外の時間</h2>
      <p class="muted small">野外奉仕の時間とは別に集計し、足しません。1時間単位で記録します。</p>
      <label class="field"><span>日付</span><input type="date" name="date" value="${defaultDate}" required></label>
      <label class="field"><span>名目</span>
        <input type="text" name="title" list="other-titles" autocomplete="off" required placeholder="例：〇〇の奉仕"></label>
      <datalist id="other-titles">${titles.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
      <label class="field"><span>時間</span>
        <span class="hm"><select name="hours">${options(OTHER_HOUR_OPTS, 1)}</select><span>時間</span></span></label>
      <button class="btn btn-primary btn-block">記録する</button>
    </form>` : ''}

    ${monthNav(ym)}

    <section class="card">
      <h2>奉仕時間 <small>この月の記録 ${formatMinutes(monthTotal)}</small></h2>
      ${times.length ? `<div class="list">${times.map((r) => `
        <div class="list-item">
          <div class="li-main">
            <div class="li-title"><span class="time">${esc(formatDate(r.date))}</span>${formatMinutes(r.minutes)}</div>
            ${r.memo ? `<div class="li-sub">${esc(r.memo)}</div>` : ''}
          </div>
          <button type="button" class="btn btn-small btn-ghost-danger" data-action="del-time" data-id="${esc(r.id)}">削除</button>
        </div>`).join('')}</div>` : '<p class="muted">記録はありません</p>'}
      <a class="btn btn-block" href="#/report?ym=${ym}">${formatYm(ym)}の報告を見る</a>
    </section>

    ${info.other ? `
    <section class="card">
      <h2>野外奉仕以外の時間 <small>合計 ${others.reduce((s, r) => s + r.hours, 0)}時間</small></h2>
      ${others.length ? `<div class="list">${others.map((r) => `
        <div class="list-item">
          <div class="li-main">
            <div class="li-title"><span class="time">${esc(formatDate(r.date))}</span>${r.hours}時間</div>
            <div class="li-sub">${esc(r.title)}</div>
          </div>
          <button type="button" class="btn btn-small btn-ghost-danger" data-action="del-other" data-id="${esc(r.id)}">削除</button>
        </div>`).join('')}</div>` : '<p class="muted">記録はありません</p>'}
    </section>` : ''}`;

  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const fd = new FormData(f);
    const date = fd.get('date');
    if (!isDateStr(date)) return toast('日付を入れてください');
    if (f.dataset.form === 'time') {
      const minutes = Number(fd.get('h')) * 60 + Number(fd.get('m'));
      if (minutes <= 0) return toast('時間を選んでください');
      await put('serviceTimes', newRecord({ date, minutes, memo: String(fd.get('memo') || '').trim() }));
      toast(`記録しました：${formatDate(date)} ${formatMinutes(minutes)}`);
    } else {
      const title = String(fd.get('title') || '').trim();
      if (!title) return toast('名目を入れてください');
      const hours = Number(fd.get('hours'));
      await put('otherTimes', newRecord({ date, title, hours }));
      toast(`記録しました：${title} ${hours}時間`);
    }
    if (date.slice(0, 7) !== ym) location.hash = `#/record?ym=${date.slice(0, 7)}`;
    else refresh();
  });

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const store = b.dataset.action === 'del-time' ? 'serviceTimes' : 'otherTimes';
    if (await confirmDialog('この記録を削除しますか？', { ok: '削除する', danger: true })) {
      await remove(store, b.dataset.id);
      toast('削除しました');
      refresh();
    }
  });
}
