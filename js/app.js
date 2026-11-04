import {
  TEAM_FIELDS, ROBOT_FIELDS, MECH_FIELDS, EFF_FIELDS, RATING_FIELDS, STRATEGY_TEXT,
  ROLE_OPTIONS, START_OPTIONS, PICK_OPTIONS,
  blankRecord, blankMech, blankParam, normalize, getPath, setPath, esc, newId,
  recordLabel, estimatedTotal,
} from './model.js';
import { store, prefs } from './storage.js';
import { fetchStatbotics, fmt, fmtRank, fmtRecord, breakdownLabel, statboticsUrl } from './statbotics.js';
import { buildShareUrl, readShareHash, qrDataUrl, generatePdf } from './report.js';

const $ = (sel) => document.querySelector(sel);
const form = $('#form');
let state = blankRecord();
let records = [];

/* ---------- Toast & busy overlay ---------- */

let toastTimer;
function toast(msg, kind = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ''), 3200);
}

function busy(text) {
  $('#busy').hidden = !text;
  if (text) $('#busyText').textContent = text;
}

/* ---------- Static field rendering ---------- */

function fieldHtml(path, label, type, extra) {
  if (type === 'select') {
    return `<label class="field"><span>${label}</span><select name="${path}"><option value="">—</option>${extra.map((o) => `<option>${esc(o)}</option>`).join('')}</select></label>`;
  }
  if (type === 'textarea') {
    return `<label class="field wide"><span>${label}</span><textarea name="${path}" rows="3" placeholder="${esc(extra || '')}"></textarea></label>`;
  }
  const numAttrs = type === 'number' ? ' inputmode="decimal" step="any"' : '';
  return `<label class="field"><span>${label}</span><input name="${path}" type="${type}"${numAttrs} placeholder="${esc(extra || '')}"></label>`;
}

const fieldsHtml = (prefix, fields) => fields.map(([k, label, type, extra]) => fieldHtml(`${prefix}.${k}`, label, type, extra)).join('');

function ratingHtml(path, label) {
  return `<div class="rating"><span>${label}</span><div class="pills" role="radiogroup" aria-label="${label}">${[1, 2, 3, 4, 5]
    .map((n) => `<label><input type="radio" name="${path}" value="${n}"><b>${n}</b></label>`).join('')}</div></div>`;
}

function choiceHtml(path, label, options, type) {
  return `<div class="field wide"><span>${label}</span><div class="pills">${options
    .map(([value, text]) => `<label><input type="${type}" name="${path}" value="${esc(value)}"><b>${esc(text)}</b></label>`).join('')}</div></div>`;
}

function renderStaticFields() {
  $('#teamFields').innerHTML = fieldsHtml('team', TEAM_FIELDS);
  $('#robotFields').innerHTML = fieldsHtml('robot', ROBOT_FIELDS);
  $('#effFields').innerHTML = fieldsHtml('efficiency', EFF_FIELDS);
  $('#ratingFields').innerHTML = RATING_FIELDS.map(([k, l]) => ratingHtml(`efficiency.${k}`, l)).join('');
  $('#stratTop').innerHTML =
    choiceHtml('strategy.roles', '角色定位（可複選）', ROLE_OPTIONS.map((r) => [r, r]), 'checkbox') +
    choiceHtml('strategy.startPos', '偏好起始位置', START_OPTIONS.map((r) => [r, r]), 'radio') +
    choiceHtml('strategy.pick', '選隊建議', PICK_OPTIONS, 'radio');
  $('#stratFields').innerHTML = STRATEGY_TEXT.map(([k, l, ph]) => fieldHtml(`strategy.${k}`, l, 'textarea', ph)).join('');
}

/* ---------- Filling the form from state ---------- */

function fillForm() {
  for (const el of form.querySelectorAll('[name]')) {
    const v = getPath(state, el.name);
    if (el.type === 'checkbox') el.checked = Array.isArray(v) && v.includes(el.value);
    else if (el.type === 'radio') {
      el.checked = String(v ?? '') === el.value;
      el.dataset.wasChecked = el.checked ? '1' : '';
    }
    else el.value = v ?? '';
  }
  $('#statYear').value = state.statbotics?.year || state.team.year || new Date().getFullYear();
  renderLists();
  renderPhotos();
  renderStat();
  renderEffSummary();
  renderQr();
}

function rowHtml(list, i, fields, obj) {
  return `<div class="row">${fields.map(([k, label, type, extra]) => {
    const attrs = `data-list="${list}" data-i="${i}" data-k="${k}" aria-label="${label}"`;
    if (type === 'select') {
      return `<label class="field"><span>${label}</span><select ${attrs}><option value="">—</option>${extra
        .map((o) => `<option${String(obj[k]) === o ? ' selected' : ''}>${o}</option>`).join('')}</select></label>`;
    }
    const listAttr = list === 'mechanisms' && k === 'name' ? ' list="mechNames"' : '';
    const numAttrs = type === 'number' ? ' inputmode="decimal" step="any"' : '';
    return `<label class="field"><span>${label}</span><input ${attrs} type="${type}"${numAttrs}${listAttr} value="${esc(obj[k])}" placeholder="${esc(extra || '')}"></label>`;
  }).join('')}<button type="button" class="icon danger" data-remove="${list}" data-i="${i}" title="移除" aria-label="移除">✕</button></div>`;
}

const PARAM_FIELDS = [['key', '項目', 'text', '例：Shooter 轉速'], ['value', '數值', 'text', '例：4500 RPM']];

function renderLists() {
  $('#mechList').innerHTML = state.mechanisms.map((m, i) => rowHtml('mechanisms', i, MECH_FIELDS, m)).join('') ||
    '<p class="empty">尚未加入機構。</p>';
  $('#paramList').innerHTML = state.params.map((p, i) => rowHtml('params', i, PARAM_FIELDS, p)).join('') ||
    '<p class="empty">尚未加入自訂參數。</p>';
  form.querySelectorAll('.rows .row').forEach((r) => r.classList.toggle('params', !!r.querySelector('[data-list="params"]')));
}

function renderPhotos() {
  const grid = $('#photoGrid');
  if (!state.photos.length) {
    grid.innerHTML = '<p class="empty">尚未加入照片。</p>';
    return;
  }
  grid.innerHTML = state.photos.map((p, i) => `
    <figure class="photo">
      <img src="${p.dataUrl}" alt="${esc(p.caption)}">
      <div class="photo-bar">
        <input data-photo="${p.id}" list="photoCaptions" value="${esc(p.caption)}" placeholder="說明（例：Intake）" aria-label="照片說明">
        <button type="button" class="icon" data-move="${i}" data-dir="-1" title="往前" aria-label="往前" ${i === 0 ? 'disabled' : ''}>←</button>
        <button type="button" class="icon" data-move="${i}" data-dir="1" title="往後" aria-label="往後" ${i === state.photos.length - 1 ? 'disabled' : ''}>→</button>
        <button type="button" class="icon danger" data-photo-del="${p.id}" title="刪除" aria-label="刪除照片">✕</button>
      </div>
    </figure>`).join('');
}

function renderStat() {
  const view = $('#statView');
  const sb = state.statbotics;
  if (!sb) {
    view.innerHTML = '<p class="empty">輸入隊號後按「抓取 Statbotics」取得 EPA、排名與賽事表現。</p>';
    $('#statStatus').textContent = '';
    return;
  }
  $('#statStatus').innerHTML = `${sb.year} 賽季 · 擷取於 ${new Date(sb.fetchedAt).toLocaleString('zh-TW')} · <a href="${statboticsUrl(state.team.number, sb.year)}" target="_blank" rel="noopener">在 Statbotics 開啟</a>`;
  const s = sb.season;
  const tiles = s
    ? [['EPA 總分', fmt(s.epa)], ['自動', fmt(s.auto)], ['手動', fmt(s.teleop)], ['終局', fmt(s.endgame)],
       ['世界排名', fmtRank(s.ranks.total)], ['賽季戰績', fmtRecord(s.record)]]
    : [];
  view.innerHTML = `
    ${s ? `<div class="tiles">${tiles.map(([l, v]) => `<div class="tile"><span>${l}</span><b>${esc(v)}</b></div>`).join('')}</div>`
        : '<p class="empty">此賽季尚無 Statbotics 資料（可能尚未出賽）。</p>'}
    ${sb.events.length ? `<div class="table-wrap"><table>
      <thead><tr><th>賽事</th><th>週</th><th>EPA</th><th>排名</th><th>戰績</th></tr></thead>
      <tbody>${sb.events.map((e) => `<tr${e.key === state.team.event ? ' class="hl"' : ''}><td>${esc(e.name)} <small class="muted">${esc(e.key)}</small></td>
        <td>${e.week ?? '—'}</td><td>${fmt(e.epa)}</td><td>${e.qualRank ? `${e.qualRank}/${e.numTeams}` : '—'}</td><td>${fmtRecord(e.record)}</td></tr>`).join('')}</tbody>
    </table></div>` : ''}
    ${s?.gameBreakdown?.length ? `<details><summary>本季項目 EPA 細項（${s.gameBreakdown.length}）</summary>
      <div class="kv">${s.gameBreakdown.map(([k, v]) => `<div><span>${esc(breakdownLabel(k))}</span><b>${fmt(v, 2)}</b></div>`).join('')}</div></details>` : ''}`;
}

function renderEffSummary() {
  const est = estimatedTotal(state.efficiency);
  const epa = state.statbotics?.season?.epa;
  const el = $('#effSummary');
  if (est === null && typeof epa !== 'number') {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `
    <div class="tile"><span>Scout 預估單場得分</span><b>${fmt(est)}</b></div>
    <div class="tile"><span>Statbotics EPA</span><b>${fmt(epa)}</b></div>
    ${est !== null && typeof epa === 'number' ? `<div class="tile"><span>差異</span><b>${est - epa >= 0 ? '+' : ''}${fmt(est - epa)}</b></div>` : ''}`;
}

let shareUrl = '';
function renderQr() {
  const { url, truncated } = buildShareUrl(state);
  shareUrl = url;
  const src = qrDataUrl(url, 440);
  const img = $('#qrImg');
  if (src) img.src = src;
  else img.removeAttribute('src');
  $('#qrInfo').textContent = !src
    ? '資料過多，無法產生 QR Code。請縮短文字內容。'
    : `連結長度 ${url.length} 字元${truncated ? '｜文字過長，QR Code 中的長文字已截斷（PDF 內仍為完整內容）' : ''}`;
}

/* ---------- Saving ---------- */

let saveTimer;
function changed({ immediate = false } = {}) {
  state.updatedAt = Date.now();
  clearTimeout(saveTimer);
  const doSave = async () => {
    await store.put(state);
    upsertRecordList();
    renderQr();
  };
  if (immediate) return doSave();
  saveTimer = setTimeout(doSave, 500);
}

function upsertRecordList() {
  const i = records.findIndex((r) => r.id === state.id);
  const summary = { id: state.id, label: recordLabel(state), updatedAt: state.updatedAt };
  if (i >= 0) records[i] = summary;
  else records.unshift(summary);
  renderRecordSelect();
}

function renderRecordSelect() {
  records.sort((a, b) => b.updatedAt - a.updatedAt);
  $('#recordSelect').innerHTML = records.map((r) => `<option value="${r.id}"${r.id === state.id ? ' selected' : ''}>${esc(r.label)}</option>`).join('');
}

async function loadRecords() {
  const all = await store.all();
  records = all.map((r) => ({ id: r.id, label: recordLabel(r), updatedAt: r.updatedAt || 0 }));
  return all;
}

async function openRecord(id) {
  const all = await store.all();
  const rec = all.find((r) => r.id === id);
  if (!rec) return;
  state = normalize(rec);
  prefs.set('lastRecord', state.id);
  fillForm();
  renderRecordSelect();
}

async function newRecord(data) {
  clearTimeout(saveTimer);
  state = data ? normalize(data) : blankRecord();
  if (records.some((r) => r.id === state.id) && data) state.id = newId();
  prefs.set('lastRecord', state.id);
  await changed({ immediate: true });
  fillForm();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Event handlers ---------- */

function onFormInput(e) {
  const t = e.target;
  if (t.name) {
    if (t.type === 'checkbox') {
      setPath(state, t.name, [...form.querySelectorAll(`[name="${t.name}"]:checked`)].map((x) => x.value));
    } else if (t.type === 'radio') {
      if (t.checked) setPath(state, t.name, t.value);
    } else {
      setPath(state, t.name, t.value);
    }
    if (t.name.startsWith('efficiency.')) renderEffSummary();
    if (t.name === 'team.year' && !state.statbotics) $('#statYear').value = t.value;
    changed();
  } else if (t.dataset.list) {
    state[t.dataset.list][Number(t.dataset.i)][t.dataset.k] = t.value;
    changed();
  } else if (t.dataset.photo) {
    const p = state.photos.find((x) => x.id === t.dataset.photo);
    if (p) p.caption = t.value;
    changed();
  }
}

// Clicking a selected radio pill again clears it.
function onRadioClick(e) {
  const t = e.target;
  if (t.type !== 'radio' || !t.name) return;
  if (t.dataset.wasChecked === '1') {
    t.checked = false;
    setPath(state, t.name, '');
    changed();
  }
  form.querySelectorAll(`[name="${t.name}"]`).forEach((r) => (r.dataset.wasChecked = r.checked ? '1' : ''));
}

function onFormClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.remove) {
    state[btn.dataset.remove].splice(Number(btn.dataset.i), 1);
    renderLists();
    changed();
  } else if (btn.dataset.photoDel) {
    state.photos = state.photos.filter((p) => p.id !== btn.dataset.photoDel);
    renderPhotos();
    changed();
  } else if (btn.dataset.move) {
    const i = Number(btn.dataset.move);
    const j = i + Number(btn.dataset.dir);
    [state.photos[i], state.photos[j]] = [state.photos[j], state.photos[i]];
    renderPhotos();
    changed();
  }
}

function resizeImage(file, max = 1600) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`無法讀取圖片：${file.name}`));
    };
    img.src = url;
  });
}

async function onPhotos(e) {
  const files = [...e.target.files];
  e.target.value = '';
  for (const file of files) {
    try {
      state.photos.push({ id: newId(), caption: '', dataUrl: await resizeImage(file) });
    } catch (err) {
      toast(err.message, 'error');
    }
  }
  renderPhotos();
  changed();
}

async function onFetchStat() {
  const team = parseInt(state.team.number, 10);
  const year = parseInt($('#statYear').value, 10) || new Date().getFullYear();
  if (!team) {
    toast('請先輸入隊號', 'error');
    $('[name="team.number"]').focus();
    return;
  }
  const btn = $('#btnStat');
  btn.disabled = true;
  $('#statStatus').textContent = '抓取中…';
  try {
    const sb = await fetchStatbotics(team, year);
    state.statbotics = sb;
    if (!state.team.name) state.team.name = sb.team.name || '';
    if (!state.team.location) state.team.location = [sb.team.state, sb.team.country].filter(Boolean).join(', ');
    fillForm();
    changed();
    toast(`已取得 ${team} ${sb.team.name} 的 Statbotics 資料`);
  } catch (err) {
    $('#statStatus').textContent = '';
    renderStat();
    toast(navigator.onLine ? err.message : '目前離線，無法連線 Statbotics', 'error');
  } finally {
    btn.disabled = false;
  }
}

function download(filename, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function onImportFile(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const list = (Array.isArray(data) ? data : [data]).map((item) => ({ ...normalize(item), updatedAt: item.updatedAt || Date.now() }));
    for (const rec of list) await store.put(rec);
    await loadRecords();
    await openRecord(list[0].id);
    toast(`已匯入 ${list.length} 筆紀錄`);
  } catch (err) {
    toast(`匯入失敗：${err.message}`, 'error');
  }
}

async function onPdf() {
  clearTimeout(saveTimer);
  await store.put(state);
  busy('產生 PDF 中…');
  try {
    const n = await generatePdf(state, (i, total) => busy(`產生 PDF 中… ${i} / ${total} 頁`));
    toast(`PDF 已產生（${n} 頁）`);
  } catch (err) {
    console.error(err);
    toast(`PDF 產生失敗：${err.message}`, 'error');
  } finally {
    busy(null);
  }
}

function bindEvents() {
  form.addEventListener('input', onFormInput);
  form.addEventListener('change', onFormInput);
  form.addEventListener('click', onRadioClick);
  form.addEventListener('click', onFormClick);
  $('#photoInput').addEventListener('change', onPhotos);
  $('#btnStat').addEventListener('click', onFetchStat);
  $('#btnAddMech').addEventListener('click', () => {
    state.mechanisms.push(blankMech());
    renderLists();
    changed();
    $('#mechList .row:last-child input')?.focus();
  });
  $('#btnAddParam').addEventListener('click', () => {
    state.params.push(blankParam());
    renderLists();
    changed();
    $('#paramList .row:last-child input')?.focus();
  });
  $('#recordSelect').addEventListener('change', async (e) => {
    clearTimeout(saveTimer);
    await store.put(state);
    openRecord(e.target.value);
  });
  $('#btnNew').addEventListener('click', async () => {
    clearTimeout(saveTimer);
    await store.put(state);
    newRecord();
  });
  $('#btnDelete').addEventListener('click', async () => {
    if (!confirm(`確定刪除「${recordLabel(state)}」？此動作無法復原。`)) return;
    clearTimeout(saveTimer);
    await store.delete(state.id);
    records = records.filter((r) => r.id !== state.id);
    if (records.length) await openRecord(records[0].id);
    else await newRecord();
    toast('已刪除');
  });
  $('#btnExport').addEventListener('click', () => download(`team${state.team.number || 'unknown'}_scouting.json`, JSON.stringify(state)));
  $('#btnExportAll').addEventListener('click', async () => {
    clearTimeout(saveTimer);
    await store.put(state);
    const all = await store.all();
    download(`scouting_all_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(all));
  });
  $('#btnImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', onImportFile);
  $('#btnPdf').addEventListener('click', onPdf);
  $('#btnCopyLink').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast('已複製連結');
    } catch {
      prompt('複製此連結：', shareUrl);
    }
  });
  window.addEventListener('hashchange', importFromHash);
}

async function importFromHash() {
  let imported;
  try {
    imported = readShareHash(location.hash);
  } catch (err) {
    toast(err.message, 'error');
  }
  if (!imported) return false;
  history.replaceState(null, '', location.pathname + location.search);
  await newRecord(imported);
  toast(`已從 QR Code 匯入隊伍 ${imported.team.number || ''} 的資料`);
  return true;
}

async function init() {
  renderStaticFields();
  bindEvents();
  const all = await loadRecords();
  if (await importFromHash()) return;
  const last = prefs.get('lastRecord');
  const rec = all.find((r) => r.id === last) || [...all].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
  if (rec) {
    state = normalize(rec);
    fillForm();
    renderRecordSelect();
  } else {
    await newRecord();
  }
}

init();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW registration failed', err));
}
