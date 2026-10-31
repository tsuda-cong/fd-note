// 出版物の管理（設定）: 追加・名称の変更・並べ替え・使用中かどうか
// 削除はしない（過去の配布記録や教材の履歴から名称を引けるようにするため）。使わないものは「使用中」を外して隠す。

import { getAll, put, write, newRecord } from '../db.js';
import { nowStamp } from '../dates.js';
import { sortPublications, kindLabel } from '../publications.js';
import { setTitle, esc, toast, refresh } from '../ui.js';

function rowHtml(p, i, last) {
  return `
    <div class="list-item pub-item ${p.active ? '' : 'inactive'}">
      <div class="li-main">
        <div class="li-title">${esc(p.name)}
          ${p.isMaterial ? '<span class="badge student">教材</span>' : ''}
          ${p.active ? '' : '<span class="badge">非表示</span>'}</div>
        <div class="li-sub">${kindLabel(p)}</div>
        <details class="form-toggle pub-edit">
          <summary class="link-btn">編集</summary>
          <form data-form="edit" data-id="${esc(p.id)}">
            <label class="field"><span>名称</span><input type="text" name="name" value="${esc(p.name)}" required autocomplete="off"></label>
            ${p.kind === 'nameOnly' ? `<label class="check"><input type="checkbox" name="isMaterial" ${p.isMaterial ? 'checked' : ''}><span>聖書レッスンの教材として使う</span></label>` : ''}
            <label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}><span>使用中（外すと選択肢に出なくなります）</span></label>
            <button class="btn btn-primary btn-block">保存する</button>
          </form>
        </details>
      </div>
      <div class="li-actions updown">
        <button type="button" class="btn btn-small" data-move="-1" data-id="${esc(p.id)}" ${i === 0 ? 'disabled' : ''} aria-label="上へ">▲</button>
        <button type="button" class="btn btn-small" data-move="1" data-id="${esc(p.id)}" ${i === last ? 'disabled' : ''} aria-label="下へ">▼</button>
      </div>
    </div>`;
}

export async function render(el) {
  setTitle('出版物', '#/settings');
  const pubs = sortPublications(await getAll('publications'));

  el.innerHTML = `
    <section class="card">
      <h2>出版物のリスト</h2>
      <p class="muted small">訪問で配布した出版物と、聖書レッスンの教材に使います。並び順は▲▼で変えられます。使わなくなったものは、編集で「使用中」を外すと選択肢に出なくなります（これまでの記録には名称が残ります）。</p>
      <div class="list">${pubs.map((p, i) => rowHtml(p, i, pubs.length - 1)).join('')}</div>
    </section>

    <form class="card" data-form="add" autocomplete="off">
      <h2>出版物を追加</h2>
      <label class="field"><span>名称</span><input type="text" name="name" required></label>
      <label class="check"><input type="checkbox" name="isMaterial"><span>聖書レッスンの教材として使う（進み具合はメモで記録します）</span></label>
      <button class="btn btn-primary btn-block">追加する</button>
    </form>`;

  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const fd = new FormData(f);
    const name = String(fd.get('name') || '').trim();
    if (!name) return toast('名称を入れてください');
    if (f.dataset.form === 'add') {
      const order = pubs.reduce((m, p) => Math.max(m, p.order ?? 0), 0) + 1;
      await put('publications', newRecord({
        name, kind: 'nameOnly', course: null, isMaterial: fd.get('isMaterial') === 'on', order, active: true,
      }));
      toast(`${name}を追加しました`);
    } else {
      const p = pubs.find((x) => x.id === f.dataset.id);
      await put('publications', {
        ...p,
        name,
        isMaterial: p.kind === 'nameOnly' ? fd.get('isMaterial') === 'on' : p.isMaterial,
        active: fd.get('active') === 'on',
        updatedAt: nowStamp(),
      });
      toast('保存しました');
    }
    return refresh();
  });

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-move]');
    if (!b) return;
    const i = pubs.findIndex((p) => p.id === b.dataset.id);
    const j = i + Number(b.dataset.move);
    if (j < 0 || j >= pubs.length) return;
    // 並び順を振り直してから入れ替える（同じ番号が重なっていても正しく動くように）
    const list = pubs.map((p, k) => ({ ...p, order: k + 1 }));
    [list[i].order, list[j].order] = [list[j].order, list[i].order];
    await write(['publications'], (s) => { for (const p of list) s('publications').put(p); });
    refresh();
  });
}
