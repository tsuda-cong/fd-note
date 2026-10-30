// 月の報告: 一目で見られて、コピーしやすい形にまとめる

import { loadAll, getSettings } from '../db.js';
import { currentYm, isYm, addMonths, formatYm } from '../dates.js';
import { typeInfo, displayName } from '../model.js';
import { monthSummary, formatMinutes } from '../calc.js';
import { setTitle, esc, toast, copyText } from '../ui.js';

function reportText(ym, sum, info, settings) {
  const lines = [`【${formatYm(ym)}の奉仕報告】`];
  if (settings.name.trim()) lines.push(`名前：${settings.name.trim()}`);
  if (info.hours) lines.push(`奉仕時間：${sum.reportHours}時間`);
  lines.push(`聖書レッスン：${sum.lessonCount}件`);
  if (info.other && sum.otherHours) {
    lines.push(`野外奉仕以外の時間：${sum.otherHours}時間（${sum.otherByTitle.map((o) => `${o.title} ${o.hours}時間`).join('、')}）`);
  }
  if (info.hours && (sum.carryIn || sum.carryOut)) {
    lines.push(`（前月からの繰り越し ${sum.carryIn}分／翌月への繰り越し ${sum.carryOut}分）`);
  }
  return lines.join('\n');
}

export async function render(el, { query }) {
  const ym = isYm(query.get('ym')) ? query.get('ym') : currentYm();
  setTitle('月の報告', `#/record?ym=${ym}`);
  const [all, settings] = await Promise.all([loadAll(), getSettings()]);
  const info = typeInfo(settings.userType);
  const sum = monthSummary(ym, all);
  const names = new Map(all.people.map((p) => [p.id, displayName(p)]));
  const text = reportText(ym, sum, info, settings);
  const inProgress = ym === currentYm();

  el.innerHTML = `
    <div class="month-nav">
      <a class="btn" href="#/report?ym=${addMonths(ym, -1)}" aria-label="前の月">‹</a>
      <strong>${formatYm(ym)}${inProgress ? '<small>（月の途中）</small>' : ''}</strong>
      <a class="btn" href="#/report?ym=${addMonths(ym, 1)}" aria-label="次の月">›</a>
    </div>

    ${info.hours ? `
    <section class="card report-card">
      <h2>奉仕時間</h2>
      <div class="big-number">${sum.reportHours}<small>時間</small></div>
      <table class="calc">
        <tr><th>この月の記録</th><td>${formatMinutes(sum.monthMinutes)}</td></tr>
        <tr><th>前月からの繰り越し</th><td>＋ ${sum.carryIn}分</td></tr>
        <tr class="sum"><th>合計</th><td>${formatMinutes(sum.total)}</td></tr>
        <tr class="carry"><th>翌月へ繰り越し</th><td>${sum.carryOut}分</td></tr>
      </table>
      <p class="muted small">1時間に満たない分は翌月に繰り越します。</p>
    </section>` : ''}

    <section class="card report-card">
      <h2>聖書レッスン</h2>
      <div class="big-number">${sum.lessonCount}<small>件</small></div>
      ${sum.lessonPersonIds.length
        ? `<p class="muted small">この月にレッスンを行った人：${sum.lessonPersonIds.map((id) => esc(names.get(id) || '（削除済み）')).join('、')}</p>`
        : '<p class="muted small">訪問先のカルテで「レッスンを記録」すると、ここに数えられます。</p>'}
    </section>

    ${info.other ? `
    <section class="card report-card">
      <h2>野外奉仕以外の時間</h2>
      <div class="big-number">${sum.otherHours}<small>時間</small></div>
      ${sum.otherByTitle.length ? `<table class="calc">${sum.otherByTitle.map((o) =>
        `<tr><th>${esc(o.title)}</th><td>${o.hours}時間</td></tr>`).join('')}</table>` : ''}
      <p class="muted small">野外奉仕の時間には足していません。</p>
    </section>` : ''}

    <section class="card">
      <h2>報告用の文章</h2>
      <pre class="report-text">${esc(text)}</pre>
      <button type="button" class="btn btn-primary btn-block btn-big" data-action="copy">コピーする</button>
    </section>`;

  el.querySelector('[data-action="copy"]').addEventListener('click', async () => {
    toast((await copyText(text)) ? 'コピーしました' : 'コピーできませんでした。文章を長押しして選んでください');
  });
}
