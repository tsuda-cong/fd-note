// バックアップ: 書き出し（共有シート／ダウンロード。パスワードを付けることもできる）と読み込み

import { getMeta, getSettings } from '../db.js';
import { formatDate, daysBetween, todayStr } from '../dates.js';
import {
  buildBackupFile, markBackedUp, parseBackup, restoreBackup, countRecords,
  canEncrypt, encryptBackup, isEncryptedBackup, decryptBackup,
} from '../backup.js';
import { setTitle, toast, choose, confirmDialog, askPassword, refresh, applyTheme } from '../ui.js';

const MIN_PASSWORD = 8;

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

function makeFile(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  return { name, blob, file: new File([blob], name, { type: 'application/json' }) };
}

export async function render(el) {
  setTitle('バックアップ', '#/settings');
  const lastBackup = await getMeta('lastBackupAt');
  // iPhone では、ボタンを押してから共有シートを開くまでに待ち時間があると失敗するため、先に用意しておく。
  // パスワードを付けるときも、「準備する」で先に暗号化してから「書き出す」を押してもらう。
  const backup = await buildBackupFile();
  const plain = makeFile(backup.name, backup.json);
  let current = plain;
  let locked = false;
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [plain.file] }));
  const total = backup.counts.reduce((s, c) => s + c.count, 0);

  el.innerHTML = `
    <section class="card">
      <h2>書き出し</h2>
      <p>最後のバックアップ：<strong>${lastBackup ? `${formatDate(lastBackup.slice(0, 10))}（${daysBetween(lastBackup.slice(0, 10), todayStr())}日前）` : 'まだありません'}</strong></p>
      <p class="muted small">全データを1つのファイル（JSON形式）にまとめます。いま ${total}件の記録があります。</p>

      ${canEncrypt() ? `
      <fieldset class="field pw-box">
        <legend>パスワード（任意）</legend>
        <p class="muted small">入れると、ファイルの中身が暗号化され、このアプリでパスワードを入れないと読めなくなります。空欄のままなら、パスワードなしで書き出します。</p>
        <input type="password" name="pw1" autocomplete="off" placeholder="${MIN_PASSWORD}文字以上" aria-label="パスワード">
        <input type="password" name="pw2" autocomplete="off" placeholder="確認のため、もう一度" aria-label="パスワード（確認）">
        <label class="check"><input type="checkbox" name="pwShow"><span>入力した文字を表示する</span></label>
        <p class="note small pw-warn" hidden>パスワードを忘れると、このファイルは誰にも戻せません。紙に書いて大事な場所に置くなど、忘れない工夫をしてください。</p>
        <button type="button" class="btn btn-block" data-action="prepare" hidden>パスワードを付けて準備する</button>
        <p class="pw-status small" role="status"></p>
      </fieldset>` : ''}

      ${canShare ? `
        <button type="button" class="btn btn-primary btn-block btn-big" data-action="share">書き出す（共有シート）</button>
        <p class="muted small">iPhone：共有シートで「"ファイル"に保存」を選びます。</p>
        <button type="button" class="btn btn-block" data-action="download">ファイルとしてダウンロード</button>`
      : `
        <button type="button" class="btn btn-primary btn-block btn-big" data-action="download">書き出す（ダウンロード）</button>
        <p class="muted small">Android：「ダウンロード」フォルダに保存されます。</p>`}
      <p class="muted small">パスワードなしのファイルは、メモ帳などでも中身（訪問先の住所や名前）が読めます。人に送ったり、共有の場所に置いたりしないでください。</p>
    </section>

    <section class="card">
      <h2>読み込み</h2>
      <p class="muted small">書き出したファイルからデータを戻します。機種変更のときにも使います。パスワード付きのファイルは、読み込むときにパスワードを聞きます。</p>
      <label class="btn btn-block btn-big file-btn">
        ファイルを選ぶ
        <input type="file" accept=".json,application/json" hidden>
      </label>
    </section>`;

  const exportButtons = [...el.querySelectorAll('[data-action="share"], [data-action="download"]')];
  const pw1 = el.querySelector('[name="pw1"]');
  const pw2 = el.querySelector('[name="pw2"]');
  const status = el.querySelector('.pw-status');
  const prepareBtn = el.querySelector('[data-action="prepare"]');
  const warn = el.querySelector('.pw-warn');
  const labels = new Map(exportButtons.map((b) => [b, b.textContent]));

  const setExportReady = (ready, lockedFile) => {
    for (const b of exportButtons) {
      b.disabled = !ready;
      const label = labels.get(b);
      const lockedLabel = label.startsWith('書き出す') ? `パスワード付きで${label}` : `パスワード付き${label}`;
      b.textContent = lockedFile && ready ? lockedLabel : label;
    }
  };

  // パスワード欄を変えたら、前に準備した暗号化ファイルは使わない
  const onPasswordInput = () => {
    const typed = pw1.value || pw2.value;
    current = plain;
    locked = false;
    prepareBtn.hidden = !typed;
    warn.hidden = !typed;
    status.textContent = typed ? '「パスワードを付けて準備する」を押してから、書き出してください。' : '';
    setExportReady(!typed, false);
  };
  pw1?.addEventListener('input', onPasswordInput);
  pw2?.addEventListener('input', onPasswordInput);
  el.querySelector('[name="pwShow"]')?.addEventListener('change', (e) => {
    pw1.type = pw2.type = e.target.checked ? 'text' : 'password';
  });

  prepareBtn?.addEventListener('click', async () => {
    if (pw1.value.length < MIN_PASSWORD) return toast(`パスワードは${MIN_PASSWORD}文字以上にしてください`);
    if (pw1.value !== pw2.value) return toast('2つのパスワードが同じではありません');
    prepareBtn.disabled = true;
    status.textContent = '暗号化しています…';
    try {
      const text = await encryptBackup(backup.json, pw1.value);
      current = makeFile(backup.name.replace(/\.json$/, '-pw.json'), text);
      locked = true;
      status.textContent = '準備できました。下の「書き出す」を押してください。';
      setExportReady(true, true);
    } catch (err) {
      status.textContent = `暗号化できませんでした：${err.message}`;
    } finally {
      prepareBtn.disabled = false;
    }
    return undefined;
  });

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-action="share"], [data-action="download"]');
    if (!b) return;
    const done = locked ? '書き出しました（パスワード付き）' : '書き出しました';
    if (b.dataset.action === 'share') {
      try {
        await navigator.share({ files: [current.file], title: '野外奉仕記録のバックアップ' });
        await markBackedUp();
        toast(done);
        refresh();
      } catch (err) {
        if (err.name === 'AbortError') toast('書き出しを取りやめました');
        else toast('共有シートを開けませんでした。「ファイルとしてダウンロード」を使ってください');
      }
    } else {
      download(current.name, current.blob);
      await markBackedUp();
      toast(done);
      setTimeout(refresh, 800);
    }
  });

  el.querySelector('input[type="file"]').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    let text = await f.text();
    if (isEncryptedBackup(text)) {
      if (!canEncrypt()) {
        await choose('この端末ではパスワード付きのファイルを開けません。', [{ label: '閉じる', value: null }]);
        return;
      }
      let detail = '書き出したときに決めたパスワードを入れてください。';
      for (;;) {
        const pw = await askPassword('このファイルにはパスワードが付いています。', { detail, ok: '開く' });
        if (pw === null) return;
        try {
          text = await decryptBackup(text, pw);
          break;
        } catch (err) {
          detail = err.message;
        }
      }
    }
    let parsed;
    try {
      parsed = parseBackup(text);
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
      detail: `${parsed.exportedAt ? `書き出した日：${formatDate(parsed.exportedAt.slice(0, 10))}\n` : ''}中身：${lines.join('、') || '記録なし'}\n\n「追加」では、同じ記録は1つにまとめます。設定は今のままです（よく使う市区町村だけは、ファイルの分も足します）。出版物は、手元にあるものの名称などはそのままにして、ないものだけ足します。`,
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
