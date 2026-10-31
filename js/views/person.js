// 訪問先の詳細（カルテ）: 次回予定、再訪問の記録、渡した出版物、聖書レッスン（教材・進み具合）

import { loadAll, getSettings, put, remove, write, deletePerson, newRecord } from '../db.js';
import { todayStr, nowTimeStr, isDateStr, isTimeStr, formatDate, formatDateTime, relativeLabel, nowStamp, WEEKDAYS } from '../dates.js';
import { summarizePeople, displayName, fullAddress, genderLabel, STATUS } from '../model.js';
import { setTitle, esc, escLines, toast, confirmDialog, refresh, dateTimeFields, options } from '../ui.js';
import {
  loadCourses, courseItems, progressSummary, progressHeadline, recordReachText, pointProgress, currentMaterial,
  materialType, kindLabel, sortPublications, publicationsByUsage, distributionLabel,
  pubPickerHtml, bindPubPicker, readPubPicker,
} from '../publications.js';

const WEEKDAY_OPTS = WEEKDAYS.map((w, i) => [i, `${w}曜日`]);
const POINT_OPTS = [['', '—'], ...Array.from({ length: 10 }, (_, i) => [i, String(i)])];
const text = (fd, name) => String(fd.get(name) || '').trim();
const timeOf = (fd, name) => (isTimeStr(text(fd, name)) ? text(fd, name) : '');

// 描き直しても、開いていた欄（details）を開いたままにする（別の人のカルテを開いたら閉じる）
const openPanels = new Set();
let panelsFor = null;

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

function historyItem(r, action, { extra = '', sub = '' } = {}) {
  return `
    <div class="list-item">
      <div class="li-main">
        <div class="li-title">${esc(formatDateTime(r.date, r.time))} ${extra}</div>
        ${sub}
        ${r.memo ? `<div class="li-sub">${escLines(r.memo)}</div>` : ''}
      </div>
      <button type="button" class="btn btn-small btn-ghost-danger" data-action="${action}" data-id="${esc(r.id)}" aria-label="削除">削除</button>
    </div>`;
}

function historyList(list, action, { limit = 5, firstLabel = '', subOf = () => '' } = {}) {
  if (!list.length) return '<p class="muted">記録はありません</p>';
  const item = (r, i) => historyItem(r, action, {
    extra: firstLabel && i === list.length - 1 ? `<span class="badge">${firstLabel}</span>` : '',
    sub: subOf(r),
  });
  const head = list.slice(0, limit).map((r, i) => item(r, i)).join('');
  const rest = list.slice(limit).map((r, i) => item(r, i + limit)).join('');
  return `<div class="list">${head}</div>${rest ? `
    <details class="more"><summary>残り${list.length - limit}件を表示</summary><div class="list">${rest}</div></details>` : ''}`;
}

function panel(key, summaryHtml, body, summaryClass = 'btn btn-block') {
  return `<details class="form-toggle" data-panel="${key}" ${openPanels.has(key) ? 'open' : ''}>
    <summary class="${summaryClass}">${summaryHtml}</summary>${body}</details>`;
}

export async function render(el, { params: [id] }) {
  const [all, settings, courses] = await Promise.all([
    loadAll(), getSettings(), loadCourses().catch(() => null),
  ]);
  const today = todayStr();
  const p = summarizePeople(all, settings, today).find((x) => x.id === id);
  if (!p) {
    setTitle('訪問先', '#/visits');
    el.innerHTML = '<section class="card"><p>この訪問先は見つかりません。</p><a class="btn btn-block" href="#/visits">一覧へ戻る</a></section>';
    return;
  }
  setTitle(displayName(p), '#/visits');
  if (panelsFor !== id) {
    openPanels.clear();
    panelsFor = id;
  }
  const raw = all.people.find((x) => x.id === id);
  const todaySchedule = p.schedules.find((s) => s.weekday === new Date().getDay());

  // 出版物と配布の記録
  const pubById = new Map(all.publications.map((x) => [x.id, x]));
  const pickable = publicationsByUsage(all.publications, all.visitPublications);
  // 新しい日付が上。同じ日に渡したものは入れた順
  const given = all.visitPublications.filter((r) => r.personId === id)
    .sort((a, b) => b.date.localeCompare(a.date) || (a.createdAt || '').localeCompare(b.createdAt || '') || (a.pos ?? 0) - (b.pos ?? 0));
  const givenByVisit = new Map();
  for (const g of given) if (g.visitId) givenByVisit.set(g.visitId, [...(givenByVisit.get(g.visitId) || []), g]);
  const givenText = (list) => list.map((g) => distributionLabel(pubById.get(g.publicationId), g)).join('、');

  // 教材と進み具合
  const materials = all.lessonMaterials.filter((m) => m.personId === id);
  const current = currentMaterial(materials);
  const curPub = current ? pubById.get(current.publicationId) : null;
  const curType = curPub ? materialType(curPub) : null;
  const course = curType === 'lesson' && courses ? courses[curPub.course] : null;
  const items = courseItems(course);
  const progressOf = (pubId) => all.lessonProgress.filter((r) => r.personId === id && r.publicationId === pubId);
  const doneIds = new Set(curPub ? progressOf(curPub.id).map((r) => r.item) : []);
  const sum = progressSummary(items, doneIds);
  const myRecords = p.lessons; // 新しい順
  const lastForCurrent = curPub ? myRecords.find((r) => r.publicationId === curPub.id && (curType === 'lesson' ? r.item : r.memo)) : null;
  const lastReach = curType === 'lesson' ? recordReachText(items, lastForCurrent) : '';
  const points = curType === 'lesson' ? pointProgress(course, items, doneIds, lastForCurrent) : null;
  const materialChoices = sortPublications(all.publications.filter((x) => x.isMaterial && (x.active || x.id === curPub?.id)));

  // 実施記録の「扱ったレッスン」の初期値: 前回の途中のレッスンが済でなければそれ、なければ次の未済
  const defaultReach = lastForCurrent?.item && !doneIds.has(lastForCurrent.item) ? lastForCurrent.item : (sum.next?.id || items[0]?.id || '');
  // 「この回で済になったもの」の候補: 未済のもののうち、扱ったレッスンの1つ先まで
  const doneCandidates = (reachId) => {
    const idx = items.findIndex((it) => it.id === reachId);
    return items.slice(0, Math.max(idx + 2, 1)).filter((it) => !doneIds.has(it.id));
  };
  const candidateChips = (reachId) => doneCandidates(reachId).map((it) =>
    `<button type="button" class="chip" data-done-item="${it.id}" aria-pressed="false">${esc(it.label)}</button>`).join('')
    || '<span class="muted small">済にできるものはありません</span>';

  const recordSub = (r) => {
    const pub = r.publicationId ? pubById.get(r.publicationId) : null;
    if (!pub) return '';
    const reach = materialType(pub) === 'lesson' && courses ? recordReachText(courseItems(courses[pub.course]), r) : '';
    const doneHere = all.lessonProgress.filter((x) => x.lessonRecordId === r.id);
    const doneText = doneHere.length && courses ? `／済：${doneHere.map((x) => courseItems(courses[pub.course]).find((it) => it.id === x.item)?.label || x.item).join('、')}` : '';
    return `<div class="li-sub">${esc(pub.name)}${reach ? `：${esc(reach)}` : ''}${esc(doneText)}</div>`;
  };

  const progressBlock = () => {
    if (!course) return '<p class="muted small">教材の構成を読み込めませんでした。</p>';
    const pct = sum.total ? Math.round((sum.doneCount / sum.total) * 100) : 0;
    const sections = [...new Set(items.map((it) => it.section))];
    return `
      <div class="progress-box">
        <p class="progress-head">${esc(progressHeadline(sum))}</p>
        <div class="progress-bar" role="img" aria-label="${sum.total}個中${sum.doneCount}個済"><span style="width:${pct}%"></span></div>
        ${points ? `<p class="small">ポイント：${points.total}中${points.done}</p>` : ''}
        ${sum.missing.length ? `<p class="small warn-text">まだのもの：${esc(sum.missing.map((it) => it.label).join('、'))}</p>` : ''}
        ${sum.next ? `<p class="small">次は：<strong>${esc(sum.next.label)}</strong></p>` : ''}
        <p class="small">前回はここまで：${lastForCurrent ? `${esc(formatDate(lastForCurrent.date))} <strong>${esc(lastReach)}</strong>` : 'まだ記録がありません'}</p>
      </div>
      ${panel('grid', '進み具合のチェック（押すと済・取り消し）', `
        <div class="item-grid">
          ${sections.map((sec) => `
            ${sec ? `<p class="grid-head">セクション${sec}</p>` : ''}
            <div class="chips">${items.filter((it) => it.section === sec).map((it) => `
              <button type="button" class="chip item ${doneIds.has(it.id) ? 'on' : ''}" data-action="toggle-item" data-item="${it.id}"
                aria-pressed="${doneIds.has(it.id)}">${esc(it.review ? `セクション${sec}の復習` : it.label.replace('レッスン', ''))}</button>`).join('')}</div>`).join('')}
        </div>
        <div class="bulk">
          <label class="field"><span>これまでの分をまとめて登録</span>
            <select name="bulkUpTo">${options(items.map((it) => [it.id, `${it.label}まで`]), sum.upTo?.id || items[0]?.id)}</select></label>
          <button type="button" class="btn btn-block" data-action="bulk-done">ここまでまとめて済にする</button>
        </div>`)}`;
  };

  const lessonFormFields = () => {
    if (curType === 'lesson' && course) {
      return `
        <p class="small">前回はここまで：${lastForCurrent ? `<strong>${esc(lastReach)}</strong>（${esc(formatDate(lastForCurrent.date))}）` : 'まだ記録がありません'}</p>
        <div class="row2">
          <label class="field"><span>どこまで進んだか</span>
            <select name="item">${options(items.map((it) => [it.id, it.label]), defaultReach)}</select></label>
          <label class="field"><span>ポイント</span>
            <select name="point">${options(POINT_OPTS, '')}</select></label>
        </div>
        <div class="field"><span>この回で済になったもの（押して選ぶ。複数可）</span>
          <div class="chips done-chips">${candidateChips(defaultReach)}</div></div>
        <label class="field"><span>メモ（任意）</span><input type="text" name="memo" autocomplete="off"></label>`;
    }
    return `<label class="field"><span>${curType === 'memo' ? 'メモ（どこまで進んだか）' : 'メモ（任意）'}</span>
      <input type="text" name="memo" autocomplete="off" placeholder="例：第5課の3まで"></label>
      ${curType === 'memo' && lastForCurrent ? `<p class="small">前回のメモ：<strong>${esc(lastForCurrent.memo)}</strong>（${esc(formatDate(lastForCurrent.date))}）</p>` : ''}`;
  };

  const materialHistory = () => {
    const past = materials.filter((m) => m !== current).sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    if (!past.length) return '';
    return `<h4>教材の履歴</h4><div class="list">${past.map((m) => {
      const pub = pubById.get(m.publicationId);
      const its = pub && materialType(pub) === 'lesson' && courses ? courseItems(courses[pub.course]) : [];
      const done = new Set(progressOf(m.publicationId).map((r) => r.item));
      return `<div class="list-item"><div class="li-main">
        <div class="li-title">${esc(pub?.name || '（不明な出版物）')}</div>
        <div class="li-sub">${esc(formatDate(m.startDate))}〜${esc(formatDate(m.endDate))}${its.length ? `／${its.length}個中${its.filter((it) => done.has(it.id)).length}個済` : ''}</div>
      </div></div>`;
    }).join('')}</div>`;
  };

  const visitOptions = p.visits.map((v) => [v.id, `${formatDate(v.date)}の訪問`]);

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
      ${fullAddress(p) ? `<p class="addr">${escLines(fullAddress(p))}</p>` : ''}
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
      ${panel('plan', '＋ 予定を追加', `
        <form data-form="plan">
          ${dateTimeFields({ date: '', time: '' })}
          <label class="field"><span>メモ</span><input type="text" name="memo" autocomplete="off"></label>
          <button class="btn btn-primary btn-block">予定を保存</button>
        </form>`)}
    </section>

    <section class="card">
      ${panel('visit', '再訪問を記録', `
        <form data-form="visit">
          ${dateTimeFields()}
          <label class="field"><span>メモ</span><textarea name="memo" rows="3"></textarea></label>
          ${pubPickerHtml(pickable)}
          <fieldset class="sub">
            <legend>次回の予定（任意）</legend>
            ${dateTimeFields({ date: '', time: '', dateName: 'nextDate', timeName: 'nextTime', required: false })}
            <label class="field"><span>予定のメモ</span><input type="text" name="nextMemo" autocomplete="off"></label>
          </fieldset>
          ${p.openPlans.length ? '<label class="check"><input type="checkbox" name="closePlans" checked><span>今ある次回の予定を「済み」にする</span></label>' : ''}
          <button class="btn btn-primary btn-block">記録する</button>
        </form>`, 'btn btn-primary btn-block btn-big')}
      <h3>訪問の履歴 <small>${p.visits.length}件</small></h3>
      ${historyList(p.visits, 'visit-del', {
        firstLabel: '初回',
        subOf: (v) => (givenByVisit.has(v.id) ? `<div class="li-sub given">渡した出版物：${esc(givenText(givenByVisit.get(v.id)))}</div>` : ''),
      })}
    </section>

    <section class="card">
      <h3>渡した出版物 <small>${given.length}件</small></h3>
      ${given.length ? `<div class="list">${given.map((g) => `
        <div class="list-item">
          <div class="li-main"><div class="li-title"><span class="time">${esc(formatDate(g.date))}</span>${esc(distributionLabel(pubById.get(g.publicationId), g))}</div></div>
          <button type="button" class="btn btn-small btn-ghost-danger" data-action="given-del" data-id="${esc(g.id)}">削除</button>
        </div>`).join('')}</div>` : '<p class="muted">記録はありません</p>'}
      ${panel('given', '＋ 渡した出版物を追加（これまでの分など）', `
        <form data-form="given">
          <label class="field"><span>いつ渡したか</span>
            <select name="when">${options([...visitOptions, ['', '訪問の記録がない日（日付を入れる）']], visitOptions[0]?.[0] ?? '')}</select></label>
          <label class="field given-date" ${visitOptions.length ? 'hidden' : ''}><span>日付</span><input type="date" name="date" value="${today}"></label>
          ${pubPickerHtml(pickable, { legend: '渡した出版物' })}
          <button class="btn btn-primary btn-block">追加する</button>
        </form>`)}
    </section>

    <section class="card">
      <h3>聖書レッスン</h3>
      <label class="check switch"><input type="checkbox" data-action="toggle-student" ${p.isStudent ? 'checked' : ''}><span>レッスン生</span></label>
      ${p.isStudent ? `
        <h4>使用中の教材</h4>
        <p>${curPub ? `<strong>${esc(curPub.name)}</strong> <small class="muted">${esc(kindLabel(curPub))}／${esc(formatDate(current.startDate))}から</small>` : '<span class="muted">まだ選んでいません</span>'}</p>
        ${panel('material', curPub ? '教材を変更' : '教材を選ぶ', materialChoices.length ? `
          <form data-form="material">
            <label class="field"><span>教材</span>
              <select name="publicationId">${options(materialChoices.map((x) => [x.id, x.name]), curPub?.id || materialChoices[0].id)}</select></label>
            <p class="muted small">変更しても、前の教材の進み具合や記録は消えずに残ります。</p>
            <button class="btn btn-primary btn-block">この教材にする</button>
          </form>` : '<p class="muted small">設定の「出版物」で、教材として使うものを登録してください。</p>')}
        ${curType === 'lesson' ? progressBlock() : ''}
        ${curType === 'memo' ? `<p class="small">前回のメモ：${lastForCurrent ? `<strong>${esc(lastForCurrent.memo)}</strong>（${esc(formatDate(lastForCurrent.date))}）` : 'まだ記録がありません'}</p>` : ''}

        <h4>レッスンの予定</h4>
        ${p.schedules.length ? `<div class="chips">${p.schedules.map((s) => `
          <span class="chip on">${WEEKDAYS[s.weekday]}曜 ${esc(s.time)}
            <button type="button" class="chip-x" data-action="sched-del" data-id="${esc(s.id)}" aria-label="この予定を削除">×</button></span>`).join('')}</div>`
          : '<p class="muted small">曜日と時刻を登録すると、ホームの「今日・明日の予定」に出ます。</p>'}
        ${panel('schedule', '＋ 曜日と時刻を追加', `
          <form data-form="schedule">
            <div class="row2">
              <label class="field"><span>曜日</span><select name="weekday">${options(WEEKDAY_OPTS, new Date().getDay())}</select></label>
              <label class="field"><span>時刻</span><input type="time" name="time" value="${p.schedules[0]?.time || '10:00'}" required></label>
            </div>
            <button class="btn btn-primary btn-block">追加する</button>
          </form>`)}
        ${panel('lesson', 'レッスンを記録', `
          <form data-form="lesson">
            ${dateTimeFields({ time: todaySchedule?.time || nowTimeStr() })}
            ${curPub ? `<p class="small muted">教材：${esc(curPub.name)}</p>` : ''}
            ${lessonFormFields()}
            <button class="btn btn-primary btn-block">記録する</button>
          </form>`, 'btn btn-primary btn-block btn-big')}` : '<p class="muted small">チェックを付けると、レッスンの予定と実施記録を入れられます。</p>'}
      ${p.lessons.length || p.isStudent ? `<h4>実施記録 <small>${p.lessons.length}回</small></h4>${historyList(p.lessons, 'lesson-del', { subOf: recordSub })}` : ''}
      ${p.isStudent ? materialHistory() : ''}
    </section>

    <button type="button" class="btn btn-danger-outline btn-block" data-action="delete-person">この訪問先を削除</button>`;

  for (const f of el.querySelectorAll('form')) bindPubPicker(f, pickable);
  el.addEventListener('toggle', (e) => {
    const key = e.target.dataset?.panel;
    if (!key) return;
    if (e.target.open) openPanels.add(key);
    else openPanels.delete(key);
  }, true);

  // 実施記録: 「どこまで進んだか」を変えたら、済の候補を入れ替える
  const reachSel = el.querySelector('form[data-form="lesson"] [name="item"]');
  reachSel?.addEventListener('change', () => {
    el.querySelector('.done-chips').innerHTML = candidateChips(reachSel.value);
  });
  el.querySelector('.done-chips')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-done-item]');
    if (!b) return;
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('on', on);
  });
  // 配布をあとから足す: 「訪問の記録がない日」を選んだときだけ日付欄を出す
  const whenSel = el.querySelector('form[data-form="given"] [name="when"]');
  whenSel?.addEventListener('change', () => {
    el.querySelector('.given-date').hidden = whenSel.value !== '';
  });

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
    if (kind === 'material') return changeMaterial(String(fd.get('publicationId')));
    if (kind === 'given') {
      const list = readPubPicker(f);
      if (!list.length) return toast('渡した出版物を選んでください');
      const visit = p.visits.find((v) => v.id === fd.get('when'));
      const date = visit ? visit.date : text(fd, 'date');
      if (!isDateStr(date)) return toast('日付を入れてください');
      await write(['visitPublications'], (s) => {
        for (const d of list) s('visitPublications').put(newRecord({ personId: id, visitId: visit?.id || null, date, ...d }));
      });
      toast(`${list.length}件追加しました`);
      openPanels.delete('given');
      return refresh();
    }

    const date = text(fd, 'date');
    if (!isDateStr(date)) return toast('日付を入れてください');
    const time = timeOf(fd, 'time');

    if (kind === 'plan') {
      await put('plans', newRecord({ personId: id, date, time, memo: text(fd, 'memo'), done: false }));
      toast('予定を追加しました');
      openPanels.delete('plan');
    } else if (kind === 'lesson') {
      const isLesson = curType === 'lesson' && course;
      const rec = newRecord({
        personId: id, date, time, memo: text(fd, 'memo'),
        publicationId: curPub?.id || null,
        item: isLesson ? text(fd, 'item') || null : null,
        point: isLesson && text(fd, 'point') !== '' ? Number(fd.get('point')) : null,
      });
      const doneNow = isLesson ? [...f.querySelectorAll('[data-done-item][aria-pressed="true"]')].map((b) => b.dataset.doneItem) : [];
      await write(['lessonRecords', 'lessonProgress'], (s) => {
        s('lessonRecords').put(rec);
        for (const item of doneNow) {
          if (!doneIds.has(item)) s('lessonProgress').put(newRecord({ personId: id, publicationId: curPub.id, item, doneDate: date, lessonRecordId: rec.id, carriedFrom: null }));
        }
      });
      toast('レッスンを記録しました');
      openPanels.delete('lesson');
    } else if (kind === 'visit') {
      const nd = text(fd, 'nextDate');
      const closing = fd.get('closePlans') === 'on' ? p.openPlans : [];
      const visit = newRecord({ personId: id, date, time, memo: text(fd, 'memo') });
      const distributed = readPubPicker(f).map((d) => newRecord({ personId: id, visitId: visit.id, date, ...d }));
      await write(['visits', 'plans', 'visitPublications'], (s) => {
        s('visits').put(visit);
        for (const pl of closing) s('plans').put({ ...pl, done: true, doneAt: nowStamp() });
        if (isDateStr(nd)) {
          s('plans').put(newRecord({ personId: id, date: nd, time: timeOf(fd, 'nextTime'), memo: text(fd, 'nextMemo'), done: false }));
        }
        for (const d of distributed) s('visitPublications').put(d);
      });
      toast('再訪問を記録しました');
      openPanels.delete('visit');
    }
    return refresh();
  });

  // 教材の変更。前の教材の記録・進み具合は残す。同じ内容のレッスン（冊子→書籍の01〜03など）は引き継ぐか確かめる。
  async function changeMaterial(pubId) {
    if (pubId === curPub?.id) return toast('いまの教材と同じです');
    const next = pubById.get(pubId);
    let carried = [];
    if (curPub && materialType(curPub) === 'lesson' && materialType(next) === 'lesson' && courses) {
      const from = courses[curPub.course];
      const to = courses[next.course];
      const shared = from?.sameAs === next.course || to?.sameAs === curPub.course;
      if (shared) {
        const toIds = new Set(courseItems(to).map((it) => it.id));
        const already = new Set(progressOf(next.id).map((r) => r.item));
        carried = progressOf(curPub.id).filter((r) => toIds.has(r.item) && !already.has(r.item));
      }
    }
    let carry = false;
    if (carried.length) {
      const labels = courseItems(courses[curPub.course]).filter((it) => carried.some((r) => r.item === it.id)).map((it) => it.label).join('、');
      const ans = await confirmDialog(`${curPub.name}で済にした ${labels} を、${next.name}に引き継ぎますか？`, {
        ok: '引き継ぐ', detail: '「キャンセル」を押すと、引き継がずに教材だけを変えます。',
      });
      carry = ans;
    }
    await write(['lessonMaterials', 'lessonProgress'], (s) => {
      if (current) s('lessonMaterials').put({ ...current, endDate: today, updatedAt: nowStamp() });
      s('lessonMaterials').put(newRecord({ personId: id, publicationId: next.id, startDate: today, endDate: null }));
      if (carry) {
        for (const r of carried) {
          s('lessonProgress').put(newRecord({ personId: id, publicationId: next.id, item: r.item, doneDate: r.doneDate, lessonRecordId: null, carriedFrom: curPub.id }));
        }
      }
    });
    toast(`教材を${next.name}にしました${carry ? '（進み具合を引き継ぎました）' : ''}`);
    openPanels.delete('material');
    refresh();
  }

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
      case 'toggle-item': {
        const item = b.dataset.item;
        const recs = progressOf(curPub.id).filter((r) => r.item === item);
        if (recs.length) await write(['lessonProgress'], (s) => { for (const r of recs) s('lessonProgress').delete(r.id); });
        else await put('lessonProgress', newRecord({ personId: id, publicationId: curPub.id, item, doneDate: today, lessonRecordId: null, carriedFrom: null }));
        return refresh();
      }
      case 'bulk-done': {
        const upTo = el.querySelector('[name="bulkUpTo"]').value;
        const idx = items.findIndex((it) => it.id === upTo);
        const add = items.slice(0, idx + 1).filter((it) => !doneIds.has(it.id));
        if (!add.length) return toast('すでにすべて済です');
        if (!(await confirmDialog(`${items[idx].label}までの ${add.length}個を済にしますか？`, { ok: '済にする' }))) return undefined;
        await write(['lessonProgress'], (s) => {
          for (const it of add) s('lessonProgress').put(newRecord({ personId: id, publicationId: curPub.id, item: it.id, doneDate: today, lessonRecordId: null, carriedFrom: null }));
        });
        toast(`${add.length}個を済にしました`);
        return refresh();
      }
      case 'plan-done': {
        const pl = all.plans.find((x) => x.id === rid);
        await put('plans', { ...pl, done: true, doneAt: nowStamp() });
        toast('済みにしました');
        return refresh();
      }
      case 'plan-del':
        if (!(await confirmDialog('この予定を削除しますか？', { ok: '削除する', danger: true }))) return undefined;
        await remove('plans', rid);
        return refresh();
      case 'visit-del': {
        const linked = given.filter((g) => g.visitId === rid);
        if (!(await confirmDialog('この訪問の記録を削除しますか？', {
          ok: '削除する', danger: true, detail: linked.length ? 'このとき渡した出版物の記録も消えます。' : '',
        }))) return undefined;
        await write(['visits', 'visitPublications'], (s) => {
          s('visits').delete(rid);
          for (const g of linked) s('visitPublications').delete(g.id);
        });
        return refresh();
      }
      case 'given-del':
        if (!(await confirmDialog('この出版物の記録を削除しますか？', { ok: '削除する', danger: true }))) return undefined;
        await remove('visitPublications', rid);
        return refresh();
      case 'lesson-del': {
        const linked = all.lessonProgress.filter((r) => r.lessonRecordId === rid);
        if (!(await confirmDialog('このレッスンの記録を削除しますか？', {
          ok: '削除する', danger: true,
          detail: `月のレッスン件数も変わります。${linked.length ? 'この回で済にしたものも、済が外れます。' : ''}`,
        }))) return undefined;
        await write(['lessonRecords', 'lessonProgress'], (s) => {
          s('lessonRecords').delete(rid);
          for (const r of linked) s('lessonProgress').delete(r.id);
        });
        return refresh();
      }
      case 'sched-del':
        if (!(await confirmDialog('このレッスンの予定を削除しますか？', { ok: '削除する', danger: true }))) return undefined;
        await remove('lessonSchedules', rid);
        return refresh();
      case 'delete-person':
        if (!(await confirmDialog(`「${displayName(p)}」を削除しますか？`, {
          ok: '削除する', danger: true, detail: '訪問の履歴、予定、渡した出版物、レッスンの記録と進み具合もすべて消え、過去の月のレッスン件数も減ります。元に戻せません。',
        }))) return undefined;
        await deletePerson(id);
        toast('削除しました');
        location.replace('#/visits');
        return undefined;
      default:
        return undefined;
    }
  });
}
