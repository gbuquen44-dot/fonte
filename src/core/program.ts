import type { LiftKey, PlannedExercise, PlannedSession, PlannedSet, Profile, SessionKey, SetType } from './types';
import { addDays, dayKey, diffDays, type ISODate } from './dates';
import { roundLoad } from './lifting';
import { EXERCISES } from '../data/exercises';

export interface Located {
  week: number;
  block: number;
  blockWeek: number;
  key: SessionKey | null;
}

/** Where a date falls in the program. Program weeks start on Tuesday. */
export function locate(date: ISODate, programStart: ISODate): Located | null {
  const d = diffDays(date, programStart);
  if (d < 0) return null;
  const week = Math.floor(d / 7) + 1;
  const block = Math.ceil(week / 5);
  const blockWeek = ((week - 1) % 5) + 1;
  const k = dayKey(date);
  const key = k === 'mon' || k === 'thu' ? null : k;
  return { week, block, blockWeek, key };
}

export function dateOfSession(programStart: ISODate, block: number, blockWeek: number, key: SessionKey): ISODate {
  const offset: Record<SessionKey, number> = { tue: 0, wed: 1, fri: 3, sat: 4, sun: 5 };
  return addDays(programStart, ((block - 1) * 5 + blockWeek - 1) * 7 + offset[key]);
}

/** Blocks ending in a true 1RM: block 3, then every other block. */
export const isTestBlock = (block: number) => block >= 3 && block % 2 === 1;

type Row = [reps: number, pct: number, rpe: number | undefined, type: SetType, ref?: boolean];

function barbell(exId: string, rows: Row[], note?: string): PlannedExercise {
  return {
    exId,
    note,
    sets: rows.map(([reps, pct, rpe, type, ref], i) => ({ id: `${exId}-${i}`, type, reps, pct, rpe, ref })),
  };
}

function rep(n: number, row: Row): Row[] {
  return Array.from({ length: n }, () => row);
}

function acc(exId: string, sets: number, reps: number, repsMax: number, opts: { group?: string; rpe?: number; note?: string } = {}): PlannedExercise {
  const out: PlannedSet[] = Array.from({ length: sets }, (_, i) => ({
    id: `${exId}-${i}`,
    type: 'acc' as const,
    reps,
    repsMax,
    rpe: opts.rpe,
  }));
  return { exId, group: opts.group, note: opts.note, sets: out };
}

const cap = (rpe: number, block: number) => Math.min(rpe + (block > 1 ? 0.5 : 0), block > 2 ? 9 : 8.5);

function singles(block: number, ladder: [number, number, number], topRpe: number): Row[] {
  const [a, b, c] = ladder;
  return [
    [1, a, 3, 'ramp'],
    [1, b, 5, 'ramp', true],
    [1, c, cap(topRpe, block), 'top'],
  ];
}

function wave(block: number, drop: boolean): Row[] {
  const rows: Row[] = [
    [5, 68, 3, 'ramp'],
    [5, 74, 5, 'ramp'],
    [5, 80, 7, 'work'],
    [5, 84, cap(8, block), 'top'],
  ];
  if (drop) rows.push([5, 79, 7, 'drop']);
  return rows;
}

function testRows(block: number): Row[] {
  if (isTestBlock(block)) {
    return [
      [1, 75, 2, 'ramp'],
      [1, 84, 5, 'ramp'],
      [1, 91, 7, 'test'],
      [1, 96, 8.5, 'test'],
      [1, 101, 10, 'test'],
    ];
  }
  return [
    [1, 75, 2, 'ramp'],
    [1, 84, 5, 'ramp'],
    [1, 92, block === 1 ? 8 : 8.5, 'top'],
  ];
}

function tuesday(block: number, week: number): PlannedSession {
  const title = 'Squat + Bench';
  const subtitle = 'Force, pecs, triceps';
  const ex: PlannedExercise[] = [];
  if (week === 1 || week === 2 || week === 4) {
    const top = week === 1 ? 7 : week === 2 ? 7.5 : 8;
    const workPct = week === 2 ? 80 : 78;
    const workRpe = week === 2 ? 7.5 : 7;
    ex.push(barbell('squat', [...singles(block, [78, 85, 91], top), ...rep(2, [5, workPct, workRpe, 'work'])]));
    ex.push(barbell('bench2ct', [...singles(block, [78, 85, 91], top), ...rep(3, [5, week === 1 ? 78 : 80, week === 1 ? 7 : top, 'work'])]));
  } else if (week === 3) {
    ex.push(barbell('squat', wave(block, false)));
    ex.push(barbell('bench2ct', wave(block, true)));
  } else {
    const isTest = isTestBlock(block);
    return {
      key: 'tue',
      block,
      week,
      title: isTest ? 'Test squat' : 'Single squat',
      subtitle: 'Semaine 5, affûtage',
      exercises: [
        barbell('squat', testRows(block), isTest ? 'Vrai max si tout va bien.' : 'Tu t\'arrêtes à ce single, il te reste 2 reps.'),
        barbell('bench', rep(3, [3, 76, 6, 'work']), 'Dernier contact avant le bench de vendredi.'),
      ],
    };
  }
  ex.push(acc('smithIncline', 2, 8, 10, { rpe: 8 }));
  ex.push(acc('dips', 2, 8, 12, { rpe: 8 }));
  ex.push(acc('extV', 2, 10, 12, { rpe: 8.5 }));
  if (block > 1) ex.push(acc('pecFly', 2, 12, 15, { rpe: 8.5 }));
  return { key: 'tue', block, week, title, subtitle, exercises: ex };
}

function wednesday(block: number, week: number): PlannedSession {
  if (week === 5) {
    return {
      key: 'wed',
      block,
      week,
      title: 'Haut du corps léger',
      subtitle: 'Semaine 5, moitié du volume',
      exercises: [
        acc('tractions', 2, 6, 8, { rpe: 7 }),
        acc('dm', 2, 6, 8, { rpe: 7 }),
        acc('elevMachine', 2, 12, 15, { rpe: 8 }),
        acc('oiseau', 2, 12, 15, { rpe: 8 }),
        acc('marteau', 2, 10, 12, { rpe: 8 }),
      ],
    };
  }
  const ex = [
    acc('tractions', 3, 6, 10, { rpe: 8 }),
    acc('dm', 3, 6, 8, { rpe: 8 }),
    acc('oiseau', 2, 12, 15, { rpe: 8.5 }),
    acc('elevMachine', 3, 12, 15, { rpe: 8.5 }),
    acc('marteau', 2, 10, 12, { rpe: 8.5, group: 'a' }),
    acc('elevHalteres', 2, 12, 15, { rpe: 8.5, group: 'a' }),
    acc('bayesian', 2, 10, 12, { rpe: 8.5 }),
  ];
  if (block > 1) {
    ex.splice(2, 0, acc('tirageHNeutre', 2, 8, 12, { rpe: 8 }));
    ex.push(acc('pupitre', 2, 10, 12, { rpe: 8.5 }));
  }
  return { key: 'wed', block, week, title: 'Dos + Épaules + Biceps', subtitle: 'Muscle', exercises: ex };
}

function friday(block: number, week: number): PlannedSession {
  if (week === 5) {
    const isTest = isTestBlock(block);
    return {
      key: 'fri',
      block,
      week,
      title: isTest ? 'Test bench' : 'Single bench',
      subtitle: 'Semaine 5, affûtage',
      exercises: [
        barbell('bench', testRows(block), isTest ? 'Vrai max si tout va bien. Vraie pause sur la poitrine.' : 'Vraie pause sur la poitrine, il te reste 2 reps.'),
        acc('extV', 2, 10, 12, { rpe: 7 }),
      ],
    };
  }
  const ex: PlannedExercise[] = [];
  if (week === 3) {
    ex.push(barbell('deadlift', [[5, 66, 3, 'ramp'], [5, 74, 5, 'ramp'], [5, 80, 7, 'work'], [5, 84, cap(8, block), 'top']]));
  } else {
    const top = week === 1 ? 7 : week === 2 ? 7.5 : 8;
    const ladder: [number, number, number] = week === 1 ? [78, 85, 90] : [80, 85, 91];
    const tail: Row[] = week === 4 ? rep(2, [3, 80, 7, 'work']) : rep(2, [5, week === 1 ? 76 : 78, 7, 'work']);
    ex.push(barbell('deadlift', [...singles(block, ladder, top), ...tail]));
  }
  const cgSets = week === 2 || week === 3 ? 4 : 3;
  ex.push(barbell('closeGrip', [[3, 68, 2, 'ramp'], [3, 74, 5, 'ramp'], ...rep(cgSets - 1, [3, 80, 7, 'work'] as Row)]));
  ex.push(acc('rdl', 2, 8, 8, { rpe: 7 }));
  ex.push(acc('legCurl', 2, 10, 12, { rpe: 8 }));
  ex.push(acc('extOverhead', 2, 10, 12, { rpe: 8.5 }));
  if (block > 1) ex.push(acc('extUni', 2, 12, 15, { rpe: 8.5 }));
  ex.push(acc('mollets', 2, 12, 15, { rpe: 8.5 }));
  return { key: 'fri', block, week, title: 'Deadlift + Triceps', subtitle: 'Force, ischios, triceps', exercises: ex };
}

function saturday(block: number, week: number): PlannedSession {
  if (week === 5) {
    return {
      key: 'sat',
      block,
      week,
      title: 'Séance légère',
      subtitle: 'Facultative, tu peux te reposer',
      exercises: [
        acc('tirageLarge', 2, 8, 12, { rpe: 7 }),
        acc('facePull', 2, 12, 15, { rpe: 7 }),
        acc('curlPoulie', 2, 10, 12, { rpe: 7 }),
        acc('elevPoulie', 2, 12, 15, { rpe: 7 }),
      ],
    };
  }
  const ex = [
    acc('tractions', 2, 6, 10, { rpe: 8 }),
    acc('tirageLarge', 2, 8, 12, { rpe: 8 }),
    acc('tirageHUni', 2, 8, 12, { rpe: 8 }),
    acc('facePull', 2, 12, 15, { rpe: 8.5 }),
    acc('curlPoulie', 2, 10, 12, { rpe: 8.5, group: 'b' }),
    acc('elevPoulie', 2, 12, 15, { rpe: 8.5, group: 'b' }),
    acc('bayesian', 2, 10, 12, { rpe: 8.5 }),
  ];
  if (block > 1) ex.splice(3, 0, acc('tirageHaut', 2, 10, 12, { rpe: 8 }));
  return { key: 'sat', block, week, title: 'Dos + Épaules + Bras', subtitle: 'Muscle', exercises: ex };
}

function sunday(block: number, week: number): PlannedSession {
  if (week === 5) {
    const isTest = isTestBlock(block);
    return {
      key: 'sun',
      block,
      week,
      title: isTest ? 'Test deadlift' : 'Single deadlift',
      subtitle: 'Fin du bloc',
      exercises: [barbell('deadlift', testRows(block), isTest ? 'Vrai max si tout va bien.' : 'Il te reste 2 reps.'), acc('abdos', 2, 10, 15, { rpe: 7 })],
    };
  }
  if (week === 4) {
    return {
      key: 'sun',
      block,
      week,
      title: 'Technique légère',
      subtitle: 'Dernier contact avant la semaine 5',
      exercises: [
        barbell('squat', rep(3, [2, 75, 5, 'work'])),
        barbell('bench', [[7, 50, 3, 'ramp'], [7, 60, 4, 'ramp'], ...rep(2, [7, 70, 6, 'work'] as Row)]),
        barbell('deadlift', rep(3, [1, 72, 4, 'work'])),
        acc('mollets', 2, 12, 15, { rpe: 8 }),
        acc('abdos', 2, 10, 15, { rpe: 8 }),
      ],
    };
  }
  const squatRows: Row[] =
    week === 1
      ? [[3, 71, 2, 'ramp'], [3, 79, 5, 'ramp'], [3, 82, 7, 'top'], ...rep(2, [7, 68, 6.5, 'work'] as Row)]
      : [[3, 74, 3, 'ramp'], [3, 80, 5, 'ramp'], [3, 84, 7, 'top'], ...rep(2, [7, 70, 7, 'work'] as Row)];
  const benchRows: Row[] =
    week === 1
      ? [[7, 50, 3, 'ramp'], [7, 60, 4, 'ramp'], ...rep(3, [7, 72, 7, 'work'] as Row)]
      : week === 2
        ? [[7, 50, 3, 'ramp'], [7, 60, 4, 'ramp'], ...rep(3, [7, 74, 7, 'work'] as Row)]
        : [[7, 50, 3, 'ramp'], [7, 60, 4, 'ramp'], ...rep(2, [7, 76, 7.5, 'work'] as Row), [7, 70, 7, 'drop']];
  const ex = [
    barbell('squat', squatRows, 'Garde 3 reps en réserve : le squat lourd revient mardi.'),
    barbell('bench', benchRows),
    acc('pendulum', 2, 8, 10, { rpe: 7.5 }),
    acc('legExt', 2, 10, 12, { rpe: 8 }),
    acc('legCurl', 2, 10, 12, { rpe: 8 }),
    acc('mollets', 2, 12, 15, { rpe: 8.5 }),
    acc('abdos', 2, 10, 15, { rpe: 8 }),
  ];
  if (block > 1) ex.splice(5, 0, acc('abduction', 2, 12, 15, { rpe: 8 }));
  return { key: 'sun', block, week, title: 'Squat + Bench + Jambes', subtitle: 'Volume, jamais à l\'échec', exercises: ex };
}

export function buildSession(block: number, week: number, key: SessionKey): PlannedSession {
  switch (key) {
    case 'tue':
      return tuesday(block, week);
    case 'wed':
      return wednesday(block, week);
    case 'fri':
      return friday(block, week);
    case 'sat':
      return saturday(block, week);
    case 'sun':
      return sunday(block, week);
  }
}

export const SESSION_KEYS: SessionKey[] = ['tue', 'wed', 'fri', 'sat', 'sun'];

export function buildWeek(block: number, week: number): PlannedSession[] {
  return SESSION_KEYS.map((k) => buildSession(block, week, k));
}

/** Sets that count as hard work, ramps excluded. */
export function hardSets(s: PlannedSession): number {
  return s.exercises.reduce((a, e) => a + e.sets.filter((x) => x.type !== 'ramp').length, 0);
}

export function plannedFor(date: ISODate, p: Pick<Profile, 'programStart'>): PlannedSession | null {
  const loc = locate(date, p.programStart);
  return loc?.key ? buildSession(loc.block, loc.blockWeek, loc.key) : null;
}

export interface PlanRow {
  count: number;
  reps: number;
  repsMax?: number;
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
    if (last && last.type === s.type && last.reps === s.reps && last.repsMax === s.repsMax && last.load === load && last.rpe === s.rpe) last.count++;
    else rows.push({ count: 1, reps: s.reps, repsMax: s.repsMax, load, rpe: s.rpe, type: s.type });
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
