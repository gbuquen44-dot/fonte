import { addDays, dateRange, diffDays, type ISODate } from './dates';
import type { DayLog, KcalStep, Phase, Profile } from './types';

export interface WeighIn {
  date: ISODate;
  weight: number;
}

export function weighIns(days: Record<ISODate, DayLog>): WeighIn[] {
  return Object.values(days)
    .filter((d) => typeof d.weight === 'number')
    .map((d) => ({ date: d.date, weight: d.weight as number }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Displayed trend, corrected for gaps between weigh-ins. */
export function ewma(points: WeighIn[], a = 0.1): { date: ISODate; value: number }[] {
  const out: { date: ISODate; value: number }[] = [];
  let t: number | undefined;
  let prev: ISODate | undefined;
  for (const p of points) {
    if (t === undefined || prev === undefined) t = p.weight;
    else {
      const gap = Math.max(1, diffDays(p.date, prev));
      t += (1 - Math.pow(1 - a, gap)) * (p.weight - t);
    }
    prev = p.date;
    out.push({ date: p.date, value: t });
  }
  return out;
}

export interface Regression {
  slope: number;
  sigma: number;
  n: number;
  mean: number;
  spanDays: number;
}

export function regress(points: WeighIn[]): Regression | null {
  const n = points.length;
  if (n < 2) return null;
  const x0 = points[0].date;
  const xs = points.map((p) => diffDays(p.date, x0));
  const ys = points.map((p) => p.weight);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (ys[i] - my - slope * (xs[i] - mx)) ** 2;
  const sigma = n > 2 ? Math.sqrt(ss / (n - 2)) : 0;
  return { slope, sigma, n, mean: my, spanDays: xs[n - 1] - xs[0] + 1 };
}

export function targetKcal(plan: KcalStep[], date: ISODate): number | undefined {
  let cur: number | undefined;
  for (const s of [...plan].sort((a, b) => a.from.localeCompare(b.from))) {
    if (s.from <= date) cur = s.kcal;
  }
  return cur;
}

export function nextStep(plan: KcalStep[], date: ISODate): KcalStep | undefined {
  return [...plan].sort((a, b) => a.from.localeCompare(b.from)).find((s) => s.from > date);
}

export const GEL_DAYS = 10;
const GEL_TRIGGER_KCAL = 300;
const GEL_WINDOW = 14;

/** Days when the scale is not read: water and glycogen move faster than tissue. */
export function gelDates(p: Pick<Profile, 'kcalPlan' | 'events'>): Set<ISODate> {
  const out = new Set<ISODate>();
  const plan = [...p.kcalPlan].sort((a, b) => a.from.localeCompare(b.from));
  for (let i = 1; i < plan.length; i++) {
    let sum = 0;
    for (let j = i; j >= 1 && diffDays(plan[i].from, plan[j].from) <= GEL_WINDOW; j--) {
      sum += plan[j].kcal - plan[j - 1].kcal;
    }
    if (sum >= GEL_TRIGGER_KCAL) {
      for (let d = 0; d <= GEL_DAYS; d++) out.add(addDays(plan[i].from, d));
    }
  }
  for (const e of p.events) for (let d = 0; d <= 12; d++) out.add(addDays(e.date, d));
  return out;
}

export function gelEnd(p: Pick<Profile, 'kcalPlan' | 'events'>, date: ISODate): ISODate | null {
  const all = gelDates(p);
  if (!all.has(date)) return null;
  let d = date;
  while (all.has(addDays(d, 1))) d = addDays(d, 1);
  return d;
}

export const BANDS: Record<Phase, [number, number]> = {
  remontee: [-0.2, 0.2],
  stabilisation: [-0.2, 0.2],
  recuperation: [0.2, 0.65],
  prise: [0.1, 0.4],
};

export interface WindowRead {
  reg: Regression;
  slopePct: number;
  windowDays: number;
  weighIns: number;
  kcalDays: number;
  meanKcal: number | null;
}

export function readWindow(days: Record<ISODate, DayLog>, end: ISODate, length: number, gel: Set<ISODate>): WindowRead | null {
  const range = dateRange(end, length).filter((d) => !gel.has(d));
  const points = range.flatMap((d) => (typeof days[d]?.weight === 'number' ? [{ date: d, weight: days[d].weight as number }] : []));
  const reg = regress(points);
  if (!reg) return null;
  const kcals = range.flatMap((d) => (typeof days[d]?.kcal === 'number' ? [days[d].kcal as number] : []));
  return {
    reg,
    slopePct: ((reg.slope * 7) / reg.mean) * 100,
    windowDays: range.length,
    weighIns: points.length,
    kcalDays: kcals.length,
    meanKcal: kcals.length ? kcals.reduce((a, b) => a + b, 0) / kcals.length : null,
  };
}

export interface Maintenance {
  value: number;
  low: number;
  high: number;
  source: 'estimate' | 'data';
}

const RHO = 7700;

/** Olive oil he eats every day and does not log in Yazio. */
export const UNLOGGED_FAT = 10;
const UNLOGGED_KCAL = 90;

export function estimateMaintenance(p: Profile, days: Record<ISODate, DayLog>, end: ISODate): Maintenance {
  const fallback: Maintenance = { value: p.maintenance, low: p.maintenanceLow, high: p.maintenanceHigh, source: 'estimate' };
  const w = readWindow(days, end, 28, gelDates(p));
  if (!w || w.weighIns < 12 || w.kcalDays < 14 || w.meanKcal === null || w.windowDays < 21) return fallback;
  const value = w.meanKcal + UNLOGGED_KCAL - RHO * w.reg.slope;
  const n = w.reg.spanDays;
  const se = w.reg.sigma * Math.sqrt(12 / (n ** 3 - n)) * 1.6;
  const half = 1.96 * RHO * se;
  return { value, low: value - half, high: value + half, source: 'data' };
}

export type DecisionKind = 'plan' | 'nodata' | 'frozen' | 'wait' | 'keep' | 'up' | 'down';

export interface Decision {
  kind: DecisionKind;
  delta: number;
  title: string;
  why: string;
  slopePct?: number;
  windowDays?: number;
}

export function weightFloorKcal(): number {
  return 1800;
}

/** The Monday rule: 28-day slope, ±100 kcal, 14 days between changes. */
export function mondayDecision(p: Profile, days: Record<ISODate, DayLog>, today: ISODate): Decision {
  const plan = [...p.kcalPlan].sort((a, b) => a.from.localeCompare(b.from));
  const pending = plan.find((s) => s.from > today);
  if (pending) {
    return {
      kind: 'plan',
      delta: 0,
      title: 'La montée suit ton plan',
      why: `Prochain palier : ${pending.kcal.toLocaleString('fr-FR')} kcal.`,
    };
  }

  const gel = gelDates(p);
  if (gel.has(today)) {
    return { kind: 'frozen', delta: 0, title: 'Balance en pause', why: 'Le poids bouge surtout par l\'eau et le glycogène. Aucune décision pour l\'instant.' };
  }

  const last = plan[plan.length - 1];
  const start = plan[1]?.from ?? plan[0]?.from;
  if (last && diffDays(today, last.from) < 14) {
    return { kind: 'wait', delta: 0, title: 'Cible gardée', why: 'Dernier changement il y a moins de 14 jours.' };
  }

  let w = readWindow(days, today, 28, gel);
  const enough = (r: WindowRead | null) =>
    !!r && r.windowDays >= 21 && r.weighIns >= Math.ceil((r.windowDays * 20) / 28) && r.kcalDays >= Math.ceil((r.windowDays * 22) / 28);
  if (w && w.reg.sigma > 0.6) w = readWindow(days, today, 42, gel) ?? w;
  const recent = dateRange(today, 7).filter((d) => typeof days[d]?.kcal === 'number').length;
  if (!enough(w) || !w || recent < 4) {
    return { kind: 'nodata', delta: 0, title: 'Semaine sans décision', why: 'Il faut au moins 20 pesées et 22 jours de calories sur 28. Rien ne change.' };
  }

  let [low, high] = BANDS[p.phase];
  if (p.symptoms.length) high = Math.max(high, 0.65);
  const s = w.slopePct;
  const recentStart = start ? diffDays(today, start) < 21 : false;
  const base = { slopePct: s, windowDays: w.windowDays };
  const fmt = s.toFixed(2).replace('.', ',');

  if (p.phase === 'stabilisation' && s < -0.25) {
    return { ...base, kind: 'up', delta: 200, title: '+200 kcal', why: `Tu perds encore ${fmt} %/semaine.` };
  }
  if (s < low) return { ...base, kind: 'up', delta: 100, title: '+100 kcal, surtout en glucides', why: `Pente de ${fmt} %/semaine, sous ta bande.` };
  if (s > high) {
    if (recentStart) return { ...base, kind: 'keep', delta: 0, title: 'Rien à changer', why: 'Pas de baisse pendant les 21 premiers jours.' };
    return { ...base, kind: 'down', delta: -100, title: '−100 kcal', why: `Pente de ${fmt} %/semaine, au-dessus de ta bande.` };
  }
  return { ...base, kind: 'keep', delta: 0, title: 'Rien à changer', why: `Pente de ${fmt} %/semaine, dans ta bande.` };
}

export interface StepsRead {
  m7: number | null;
  m28: number | null;
}

/** Days under 1,500 steps with a session are treated as undercounted. */
export function stepsRead(days: Record<ISODate, DayLog>, end: ISODate, sessionDates: Set<ISODate>): StepsRead {
  const mean = (n: number) => {
    const v = dateRange(end, n).flatMap((d) => {
      const s = days[d]?.steps;
      if (typeof s !== 'number') return [];
      if (s < 1500 && sessionDates.has(d)) return [];
      return [s];
    });
    return v.length >= Math.ceil(n / 2) ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  return { m7: mean(7), m28: mean(28) };
}

export function mean7(days: Record<ISODate, DayLog>, end: ISODate, field: keyof DayLog, span = 7): number | null {
  const v = dateRange(end, span).flatMap((d) => {
    const x = days[d]?.[field];
    return typeof x === 'number' ? [x] : [];
  });
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export interface Macros {
  protein: number;
  fat: number;
  carbs: number;
}

export const fatFloor = (weight: number) => Math.round(weight * 0.6);

/** Protein holds at 140 g, fat at 0.6 g per kilo, the rest goes to carbs. The calorie target excludes the unlogged oil. */
export function macrosFor(kcal: number, weight: number): Macros {
  const protein = Math.round(Math.max(weight * 2, 140) / 5) * 5;
  const fat = fatFloor(weight);
  const carbs = Math.round((kcal - protein * 4 - (fat - UNLOGGED_FAT) * 9) / 4 / 5) * 5;
  return { protein, fat, carbs };
}
