import { addDays, dateRange, type ISODate } from './dates';
import type { DayLog, Profile, SessionLog } from './types';
import { targetKcal } from './energy';
import { sessionPerformance } from './insights';

export type LinkState = 'attente' | 'apercu' | 'tendance';
type Bin = 'hi' | 'lo' | null;
type Unit = 'note' | 'pct' | 'forme' | 'heures' | 'qualite';

export interface Side {
  label: string;
  n: number;
  mean: number | null;
}

export interface Link {
  id: string;
  title: string;
  outcome: string;
  unit: Unit;
  hi: Side;
  lo: Side;
  state: LinkState;
  /** Points still missing before the first comparison. */
  needed: number;
  d: number;
  /** Which side looks better, when there is a visible gap. */
  better: 'hi' | 'lo' | null;
}

interface Ctx {
  days: Record<ISODate, DayLog>;
  profile: Profile;
}

interface SessionDef {
  id: string;
  title: string;
  hi: string;
  lo: string;
  bin(s: SessionLog, c: Ctx): Bin;
}

interface DayDef {
  id: string;
  title: string;
  hi: string;
  lo: string;
  outcome: string;
  unit: Unit;
  bin(date: ISODate, c: Ctx): Bin;
  y(date: ISODate, c: Ctx): number | undefined;
}

const cut = (v: number | undefined | null, high: number, low: number): Bin => (typeof v !== 'number' ? null : v >= high ? 'hi' : v < low ? 'lo' : null);

function mean3(c: Ctx, end: ISODate, f: keyof DayLog): number | undefined {
  const v = dateRange(end, 3).flatMap((d) => {
    const x = c.days[d]?.[f];
    return typeof x === 'number' ? [x] : [];
  });
  return v.length >= 2 ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
}

const SESSION_DEFS: SessionDef[] = [
  { id: 'sleep', title: 'Sommeil de la nuit', hi: '7 h 30 ou plus', lo: 'Moins de 7 h', bin: (s, c) => cut(c.days[s.date]?.sleepH, 7.5, 7) },
  { id: 'sleep3', title: 'Sommeil sur 3 nuits', hi: '7 h 30 ou plus', lo: 'Moins de 7 h', bin: (s, c) => cut(mean3(c, s.date, 'sleepH'), 7.5, 7) },
  {
    id: 'kcal',
    title: 'Calories de la veille',
    hi: 'Cible atteinte',
    lo: 'Sous la cible',
    bin: (s, c) => {
      const d = addDays(s.date, -1);
      const k = c.days[d]?.kcal;
      const t = targetKcal(c.profile.kcalPlan, d);
      return typeof k !== 'number' || t === undefined ? null : k >= t - 100 ? 'hi' : k < t - 250 ? 'lo' : null;
    },
  },
  { id: 'protein', title: 'Protéines de la veille', hi: '130 g ou plus', lo: 'Moins de 110 g', bin: (s, c) => cut(c.days[addDays(s.date, -1)]?.protein, 130, 110) },
  { id: 'carbs', title: 'Glucides de la veille', hi: '250 g ou plus', lo: 'Moins de 200 g', bin: (s, c) => cut(c.days[addDays(s.date, -1)]?.carbs, 250, 200) },
  { id: 'pre', title: 'Repas avant la séance', hi: 'Beaucoup de glucides', lo: 'Peu de glucides', bin: (s) => (!s.pre ? null : s.pre.carbs === 'high' ? 'hi' : s.pre.carbs === 'low' ? 'lo' : null) },
  { id: 'delay', title: 'Délai du repas', hi: '1 à 3 h avant', lo: 'Autre délai', bin: (s) => (!s.pre ? null : s.pre.mealDelay === '1-2' || s.pre.mealDelay === '2-3' ? 'hi' : 'lo') },
  { id: 'caffeine', title: 'Caféine', hi: '200 mg ou plus', lo: '100 mg ou moins', bin: (s) => (!s.pre ? null : s.pre.caffeineMg >= 200 ? 'hi' : 'lo') },
  { id: 'steps', title: 'Pas de la veille', hi: '10 000 ou plus', lo: 'Moins de 6 000', bin: (s, c) => cut(c.days[addDays(s.date, -1)]?.steps, 10000, 6000) },
  { id: 'stress', title: 'Stress', hi: 'Calme', lo: 'Stress marqué', bin: (s, c) => { const x = c.days[s.date]?.stress; return typeof x !== 'number' ? null : x <= 1 ? 'hi' : x >= 2 ? 'lo' : null; } },
  { id: 'recovery', title: 'Forme du matin', hi: 'En forme', lo: 'Fatigué', bin: (s, c) => cut(c.days[s.date]?.recovery, 7, 6) },
  { id: 'hour', title: 'Heure de la séance', hi: 'Après 17 h', lo: 'Avant 17 h', bin: (s) => (new Date(s.startedAt).getHours() >= 17 ? 'hi' : 'lo') },
];

const DAY_DEFS: DayDef[] = [
  { id: 'night-rec', title: 'Sommeil et forme du matin', hi: '7 h 30 ou plus', lo: 'Moins de 7 h', outcome: 'Forme du matin', unit: 'forme', bin: (d, c) => cut(c.days[d]?.sleepH, 7.5, 7), y: (d, c) => c.days[d]?.recovery },
  { id: 'kcal-rec', title: 'Calories et forme du lendemain', hi: 'Cible atteinte', lo: 'Sous la cible', outcome: 'Forme du lendemain', unit: 'forme', bin: (d, c) => { const y = addDays(d, -1); const k = c.days[y]?.kcal; const t = targetKcal(c.profile.kcalPlan, y); return typeof k !== 'number' || t === undefined ? null : k >= t - 100 ? 'hi' : k < t - 250 ? 'lo' : null; }, y: (d, c) => c.days[d]?.recovery },
  { id: 'steps-rec', title: 'Pas et forme du lendemain', hi: '10 000 ou plus', lo: 'Moins de 6 000', outcome: 'Forme du lendemain', unit: 'forme', bin: (d, c) => cut(c.days[addDays(d, -1)]?.steps, 10000, 6000), y: (d, c) => c.days[d]?.recovery },
  { id: 'late-coffee', title: 'Caféine tardive et sommeil', hi: 'Sans caféine tardive', lo: 'Avec caféine tardive', outcome: 'Heures dormies', unit: 'heures', bin: (d, c) => { const x = c.days[d]; return !x?.checkinAt ? null : x.tags?.includes('Caféine tardive') ? 'lo' : 'hi'; }, y: (d, c) => c.days[d]?.sleepH },
  { id: 'late-meal', title: 'Repas tardif et sommeil', hi: 'Sans repas tardif', lo: 'Avec repas tardif', outcome: 'Qualité du sommeil', unit: 'qualite', bin: (d, c) => { const x = c.days[d]; return !x?.checkinAt ? null : x.tags?.includes('Repas tardif') ? 'lo' : 'hi'; }, y: (d, c) => c.days[d]?.sleepQ },
];

const MIN_SIDE = 3;
const STRONG_SIDE = 5;
const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

function effect(a: number[], b: number[]): number {
  if (a.length < 2 || b.length < 2) return 0;
  const ma = avg(a) as number;
  const mb = avg(b) as number;
  const va = a.reduce((s, x) => s + (x - ma) ** 2, 0) / (a.length - 1);
  const vb = b.reduce((s, x) => s + (x - mb) ** 2, 0) / (b.length - 1);
  const sd = Math.sqrt((va + vb) / 2);
  return sd > 1e-9 ? (ma - mb) / sd : ma === mb ? 0 : Math.sign(ma - mb) * 2;
}

function build(id: string, title: string, outcome: string, unit: Unit, hiLabel: string, loLabel: string, hi: number[], lo: number[]): Link {
  const needed = Math.max(0, MIN_SIDE - hi.length) + Math.max(0, MIN_SIDE - lo.length);
  const d = effect(hi, lo);
  const state: LinkState = needed > 0 ? 'attente' : hi.length >= STRONG_SIDE && lo.length >= STRONG_SIDE && Math.abs(d) >= 0.5 ? 'tendance' : 'apercu';
  return {
    id,
    title,
    outcome,
    unit,
    hi: { label: hiLabel, n: hi.length, mean: avg(hi) },
    lo: { label: loLabel, n: lo.length, mean: avg(lo) },
    state,
    needed,
    d,
    better: state === 'attente' || Math.abs(d) < 0.3 ? null : d > 0 ? 'hi' : 'lo',
  };
}

const RANK: Record<LinkState, number> = { tendance: 0, apercu: 1, attente: 2 };

/**
 * Plain comparisons between what he does and how it goes. Force is used once
 * both sides hold enough heavy sessions, his own rating of the session before that.
 */
export function buildLinks(sessions: SessionLog[], days: Record<ISODate, DayLog>, profile: Profile, today: ISODate): Link[] {
  const done = sessions.filter((s) => s.status === 'done');
  const c: Ctx = { days, profile };
  const force = new Map(sessionPerformance(done).map((p) => [p.id, p.spr]));
  const out: Link[] = SESSION_DEFS.map((def) => {
    const bins = done.map((s) => ({ s, bin: def.bin(s, c) }));
    const pick = (b: Bin, f: (s: SessionLog) => number | undefined) => bins.flatMap((x) => { const y = f(x.s); return x.bin === b && typeof y === 'number' ? [y] : []; });
    const fHi = pick('hi', (s) => force.get(s.id));
    const fLo = pick('lo', (s) => force.get(s.id));
    if (fHi.length >= MIN_SIDE && fLo.length >= MIN_SIDE) return build(def.id, def.title, 'Force du jour', 'pct', def.hi, def.lo, fHi, fLo);
    const rate = (s: SessionLog) => s.post?.vsPlan;
    return build(def.id, def.title, 'Séance par rapport au plan', 'note', def.hi, def.lo, pick('hi', rate), pick('lo', rate));
  });
  const dates = Object.keys(days).filter((d) => d <= today).sort();
  for (const def of DAY_DEFS) {
    const hi: number[] = [];
    const lo: number[] = [];
    for (const d of dates) {
      const b = def.bin(d, c);
      const y = def.y(d, c);
      if (typeof y !== 'number' || !b) continue;
      (b === 'hi' ? hi : lo).push(y);
    }
    out.push(build(def.id, def.title, def.outcome, def.unit, def.hi, def.lo, hi, lo));
  }
  return out.sort((a, b) => RANK[a.state] - RANK[b.state] || Math.abs(b.d) - Math.abs(a.d) || a.needed - b.needed);
}
