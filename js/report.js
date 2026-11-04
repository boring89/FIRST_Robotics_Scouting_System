// QR share links and the A4 PDF report (DOM blocks → paginated pages → html2canvas → jsPDF).

import {
  esc, num, estimatedTotal, pickLabel, normalize, matchSummary,
  TEAM_FIELDS, ROBOT_FIELDS, MECH_FIELDS, EFF_FIELDS, RATING_FIELDS, STRATEGY_TEXT, ENDGAME_RESULTS,
} from './model.js';
import { fmt, fmtRank, fmtRecord, breakdownLabel, statboticsUrl } from './statbotics.js';

/* ---------- QR payload ---------- */

const MAX_URL = 1800; // keeps the QR code scannable when printed

function prune(v) {
  if (Array.isArray(v)) {
    const a = v.map(prune).filter((x) => x !== undefined);
    return a.length ? a : undefined;
  }
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      const p = prune(x);
      if (p !== undefined) o[k] = p;
    }
    return Object.keys(o).length ? o : undefined;
  }
  return v === '' || v == null ? undefined : v;
}

function truncateStrings(v, limit) {
  if (typeof v === 'string') return v.length > limit ? v.slice(0, limit - 1) + '…' : v;
  if (Array.isArray(v)) return v.map((x) => truncateStrings(x, limit));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, truncateStrings(x, limit)]));
  return v;
}

export function shareBase() {
  return location.origin + location.pathname;
}

export function buildShareUrl(rec) {
  const { team, robot, mechanisms, params, efficiency, strategy, matches } = rec;
  let data = prune({ v: 1, team, robot, mechanisms, params, efficiency, strategy, matches }) || {};
  const make = (d) => `${shareBase()}#d=${LZString.compressToEncodedURIComponent(JSON.stringify(d))}`;
  let url = make(data);
  let truncated = false;
  for (let limit = 400; url.length > MAX_URL && limit >= 10; limit = Math.floor(limit * 0.6)) {
    data = truncateStrings(data, limit);
    data.t = 1;
    truncated = true;
    url = make(data);
  }
  return { url, truncated };
}

export function readShareHash(hash) {
  const m = /^#d=(.+)$/.exec(hash || '');
  if (!m) return null;
  const json = LZString.decompressFromEncodedURIComponent(m[1]);
  if (!json) throw new Error('QR Code 資料無法解析');
  const data = JSON.parse(json);
  delete data.v;
  delete data.t;
  return normalize({ ...data, id: undefined });
}

export function qrDataUrl(text, px = 480) {
  try {
    const qr = qrcode(0, 'L');
    qr.addData(text, 'Byte');
    qr.make();
    const cell = Math.max(2, Math.floor(px / (qr.getModuleCount() + 8)));
    return qr.createDataURL(cell, cell * 4);
  } catch (err) {
    console.warn('QR generation failed', err);
    return null;
  }
}

/* ---------- Report blocks ---------- */

const PAGE_W = 794; // A4 at 96 dpi
const PAGE_H = 1123;

const has = (v) => v !== '' && v != null && !(Array.isArray(v) && !v.length);
const multiline = (s) => esc(s).replace(/\n/g, '<br>');

export function block(html, cls = '') {
  const el = document.createElement('div');
  el.className = `rpt-block ${cls}`;
  el.innerHTML = html;
  return el;
}

function kvGrid(fields, obj) {
  const items = fields.filter(([k, , type]) => type !== 'textarea' && has(obj[k]));
  if (!items.length) return '';
  return `<div class="rpt-kv">${items.map(([k, label]) => `<div><span>${esc(label)}</span><b>${esc(obj[k])}</b></div>`).join('')}</div>`;
}

function headerBlock(rec, qr) {
  const t = rec.team;
  const meta = TEAM_FIELDS.filter(([k]) => !['number', 'name'].includes(k) && has(t[k]));
  const pick = pickLabel(rec.strategy.pick);
  return block(`
    <div class="rpt-header">
      <div class="rpt-title">
        <div class="rpt-kicker">FRC Scouting Report${t.year ? ` · ${esc(t.year)}` : ''}</div>
        <div class="rpt-team"><span>${esc(t.number || '?')}</span>${esc(t.name || '')}</div>
        ${pick ? `<div class="rpt-pick rpt-pick-${esc(rec.strategy.pick)}">選隊建議：${esc(pick)}</div>` : ''}
        <div class="rpt-meta">${meta.map(([k, label]) => `<div><span>${esc(label)}</span>${esc(t[k])}</div>`).join('')}</div>
      </div>
      ${qr ? `<div class="rpt-qr"><img src="${qr}" alt=""><div>掃描匯入資料</div></div>` : ''}
    </div>`);
}

function statBlocks(rec) {
  const sb = rec.statbotics;
  if (!sb) return [];
  const s = sb.season;
  const out = [];
  const tiles = s
    ? [
        ['EPA 總分', fmt(s.epa)], ['自動 EPA', fmt(s.auto)], ['手動 EPA', fmt(s.teleop)], ['終局 EPA', fmt(s.endgame)],
        ['世界排名', fmtRank(s.ranks.total)], ['賽季戰績', fmtRecord(s.record)],
      ]
    : [];
  const extra = [
    s?.ranks?.country && ['國家排名', fmtRank(s.ranks.country)],
    s?.ranks?.state && ['州 / 地區排名', fmtRank(s.ranks.state)],
    s?.ranks?.district && ['District 排名', fmtRank(s.ranks.district)],
    s && ['Norm EPA', fmt(s.norm, 0)],
    s?.stats?.max != null && ['賽季最高 EPA', fmt(s.stats.max)],
    ['生涯戰績', fmtRecord(sb.team.record)],
    sb.team.rookieYear && ['新秀年', sb.team.rookieYear],
  ].filter(Boolean);

  out.push(block(`
    <h2>Statbotics 數據 <small>${sb.year} 賽季 · 擷取於 ${esc(sb.fetchedAt.slice(0, 10))} · ${esc(statboticsUrl(rec.team.number, sb.year))}</small></h2>
    ${s ? `<div class="rpt-tiles">${tiles.map(([l, v]) => `<div><span>${l}</span><b>${esc(v)}</b></div>`).join('')}</div>`
        : `<p class="rpt-muted">此賽季尚無 Statbotics 資料。</p>`}
    <div class="rpt-kv rpt-kv-4">${extra.map(([l, v]) => `<div><span>${l}</span><b>${esc(v)}</b></div>`).join('')}</div>`));

  if (sb.events.length) {
    out.push(block(`
      <h3>賽事表現</h3>
      <table class="rpt-table">
        <thead><tr><th>賽事</th><th>週</th><th>EPA</th><th>資格賽排名</th><th>戰績</th></tr></thead>
        <tbody>${sb.events.map((e) => `<tr${e.key === rec.team.event ? ' class="rpt-hl"' : ''}>
          <td>${esc(e.name)} <small>${esc(e.key)}</small></td><td>${e.week ?? '—'}</td><td>${fmt(e.epa)}</td>
          <td>${e.qualRank ? `${e.qualRank} / ${e.numTeams}` : '—'}</td><td>${fmtRecord(e.record)}</td></tr>`).join('')}
        </tbody>
      </table>`));
  }
  if (s?.gameBreakdown?.length) {
    out.push(block(`
      <h3>本季項目 EPA 細項</h3>
      <div class="rpt-kv rpt-kv-4 rpt-small">${s.gameBreakdown.map(([k, v]) => `<div><span>${esc(breakdownLabel(k))}</span><b>${fmt(v, 2)}</b></div>`).join('')}</div>`));
  }
  return out;
}

function robotBlocks(rec) {
  const out = [];
  const grid = kvGrid(ROBOT_FIELDS, rec.robot);
  const params = rec.params.filter((p) => has(p.key) || has(p.value));
  if (grid || has(rec.robot.notes) || params.length) {
    out.push(block(`
      <h2>機構參數</h2>
      ${grid}
      ${params.length ? `<div class="rpt-kv">${params.map((p) => `<div><span>${esc(p.key)}</span><b>${esc(p.value)}</b></div>`).join('')}</div>` : ''}
      ${has(rec.robot.notes) ? `<div class="rpt-text"><span>機構備註</span><p>${multiline(rec.robot.notes)}</p></div>` : ''}`));
  }
  const mechs = rec.mechanisms.filter((m) => MECH_FIELDS.some(([k]) => has(m[k])));
  if (mechs.length) {
    out.push(block(`
      <h3>機構與效率</h3>
      <table class="rpt-table">
        <thead><tr>${MECH_FIELDS.map(([, l]) => `<th>${esc(l)}</th>`).join('')}</tr></thead>
        <tbody>${mechs.map((m) => `<tr>${MECH_FIELDS.map(([k]) => `<td>${esc(m[k]) || '—'}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`));
  }
  return out;
}

function ratingBar(v) {
  const n = num(v) || 0;
  return `<span class="rpt-bar">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span><b>${n ? n : '—'}</b>`;
}

function efficiencyBlock(rec) {
  const e = rec.efficiency;
  const grid = kvGrid(EFF_FIELDS, e);
  const ratings = RATING_FIELDS.filter(([k]) => has(e[k]));
  const est = estimatedTotal(e);
  const epa = rec.statbotics?.season?.epa;
  if (!grid && !ratings.length) return [];
  return [block(`
    <h2>效率</h2>
    ${est !== null ? `<div class="rpt-compare">
        <div><span>Scout 預估單場得分</span><b>${fmt(est)}</b></div>
        ${typeof epa === 'number' ? `<div><span>Statbotics EPA</span><b>${fmt(epa)}</b></div>
        <div><span>差異</span><b>${est - epa >= 0 ? '+' : ''}${fmt(est - epa)}</b></div>` : ''}
      </div>` : ''}
    ${grid}
    ${ratings.length ? `<div class="rpt-ratings">${ratings.map(([k, l]) => `<div><span>${esc(l)}</span>${ratingBar(e[k])}</div>`).join('')}</div>` : ''}`)];
}

const endgameLabel = (v) => ENDGAME_RESULTS.find(([k]) => k === v)?.[1] || '—';
const yes = (v) => (v ? '✓' : '');

function matchBlocks(rec, scoring) {
  const s = matchSummary(rec.matches, scoring);
  if (!s) return [];
  const pct = (v) => (v == null ? '—' : `${fmt(v, 0)}%`);
  const tiles = [
    ['場數', s.n], ['平均自動得分數', fmt(s.autoScored)], ['平均手動得分數', fmt(s.teleScored)],
    ['命中率', pct(s.accuracy)], ['終局成功率', pct(s.endgameRate)], ['故障場數', s.failures],
  ];
  const rows = rec.matches.map((m) => `<tr>
    <td>${esc(m.match) || '—'}</td><td>${m.alliance === 'red' ? '紅' : m.alliance === 'blue' ? '藍' : '—'}</td>
    <td>${yes(m.leave)}</td><td>${m.autoScored} / ${m.autoMissed}</td><td>${m.teleScored} / ${m.teleMissed}</td>
    <td>${endgameLabel(m.endgame)}</td><td>${yes(m.defense)}</td><td>${m.fouls || ''}</td><td>${yes(m.broke)}</td>
    <td>${esc(m.notes)}</td></tr>`);
  const head = '<thead><tr><th>場次</th><th>聯盟</th><th>離開</th><th>自動 中/失</th><th>手動 中/失</th><th>終局</th><th>防守</th><th>犯規</th><th>故障</th><th>備註</th></tr></thead>';
  const out = [block(`
    <h2>逐場紀錄</h2>
    <div class="rpt-tiles">${tiles.map(([l, v]) => `<div><span>${l}</span><b>${esc(v)}</b></div>`).join('')}</div>`)];
  for (let i = 0; i < rows.length; i += 15) {
    out.push(block(`<table class="rpt-table">${head}<tbody>${rows.slice(i, i + 15).join('')}</tbody></table>`, 'rpt-tight'));
  }
  return out;
}

function strategyBlocks(rec) {
  const s = rec.strategy;
  const chips = [
    ...s.roles.map((r) => ['角色', r]),
    has(s.startPos) && ['起始位置', s.startPos],
    has(s.pick) && ['選隊建議', pickLabel(s.pick)],
  ].filter(Boolean);
  const texts = STRATEGY_TEXT.filter(([k]) => has(s[k]));
  if (!chips.length && !texts.length) return [];
  const title = '<h2>策略</h2>';
  const chipHtml = chips.length ? `<div class="rpt-chips">${chips.map(([l, v]) => `<span><small>${esc(l)}</small>${esc(v)}</span>`).join('')}</div>` : '';
  if (!texts.length) return [block(title + chipHtml)];
  // One block per text field so long notes paginate naturally; the title rides with the first one.
  return texts.map(([k, label], i) => block(`${i === 0 ? title + chipHtml : ''}
    <div class="rpt-text"><span>${esc(label)}</span><p>${multiline(s[k])}</p></div>`, i ? 'rpt-tight' : ''));
}

const PHOTO_BOX = { w: 345, h: 250 };

function photoBlocks(rec) {
  const photos = rec.photos;
  const out = [];
  for (let i = 0; i < photos.length; i += 2) {
    const row = photos.slice(i, i + 2);
    out.push(block(`${i === 0 ? '<h2>機構照片</h2>' : ''}
      <div class="rpt-photos">${row.map((p) => `<figure>
        <div class="rpt-photo-box" style="width:${PHOTO_BOX.w}px;height:${PHOTO_BOX.h}px"><img src="${p.dataUrl}" alt=""></div>
        <figcaption>${esc(p.caption || '')}</figcaption></figure>`).join('')}</div>`));
  }
  return out;
}

// html2canvas ignores object-fit, so size each photo explicitly to fit its box.
async function prepareImages(blocks) {
  const imgs = blocks.flatMap((b) => [...b.querySelectorAll('img')]);
  const loaded = (img) => img.complete || new Promise((resolve) => {
    img.onload = img.onerror = resolve;
    setTimeout(resolve, 5000);
  });
  await Promise.all(imgs.map(loaded));
  for (const img of imgs) {
    if (!img.closest('.rpt-photo-box') || !img.naturalWidth) continue;
    const s = Math.min(PHOTO_BOX.w / img.naturalWidth, PHOTO_BOX.h / img.naturalHeight);
    img.style.width = `${Math.round(img.naturalWidth * s)}px`;
    img.style.height = `${Math.round(img.naturalHeight * s)}px`;
  }
}

function paginate(root, blocks, footText) {
  const pages = [];
  const newPage = () => {
    const page = document.createElement('div');
    page.className = 'rpt-page';
    page.style.width = `${PAGE_W}px`;
    page.style.height = `${PAGE_H}px`;
    page.innerHTML = `<div class="rpt-body"></div><div class="rpt-foot"><span>${esc(footText)}</span><span class="rpt-pno"></span></div>`;
    root.append(page);
    pages.push(page);
    return page.firstElementChild;
  };
  let body = newPage();
  for (const b of blocks) {
    body.append(b);
    if (body.scrollHeight > body.clientHeight + 1 && body.children.length > 1) {
      b.remove();
      body = newPage();
      body.append(b);
    }
  }
  pages.forEach((p, i) => (p.querySelector('.rpt-pno').textContent = `第 ${i + 1} / ${pages.length} 頁`));
  return pages;
}

// Lays out blocks onto A4 pages, rasterises each page and saves the PDF.
export async function renderPdf(blocks, { foot, filename, title, linkUrl, onProgress = () => {} }) {
  const root = document.getElementById('reportRoot');
  root.innerHTML = '';
  root.classList.add('active');
  try {
    await prepareImages(blocks);
    await document.fonts?.ready;
    const pages = paginate(root, blocks, foot);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const mmPerPx = 210 / PAGE_W;
    for (let i = 0; i < pages.length; i++) {
      onProgress(i + 1, pages.length);
      const canvas = await html2canvas(pages[i], { scale: 2, backgroundColor: '#ffffff', logging: false, width: PAGE_W, height: PAGE_H });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');

      // Make the QR code a clickable link in the PDF too.
      const qrImg = linkUrl && pages[i].querySelector('.rpt-qr img');
      if (qrImg) {
        const pr = pages[i].getBoundingClientRect();
        const r = qrImg.getBoundingClientRect();
        pdf.link((r.left - pr.left) * mmPerPx, (r.top - pr.top) * mmPerPx, r.width * mmPerPx, r.height * mmPerPx, { url: linkUrl });
      }
    }
    pdf.setProperties({ title, subject: 'FRC Scouting', creator: 'FRC Scouting' });
    pdf.save(`${filename.replace(/[^\w.-]+/g, '-')}.pdf`);
    return pages.length;
  } finally {
    root.innerHTML = '';
    root.classList.remove('active');
  }
}

export async function generatePdf(rec, { scoring, onProgress } = {}) {
  const { url } = buildShareUrl(rec);
  const qr = qrDataUrl(url, 600);
  const blocks = [
    headerBlock(rec, qr),
    ...statBlocks(rec),
    ...robotBlocks(rec),
    ...matchBlocks(rec, scoring),
    ...efficiencyBlock(rec),
    ...strategyBlocks(rec),
    ...photoBlocks(rec),
  ];
  const t = rec.team;
  return renderPdf(blocks, {
    foot: `Team ${t.number || '?'} ${t.name || ''} · ${t.event || ''} · Scout: ${t.scout || '—'} · 產生於 ${new Date().toLocaleString('zh-TW')}`,
    filename: ['Team' + (t.number || 'unknown'), t.event, 'scouting'].filter(Boolean).join('_'),
    title: `Team ${t.number} Scouting Report`,
    linkUrl: url,
    onProgress,
  });
}
