import { addDays, dateRange, diffDays, type ISODate } from './dates';
import type { DayLog, LiftKey, SessionLog } from './types';
import { e1rm, liftOf, LIFTS } from './lifting';

export type Label = 'observation' | 'piste' | 'signal' | 'ecarte';

const LAMBDA = 0.15;
const GROWTH = 0.0005;
const BURN_IN = 4;

function median(v: number[]): number {
  const a = [...v].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function mad(v: number[]): number {
  const m = median(v);
  return 1.4826 * median(v.map((x) => Math.abs(x - m)));
}

export interface SprPoint {
  id: string;
  date: ISODate;
  key: string;
  week: number;
  block: number;
  spr: number;
}

/** Session performance: the e1RM of the day against its expected trend, built from past sessions only. */
export function sessionPerformance(sessions: SessionLog[]): SprPoint[] {
  const done = sessions.filter((s) => s.status === 'done').sort((a, b) => a.startedAt - b.startedAt);
  const state: Record<string, { lnE?: number; seen: number; residuals: number[] }> = {};
  for (const l of LIFTS) state[l] = { seen: 0, residuals: [] };
  const raw: { s: SessionLog; u: Partial<Record<LiftKey, number>> }[] = [];

  for (const s of done) {
    const u: Partial<Record<LiftKey, number>> = {};
    for (const lift of LIFTS) {
      const vals = s.sets.flatMap((x) => {
        if (liftOf(x.exId) !== lift || x.failed) return [];
        const r = e1rm(x.load, x.reps, x.rpe);
        return r ? [r.value] : [];
      });
      if (!vals.length) continue;
      const st = state[lift];
      const today = median(vals);
      if (st.lnE === undefined) {
        st.lnE = Math.log(today);
        st.seen = 1;
        continue;
      }
      const resid = 100 * (Math.log(today) - st.lnE);
      st.lnE += GROWTH + (LAMBDA * resid) / 100;
      st.seen++;
      if (st.seen > BURN_IN) {
        u[lift] = resid;
        st.residuals.push(resid);
      }
    }
    if (Object.keys(u).length) raw.push({ s, u });
  }

  return raw.map(({ s, u }) => {
    let num = 0;
    let den = 0;
    for (const [lift, v] of Object.entries(u)) {
      const res = state[lift].residuals;
      const spread = res.length >= 4 ? Math.max(mad(res), 1) : 3;
      num += (v as number) / spread ** 2;
      den += 1 / spread ** 2;
    }
    return { id: s.id, date: s.date, key: s.key, week: s.week, block: s.block, spr: num / den };
  });
}

export interface Candidate {
  id: string;
  title: string;
  question: string;
  rank: number;
  mu0: number;
  tau: number;
  pi1: number;
  own?: boolean;
  placebo?: boolean;
  value(s: SessionLog, ctx: Ctx): number | null;
}

interface Ctx {
  days: Record<ISODate, DayLog>;
  sessions: SessionLog[];
}

const nightOf = (ctx: Ctx, date: ISODate) => ctx.days[date]?.sleepH;

function avg(ctx: Ctx, end: ISODate, n: number, f: keyof DayLog): number | null {
  const v = dateRange(end, n).flatMap((d) => {
    const x = ctx.days[d]?.[f];
    return typeof x === 'number' ? [x] : [];
  });
  return v.length >= Math.ceil(n * 0.7) ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

const CARBS = { low: 0, mid: 1, high: 2 } as const;
const DELAY = { lt1: 0.5, '1-2': 1.5, '2-3': 2.5, '3-4': 3.5, '4p': 5, fasted: 9 } as const;

/** Stable coin flip from the session id, kept out of every other variable. */
function placeboBit(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000 < 0.5 ? 1 : 0;
}

/** Tracked questions, most plausible first, with priors from the science in % of performance. */
export const CANDIDATES: Candidate[] = [
  { id: 'sleep', title: 'Heures de sommeil la veille', question: 'Dors-tu mieux avant tes meilleures séances ?', rank: 1, mu0: 1, tau: 0.8, pi1: 0.3, value: (s, c) => nightOf(c, s.date) ?? null },
  { id: 'carbsPre', title: 'Glucides avant la séance', question: 'Ton intuition : beaucoup de glucides avant la séance, ça change tout ?', rank: 2, mu0: 0.7, tau: 0.8, pi1: 0.15, own: true, value: (s) => (s.pre ? CARBS[s.pre.carbs] : null) },
  { id: 'caffeine', title: 'Caféine avant la séance', question: 'Ta caféine t\'aide-t-elle vraiment ?', rank: 3, mu0: 0.5, tau: 0.5, pi1: 0.15, own: true, value: (s) => (s.pre ? s.pre.caffeineMg / 100 : null) },
  { id: 'delay', title: 'Délai depuis le dernier repas', question: 'Quel délai repas-séance te va le mieux ?', rank: 4, mu0: -0.4, tau: 0.5, pi1: 0.15, value: (s) => (s.pre ? DELAY[s.pre.mealDelay] : null) },
  { id: 'kcalYesterday', title: 'Calories de la veille', question: 'Ce que tu manges la veille joue-t-il sur ta séance ?', rank: 5, mu0: 0.15, tau: 0.2, pi1: 0.15, value: (s, c) => { const k = c.days[addDays(s.date, -1)]?.kcal; return typeof k === 'number' ? (k - 2000) / 100 : null; } },
  { id: 'sleep3', title: 'Sommeil moyen sur 3 nuits', question: 'La dette de sommeil pèse-t-elle plus qu\'une mauvaise nuit ?', rank: 6, mu0: 1, tau: 0.8, pi1: 0.15, value: (s, c) => avg(c, s.date, 3, 'sleepH') },
  { id: 'stress', title: 'Stress de la veille', question: 'Ton stress hors salle baisse-t-il ta performance ?', rank: 7, mu0: -0.5, tau: 0.5, pi1: 0.15, value: (s, c) => { const x = c.days[s.date]?.stress; return typeof x === 'number' ? x : null; } },
  { id: 'recovery', title: 'Récupération du matin', question: 'Ta note du matin prédit-elle la séance ?', rank: 8, mu0: 0.4, tau: 0.4, pi1: 0.15, value: (s, c) => { const x = c.days[s.date]?.recovery; return typeof x === 'number' ? x : null; } },
  { id: 'hour', title: 'Heure de la séance', question: 'À quelle heure es-tu le plus fort ?', rank: 9, mu0: 0, tau: 0.3, pi1: 0.15, own: true, value: (s) => new Date(s.startedAt).getHours() },
  { id: 'steps', title: 'Pas de la veille', question: 'Trop marcher la veille pèse-t-il sur les jambes ?', rank: 10, mu0: -0.1, tau: 0.2, pi1: 0.15, own: true, value: (s, c) => { const x = c.days[addDays(s.date, -1)]?.steps; return typeof x === 'number' ? x / 1000 : null; } },
  { id: 'placebo', title: 'Variable de contrôle', question: 'Contrôle du moteur : doit rester sans effet.', rank: 99, mu0: 0, tau: 0.5, pi1: 0.05, placebo: true, value: (s) => placeboBit(s.id) },
];

function budgetFor(days: number): number {
  if (days < 30) return 0;
  if (days < 60) return 5;
  if (days < 120) return 10;
  if (days < 365) return 20;
  return 40;
}

function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export function evidence(b: number, se: number, mu0: number, tau: number, pi1: number, swc: number) {
  const logN = (x: number, m: number, v: number) => -0.5 * (Math.log(2 * Math.PI * v) + (x - m) ** 2 / v);
  const bf10 = Math.exp(logN(b, mu0, se ** 2 + tau ** 2) - logN(b, 0, se ** 2));
  const pip = (pi1 * bf10) / (pi1 * bf10 + 1 - pi1);
  const v = 1 / (1 / se ** 2 + 1 / tau ** 2);
  const m = v * (b / se ** 2 + mu0 / tau ** 2);
  const pSwc = pip * normCdf((Math.abs(m) - swc) / Math.sqrt(v));
  return { bf10, pip, m, lo: m - 1.645 * Math.sqrt(v), hi: m + 1.645 * Math.sqrt(v), pSwc };
}

/** Removes session type and block-week effects from a series. */
function residualize(v: number[], groups: string[]): number[] {
  const sums: Record<string, { s: number; n: number }> = {};
  v.forEach((x, i) => {
    const g = (sums[groups[i]] ??= { s: 0, n: 0 });
    g.s += x;
    g.n++;
  });
  return v.map((x, i) => x - sums[groups[i]].s / sums[groups[i]].n);
}

function acf1(v: number[]): number {
  const n = v.length;
  const m = v.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    den += (v[i] - m) ** 2;
    if (i) num += (v[i] - m) * (v[i - 1] - m);
  }
  return den ? num / den : 0;
}

export interface Fit {
  b: number;
  se: number;
  n: number;
  sigma: number;
}

/** Slope with standard error inflated for autocorrelated residuals. */
export function fitEffect(y: number[], x: number[], groups: string[]): Fit | null {
  const ry = residualize(y, groups);
  const rx = residualize(x, groups);
  const n = y.length;
  const sxx = rx.reduce((a, b) => a + b * b, 0);
  if (sxx < 1e-9 || n < 6) return null;
  const b = rx.reduce((a, v, i) => a + v * ry[i], 0) / sxx;
  const res = ry.map((v, i) => v - b * rx[i]);
  const k = new Set(groups).size;
  const df = Math.max(1, n - k - 1);
  const s2 = res.reduce((a, v) => a + v * v, 0) / df;
  const phi = Math.min(0.6, Math.max(0, acf1(res)));
  const rho = Math.min(0.9, Math.max(0, acf1(rx)));
  const f = (1 + phi * rho) / (1 - phi * rho);
  return { b, se: Math.sqrt((s2 / sxx) * f), n, sigma: Math.sqrt(s2) };
}

export interface Finding {
  candidate: Candidate;
  label: Label;
  n: number;
  needed: number;
  effect?: number;
  lo?: number;
  hi?: number;
  pip?: number;
}

export interface InsightReport {
  historyDays: number;
  sessions: number;
  budget: number;
  sigma: number | null;
  findings: Finding[];
}

export function analyze(sessions: SessionLog[], days: Record<ISODate, DayLog>, today: ISODate): InsightReport {
  const done = sessions.filter((s) => s.status === 'done').sort((a, b) => a.startedAt - b.startedAt);
  const spr = sessionPerformance(done);
  const first = done[0]?.date;
  const historyDays = first ? diffDays(today, first) + 1 : 0;
  const budget = budgetFor(historyDays);
  const ctx: Ctx = { days, sessions: done };
  const sigma = spr.length >= 8 ? mad(spr.map((p) => p.spr)) : null;
  const byId = new Map(done.map((s) => [s.id, s]));

  const active = [...CANDIDATES].sort((a, b) => a.rank - b.rank);
  const findings: Finding[] = active.map((candidate, index) => {
    const rows = spr.flatMap((p) => {
      const s = byId.get(p.id);
      const x = s ? candidate.value(s, ctx) : null;
      return x === null || x === undefined ? [] : [{ y: p.spr, x, g: `${p.key}-${p.week % 5}` }];
    });
    const n = rows.length;
    const needed = Math.max(0, 16 - n);
    if (budget === 0 || (index >= budget && !candidate.placebo)) return { candidate, label: 'observation', n, needed };
    const fit = fitEffect(rows.map((r) => r.y), rows.map((r) => r.x), rows.map((r) => r.g));
    if (!fit) return { candidate, label: 'observation', n, needed };
    const swc = Math.max(0.3, 0.1 * fit.sigma);
    const ev = evidence(fit.b, fit.se, candidate.mu0, candidate.tau, candidate.pi1, swc);
    let label: Label = 'observation';
    if (n >= 16 && historyDays >= 30 && ev.pip >= 0.5) label = 'piste';
    const half = Math.floor(n / 2);
    const a = fitEffect(rows.slice(0, half).map((r) => r.y), rows.slice(0, half).map((r) => r.x), rows.slice(0, half).map((r) => r.g));
    const c = fitEffect(rows.slice(half).map((r) => r.y), rows.slice(half).map((r) => r.x), rows.slice(half).map((r) => r.g));
    const stable = !!a && !!c && Math.sign(a.b) === Math.sign(c.b);
    if (label === 'piste' && n >= 40 && historyDays >= 60 && ev.pip >= 0.95 && ev.pSwc >= 0.8 && stable) label = 'signal';
    return { candidate, label, n, needed, effect: ev.m, lo: ev.lo, hi: ev.hi, pip: ev.pip };
  });

  return { historyDays, sessions: done.length, budget, sigma, findings };
}
