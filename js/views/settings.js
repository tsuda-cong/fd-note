// 設定: 区分、名前、住所の初期値、色分けの基準、表示テーマ

import { getSettings, saveSettings, getMeta } from '../db.js';
import { formatDate } from '../dates.js';
import { USER_TYPES } from '../model.js';
import { setTitle, esc, toast, applyTheme, refresh } from '../ui.js';
import { loadMunicipalities, loadLastPlace, addressFieldsHtml, bindAddressFields, readAddressFields } from '../address.js';

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

    <section class="card default-place-card">
      <h2>住所の初期値</h2>
      <p class="muted small">新しい訪問を入れるとき、最初から選んでおく都道府県・市区町村です。決めていないときは、前回選んだものが選ばれます。</p>
      <p>いまの初期値：<strong>${s.defaultPlace ? `${esc(s.defaultPlace.pref)}${esc(s.defaultPlace.city)}` : '指定なし（前回選んだもの）'}</strong></p>
      <div class="default-place-set"></div>
      ${s.defaultPlace ? '<button type="button" class="btn btn-block btn-ghost-danger" data-action="default-clear">初期値の指定をやめる</button>' : ''}
    </section>

    <nav class="card link-list">
      <a href="#/report">月の報告 <span>›</span></a>
      <a href="#/publications">出版物（配布の記録・レッスンの教材）<span>›</span></a>
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

  // 住所の初期値: 都道府県 → 市区町村を選んで決める
  const defCard = el.querySelector('.default-place-card');
  defCard.querySelector('[data-action="default-clear"]')?.addEventListener('click', async () => {
    await saveSettings({ defaultPlace: null });
    toast('初期値の指定をやめました');
    refresh();
  });
  loadMunicipalities().then((muni) => {
    const cur = s.defaultPlace || loadLastPlace() || { pref: '', city: '' };
    defCard.querySelector('.default-place-set').innerHTML = `
      ${addressFieldsHtml(muni, cur, { label: '初期値にする市区町村', detail: false })}
      <button type="button" class="btn btn-block" data-action="default-set">この市区町村を初期値にする</button>`;
    bindAddressFields(defCard, muni);
    defCard.querySelector('[data-action="default-set"]').addEventListener('click', async () => {
      const { pref, city } = readAddressFields(defCard);
      if (!pref || !city) return toast('都道府県と市区町村を選んでください');
      await saveSettings({ defaultPlace: { pref, city } });
      toast(`${pref}${city}を初期値にしました`);
      refresh();
    });
  }).catch((e) => {
    defCard.querySelector('.default-place-set').innerHTML = `<p class="muted small">${esc(e.message)}</p>`;
  });
}
