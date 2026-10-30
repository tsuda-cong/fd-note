// バックアップ: 書き出し（共有シート／ダウンロード）と読み込み

import { getMeta, getSettings } from '../db.js';
import { formatDate, daysBetween, todayStr } from '../dates.js';
import { buildBackupFile, markBackedUp, parseBackup, restoreBackup, countRecords } from '../backup.js';
import { setTitle, toast, choose, confirmDialog, refresh, applyTheme } from '../ui.js';

function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function render(el) {
  setTitle('バックアップ', '#/settings');
  const lastBackup = await getMeta('lastBackupAt');
  // iPhone では、ボタンを押してから共有シートを開くまでに待ち時間があると失敗するため、先に用意しておく
  const backup = await buildBackupFile();
  const blob = new Blob([backup.json], { type: 'application/json' });
  const file = new File([blob], backup.name, { type: 'application/json' });
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
  const total = backup.counts.reduce((s, c) => s + c.count, 0);

  el.innerHTML = `
    <section class="card">
      <h2>書き出し</h2>
      <p>最後のバックアップ：<strong>${lastBackup ? `${formatDate(lastBackup.slice(0, 10))}（${daysBetween(lastBackup.slice(0, 10), todayStr())}日前）` : 'まだありません'}</strong></p>
      <p class="muted small">全データを1つのファイル（JSON形式）にまとめます。いま ${total}件の記録があります。</p>
      ${canShare ? `
        <button type="button" class="btn btn-primary btn-block btn-big" data-action="share">書き出す（共有シート）</button>
        <p class="muted small">iPhone：共有シートで「"ファイル"に保存」を選びます。</p>
        <button type="button" class="btn btn-block" data-action="download">ファイルとしてダウンロード</button>`
      : `
        <button type="button" class="btn btn-primary btn-block btn-big" data-action="download">書き出す（ダウンロード）</button>
        <p class="muted small">Android：「ダウンロード」フォルダに保存されます。</p>`}
      <p class="muted small">ファイルには訪問先の住所や名前が入っています。人に送ったり、共有の場所に置いたりしないでください。</p>
    </section>

    <section class="card">
      <h2>読み込み</h2>
      <p class="muted small">書き出したファイルからデータを戻します。機種変更のときにも使います。</p>
      <label class="btn btn-block btn-big file-btn">
        ファイルを選ぶ
        <input type="file" accept=".json,application/json" hidden>
      </label>
    </section>`;

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    if (b.dataset.action === 'share') {
      try {
        await navigator.share({ files: [file], title: '野外奉仕記録のバックアップ' });
        await markBackedUp();
        toast('書き出しました');
        refresh();
      } catch (err) {
        if (err.name === 'AbortError') toast('書き出しを取りやめました');
        else toast('共有シートを開けませんでした。「ファイルとしてダウンロード」を使ってください');
      }
    } else if (b.dataset.action === 'download') {
      download(backup.name, blob);
      await markBackedUp();
      toast('書き出しました');
      setTimeout(refresh, 800);
    }
  });

  el.querySelector('input[type="file"]').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    let parsed;
    try {
      parsed = parseBackup(await f.text());
    } catch (err) {
      await choose(err.message, [{ label: '閉じる', value: null }]);
      return;
    }
    const lines = countRecords(parsed.data).filter((c) => c.count).map((c) => `${c.label} ${c.count}件`);
    const mode = await choose('このファイルを読み込みます。今のデータをどうしますか？', [
      { label: '今のデータに追加する', value: 'merge', cls: 'btn-primary' },
      { label: '今のデータを消して置き換える', value: 'replace', cls: 'btn-danger' },
      { label: 'やめる', value: null },
    ], {
      detail: `${parsed.exportedAt ? `書き出した日：${formatDate(parsed.exportedAt.slice(0, 10))}\n` : ''}中身：${lines.join('、') || '記録なし'}\n\n「追加」では、同じ記録は1つにまとめます。設定は今のままです（町名リストだけは、ファイルの町名も足します）。`,
    });
    if (!mode) return;
    if (mode === 'replace' && !(await confirmDialog('今のデータをすべて消して、ファイルの内容に置き換えます。よろしいですか？', {
      ok: '置き換える', danger: true, detail: '元に戻せません。心配なときは、先に今のデータを書き出してください。',
    }))) return;
    try {
      await restoreBackup(parsed.data, mode);
    } catch (err) {
      await choose(`読み込めませんでした：${err.message}`, [{ label: '閉じる', value: null }]);
      return;
    }
    applyTheme((await getSettings()).theme);
    toast(mode === 'replace' ? '置き換えました' : '追加しました');
    location.hash = '#/';
  });
}
