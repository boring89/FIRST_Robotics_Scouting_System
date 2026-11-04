// Full-screen match entry dialog with large tap targets for use while a match is running.

import { MATCH_COUNTERS, ENDGAME_RESULTS, ALLIANCES, esc } from './model.js';

const dialog = document.getElementById('matchDialog');
const body = document.getElementById('matchForm');
let draft = null;
let callbacks = {};

function counterHtml([k, label]) {
  return `<div class="counter"><span>${label}</span><div>
    <button type="button" data-inc="${k}" data-d="-1" aria-label="${label} 減一">−</button>
    <output data-out="${k}">${draft[k]}</output>
    <button type="button" class="plus" data-inc="${k}" data-d="1" aria-label="${label} 加一">＋</button></div></div>`;
}

function toggleHtml(k, label) {
  return `<label class="toggle"><input type="checkbox" data-f="${k}"${draft[k] ? ' checked' : ''}><b>${label}</b></label>`;
}

function pillsHtml(k, options, cls = '') {
  return `<div class="pills big ${cls}">${options.map(([v, l]) => `<label><input type="radio" name="md-${k}" data-f="${k}" value="${v}"${draft[k] === v ? ' checked' : ''}><b class="pill-${v}">${l}</b></label>`).join('')}</div>`;
}

function render(isNew) {
  body.innerHTML = `
    <div class="md-head">
      <h2>${isNew ? '新增場次' : '編輯場次'}</h2>
      <button type="button" class="icon" data-act="close" aria-label="關閉">✕</button>
    </div>
    <div class="md-body">
      <div class="grid">
        <label class="field"><span>場次</span><input data-f="match" value="${esc(draft.match)}" placeholder="例：Q12"></label>
        <label class="field"><span>Scout</span><input data-f="scout" value="${esc(draft.scout)}"></label>
      </div>
      <div class="md-group"><span class="md-label">聯盟</span>${pillsHtml('alliance', ALLIANCES, 'alliance')}</div>
      <h3>自動</h3>
      <div class="md-row">${toggleHtml('leave', '離開起始區')}</div>
      <div class="counters">${MATCH_COUNTERS.auto.map(counterHtml).join('')}</div>
      <h3>手動</h3>
      <div class="counters">${MATCH_COUNTERS.teleop.map(counterHtml).join('')}</div>
      <div class="md-row">${toggleHtml('defense', '有防守對手')}${toggleHtml('defended', '被防守')}</div>
      <h3>終局</h3>
      ${pillsHtml('endgame', ENDGAME_RESULTS)}
      <h3>其他</h3>
      <div class="counters">${MATCH_COUNTERS.other.map(counterHtml).join('')}</div>
      <div class="md-row">${toggleHtml('broke', '故障 / 斷線')}</div>
      <label class="field wide"><span>備註</span><textarea data-f="notes" rows="2">${esc(draft.notes)}</textarea></label>
    </div>
    <div class="md-foot">
      ${isNew ? '' : '<button type="button" class="ghost danger" data-act="delete">刪除</button>'}
      <span class="spacer"></span>
      <button type="button" class="ghost" data-act="close">取消</button>
      <button type="button" class="primary" data-act="save">儲存</button>
    </div>`;
}

body.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn || !draft) return;
  if (btn.dataset.inc) {
    const k = btn.dataset.inc;
    draft[k] = Math.max(0, (Number(draft[k]) || 0) + Number(btn.dataset.d));
    body.querySelector(`[data-out="${k}"]`).textContent = draft[k];
    navigator.vibrate?.(10);
  } else if (btn.dataset.act === 'save') {
    callbacks.onSave?.(draft);
    dialog.close();
  } else if (btn.dataset.act === 'delete') {
    if (!confirm(`刪除場次 ${draft.match || ''}？`)) return;
    callbacks.onDelete?.(draft.id);
    dialog.close();
  } else if (btn.dataset.act === 'close') {
    dialog.close();
  }
});

function onField(e) {
  const t = e.target;
  if (!draft || !t.dataset.f) return;
  if (t.type === 'checkbox') draft[t.dataset.f] = t.checked;
  else if (t.type === 'radio') { if (t.checked) draft[t.dataset.f] = t.value; }
  else draft[t.dataset.f] = t.value;
}
body.addEventListener('input', onField);
body.addEventListener('change', onField);

export function openMatchDialog(match, isNew, cbs) {
  draft = structuredClone(match);
  callbacks = cbs;
  render(isNew);
  dialog.showModal();
  if (isNew) body.querySelector('[data-f="match"]').focus();
}
