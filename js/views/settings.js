// 設定: 区分、名前、よく使う市区町村、色分けの基準、表示テーマ

import { getSettings, saveSettings, getMeta } from '../db.js';
import { formatDate } from '../dates.js';
import { USER_TYPES } from '../model.js';
import { setTitle, esc, toast, applyTheme, copyText, loadScript, refresh } from '../ui.js';
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
  // 公開している場所の URL（決め打ちにせず、いま開いている場所から求める）
  const appUrl = new URL('./', location.href).href;

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

    <section class="card fav-card">
      <h2>よく使う市区町村</h2>
      <p class="muted small">登録すると、訪問の住所を入れるときに一番上に出て、1回押すだけで選べます。</p>
      ${s.favoriteCities.length ? `<div class="chips">${s.favoriteCities.map((f, i) => `
        <span class="chip on">${esc(f.pref)}${esc(f.city)}
          <button type="button" class="chip-x" data-action="fav-del" data-i="${i}" aria-label="${esc(f.city)}を外す">×</button></span>`).join('')}</div>`
        : '<p class="muted small">まだ登録していません。</p>'}
      <div class="fav-add"></div>
    </section>

    <nav class="card link-list">
      <a href="#/report">月の報告 <span>›</span></a>
      <a href="#/backup">バックアップ（書き出し・読み込み）<small>${lastBackup ? `最終 ${formatDate(lastBackup.slice(0, 10))}` : 'まだありません'}</small><span>›</span></a>
      <a href="#/help">使い方・注意事項 <span>›</span></a>
    </nav>

    <section class="card">
      <h2>このアプリを人に教える</h2>
      <p class="muted small">相手のスマホのカメラでこの QR コードを読み取ってもらうと、このアプリのページが開きます。伝わるのはアプリの URL だけで、あなたの記録は渡りません。</p>
      <div class="qr" role="img" aria-label="このアプリの URL の QR コード"></div>
      <p class="qr-url">${esc(appUrl)}</p>
      <button type="button" class="btn btn-block" data-action="copy-url">URL をコピー</button>
    </section>

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

  // よく使う市区町村: 都道府県 → 市区町村を選んで追加する
  const favCard = el.querySelector('.fav-card');
  favCard.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-action="fav-del"]');
    if (!b) return;
    await saveSettings({ favoriteCities: s.favoriteCities.filter((_, i) => i !== Number(b.dataset.i)) });
    toast('外しました');
    refresh();
  });
  loadMunicipalities().then((muni) => {
    const last = loadLastPlace();
    favCard.querySelector('.fav-add').innerHTML = `
      ${addressFieldsHtml(muni, { pref: last?.pref || '', city: '' }, [], { label: '追加する市区町村' })}
      <button type="button" class="btn btn-block" data-action="fav-add">追加する</button>`;
    // 町名以下の欄はここでは使わない
    favCard.querySelector('[name="address"]').hidden = true;
    bindAddressFields(favCard, muni);
    favCard.querySelector('[data-action="fav-add"]').addEventListener('click', async () => {
      const { pref, city } = readAddressFields(favCard);
      if (!pref || !city) return toast('都道府県と市区町村を選んでください');
      if (s.favoriteCities.some((f) => f.pref === pref && f.city === city)) return toast('すでに登録しています');
      await saveSettings({ favoriteCities: [...s.favoriteCities, { pref, city }] });
      toast(`${city}を登録しました`);
      refresh();
    });
  }).catch((e) => {
    favCard.querySelector('.fav-add').innerHTML = `<p class="muted small">${esc(e.message)}</p>`;
  });

  el.querySelector('[data-action="copy-url"]').addEventListener('click', async () => {
    toast((await copyText(appUrl)) ? 'URL をコピーしました' : 'コピーできませんでした');
  });

  const qrBox = el.querySelector('.qr');
  try {
    const qrcode = await loadScript('./vendor/qrcode-generator/qrcode.js', 'qrcode');
    const qr = qrcode(0, 'M');
    qr.addData(appUrl);
    qr.make();
    qrBox.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
  } catch {
    qrBox.innerHTML = '<p class="muted small">QR コードを表示できませんでした。上の URL を伝えてください。</p>';
  }
}
