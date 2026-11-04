// Record schema, field definitions and small helpers shared by the form and the PDF report.

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// [key, label, type, options-or-placeholder]
export const TEAM_FIELDS = [
  ['number', '隊號', 'number', '例：254'],
  ['name', '隊名', 'text', '抓取 Statbotics 可自動填入'],
  ['location', '地區 / 學校', 'text'],
  ['year', '賽季年份', 'number'],
  ['event', '賽事代碼', 'text', '例：2026twtp'],
  ['match', '觀察場次', 'text', '例：Q12, Q25'],
  ['scout', 'Scout 人員', 'text'],
  ['date', '日期', 'date'],
];

export const ROBOT_FIELDS = [
  ['drivetrain', '底盤類型', 'select', ['Swerve', 'Tank / West Coast', 'Mecanum', 'H-Drive', '其他']],
  ['driveMotors', '驅動馬達', 'text', '例：Kraken X60 ×4'],
  ['gearRatio', '齒輪比', 'text', '例：L2 6.75:1'],
  ['maxSpeed', '最高速度 (ft/s)', 'number'],
  ['length', '長度 (in)', 'number'],
  ['width', '寬度 (in)', 'number'],
  ['height', '高度 (in)', 'number'],
  ['weight', '重量 (lb)', 'number'],
  ['language', '程式語言', 'select', ['Java', 'C++', 'Python', 'LabVIEW', '其他']],
  ['vision', '視覺系統', 'text', '例：Limelight 4 / PhotonVision'],
  ['autoCount', '自動程式數量', 'number'],
  ['notes', '機構備註', 'textarea', '整體設計、特殊機構、可能故障點…'],
];

export const MECH_FIELDS = [
  ['name', '機構', 'text', 'Intake'],
  ['type', '類型 / 描述', 'text', '例：Over-the-bumper roller'],
  ['motors', '馬達', 'text', '例：NEO ×2'],
  ['cycleTime', '週期 (秒)', 'number'],
  ['successRate', '成功率 (%)', 'number'],
  ['rating', '評分', 'select', ['1', '2', '3', '4', '5']],
  ['notes', '備註', 'text'],
];

export const EFF_FIELDS = [
  ['matches', '觀察場數', 'number'],
  ['autoPoints', '自動得分 (平均)', 'number'],
  ['teleopPoints', '手動得分 (平均)', 'number'],
  ['endgamePoints', '終局得分 (平均)', 'number'],
  ['cycles', '每場週期數', 'number'],
  ['cycleTime', '平均週期時間 (秒)', 'number'],
  ['accuracy', '命中率 (%)', 'number'],
  ['endgameRate', '終局成功率 (%)', 'number'],
  ['failures', '故障 / 斷線次數', 'number'],
];

export const RATING_FIELDS = [
  ['driver', '駕駛技術'],
  ['speed', '速度'],
  ['reliability', '穩定度'],
  ['defense', '防守能力'],
  ['antiDefense', '抗防守'],
];

export const ROLE_OPTIONS = ['得分手', '防守', '支援 / 運輸', '全能'];
export const START_OPTIONS = ['左', '中', '右', '彈性'];
export const PICK_OPTIONS = [
  ['first', '第一輪優先'],
  ['second', '第二輪'],
  ['backup', '備選'],
  ['no', '不推薦'],
];

export const STRATEGY_TEXT = [
  ['auto', '自動階段策略', '起始位置、路線、可得分數…'],
  ['teleop', '手動階段策略', '主要得分方式、移動路線、偏好區域…'],
  ['endgame', '終局策略', '吊掛 / 停靠方式、所需時間…'],
  ['strengths', '優勢'],
  ['weaknesses', '弱點 / 風險'],
  ['synergy', '聯盟搭配建議', '適合搭配的隊伍類型、分工…'],
  ['notes', '其他備註'],
];

const fieldsToObj = (fields) => Object.fromEntries(fields.map(([k]) => [k, '']));

export function blankRecord() {
  return {
    id: newId(),
    updatedAt: Date.now(),
    team: { ...fieldsToObj(TEAM_FIELDS), year: String(new Date().getFullYear()), date: today() },
    robot: fieldsToObj(ROBOT_FIELDS),
    mechanisms: [],
    params: [],
    efficiency: { ...fieldsToObj(EFF_FIELDS), ...fieldsToObj(RATING_FIELDS) },
    strategy: { roles: [], startPos: '', pick: '', ...fieldsToObj(STRATEGY_TEXT) },
    matches: [],
    statbotics: null,
    photos: [],
  };
}

export const blankMech = () => fieldsToObj(MECH_FIELDS);
export const blankParam = () => ({ key: '', value: '' });

// Fill in any missing fields so older / imported / QR-pruned records render correctly.
export function normalize(data) {
  const base = blankRecord();
  const rec = { ...base, ...data };
  for (const k of ['team', 'robot', 'efficiency', 'strategy']) rec[k] = { ...base[k], ...(data?.[k] || {}) };
  rec.mechanisms = (Array.isArray(data?.mechanisms) ? data.mechanisms : []).map((m) => ({ ...blankMech(), ...m }));
  rec.params = (Array.isArray(data?.params) ? data.params : []).map((p) => ({ ...blankParam(), ...p }));
  rec.matches = (Array.isArray(data?.matches) ? data.matches : []).map((m) => ({ ...blankMatch(), ...m }));
  rec.photos = Array.isArray(data?.photos) ? data.photos : [];
  if (!Array.isArray(rec.strategy.roles)) rec.strategy.roles = [];
  rec.id = data?.id || base.id;
  return rec;
}

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
  target[last] = value;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

export function recordLabel(rec) {
  const t = rec.team || {};
  const parts = [t.number ? `#${t.number}` : '#?', t.name || '（未命名）'];
  if (t.event) parts.push(`· ${t.event}`);
  return parts.join(' ');
}

export function estimatedTotal(eff) {
  const parts = [eff.autoPoints, eff.teleopPoints, eff.endgamePoints].map(num);
  return parts.every((p) => p === null) ? null : parts.reduce((a, b) => a + (b || 0), 0);
}

export const pickLabel = (v) => PICK_OPTIONS.find(([k]) => k === v)?.[1] || '';

/* ---------- Match scouting ---------- */

export const MATCH_COUNTERS = {
  auto: [['autoScored', '得分'], ['autoMissed', '未命中']],
  teleop: [['teleScored', '得分'], ['teleMissed', '未命中']],
  other: [['fouls', '犯規']],
};
export const ENDGAME_RESULTS = [['none', '未嘗試'], ['fail', '失敗'], ['success', '成功']];
export const ALLIANCES = [['red', '紅'], ['blue', '藍']];

// Points per action differ every season, so they are a per-device setting rather than hard-coded.
export const SCORING_FIELDS = [
  ['leave', '離開起始區'],
  ['auto', '自動每次得分'],
  ['teleop', '手動每次得分'],
  ['endgame', '終局成功'],
];

export function blankMatch(scout = '') {
  return {
    id: newId(), match: '', alliance: '', scout,
    leave: false, autoScored: 0, autoMissed: 0,
    teleScored: 0, teleMissed: 0, defense: false, defended: false,
    endgame: '', fouls: 0, broke: false, notes: '',
  };
}

export function matchSummary(matches, scoring = {}) {
  const n = matches.length;
  if (!n) return null;
  const sum = (k) => matches.reduce((a, m) => a + (Number(m[k]) || 0), 0);
  const count = (fn) => matches.filter(fn).length;
  const attempts = sum('autoScored') + sum('autoMissed') + sum('teleScored') + sum('teleMissed');
  const tried = count((m) => m.endgame === 'success' || m.endgame === 'fail');
  const ok = count((m) => m.endgame === 'success');
  const pts = Object.fromEntries(SCORING_FIELDS.map(([k]) => [k, num(scoring[k])]));
  const s = {
    n,
    leaveRate: (count((m) => m.leave) / n) * 100,
    autoScored: sum('autoScored') / n,
    teleScored: sum('teleScored') / n,
    cycles: (sum('teleScored') + sum('teleMissed')) / n,
    accuracy: attempts ? ((sum('autoScored') + sum('teleScored')) / attempts) * 100 : null,
    endgameRate: tried ? (ok / tried) * 100 : null,
    fouls: sum('fouls') / n,
    defenseRate: (count((m) => m.defense) / n) * 100,
    failures: count((m) => m.broke),
    autoPoints: pts.auto === null && pts.leave === null ? null
      : (sum('autoScored') * (pts.auto || 0) + count((m) => m.leave) * (pts.leave || 0)) / n,
    teleopPoints: pts.teleop === null ? null : (sum('teleScored') * pts.teleop) / n,
    endgamePoints: pts.endgame === null ? null : (ok * pts.endgame) / n,
  };
  s.scoredPerMatch = s.autoScored + s.teleScored;
  return s;
}

const round1 = (v) => (v == null ? null : String(Math.round(v * 10) / 10));

// Efficiency fields derived from match records; fields that can't be computed are left out.
export function efficiencyFromMatches(s) {
  const patch = {
    matches: String(s.n),
    autoPoints: round1(s.autoPoints),
    teleopPoints: round1(s.teleopPoints),
    endgamePoints: round1(s.endgamePoints),
    cycles: round1(s.cycles),
    accuracy: round1(s.accuracy),
    endgameRate: round1(s.endgameRate),
    failures: String(s.failures),
  };
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null));
}

const isEmpty = (v) => v === '' || v == null || (Array.isArray(v) && !v.length);

// Combine a record scouted on another device into an existing one for the same team.
export function mergeRecords(target, src) {
  const ids = new Set(target.matches.map((m) => m.id));
  for (const m of src.matches) if (!ids.has(m.id)) target.matches.push(m);
  for (const sec of ['team', 'robot', 'efficiency', 'strategy']) {
    for (const [k, v] of Object.entries(src[sec] || {})) if (isEmpty(target[sec][k]) && !isEmpty(v)) target[sec][k] = v;
  }
  if (!target.mechanisms.length) target.mechanisms = src.mechanisms;
  if (!target.params.length) target.params = src.params;
  return target;
}
