import { addDays, diffDays, type ISODate } from './dates';
import type { WeighIn } from './energy';
import type { KcalStep } from './types';

/** For each weigh-in, the mean of the weigh-ins of the n days ending that day. */
export function rollingMean(points: WeighIn[], n: number): { date: ISODate; value: number }[] {
  return points.map((p) => {
    const w = points.filter((q) => q.date <= p.date && diffDays(p.date, q.date) < n);
    return { date: p.date, value: w.reduce((a, q) => a + q.weight, 0) / w.length };
  });
}

export interface Period {
  n: number;
  mean?: number;
  min?: number;
  max?: number;
}

/** The weigh-ins from one date to another, both included. */
export function periodStats(points: WeighIn[], from: ISODate, to: ISODate): Period {
  const w = points.filter((p) => p.date >= from && p.date <= to).map((p) => p.weight);
  if (!w.length) return { n: 0 };
  return { n: w.length, mean: w.reduce((a, b) => a + b, 0) / w.length, min: Math.min(...w), max: Math.max(...w) };
}

export interface KcalBand {
  from: ISODate;
  to: ISODate;
  kcal: number;
}

/** The calorie target in force on each day between two dates, one band per step. */
export function kcalBands(plan: KcalStep[], from: ISODate, to: ISODate): KcalBand[] {
  const steps = [...plan].sort((a, b) => a.from.localeCompare(b.from));
  const out: KcalBand[] = [];
  steps.forEach((s, i) => {
    const end = i + 1 < steps.length ? addDays(steps[i + 1].from, -1) : to;
    const a = s.from > from ? s.from : from;
    const b = end < to ? end : to;
    if (a <= b) out.push({ from: a, to: b, kcal: s.kcal });
  });
  return out;
}

export interface TrendRead {
  now: Period;
  before: Period;
  delta?: number;
  verdict?: 'down' | 'flat' | 'up';
}

/** The mean of the last n days against the n days before, to the tenth of a kilo as shown: under 0.2 kg apart, it is flat. */
export function trendRead(points: WeighIn[], today: ISODate, n: number, flat = 0.2): TrendRead {
  const now = periodStats(points, addDays(today, 1 - n), today);
  const before = periodStats(points, addDays(today, 1 - 2 * n), addDays(today, -n));
  if (now.mean === undefined || before.mean === undefined) return { now, before };
  const delta = Math.round((now.mean - before.mean) * 10) / 10;
  return { now, before, delta, verdict: delta <= -flat ? 'down' : delta >= flat ? 'up' : 'flat' };
}
