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
