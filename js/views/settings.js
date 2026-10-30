// 設定: 区分、名前、色分けの基準、表示テーマ

import { getSettings, saveSettings, getMeta } from '../db.js';
import { formatDate } from '../dates.js';
import { USER_TYPES } from '../model.js';
import { setTitle, esc, toast, applyTheme } from '../ui.js';

const THEMES = [['auto', '端末に合わせる'], ['light', '明るい'], ['dark', '暗い']];

async function appVersion() {
  try {
    const key = (await caches.keys()).find((k) => k.startsWith('fd-note-v'));
    return key ? key.slice('fd-note-v'.length) : '';
  } catch {
    return '';
  }
}

export async function render(el) {
  setTitle('設定');
  const [s, lastBackup, version] = await Promise.all([getSettings(), getMeta('lastBackupAt'), appVersion()]);

  el.innerHTML = `
    <form class="card" data-form="settings" autocomplete="off">
      <h2>あなたの区分</h2>
      <div class="choice-list">
        ${Object.entries(USER_TYPES).map(([k, t]) => `
          <label class="choice">
            <input type="radio" name="userType" value="${k}" ${s.userType === k ? 'checked' : ''}>
            <span><strong>${t.label}</strong><small>${t.desc}</small></span>
          </label>`).join('')}
      </div>
      <label class="field"><span>名前（報告用の文章に入ります。空欄でもかまいません）</span>
        <input type="text" name="name" value="${esc(s.name)}"></label>

      <h2>表示</h2>
      <fieldset class="field"><legend>画面の明るさ</legend>
        <div class="segmented">
          ${THEMES.map(([v, l]) => `<label><input type="radio" name="theme" value="${v}" ${s.theme === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}
        </div>
      </fieldset>
      <label class="field"><span>「しばらく訪問していない」とする日数（地図のピンと一覧の色分け）</span>
        <span class="hm"><input type="number" name="staleDays" min="1" max="999" inputmode="numeric" value="${s.staleDays}"><span>日以上</span></span></label>
      <label class="field"><span>バックアップを促すまでの日数</span>
        <span class="hm"><input type="number" name="backupReminderDays" min="1" max="999" inputmode="numeric" value="${s.backupReminderDays}"><span>日</span></span></label>
    </form>

    <nav class="card link-list">
      <a href="#/report">月の報告 <span>›</span></a>
      <a href="#/backup">バックアップ（書き出し・読み込み）<small>${lastBackup ? `最終 ${formatDate(lastBackup.slice(0, 10))}` : 'まだありません'}</small><span>›</span></a>
      <a href="#/help">使い方・注意事項 <span>›</span></a>
    </nav>

    <p class="muted small center">野外奉仕記録 ${version ? `バージョン ${esc(version)}` : ''}<br>データはこの端末の中にだけ保存されます。</p>`;

  const form = el.querySelector('form');
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('change', async () => {
    const fd = new FormData(form);
    const num = (name, fallback) => {
      const n = Math.round(Number(fd.get(name)));
      return n >= 1 && n <= 999 ? n : fallback;
    };
    const next = await saveSettings({
      userType: USER_TYPES[fd.get('userType')] ? fd.get('userType') : null,
      name: String(fd.get('name') || '').trim(),
      theme: String(fd.get('theme') || 'auto'),
      staleDays: num('staleDays', s.staleDays),
      backupReminderDays: num('backupReminderDays', s.backupReminderDays),
    });
    applyTheme(next.theme);
    toast('保存しました');
  });
}
