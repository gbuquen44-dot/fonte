import type { ISODate } from './dates';
import type { LoggedSet, Muscle, SessionLog } from './types';
import { EXERCISES } from '../data/exercises';

/** One number per set that rises with load and with reps, so 50 kg × 9 beats 50 kg × 7. */
export const setScore = (x: Pick<LoggedSet, 'load' | 'reps'>) => x.load * (1 + x.reps / 30) + x.reps * 0.01;

export interface BestSet {
  date: ISODate;
  load: number;
  reps: number;
  score: number;
}

/** His best working set of an exercise in each session, oldest first. */
export function bestSets(sessions: SessionLog[], exId: string, since?: ISODate): BestSet[] {
  const out: BestSet[] = [];
  for (const s of [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt)) {
    if (since && s.date < since) continue;
    const sets = s.sets.filter((x) => x.exId === exId && !x.failed && x.reps > 0 && x.type === 'acc');
    if (!sets.length) continue;
    const top = sets.reduce((a, b) => (setScore(b) > setScore(a) ? b : a));
    out.push({ date: s.date, load: top.load, reps: top.reps, score: setScore(top) });
  }
  return out;
}

export type Move = 'up' | 'same' | 'down' | 'new';

export interface ExerciseProgress {
  exId: string;
  first?: BestSet;
  last?: BestSet;
  move: Move;
  /** "+2,5 kg", "+2 reps", "=" or "−1 rep", in plain words. */
  delta: string;
}

const kgText = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

export function progressOf(sessions: SessionLog[], exId: string, since: ISODate): ExerciseProgress {
  const list = bestSets(sessions, exId, since);
  const first = list[0];
  const last = list[list.length - 1];
  if (!first || !last || list.length < 2) {
    const before = bestSets(sessions, exId).pop();
    return { exId, first, last: last ?? before, move: 'new', delta: first ? '1re séance' : 'à venir' };
  }
  const dLoad = last.load - first.load;
  const dReps = last.reps - first.reps;
  const move: Move = last.score > first.score + 1e-6 ? 'up' : last.score < first.score - 1e-6 ? 'down' : 'same';
  if (dLoad !== 0) return { exId, first, last, move, delta: `${dLoad > 0 ? '+' : '−'}${kgText(Math.abs(dLoad))} kg` };
  if (dReps !== 0) return { exId, first, last, move, delta: `${dReps > 0 ? '+' : '−'}${Math.abs(dReps)} rep${Math.abs(dReps) > 1 ? 's' : ''}` };
  return { exId, first, last, move, delta: '=' };
}

/** The muscles he wants to push first. */
export const PRIORITY: Muscle[] = ['pecs', 'biceps', 'deltLat'];

export const mainOf = (exId: string): Muscle | undefined => {
  const m = EXERCISES[exId]?.muscles;
  return m ? (Object.keys(m) as Muscle[]).find((k) => m[k] === 1) : undefined;
};
