import type { LiftKey, LoggedSet, PRBadge, SessionLog } from './types';
import { EXERCISES } from '../data/exercises';

export const LIFTS: LiftKey[] = ['squat', 'bench', 'deadlift'];
export const LIFT_LABEL: Record<LiftKey, string> = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };

export interface E1rmResult {
  value: number;
  high: boolean;
}

/** Brzycki on effective reps: load × 36 / (37 − r), with r = reps + RIR. */
export function e1rm(load: number, reps: number, rpe?: number): E1rmResult | null {
  if (rpe === undefined || rpe < 7 || load <= 0 || reps < 1) return null;
  const r = reps + (10 - rpe);
  if (r > 10) return null;
  const value = r <= 1 ? load : (load * 36) / (37 - r);
  return { value, high: r <= 5 && rpe >= 8 };
}

export function roundLoad(kg: number, step = 2.5): number {
  return Math.round(kg / step) * step;
}

export function floorLoad(kg: number, step = 2.5): number {
  return Math.floor(kg / step + 1e-9) * step;
}

export const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25] as const;
export type Plate = (typeof PLATES)[number];

/** Plates for one side of a 20 kg bar, heaviest first. */
export function platesPerSide(load: number, bar = 20): { plates: Plate[]; rest: number } {
  let side = Math.max(0, (load - bar) / 2);
  const plates: Plate[] = [];
  for (const p of PLATES) {
    while (side + 1e-9 >= p) {
      plates.push(p);
      side -= p;
    }
  }
  return { plates, rest: Math.round(side * 2 * 100) / 100 };
}

export function liftOf(exId: string): LiftKey | undefined {
  return EXERCISES[exId]?.lift;
}

export function bestE1rmOf(sets: LoggedSet[], lift: LiftKey): number | undefined {
  let best: number | undefined;
  for (const s of sets) {
    if (liftOf(s.exId) !== lift || s.failed) continue;
    const r = e1rm(s.load, s.reps, s.rpe);
    if (r && (best === undefined || r.value > best)) best = r.value;
  }
  return best;
}

export interface LiftPoint {
  date: string;
  value: number;
}

export function e1rmSeries(sessions: SessionLog[], lift: LiftKey): LiftPoint[] {
  const out: LiftPoint[] = [];
  for (const s of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) {
    const v = bestE1rmOf(s.sets, lift);
    if (v !== undefined) out.push({ date: s.date, value: v });
  }
  return out;
}

/** Rolling mean of the last three valid e1RM of a lift. */
export function rolling3(series: LiftPoint[]): LiftPoint[] {
  return series.map((p, i) => {
    const w = series.slice(Math.max(0, i - 2), i + 1);
    return { date: p.date, value: w.reduce((a, b) => a + b.value, 0) / w.length };
  });
}

export function currentE1rm(sessions: SessionLog[], lift: LiftKey, fallback: number): number {
  const r = rolling3(e1rmSeries(sessions, lift));
  return r.length ? r[r.length - 1].value : fallback;
}

export interface TrendReading {
  value: number;
  change: number;
  verdict: 'probable' | 'flat' | 'unknown';
}

/** +3.5 % on the rolling mean reads as probable progress. */
export function liftTrend(sessions: SessionLog[], lift: LiftKey): TrendReading | null {
  const r = rolling3(e1rmSeries(sessions, lift));
  if (!r.length) return null;
  const last = r[r.length - 1].value;
  if (r.length < 6) return { value: last, change: 0, verdict: 'unknown' };
  const before = r[r.length - 4].value;
  const change = last / before - 1;
  return { value: last, change, verdict: change >= 0.035 ? 'probable' : 'flat' };
}

export function detectPRs(
  sets: LoggedSet[],
  history: SessionLog[],
  best: Record<LiftKey, number>,
  block: number,
): PRBadge[] {
  const out: PRBadge[] = [];
  const recovery = block <= 2;
  for (const lift of LIFTS) {
    const past1rm = Math.max(
      best[lift],
      ...history.flatMap((s) => s.sets.filter((x) => liftOf(x.exId) === lift && x.reps === 1 && !x.failed).map((x) => x.load)),
    );
    const single = Math.max(0, ...sets.filter((x) => liftOf(x.exId) === lift && x.reps === 1 && !x.failed).map((x) => x.load));
    if (single > past1rm) out.push({ lift, kind: '1RM', value: single, previous: past1rm, recovery });

    const pastE = Math.max(best[lift], ...history.map((s) => bestE1rmOf(s.sets, lift) ?? 0));
    const cur = bestE1rmOf(sets, lift);
    if (cur !== undefined && cur >= pastE + 1 && single <= past1rm) {
      out.push({ lift, kind: 'e1RM', value: cur, previous: pastE, recovery });
    }
  }
  return out;
}

export function tonnage(sets: LoggedSet[]): number {
  return sets.reduce((a, s) => a + (s.failed ? 0 : s.load * s.reps), 0);
}

export interface Attempt {
  label: string;
  load: number;
  aim: string;
}

/** Attempts for a true max: 90–92 %, 95–97 %, then the best up to +2 %. */
export function attempts(best: number): Attempt[] {
  const a1 = floorLoad(best * 0.92);
  const a2 = roundLoad(best * 0.96);
  const a3 = roundLoad(best * 1.01);
  return [
    { label: 'Essai 1', load: a1, aim: 'Passable un mauvais jour' },
    { label: 'Essai 2', load: a2, aim: 'Confirmer et décider' },
    { label: 'Essai 3', load: Math.max(a3, a2 + 2.5), aim: 'PR propre, jamais plus de 2 % au-dessus' },
  ];
}
