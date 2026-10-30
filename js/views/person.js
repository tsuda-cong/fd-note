// 訪問先の詳細（カルテ）: 次回予定、再訪問の記録、聖書レッスン

import { loadAll, getSettings, put, remove, write, deletePerson, newRecord } from '../db.js';
import { todayStr, nowTimeStr, isDateStr, isTimeStr, formatDate, formatDateTime, relativeLabel, nowStamp, WEEKDAYS } from '../dates.js';
import { summarizePeople, displayName, genderLabel, STATUS } from '../model.js';
import { setTitle, esc, escLines, toast, confirmDialog, refresh, dateTimeFields, options } from '../ui.js';

const WEEKDAY_OPTS = WEEKDAYS.map((w, i) => [i, `${w}曜日`]);
const text = (fd, name) => String(fd.get(name) || '').trim();
const timeOf = (fd, name) => (isTimeStr(text(fd, name)) ? text(fd, name) : '');

function planList(p) {
  if (!p.openPlans.length) return '<p class="muted">予定はありません</p>';
  return `<div class="list">${p.openPlans.map((pl) => `
    <div class="list-item">
      <div class="li-main">
        <div class="li-title">${esc(formatDateTime(pl.date, pl.time))} <small>${relativeLabel(pl.date)}</small></div>
        ${pl.memo ? `<div class="li-sub">${esc(pl.memo)}</div>` : ''}
      </div>
      <div class="li-actions">
        <button type="button" class="btn btn-small" data-action="plan-done" data-id="${esc(pl.id)}">済み</button>
        <button type="button" class="btn btn-small btn-ghost-danger" data-action="plan-del" data-id="${esc(pl.id)}">削除</button>
      </div>
    </div>`).join('')}</div>`;
}

function historyItem(r, action, extra = '') {
  return `
    <div class="list-item">
      <div class="li-main">
        <div class="li-title">${esc(formatDateTime(r.date, r.time))} ${extra}</div>
        ${r.memo ? `<div class="li-sub">${escLines(r.memo)}</div>` : ''}
      </div>
      <button type="button" class="btn btn-small btn-ghost-danger" data-action="${action}" data-id="${esc(r.id)}" aria-label="削除">削除</button>
    </div>`;
}

function historyList(list, action, { limit = 5, firstLabel = '' } = {}) {
  if (!list.length) return '<p class="muted">記録はありません</p>';
  const item = (r, i) => historyItem(r, action, firstLabel && i === list.length - 1 ? `<span class="badge">${firstLabel}</span>` : '');
  const head = list.slice(0, limit).map((r, i) => item(r, i)).join('');
  const rest = list.slice(limit).map((r, i) => item(r, i + limit)).join('');
  return `<div class="list">${head}</div>${rest ? `
    <details class="more"><summary>残り${list.length - limit}件を表示</summary><div class="list">${rest}</div></details>` : ''}`;
}

export async function render(el, { params: [id] }) {
  const [all, settings] = await Promise.all([loadAll(), getSettings()]);
  const today = todayStr();
  const p = summarizePeople(all, settings, today).find((x) => x.id === id);
  if (!p) {
    setTitle('訪問先', '#/visits');
    el.innerHTML = '<section class="card"><p>この訪問先は見つかりません。</p><a class="btn btn-block" href="#/visits">一覧へ戻る</a></section>';
    return;
  }
  setTitle(displayName(p), '#/visits');
  const raw = all.people.find((x) => x.id === id);
  const todaySchedule = p.schedules.find((s) => s.weekday === new Date().getDay());

  el.innerHTML = `
    <section class="card">
      <div class="person-head">
        <span class="dot big" style="background:${STATUS[p.status].color}"></span>
        <div>
          <h2>${esc(displayName(p))}</h2>
          <div class="badges">
            ${p.gender ? `<span class="badge">${genderLabel(p.gender)}</span>` : ''}
            <span class="badge" style="border-color:${STATUS[p.status].color}">${STATUS[p.status].label}</span>
          </div>
        </div>
      </div>
      ${p.address ? `<p class="addr">${escLines(p.address)}</p>` : ''}
      ${p.memo ? `<p class="memo">${escLines(p.memo)}</p>` : ''}
      <p class="muted small">最終訪問：${p.lastVisit ? `${formatDate(p.lastVisit.date)}（${relativeLabel(p.lastVisit.date, today)}）` : 'なし'}
        ／ 地図の位置：${p.lat != null ? '指定済み' : '未指定'}</p>
      <div class="btn-row">
        <a class="btn" href="#/person/${esc(id)}/edit">編集</a>
        <a class="btn" href="#/map?pick=${esc(id)}">${p.lat != null ? '地図の位置を変更' : '地図で位置を指定'}</a>
      </div>
    </section>

    <section class="card">
      <h3>次回の予定</h3>
      ${planList(p)}
      <details class="form-toggle">
        <summary class="btn btn-block">＋ 予定を追加</summary>
        <form data-form="plan">
          ${dateTimeFields({ date: '', time: '' })}
          <label class="field"><span>メモ</span><input type="text" name="memo" autocomplete="off"></label>
          <button class="btn btn-primary btn-block">予定を保存</button>
        </form>
      </details>
    </section>

    <section class="card">
      <details class="form-toggle">
        <summary class="btn btn-primary btn-block btn-big">再訪問を記録</summary>
        <form data-form="visit">
          ${dateTimeFields()}
          <label class="field"><span>メモ</span><textarea name="memo" rows="3"></textarea></label>
          <fieldset class="sub">
            <legend>次回の予定（任意）</legend>
            ${dateTimeFields({ date: '', time: '', dateName: 'nextDate', timeName: 'nextTime', required: false })}
            <label class="field"><span>予定のメモ</span><input type="text" name="nextMemo" autocomplete="off"></label>
          </fieldset>
          ${p.openPlans.length ? '<label class="check"><input type="checkbox" name="closePlans" checked><span>今ある次回の予定を「済み」にする</span></label>' : ''}
          <button class="btn btn-primary btn-block">記録する</button>
        </form>
      </details>
      <h3>訪問の履歴 <small>${p.visits.length}件</small></h3>
      ${historyList(p.visits, 'visit-del', { firstLabel: '初回' })}
    </section>

    <section class="card">
      <h3>聖書レッスン</h3>
      <label class="check switch"><input type="checkbox" data-action="toggle-student" ${p.isStudent ? 'checked' : ''}><span>レッスン生</span></label>
      ${p.isStudent ? `
        <h4>レッスンの予定</h4>
        ${p.schedules.length ? `<div class="chips">${p.schedules.map((s) => `
          <span class="chip on">${WEEKDAYS[s.weekday]}曜 ${esc(s.time)}
            <button type="button" class="chip-x" data-action="sched-del" data-id="${esc(s.id)}" aria-label="この予定を削除">×</button></span>`).join('')}</div>`
          : '<p class="muted small">曜日と時刻を登録すると、ホームの「今日・明日の予定」に出ます。</p>'}
        <details class="form-toggle">
          <summary class="btn btn-block">＋ 曜日と時刻を追加</summary>
          <form data-form="schedule">
            <div class="row2">
              <label class="field"><span>曜日</span><select name="weekday">${options(WEEKDAY_OPTS, new Date().getDay())}</select></label>
              <label class="field"><span>時刻</span><input type="time" name="time" value="${p.schedules[0]?.time || '10:00'}" required></label>
            </div>
            <button class="btn btn-primary btn-block">追加する</button>
          </form>
        </details>
        <details class="form-toggle">
          <summary class="btn btn-primary btn-block btn-big">レッスンを記録</summary>
          <form data-form="lesson">
            ${dateTimeFields({ time: todaySchedule?.time || nowTimeStr() })}
            <label class="field"><span>メモ（任意）</span><input type="text" name="memo" autocomplete="off" placeholder="例：第3課まで"></label>
            <button class="btn btn-primary btn-block">記録する</button>
          </form>
        </details>` : '<p class="muted small">チェックを付けると、レッスンの予定と実施記録を入れられます。</p>'}
      ${p.lessons.length || p.isStudent ? `<h4>実施記録 <small>${p.lessons.length}回</small></h4>${historyList(p.lessons, 'lesson-del')}` : ''}
    </section>

    <button type="button" class="btn btn-danger-outline btn-block" data-action="delete-person">この訪問先を削除</button>`;

  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const fd = new FormData(f);
    const kind = f.dataset.form;

    if (kind === 'schedule') {
      const time = timeOf(fd, 'time');
      if (!time) return toast('時刻を入れてください');
      await put('lessonSchedules', newRecord({ personId: id, weekday: Number(fd.get('weekday')), time }));
      toast('レッスンの予定を追加しました');
      return refresh();
    }

    const date = text(fd, 'date');
    if (!isDateStr(date)) return toast('日付を入れてください');
    const time = timeOf(fd, 'time');

    if (kind === 'plan') {
      await put('plans', newRecord({ personId: id, date, time, memo: text(fd, 'memo'), done: false }));
      toast('予定を追加しました');
    } else if (kind === 'lesson') {
      await put('lessonRecords', newRecord({ personId: id, date, time, memo: text(fd, 'memo') }));
      toast('レッスンを記録しました');
    } else if (kind === 'visit') {
      const nd = text(fd, 'nextDate');
      const closing = fd.get('closePlans') === 'on' ? p.openPlans : [];
      await write(['visits', 'plans'], (s) => {
        s('visits').put(newRecord({ personId: id, date, time, memo: text(fd, 'memo') }));
        for (const pl of closing) s('plans').put({ ...pl, done: true, doneAt: nowStamp() });
        if (isDateStr(nd)) {
          s('plans').put(newRecord({ personId: id, date: nd, time: timeOf(fd, 'nextTime'), memo: text(fd, 'nextMemo'), done: false }));
        }
      });
      toast('再訪問を記録しました');
    }
    refresh();
  });

  el.addEventListener('change', async (e) => {
    if (e.target.dataset.action !== 'toggle-student') return;
    await put('people', { ...raw, isStudent: e.target.checked, updatedAt: nowStamp() });
    toast(e.target.checked ? 'レッスン生にしました' : 'レッスン生を外しました');
    refresh();
  });

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-action]');
    if (!b) return;
    const rid = b.dataset.id;
    switch (b.dataset.action) {
      case 'plan-done': {
        const pl = all.plans.find((x) => x.id === rid);
        await put('plans', { ...pl, done: true, doneAt: nowStamp() });
        toast('済みにしました');
        return refresh();
      }
      case 'plan-del':
        if (!(await confirmDialog('この予定を削除しますか？', { ok: '削除する', danger: true }))) return;
        await remove('plans', rid);
        return refresh();
      case 'visit-del':
        if (!(await confirmDialog('この訪問の記録を削除しますか？', { ok: '削除する', danger: true }))) return;
        await remove('visits', rid);
        return refresh();
      case 'lesson-del':
        if (!(await confirmDialog('このレッスンの記録を削除しますか？', { ok: '削除する', danger: true, detail: '月のレッスン件数も変わります。' }))) return;
        await remove('lessonRecords', rid);
        return refresh();
      case 'sched-del':
        if (!(await confirmDialog('このレッスンの予定を削除しますか？', { ok: '削除する', danger: true }))) return;
        await remove('lessonSchedules', rid);
        return refresh();
      case 'delete-person':
        if (!(await confirmDialog(`「${displayName(p)}」を削除しますか？`, {
          ok: '削除する', danger: true, detail: '訪問の履歴、予定、レッスンの記録もすべて消え、過去の月のレッスン件数も減ります。元に戻せません。',
        }))) return;
        await deletePerson(id);
        toast('削除しました');
        location.replace('#/visits');
        return undefined;
      default:
        return undefined;
    }
  });
}
