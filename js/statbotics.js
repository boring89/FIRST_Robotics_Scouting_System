// Statbotics v3 API client (https://api.statbotics.io/v3, CORS enabled, no key needed).

const API = 'https://api.statbotics.io/v3';

async function get(path) {
  const res = await fetch(API + path);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Statbotics 回應錯誤 (${res.status})`);
  return res.json();
}

const mean = (v) => (v && typeof v === 'object' ? v.mean : v) ?? null;

// Breakdown keys shown as headline tiles; the rest are game-specific and listed separately.
const CORE_KEYS = new Set(['total_points', 'auto_points', 'teleop_points', 'endgame_points', 'tiebreaker_points', 'rp_1', 'rp_2', 'rp_3']);

export async function fetchStatbotics(team, year) {
  const [info, season, events] = await Promise.all([
    get(`/team/${team}`),
    get(`/team_year/${team}/${year}`),
    get(`/team_events?team=${team}&year=${year}`),
  ]);
  if (!info) throw new Error(`Statbotics 找不到隊伍 ${team}`);

  const breakdown = season?.epa?.breakdown || {};
  return {
    fetchedAt: new Date().toISOString(),
    year: Number(year),
    team: {
      name: info.name,
      country: info.country,
      state: info.state,
      district: info.district,
      rookieYear: info.rookie_year,
      record: info.record,
      normEpa: info.norm_epa,
    },
    season: season && {
      epa: mean(season.epa?.total_points),
      auto: mean(breakdown.auto_points),
      teleop: mean(breakdown.teleop_points),
      endgame: mean(breakdown.endgame_points),
      norm: season.epa?.norm ?? null,
      stats: season.epa?.stats || {},
      ranks: season.epa?.ranks || {},
      record: season.record || null,
      gameBreakdown: Object.entries(breakdown)
        .filter(([k, v]) => !CORE_KEYS.has(k) && typeof mean(v) === 'number')
        .map(([k, v]) => [k, mean(v)]),
    },
    events: (events || [])
      .sort((a, b) => (a.time || 0) - (b.time || 0))
      .map((e) => ({
        key: e.event,
        name: e.event_name,
        week: e.week,
        status: e.status,
        epa: mean(e.epa?.total_points),
        qualRank: e.record?.qual?.rank ?? null,
        numTeams: e.record?.qual?.num_teams ?? null,
        record: e.record?.total || null,
      })),
  };
}

export const fmt = (v, digits = 1) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(digits) : '—');

export const fmtRecord = (r) => (r && r.count ? `${r.wins}-${r.losses}-${r.ties}` : '—');

export function fmtRank(r) {
  if (!r || !r.rank) return '—';
  const top = r.percentile != null ? `（前 ${Math.max(0.1, (1 - r.percentile) * 100).toFixed(1)}%）` : '';
  return `#${r.rank} / ${r.team_count}${top}`;
}

export const breakdownLabel = (k) => k.replace(/_/g, ' ').replace(/\brp\b/g, 'RP');

export const statboticsUrl = (team, year) => `https://www.statbotics.io/team/${team}${year ? `/${year}` : ''}`;
