import type { LiftKey, PlannedExercise, PlannedSession, PlannedSet, Profile, SessionKey, SetType } from './types';
import { addDays, dayKey, diffDays, mondayOf, type ISODate } from './dates';
import { roundLoad } from './lifting';
import { EXERCISES } from '../data/exercises';

export interface Located {
  week: number;
  block: number;
  blockWeek: number;
  key: SessionKey | null;
}

/** Where a date falls in the program. Weeks start on Monday, Thursday is off, and a moved day wins. */
export function locate(date: ISODate, programStart: ISODate, moves?: Profile['moves']): Located | null {
  const d = diffDays(date, mondayOf(programStart));
  if (d < 0) return null;
  const week = Math.floor(d / 7) + 1;
  const block = Math.ceil(week / 5);
  const blockWeek = ((week - 1) % 5) + 1;
  const moved = moves?.[date];
  const k = dayKey(date);
  const key = moved ? (moved === 'off' ? null : moved) : k === 'thu' ? null : k;
  return { week, block, blockWeek, key };
}

const OFFSET: Record<SessionKey, number> = { mon: 0, tue: 1, wed: 2, fri: 4, sat: 5, sun: 6 };

export function dateOfSession(programStart: ISODate, block: number, blockWeek: number, key: SessionKey): ISODate {
  return addDays(mondayOf(programStart), ((block - 1) * 5 + blockWeek - 1) * 7 + OFFSET[key]);
}

/** The seven days of a program week, Monday first. */
export function weekDates(programStart: ISODate, block: number, blockWeek: number): ISODate[] {
  const monday = dateOfSession(programStart, block, blockWeek, 'mon');
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

type Row = [reps: number, pct: number, rpe: number | undefined, type: SetType, ref?: boolean];

/** Loads at failure for 1 to 12 reps, in % of the max: the usual RPE chart. */
const FAILURE = [100, 95.5, 92.2, 89.2, 86.3, 83.7, 81.1, 78.6, 76.2, 73.9, 70.7, 68.0];

function repsToFailure(pct: number): number {
  if (pct >= 100) return 1;
  for (let i = 1; i < FAILURE.length; i++) {
    if (pct >= FAILURE[i]) return i + (FAILURE[i - 1] - pct) / (FAILURE[i - 1] - FAILURE[i]);
  }
  return FAILURE.length + (FAILURE[FAILURE.length - 1] - pct) / 2.7;
}

/** The chart's RPE for these reps at this load, to the half point. */
export function chartRpe(reps: number, pct: number): number {
  return Math.min(10, Math.max(5, Math.round((10 - (repsToFailure(pct) - reps)) * 2) / 2));
}

/** Every heavy set gets an RPE: his own, the one of the set it repeats at the same load, or the chart's. */
function withRpe(rows: Row[]): Row[] {
  const out: Row[] = [];
  for (const row of rows) {
    const [reps, pct, rpe, type, ref] = row;
    const prev = out[out.length - 1];
    const repeats = prev && prev[0] === reps && prev[1] === pct && prev[2] !== undefined;
    out.push(rpe !== undefined || type === 'ramp' ? row : [reps, pct, repeats ? prev[2] : chartRpe(reps, pct), type, ref]);
  }
  return out;
}

function barbell(exId: string, rows: Row[], note?: string): PlannedExercise {
  return {
    exId,
    note,
    sets: withRpe(rows).map(([reps, pct, rpe, type, ref], i) => ({ id: `${exId}-${i}`, type, reps, pct, rpe, ref })),
  };
}

function rep(n: number, row: Row): Row[] {
  return Array.from({ length: n }, () => row);
}

/** He takes his accessory sets close to failure. */
const NEAR_FAILURE = 9.5;

function acc(exId: string, sets: number, reps: number, repsMax: number, opts: { group?: string; rpe?: number; note?: string; max?: boolean } = {}): PlannedExercise {
  const out: PlannedSet[] = Array.from({ length: sets }, (_, i) => ({
    id: `${exId}-${i}`,
    type: 'acc' as const,
    reps,
    repsMax,
    rpe: opts.rpe ?? NEAR_FAILURE,
    max: opts.max,
  }));
  return { exId, group: opts.group, note: opts.note, sets: out };
}

/* His squat, bench and deadlift programming, as he dictated it: one list per week of the block. */

const singles = (a: number, b: number, c: number, ra: number, rb: number, rc: number): Row[] => [
  [1, a, ra, 'ramp'],
  [1, b, rb, 'ramp', true],
  [1, c, rc, 'top'],
];

const RECORD: Row[] = [[1, 80, 3, 'ramp'], [1, 84, 5, 'ramp', true], [1, 90, 7, 'top'], [1, 95, 8.5, 'test'], [1, 100, 10, 'test']];

const MON_DEADLIFT: Row[][] = [
  [[5, 66, 2, 'ramp'], [5, 76, 5, 'ramp', true], [5, 82, 7, 'top'], ...rep(2, [5, 82, undefined, 'work'])],
  [[5, 66, 2, 'ramp'], [5, 76, 5, 'ramp', true], [5, 86, 8, 'top'], ...rep(2, [5, 80, undefined, 'drop'])],
  [[5, 68, 3, 'ramp'], [5, 74, 5, 'ramp', true], [5, 80, 7, 'work'], [5, 88, 9, 'top'], [5, 80, undefined, 'drop']],
  [[5, 68, 3, 'ramp'], [5, 74, 5, 'ramp', true], [5, 80, 7, 'top'], ...rep(2, [5, 80, undefined, 'work'])],
  [[5, 60, 3, 'ramp'], [5, 70, 5, 'ramp', true], [5, 75, 7, 'top'], [5, 75, undefined, 'work']],
];

const MON_CLOSE: Row[][] = [4, 5, 6, 4, 3].map((n) => [[3, 68, 2, 'ramp'], [3, 74, 5, 'ramp', true], ...rep(n, [3, 80, 7, 'work'])]);

const benchRamps = (n: number): Row[] => [50, 60, 70].slice(0, n).map((pct) => [7, pct, undefined, 'ramp']);

const WED_BENCH: Row[][] = [
  rep(3, [7, 75, undefined, 'work']),
  [...benchRamps(3), ...rep(4, [7, 75, undefined, 'work'])],
  [...benchRamps(3), ...rep(2, [7, 80, undefined, 'work']), [7, 70, undefined, 'drop']],
  [...benchRamps(3), ...rep(3, [7, 75, undefined, 'work'])],
  [...benchRamps(2), ...rep(3, [7, 70, undefined, 'work'])],
];

const WED_SQUAT: Row[][] = [
  [[3, 71, 2, 'ramp'], [3, 79, 5, 'ramp', true], [3, 84, 7, 'top'], ...rep(2, [7, 74, undefined, 'work'])],
  [[3, 74, 3, 'ramp'], [3, 80, 6, 'ramp', true], [3, 86, 8, 'top'], ...rep(3, [7, 74, undefined, 'work'])],
  [[3, 74, 3, 'ramp'], [3, 80, 6, 'ramp', true], [3, 87, 8, 'top'], ...rep(3, [7, 74, undefined, 'work'])],
  [[3, 71, 2, 'ramp'], [3, 79, 5, 'ramp', true], [3, 84, 7, 'top'], [3, 84, undefined, 'work'], ...rep(2, [7, 74, undefined, 'work'])],
  [[3, 72, 3, 'ramp'], [3, 80, 6, 'top'], [3, 80, undefined, 'work']],
];

const FRI_SQUAT: Row[][] = [
  [...singles(78, 84, 90, 2, 5, 7), ...rep(2, [1, 90, undefined, 'work'])],
  [...singles(80, 87, 93, 3, 6, 8), ...rep(2, [1, 93, undefined, 'work'])],
  [[1, 78, 2, 'ramp'], [1, 84, 5, 'ramp', true], [1, 90, 7, 'work'], [1, 95, 9, 'top'], [1, 90, undefined, 'drop']],
  [...singles(81, 87, 93, 3, 6, 8), [1, 93, undefined, 'work']],
  RECORD,
];

const FRI_BENCH: Row[][] = [
  FRI_SQUAT[0],
  FRI_SQUAT[1],
  [[1, 78, 2, 'ramp'], [1, 84, 5, 'ramp', true], [1, 90, 7, 'work'], [1, 95, 9, 'top'], [1, 95, undefined, 'work'], [1, 90, undefined, 'drop']],
  [[1, 78, 2, 'ramp'], [1, 84, 5, 'ramp', true], [1, 90, 7, 'work'], [1, 95, 9, 'top'], [1, 95, undefined, 'work']],
  RECORD,
];

const FRI_DEADLIFT: Row[][] = [
  [...FRI_SQUAT[0], [3, 80, 7, 'work'], ...rep(2, [3, 80, undefined, 'work'])],
  [...singles(81, 87, 93, 3, 6, 8), [1, 93, undefined, 'work'], [3, 87, 8, 'work'], [3, 87, undefined, 'work'], [3, 77, undefined, 'drop']],
  [[1, 78, 2, 'ramp'], [1, 84, 5, 'ramp', true], [1, 90, 7, 'work'], [1, 95, 9, 'top'], [1, 90, undefined, 'drop'], [3, 87, 8, 'work'], ...rep(2, [3, 87, undefined, 'work'])],
  [...singles(81, 87, 93, 3, 6, 8), [1, 93, undefined, 'work'], [3, 80, 7, 'work'], [3, 80, undefined, 'work']],
  RECORD,
];

const SUN_SQUAT: Row[][] = [
  [...singles(78, 85, 91, 3, 5, 7), [1, 91, undefined, 'work'], [5, 80, 8, 'work'], [5, 80, undefined, 'work'], [5, 70, undefined, 'drop']],
  [...singles(78, 85, 91, 3, 5, 7), [1, 91, undefined, 'work'], [5, 80, 8, 'work'], ...rep(2, [5, 80, undefined, 'work'])],
  [[5, 68, 3, 'ramp'], [5, 74, 5, 'ramp', true], [5, 80, 6, 'work'], [5, 86, 9, 'top'], ...rep(2, [5, 80, undefined, 'drop'])],
  [...singles(78, 85, 91, 3, 5, 7), [1, 91, undefined, 'work'], ...rep(3, [5, 77, 7, 'work'])],
  [...singles(75, 82, 87, 2, 4, 6), [1, 87, undefined, 'work'], ...rep(3, [5, 70, undefined, 'work'])],
];

const SUN_2CT: Row[][] = [
  [...singles(78, 85, 91, 3, 5, 7), ...rep(3, [5, 80, 8, 'work'])],
  [...singles(78, 85, 91, 3, 5, 7), ...rep(3, [5, 80, 8, 'work'])],
  [[5, 68, 3, 'ramp'], [5, 74, 6, 'ramp', true], [5, 80, 8, 'work'], [5, 86, 10, 'top'], [5, 80, undefined, 'drop'], [5, 74, undefined, 'drop']],
  [...singles(78, 85, 91, 3, 5, 7), ...rep(3, [5, 80, 8, 'work'])],
  [...singles(78, 85, 91, 3, 5, 7), ...rep(3, [5, 72, undefined, 'work'])],
];

const at = (rows: Row[][], week: number) => rows[Math.min(Math.max(week, 1), 5) - 1];

function monday(block: number, week: number): PlannedSession {
  return {
    key: 'mon',
    block,
    week,
    title: 'Deadlift + Close grip + Dos',
    subtitle: 'Chaîne arrière, haut de pecs, triceps',
    exercises: [
      barbell('deadlift', at(MON_DEADLIFT, week)),
      barbell('closeGrip', at(MON_CLOSE, week)),
      acc('smithIncline', 3, 8, 10),
      acc('rdl', 3, 8, 10, { rpe: 8.5 }),
      acc('tirageNeutre', 3, 8, 12, { group: 'a' }),
      acc('extCorde', 2, 10, 12, { group: 'a' }),
      acc('tirageHNeutre', 3, 8, 12),
    ],
  };
}

function tuesday(block: number, week: number): PlannedSession {
  return {
    key: 'tue',
    block,
    week,
    title: 'Dos + Épaules + Biceps',
    subtitle: 'Épaules, biceps, abdos',
    exercises: [
      acc('tractions', 3, 6, 6, { max: true }),
      acc('dmMachine', 3, 6, 10),
      acc('oiseau', 3, 12, 15),
      acc('elevMachine', 3, 12, 15, { group: 'a' }),
      acc('avantEpaule', 3, 10, 12, { group: 'a' }),
      acc('marteau', 2, 10, 12, { group: 'b' }),
      acc('elevHalteres', 3, 12, 15, { group: 'b' }),
      acc('bayesian', 2, 10, 12),
      acc('pupitre', 2, 10, 12, { group: 'c' }),
      acc('abdosPoulie', 3, 10, 15, { group: 'c' }),
    ],
  };
}

function wednesday(block: number, week: number): PlannedSession {
  return {
    key: 'wed',
    block,
    week,
    title: 'Bench + Squat + Pecs + Triceps',
    subtitle: 'Haut de pecs, triceps',
    exercises: [
      barbell('bench', at(WED_BENCH, week)),
      barbell('squat', at(WED_SQUAT, week)),
      acc('smithIncline', 3, 8, 10),
      acc('dips', 2, 8, 12),
      acc('pecPress', 2, 8, 12),
      acc('extV', 2, 10, 12),
      acc('barreFront', 2, 10, 12),
      acc('pecFly', 3, 12, 15),
    ],
  };
}

function friday(block: number, week: number): PlannedSession {
  const record = week === 5;
  const end = record ? 'Tes essais de record : arrête-toi si la barre ralentit trop.' : undefined;
  return {
    key: 'fri',
    block,
    week,
    title: record ? 'Records squat, bench, deadlift' : 'Squat + Bench + Deadlift',
    subtitle: record ? 'Semaine 5, tes records' : 'Lourd, ischios',
    exercises: [
      barbell('squat', at(FRI_SQUAT, week), end),
      barbell('bench', at(FRI_BENCH, week), record ? `Vraie pause sur la poitrine. ${end}` : undefined),
      barbell('deadlift', at(FRI_DEADLIFT, week), end),
      acc('benchHalteres2ct', 2, 8, 10, { note: 'Selon ta séance de SBD : passe-le si tu fatigues.' }),
      acc('legCurl', 2, 10, 12),
    ],
  };
}

function saturday(block: number, week: number): PlannedSession {
  return {
    key: 'sat',
    block,
    week,
    title: 'Dos + Épaules + Bras',
    subtitle: 'Dos, bras, épaules',
    exercises: [
      acc('tractions', 2, 6, 6, { max: true }),
      acc('tirageLarge', 2, 8, 12),
      acc('tirageHUni', 3, 8, 12),
      acc('curlPoulie', 2, 10, 12, { group: 'a' }),
      acc('extOverhead', 2, 10, 12, { group: 'a' }),
      acc('tirageHaut', 3, 10, 12),
      acc('bayesian', 2, 10, 12, { group: 'b' }),
      acc('extUni', 2, 12, 15, { group: 'b' }),
      acc('facePull', 3, 12, 15),
      acc('elevMachine', 2, 12, 15, { group: 'c' }),
      acc('abdos', 2, 10, 15, { group: 'c' }),
    ],
  };
}

function sunday(block: number, week: number): PlannedSession {
  return {
    key: 'sun',
    block,
    week,
    title: 'Squat + Bench 2CT + Jambes',
    subtitle: 'Quadriceps, fessiers, abdos',
    exercises: [
      barbell('squat', at(SUN_SQUAT, week)),
      barbell('bench2ct', at(SUN_2CT, week)),
      acc('pendulum', 3, 8, 10),
      acc('legExt', 3, 10, 12),
      acc('abduction', 3, 12, 15, { group: 'a' }),
      acc('releveJambes', 3, 10, 15, { group: 'a' }),
    ],
  };
}

const SESSIONS: Record<SessionKey, (block: number, week: number) => PlannedSession> = { mon: monday, tue: tuesday, wed: wednesday, fri: friday, sat: saturday, sun: sunday };

export function buildSession(block: number, week: number, key: SessionKey): PlannedSession {
  return SESSIONS[key](block, week);
}

export const SESSION_KEYS: SessionKey[] = ['mon', 'tue', 'wed', 'fri', 'sat', 'sun'];

export function buildWeek(block: number, week: number): PlannedSession[] {
  return SESSION_KEYS.map((k) => buildSession(block, week, k));
}

/** Sets that count as hard work, ramps excluded. */
export function hardSets(s: PlannedSession): number {
  return s.exercises.reduce((a, e) => a + e.sets.filter((x) => x.type !== 'ramp').length, 0);
}

export function plannedFor(date: ISODate, p: Pick<Profile, 'programStart' | 'moves'>): PlannedSession | null {
  const loc = locate(date, p.programStart, p.moves);
  return loc?.key ? buildSession(loc.block, loc.blockWeek, loc.key) : null;
}

export interface PlanRow {
  count: number;
  reps: number;
  repsMax?: number;
  max?: boolean;
  load?: number;
  rpe?: number;
  type: SetType;
}

/** Sets of an exercise, identical neighbours merged, loads in kilos. */
export function planRows(ex: PlannedExercise, tm: Record<LiftKey, number>): PlanRow[] {
  const def = EXERCISES[ex.exId];
  const lift = def?.lift ?? def?.tm;
  const rows: PlanRow[] = [];
  for (const s of ex.sets) {
    const load = s.pct !== undefined && lift ? roundLoad((tm[lift] * s.pct) / 100, 2.5) : undefined;
    const last = rows[rows.length - 1];
    if (last && last.type === s.type && last.reps === s.reps && last.repsMax === s.repsMax && last.max === s.max && last.load === load && last.rpe === s.rpe) last.count++;
    else rows.push({ count: 1, reps: s.reps, repsMax: s.repsMax, max: s.max, load, rpe: s.rpe, type: s.type });
  }
  return rows;
}

/** Rough length of a session: rests plus about 40 seconds under the bar per set. */
export function estimateMinutes(s: Pick<PlannedSession, 'exercises'>): number {
  let seconds = 0;
  for (const e of s.exercises) {
    const base = EXERCISES[e.exId]?.rest ?? 90;
    for (const p of e.sets) {
      const rest = p.type === 'ramp' ? Math.min(120, base) : p.type === 'work' || p.type === 'drop' ? base * 0.8 : base;
      seconds += 40 + (e.group ? rest * 0.5 : rest);
    }
  }
  const warmup = s.exercises.some((e) => EXERCISES[e.exId]?.kind === 'barbell') ? 10 : 5;
  return Math.round((seconds / 60 + warmup) / 5) * 5;
}
