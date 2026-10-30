// ホーム: 今日・明日の予定、過ぎた予定、今月の速報、バックアップの催促

import { loadAll, getSettings, getMeta } from '../db.js';
import { todayStr, addDays, weekdayOf, formatDate, formatDateTime, daysBetween, currentYm, formatYm, sortKey } from '../dates.js';
import { summarizePeople, displayName, fullAddress, typeInfo } from '../model.js';
import { monthSummary, formatMinutes } from '../calc.js';
import { setTitle, esc } from '../ui.js';

function itemsFor(date, all, byId) {
  const items = [];
  for (const p of all.plans) {
    if (p.done || p.date !== date) continue;
    const person = byId.get(p.personId);
    if (person) items.push({ kind: 'visit', time: p.time, person, memo: p.memo });
  }
  const wd = weekdayOf(date);
  for (const s of all.lessonSchedules) {
    if (s.weekday !== wd) continue;
    const person = byId.get(s.personId);
    if (person?.isStudent) {
      items.push({ kind: 'lesson', time: s.time, person, done: person.lessons.some((l) => l.date === date) });
    }
  }
  return items.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
}

function itemHtml(it) {
  const tag = it.kind === 'lesson'
    ? '<span class="tag tag-lesson">レッスン</span>'
    : '<span class="tag tag-visit">訪問</span>';
  const sub = [it.memo, fullAddress(it.person)].filter(Boolean).join(' ／ ');
  return `
    <a class="list-item" href="#/person/${esc(it.person.id)}">
      ${tag}
      <div class="li-main">
        <div class="li-title">${it.time ? `<span class="time">${esc(it.time)}</span>` : ''}${esc(displayName(it.person))}</div>
        ${sub ? `<div class="li-sub">${esc(sub)}</div>` : ''}
      </div>
      ${it.done ? '<span class="badge ok">記録済み</span>' : ''}
    </a>`;
}

function dayBlock(label, date, items) {
  return `
    <section class="card">
      <h2>${label}の予定 <small>${formatDate(date)}</small></h2>
      ${items.length ? `<div class="list">${items.map(itemHtml).join('')}</div>` : '<p class="muted">予定はありません</p>'}
    </section>`;
}

export async function render(el) {
  setTitle('野外奉仕記録');
  const [all, settings, lastBackup] = await Promise.all([loadAll(), getSettings(), getMeta('lastBackupAt')]);
  const today = todayStr();
  const people = summarizePeople(all, settings, today);
  const byId = new Map(people.map((p) => [p.id, p]));
  const info = typeInfo(settings.userType);
  const parts = [];

  if (!settings.userType) {
    parts.push(`
      <section class="card notice">
        <h2>はじめに</h2>
        <p>設定で、あなたの区分（伝道者・補助開拓者・正規開拓者）を選んでください。区分に合わせて入力できる項目が変わります。</p>
        <a class="btn btn-primary btn-block" href="#/settings">設定を開く</a>
        <a class="btn btn-block" href="#/help">使い方を見る</a>
      </section>`);
  }

  const hasData = all.people.length || all.serviceTimes.length || all.otherTimes.length;
  if (hasData) {
    const days = lastBackup ? daysBetween(lastBackup.slice(0, 10), today) : null;
    if (days === null || days >= settings.backupReminderDays) {
      parts.push(`
        <section class="card warn">
          <p><strong>${days === null ? 'まだバックアップしていません。' : `最後のバックアップから${days}日たっています。`}</strong></p>
          <p>端末の故障や機種変更、データの消去に備えて、書き出しておきましょう。</p>
          <a class="btn btn-primary btn-block" href="#/backup">バックアップする</a>
        </section>`);
    }
  }

  parts.push(dayBlock('今日', today, itemsFor(today, all, byId)));
  parts.push(dayBlock('明日', addDays(today, 1), itemsFor(addDays(today, 1), all, byId)));

  const overdue = all.plans
    .filter((p) => !p.done && p.date < today && byId.has(p.personId))
    .sort((a, b) => sortKey(a.date, a.time).localeCompare(sortKey(b.date, b.time)));
  if (overdue.length) {
    parts.push(`
      <section class="card">
        <h2>過ぎた予定 <small>まだ「済み」になっていないもの</small></h2>
        <div class="list">
          ${overdue.map((p) => `
            <a class="list-item" href="#/person/${esc(p.personId)}">
              <span class="tag tag-late">${esc(formatDateTime(p.date, p.time))}</span>
              <div class="li-main">
                <div class="li-title">${esc(displayName(byId.get(p.personId)))}</div>
                ${p.memo ? `<div class="li-sub">${esc(p.memo)}</div>` : ''}
              </div>
            </a>`).join('')}
        </div>
      </section>`);
  }

  const ym = currentYm();
  const sum = monthSummary(ym, all);
  parts.push(`
    <section class="card">
      <h2>${formatYm(ym)}のようす</h2>
      <div class="stats">
        ${info.hours ? `
          <div class="stat"><span class="stat-label">奉仕時間（繰り越し込み）</span>
            <span class="stat-value">${formatMinutes(sum.total)}</span></div>` : ''}
        <div class="stat"><span class="stat-label">聖書レッスン</span>
          <span class="stat-value">${sum.lessonCount}<small>件</small></span></div>
      </div>
      <a class="btn btn-block" href="#/report?ym=${ym}">月の報告を見る</a>
    </section>`);

  parts.push(`
    <div class="btn-row">
      <a class="btn btn-primary btn-big" href="#/visit/new">＋ 新しい訪問</a>
      ${info.hours ? '<a class="btn btn-primary btn-big" href="#/record">＋ 時間を記録</a>' : ''}
    </div>`);

  el.innerHTML = parts.join('');
}
