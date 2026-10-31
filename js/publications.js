// 出版物と、聖書レッスンの教材・進み具合
// 出版物の名称は、利用者が設定で登録したものをそのまま表示する（別の表記を決め打ちしない）。

import { esc } from './ui.js';
import { sortKey } from './dates.js';

export function kindLabel(pub) {
  if (pub.kind === 'lesson') return pub.course === 'booklet' ? 'レッスン型（冊子）' : 'レッスン型（書籍）';
  if (pub.kind === 'yearNo') return '年＋No.';
  return '名称のみ';
}

// 教材としての使い方: 'lesson'（レッスンごとの済チェック）か 'memo'（メモだけ）
export function materialType(pub) {
  return pub?.kind === 'lesson' ? 'lesson' : 'memo';
}

export function sortPublications(list) {
  return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'ja'));
}

// 配布の入力で使う順: 使用中のものを、よく配るものほど上に（同じ回数なら並び順）
export function publicationsByUsage(pubs, visitPublications) {
  const count = new Map();
  for (const r of visitPublications) count.set(r.publicationId, (count.get(r.publicationId) || 0) + 1);
  return sortPublications(pubs.filter((p) => p.active)).sort((a, b) => (count.get(b.id) || 0) - (count.get(a.id) || 0));
}

// 配布の記録1件の表示（例「塔」2026年 No.3）
export function distributionLabel(pub, rec) {
  const name = pub ? pub.name : '（削除された出版物）';
  if (pub?.kind !== 'yearNo') return name;
  const parts = [rec.year ? `${rec.year}年` : '', rec.no ? `No.${rec.no}` : ''].filter(Boolean);
  return parts.length ? `${name} ${parts.join(' ')}` : name;
}

// ---- レッスン型の構成（data/lesson-courses.json） ----

let coursesPromise = null;
export function loadCourses() {
  coursesPromise ||= fetch('./data/lesson-courses.json')
    .then((res) => {
      if (!res.ok) throw new Error(`教材の構成を読み込めませんでした（${res.status}）`);
      return res.json();
    })
    .then((json) => json.courses)
    .catch((e) => {
      coursesPromise = null;
      throw e;
    });
  return coursesPromise;
}

const pad2 = (n) => String(n).padStart(2, '0');

// 構成の順に並んだチェック項目（レッスン L01〜、各セクションの復習 R1〜）
export function courseItems(course) {
  const items = [];
  for (const sec of course?.sections || []) {
    for (let n = sec.from; n <= sec.to; n++) {
      items.push({ id: `L${pad2(n)}`, label: `レッスン${pad2(n)}`, section: sec.no, review: false });
    }
    if (sec.review) items.push({ id: `R${sec.no}`, label: `セクション${sec.no}の復習`, section: sec.no, review: true });
  }
  return items;
}

export function itemLabel(items, id) {
  return items.find((i) => i.id === id)?.label || id;
}

// 進み具合のまとめ（「〜まで」は、最初から抜けずに済が続いているところまで）
export function progressSummary(items, doneIds) {
  let upTo = null;
  for (const it of items) {
    if (!doneIds.has(it.id)) break;
    upTo = it;
  }
  const furthest = items.reduce((last, it, i) => (doneIds.has(it.id) ? i : last), -1);
  const missing = items.slice(0, furthest + 1).filter((it) => !doneIds.has(it.id));
  return {
    total: items.length,
    doneCount: items.filter((it) => doneIds.has(it.id)).length,
    upTo,
    missing,
    next: items.find((it) => !doneIds.has(it.id)) || null,
  };
}

export function progressHeadline(sum) {
  const count = `${sum.total}個中${sum.doneCount}個`;
  if (!sum.doneCount) return `まだ始めていません（${count}）`;
  if (!sum.upTo) return `済は${count}`;
  const where = sum.upTo.section && !sum.upTo.review ? `セクション${sum.upTo.section}・${sum.upTo.label}` : sum.upTo.label;
  return sum.doneCount === sum.total ? `すべて済（${count}）` : `${where}まで済（${count}）`;
}

// 実施記録1件の「どこまで進んだか」（例「レッスン20のポイント3まで」）
export function recordReachText(items, rec) {
  if (!rec?.item) return '';
  const label = itemLabel(items, rec.item);
  return rec.point != null && rec.point !== '' ? `${label}のポイント${rec.point}まで` : label;
}

// 将来、構成ファイルに各レッスンのポイント数（points）を入れたときの、全ポイントに対する進み具合。
// ポイント数のデータがない間は null を返す。
export function pointProgress(course, items, doneIds, lastRecord) {
  const points = course?.points || {};
  if (!items.length || !items.every((it) => it.review || points[it.id])) return null;
  const total = items.reduce((s, it) => s + (it.review ? 0 : points[it.id]), 0);
  let done = items.reduce((s, it) => s + (!it.review && doneIds.has(it.id) ? points[it.id] : 0), 0);
  if (lastRecord?.item && !doneIds.has(lastRecord.item) && lastRecord.point) done += Number(lastRecord.point);
  return { total, done };
}

// ---- 教材 ----

// 使用中の教材（終わりの日がないもののうち、いちばん新しいもの）
export function currentMaterial(materials) {
  return materials
    .filter((m) => !m.endDate)
    .sort((a, b) => sortKey(b.startDate, '').localeCompare(sortKey(a.startDate, '')) || (b.createdAt || '').localeCompare(a.createdAt || ''))[0] || null;
}

// ---- 配布した出版物の入力部品（訪問の入力・カルテで使う） ----

export function pubPickerHtml(pubs, { legend = '配布した出版物（任意）' } = {}) {
  return `
    <fieldset class="field pub-picker">
      <legend>${legend}</legend>
      ${pubs.length ? `<div class="chips pub-chips">${pubs.map((p) =>
        `<button type="button" class="chip" data-add-pub="${esc(p.id)}">＋ ${esc(p.name)}</button>`).join('')}</div>`
        : '<p class="muted small">設定の「出版物」で登録すると、ここで選べます。</p>'}
      <div class="pub-rows"></div>
    </fieldset>`;
}

export function bindPubPicker(root, pubs) {
  const box = root.querySelector('.pub-picker');
  if (!box) return;
  const rows = box.querySelector('.pub-rows');
  box.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add-pub]');
    if (add) {
      const pub = pubs.find((p) => p.id === add.dataset.addPub);
      const row = document.createElement('div');
      row.className = 'pub-row';
      row.dataset.pub = pub.id;
      row.innerHTML = `
        <span class="pub-name">${esc(pub.name)}</span>
        ${pub.kind === 'yearNo' ? `
          <span class="pub-yn">
            <input type="number" class="pub-year" inputmode="numeric" min="1900" max="2100" value="${new Date().getFullYear()}" aria-label="年"><span>年</span>
            <span>No.</span><input type="number" class="pub-no" inputmode="numeric" min="1" aria-label="No.">
          </span>` : ''}
        <button type="button" class="chip-x" data-remove-pub aria-label="${esc(pub.name)}を取り消す">×</button>`;
      rows.append(row);
      row.querySelector('.pub-no')?.focus();
      return;
    }
    const del = e.target.closest('[data-remove-pub]');
    if (del) del.closest('.pub-row').remove();
  });
}

const intIn = (v, min, max) => {
  const n = Math.round(Number(v));
  return v !== '' && Number.isFinite(n) && n >= min && n <= max ? n : null;
};

// pos は入れた順（同じ時に保存したものを、入れた順に並べるため）
export function readPubPicker(root) {
  return [...root.querySelectorAll('.pub-row')].map((row, pos) => ({
    publicationId: row.dataset.pub,
    pos,
    year: intIn(row.querySelector('.pub-year')?.value ?? '', 1900, 2100),
    no: intIn(row.querySelector('.pub-no')?.value ?? '', 1, 9999),
  }));
}
