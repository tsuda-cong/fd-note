// 画面まわりの共通部品

import { todayStr, nowTimeStr } from './dates.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// 利用者が入力した文字は必ずこれを通してから HTML に入れる
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

export function escLines(v) {
  return esc(v).replace(/\n/g, '<br>');
}

export function setTitle(text, backHref = null) {
  document.getElementById('title').textContent = text;
  document.title = text === '野外奉仕記録' ? text : `${text} - 野外奉仕記録`;
  const back = document.getElementById('back');
  back.hidden = !backHref;
  back.dataset.href = backHref || '';
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// 選択肢を出して選ばれた value を返す（閉じたら null）
export function choose(message, options, { detail = '' } = {}) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <p class="modal-msg">${esc(message)}</p>
        ${detail ? `<p class="modal-detail">${esc(detail)}</p>` : ''}
        <div class="modal-actions">
          ${options.map((o, i) => `<button type="button" class="btn btn-block ${o.cls || ''}" data-i="${i}">${esc(o.label)}</button>`).join('')}
        </div>
      </div>`;
    const close = (v) => {
      back.remove();
      resolve(v);
    };
    back.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-i]');
      if (b) close(options[Number(b.dataset.i)].value);
      else if (e.target === back) close(null);
    });
    document.body.append(back);
    back.querySelector('button').focus();
  });
}

export async function confirmDialog(message, { ok = 'OK', danger = false, detail = '' } = {}) {
  const v = await choose(message, [
    { label: ok, value: true, cls: danger ? 'btn-danger' : 'btn-primary' },
    { label: 'キャンセル', value: false },
  ], { detail });
  return v === true;
}

// 表示中の画面を描き直す（app.js が登録する）
let refresher = () => {};
export function setRefresher(fn) {
  refresher = fn;
}
export function refresh() {
  return refresher({ keepScroll: true });
}

const THEME_COLORS = { light: '#0b5d8f', dark: '#14181d' };
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    const own = meta.media.includes('dark') ? 'dark' : 'light';
    meta.content = THEME_COLORS[theme in THEME_COLORS ? theme : own];
  }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.className = 'offscreen';
    document.body.append(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* 古い端末 */ }
    ta.remove();
    return ok;
  }
}

// 同梱のライブラリ（vendor/ の通常スクリプト）を必要になったときに読み込み、作られた global を返す
const scriptLoads = new Map();
export function loadScript(src, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (!scriptLoads.has(src)) {
    scriptLoads.set(src, new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve(window[globalName]);
      s.onerror = () => {
        scriptLoads.delete(src);
        reject(new Error('部品を読み込めませんでした'));
      };
      document.head.append(s);
    }));
  }
  return scriptLoads.get(src);
}

// 日付と時刻の入力欄（2つ並び）
export function dateTimeFields({ date = todayStr(), time = nowTimeStr(), dateName = 'date', timeName = 'time',
  dateLabel = '日付', timeLabel = '時刻', required = true } = {}) {
  return `
    <div class="row2">
      <label class="field"><span>${dateLabel}</span>
        <input type="date" name="${dateName}" value="${esc(date)}" ${required ? 'required' : ''}></label>
      <label class="field"><span>${timeLabel}</span>
        <input type="time" name="${timeName}" value="${esc(time)}"></label>
    </div>`;
}

export function options(list, selected) {
  return list.map(([value, label]) =>
    `<option value="${esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`).join('');
}
