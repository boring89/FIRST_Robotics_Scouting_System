// Pick list: compare every saved record, keep a manual ranking, mark teams taken during alliance selection.

import { store, prefs } from './storage.js';
import { esc, num, estimatedTotal, matchSummary, pickLabel } from './model.js';
import { fetchStatbotics, fmt } from './statbotics.js';
import { block, renderPdf } from './report.js';

const $ = (sel) => document.querySelector(sel);
const view = $('#pickView');
let ctx;
let rows = [];

const SORTS = [
  ['rank', '我的排序'],
  ['epa', 'Statbotics EPA'],
  ['est', 'Scout 預估得分'],
  ['scored', '逐場平均得分數'],
  ['accuracy', '命中率'],
  ['driver', '駕駛技術'],
  ['reliability', '穩定度'],
  ['defense', '防守能力'],
];
const PICK_ORDER = { first: 0, second: 1, backup: 2, '': 3, no: 4 };

function metrics(r) {
  const s = matchSummary(r.matches || [], ctx.getScoring());
  const e = r.efficiency;
  return {
    epa: r.statbotics?.season?.epa ?? null,
    est: estimatedTotal(e),
    scored: s ? s.scoredPerMatch : null,
    matchN: s?.n || 0,
    accuracy: num(e.accuracy) ?? s?.accuracy ?? null,
    driver: num(e.driver),
    reliability: num(e.reliability),
    defense: num(e.defense),
  };
}

const filters = () => ({
  event: $('#pickEvent').value,
  sort: $('#pickSort').value,
  hideTaken: $('#pickHideTaken').checked,
});

// Records without a manual rank fall in after the ranked ones, by recommendation then EPA.
function byMyOrder(a, b) {
  const ra = a.rec.pickRank ?? Infinity;
  const rb = b.rec.pickRank ?? Infinity;
  if (ra !== rb) return ra - rb;
  const pa = PICK_ORDER[a.rec.strategy.pick] ?? 3;
  const pb = PICK_ORDER[b.rec.strategy.pick] ?? 3;
  if (pa !== pb) return pa - pb;
  return (b.m.epa ?? -Infinity) - (a.m.epa ?? -Infinity);
}

function visibleRows() {
  const f = filters();
  let list = rows.filter((r) => !f.event || r.rec.team.event === f.event);
  list.sort(byMyOrder);
  if (f.sort !== 'rank') list.sort((a, b) => (b.m[f.sort] ?? -Infinity) - (a.m[f.sort] ?? -Infinity));
  if (f.hideTaken) list = list.filter((r) => !r.rec.taken);
  return list;
}

const cell = (v, d = 1) => (v == null ? '—' : fmt(v, d));
const ratingCell = (v) => (v == null ? '—' : '●'.repeat(v) + '<span class="dim">' + '●'.repeat(5 - v) + '</span>');

function render() {
  const list = visibleRows();
  const f = filters();
  const dupes = new Set();
  const seen = new Set();
  for (const r of rows) {
    const key = `${r.rec.team.number}|${r.rec.team.event}`;
    if (seen.has(key)) dupes.add(key);
    seen.add(key);
  }
  $('#pickCount').textContent = `${list.length} 隊${dupes.size ? `｜有 ${dupes.size} 隊重複紀錄` : ''}`;
  $('#pickTable').innerHTML = list.length ? `
    <table class="pick">
      <thead><tr><th>#</th><th>隊伍</th><th>EPA</th><th>Scout 預估</th><th>逐場</th><th>命中率</th><th>駕駛</th><th>穩定</th><th>防守</th><th>角色</th><th>建議</th><th></th></tr></thead>
      <tbody>${list.map((r, i) => {
        const t = r.rec.team;
        const dup = dupes.has(`${t.number}|${t.event}`);
        return `<tr class="${r.rec.taken ? 'taken' : ''}">
          <td class="rank">${i + 1}</td>
          <td><button type="button" class="link" data-open="${r.rec.id}"><b>${esc(t.number || '?')}</b> ${esc(t.name)}</button>${dup ? ' <span class="badge">重複</span>' : ''}</td>
          <td>${cell(r.m.epa)}</td><td>${cell(r.m.est)}</td>
          <td>${r.m.matchN ? `${cell(r.m.scored)} <small class="muted">(${r.m.matchN} 場)</small>` : '—'}</td>
          <td>${r.m.accuracy == null ? '—' : `${fmt(r.m.accuracy, 0)}%`}</td>
          <td class="stars">${ratingCell(r.m.driver)}</td><td class="stars">${ratingCell(r.m.reliability)}</td><td class="stars">${ratingCell(r.m.defense)}</td>
          <td>${esc(r.rec.strategy.roles.join('、'))}</td>
          <td>${r.rec.strategy.pick ? `<span class="pick-${r.rec.strategy.pick}">${esc(pickLabel(r.rec.strategy.pick))}</span>` : ''}</td>
          <td class="acts">
            ${f.sort === 'rank' ? `<button type="button" class="icon" data-move="${r.rec.id}" data-dir="-1" aria-label="往上" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="icon" data-move="${r.rec.id}" data-dir="1" aria-label="往下" ${i === list.length - 1 ? 'disabled' : ''}>↓</button>` : ''}
            <button type="button" class="icon ${r.rec.taken ? 'on' : ''}" data-taken="${r.rec.id}" title="已被其他聯盟選走">${r.rec.taken ? '已選走' : '選走'}</button>
          </td></tr>`;
      }).join('')}</tbody>
    </table>` : '<p class="empty">沒有符合的紀錄。</p>';
  $('#pickApplySort').hidden = f.sort === 'rank';
}

async function save(rec) {
  rec.updatedAt = Date.now();
  await store.put(rec);
}

// Persist the current visible order (all records for the event) as the manual ranking.
async function writeRanks(list) {
  await Promise.all(list.map((r, i) => {
    if (r.rec.pickRank === i + 1) return null;
    r.rec.pickRank = i + 1;
    return save(r.rec);
  }));
}

async function move(id, dir) {
  const f = filters();
  const all = rows.filter((r) => !f.event || r.rec.team.event === f.event).sort(byMyOrder);
  const shown = f.hideTaken ? all.filter((r) => !r.rec.taken) : all;
  const i = shown.findIndex((r) => r.rec.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= shown.length) return;
  const ai = all.indexOf(shown[i]);
  const aj = all.indexOf(shown[j]);
  [all[ai], all[aj]] = [all[aj], all[ai]];
  await writeRanks(all);
  render();
}

async function refreshAll() {
  const list = visibleRows().filter((r) => parseInt(r.rec.team.number, 10));
  let failed = 0;
  for (let i = 0; i < list.length; i++) {
    const rec = list[i].rec;
    ctx.busy(`更新 Statbotics… ${i + 1} / ${list.length}`);
    const year = rec.statbotics?.year || parseInt(rec.team.year, 10) || new Date().getFullYear();
    try {
      rec.statbotics = await fetchStatbotics(parseInt(rec.team.number, 10), year);
      if (!rec.team.name) rec.team.name = rec.statbotics.team.name || '';
      list[i].m = metrics(rec);
      await save(rec);
    } catch (err) {
      console.warn(`Statbotics refresh failed for ${rec.team.number}`, err);
      failed++;
    }
  }
  ctx.busy(null);
  render();
  ctx.toast(failed ? `已更新 ${list.length - failed} 隊，${failed} 隊失敗` : `已更新 ${list.length} 隊`, failed ? 'error' : '');
}

async function exportPdf() {
  const list = visibleRows();
  if (!list.length) return ctx.toast('沒有可匯出的隊伍', 'error');
  const f = filters();
  const head = '<thead><tr><th>#</th><th>隊號</th><th>隊名</th><th>EPA</th><th>預估</th><th>逐場</th><th>命中率</th><th>駕駛</th><th>穩定</th><th>防守</th><th>角色</th><th>建議</th></tr></thead>';
  const rowHtml = (r, i) => `<tr class="${r.rec.taken ? 'rpt-taken' : ''}">
    <td>${i + 1}</td><td><b>${esc(r.rec.team.number)}</b></td><td>${esc(r.rec.team.name)}</td>
    <td>${cell(r.m.epa)}</td><td>${cell(r.m.est)}</td><td>${r.m.matchN ? `${cell(r.m.scored)} (${r.m.matchN})` : '—'}</td>
    <td>${r.m.accuracy == null ? '—' : `${fmt(r.m.accuracy, 0)}%`}</td>
    <td>${r.m.driver ?? '—'}</td><td>${r.m.reliability ?? '—'}</td><td>${r.m.defense ?? '—'}</td>
    <td>${esc(r.rec.strategy.roles.join('、'))}</td><td>${esc(pickLabel(r.rec.strategy.pick))}</td></tr>`;
  const sortLabel = SORTS.find(([k]) => k === f.sort)[1];
  const blocks = [block(`<div class="rpt-kicker">FRC Pick List</div>
    <div class="rpt-team">選隊清單${f.event ? ` <span>${esc(f.event)}</span>` : ''}</div>
    <p class="rpt-muted">排序：${esc(sortLabel)} · ${list.length} 隊 · 逐場 = 平均每場得分次數（場數）· 評分 1–5</p>`)];
  for (let i = 0; i < list.length; i += 25) {
    blocks.push(block(`<table class="rpt-table rpt-pick-table">${head}<tbody>${list.slice(i, i + 25).map((r, k) => rowHtml(r, i + k)).join('')}</tbody></table>`, 'rpt-tight'));
  }
  ctx.busy('產生 PDF 中…');
  try {
    await renderPdf(blocks, {
      foot: `選隊清單 ${f.event || ''} · 產生於 ${new Date().toLocaleString('zh-TW')}`,
      filename: ['PickList', f.event].filter(Boolean).join('_'),
      title: `Pick List ${f.event || ''}`,
      onProgress: (i, n) => ctx.busy(`產生 PDF 中… ${i} / ${n} 頁`),
    });
  } catch (err) {
    ctx.toast(`PDF 產生失敗：${err.message}`, 'error');
  } finally {
    ctx.busy(null);
  }
}

export async function showPickList() {
  const all = await store.all();
  rows = all.map((rec) => ({ rec, m: null }));
  rows.forEach((r) => (r.m = metrics(r.rec)));
  const events = [...new Set(all.map((r) => r.team.event).filter(Boolean))].sort();
  const sel = $('#pickEvent');
  const wanted = sel.value || prefs.get('pickEvent') || '';
  sel.innerHTML = `<option value="">全部賽事</option>${events.map((e) => `<option>${esc(e)}</option>`).join('')}`;
  sel.value = events.includes(wanted) ? wanted : '';
  render();
}

export function initPickList(context) {
  ctx = context;
  $('#pickSort').innerHTML = SORTS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
  $('#pickEvent').addEventListener('change', (e) => {
    prefs.set('pickEvent', e.target.value);
    render();
  });
  $('#pickSort').addEventListener('change', render);
  $('#pickHideTaken').addEventListener('change', render);
  $('#pickApplySort').addEventListener('click', async () => {
    const f = filters();
    const shown = visibleRows();
    const rest = rows.filter((r) => (!f.event || r.rec.team.event === f.event) && !shown.includes(r)).sort(byMyOrder);
    await writeRanks([...shown, ...rest]);
    $('#pickSort').value = 'rank';
    render();
    ctx.toast('已將目前排序設為我的排序');
  });
  $('#pickRefresh').addEventListener('click', refreshAll);
  $('#pickPdf').addEventListener('click', exportPdf);
  view.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.open) ctx.onOpen(btn.dataset.open);
    else if (btn.dataset.move) await move(btn.dataset.move, Number(btn.dataset.dir));
    else if (btn.dataset.taken) {
      const r = rows.find((x) => x.rec.id === btn.dataset.taken);
      r.rec.taken = !r.rec.taken;
      await save(r.rec);
      render();
    }
  });
}
