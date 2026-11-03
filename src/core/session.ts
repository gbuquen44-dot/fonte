import type { EquipKind, LiftKey, LoggedSet, PlannedExercise, PlannedSession, PlannedSet, PostCheck, SessionLog } from './types';
import { EXERCISES } from '../data/exercises';
import { detectPRs, floorLoad, roundLoad } from './lifting';
import type { ISODate } from './dates';

export interface Step {
  ex: number;
  set: number;
}

export function createSession(p: PlannedSession, date: ISODate, id: string, now: number): SessionLog {
  return {
    id,
    date,
    block: p.block,
    week: p.week,
    key: p.key,
    title: p.title,
    startedAt: now,
    status: 'active',
    plan: structuredClone(p.exercises),
    sets: [],
    skipped: [],
    adjust: {},
    prs: [],
    updatedAt: now,
  };
}

/** Set order, with superset groups alternating set by set. */
export function flowSteps(plan: PlannedExercise[]): Step[] {
  const steps: Step[] = [];
  let i = 0;
  while (i < plan.length) {
    const group = plan[i].group;
    if (!group) {
      plan[i].sets.forEach((_, s) => steps.push({ ex: i, set: s }));
      i++;
      continue;
    }
    const members: number[] = [];
    while (i < plan.length && plan[i].group === group) members.push(i++);
    const rounds = Math.max(...members.map((m) => plan[m].sets.length));
    for (let r = 0; r < rounds; r++) {
      for (const m of members) if (r < plan[m].sets.length) steps.push({ ex: m, set: r });
    }
  }
  return steps;
}

const plannedAt = (s: SessionLog, st: Step): PlannedSet => s.plan[st.ex].sets[st.set];

export const isDone = (s: SessionLog, plannedId: string) => s.sets.some((x) => x.plannedId === plannedId);

export function currentStep(s: SessionLog): Step | null {
  for (const st of flowSteps(s.plan)) {
    const id = plannedAt(s, st).id;
    if (!isDone(s, id) && !s.skipped.includes(id)) return st;
  }
  return null;
}

export function peekNext(s: SessionLog, st: Step): Step | null {
  const steps = flowSteps(s.plan);
  const from = steps.findIndex((x) => x.ex === st.ex && x.set === st.set);
  for (let i = from + 1; i < steps.length; i++) {
    const id = plannedAt(s, steps[i]).id;
    if (!isDone(s, id) && !s.skipped.includes(id)) return steps[i];
  }
  return null;
}

export function progress(s: SessionLog): { done: number; total: number } {
  const all = s.plan.flatMap((e) => e.sets).filter((x) => !s.skipped.includes(x.id));
  return { done: all.filter((x) => isDone(s, x.id)).length, total: all.length };
}

export interface Prefill {
  load: number;
  reps: number;
  pct?: number;
  /** A short sentence about what the app decided for this set. */
  hint?: string;
  first?: boolean;
}

const START_LOAD: Record<EquipKind, number> = { barbell: 40, smith: 40, machine: 30, cable: 20, dumbbell: 12, bodyweight: 0 };

function lastSetsOf(exId: string, history: SessionLog[]): LoggedSet[] {
  const sorted = [...history].sort((a, b) => b.startedAt - a.startedAt);
  for (const h of sorted) {
    const sets = h.sets.filter((x) => x.exId === exId && !x.failed && x.type !== 'ramp');
    if (sets.length) return sets;
  }
  return [];
}

export function lastBest(exId: string, history: SessionLog[]): LoggedSet | undefined {
  const sets = lastSetsOf(exId, history);
  return sets.length ? sets.reduce((a, b) => (b.load * (1 + b.reps / 30) > a.load * (1 + a.reps / 30) ? b : a)) : undefined;
}

const kgText = (n: number) => String(n).replace('.', ',');

export function prefill(s: SessionLog, st: Step, tm: Record<LiftKey, number>, history: SessionLog[]): Prefill {
  const ex = s.plan[st.ex];
  const ps = ex.sets[st.set];
  const def = EXERCISES[ex.exId];
  const adjust = s.adjust[ex.exId] ?? 1;

  if (ps.pct !== undefined) {
    const lift = def?.lift ?? def?.tm;
    const twin = s.sets
      .filter((x) => {
        if (x.exId !== ex.exId) return false;
        const p = ex.sets.find((q) => q.id === x.plannedId);
        return p?.pct === ps.pct && p?.reps === ps.reps && p?.type === ps.type;
      })
      .pop();
    if (twin) return { load: twin.load, reps: ps.reps, pct: ps.pct };
    const base = lift ? tm[lift] : 0;
    const raw = (base * ps.pct) / 100;
    const load = roundLoad(ps.type === 'ramp' ? raw : raw * adjust, 2.5);
    return { load, reps: ps.reps, pct: ps.pct };
  }

  const here = s.sets.filter((x) => x.exId === ex.exId);
  const last = lastSetsOf(ex.exId, history);
  const top = ps.max ? Infinity : ps.repsMax ?? ps.reps;
  if (here.length) {
    const prev = here[here.length - 1];
    return { load: prev.load, reps: Math.min(prev.reps || ps.reps, top) };
  }
  if (!last.length) {
    const kind = def?.kind ?? 'machine';
    return {
      load: START_LOAD[kind],
      reps: ps.reps,
      first: true,
      hint: kind === 'bodyweight' ? 'Première fois : 0 kg de lest si tu n\'en mets pas.' : 'Première fois : mets ta charge habituelle, l\'appli la retient.',
    };
  }

  const step = def?.step ?? 2.5;
  const allTop = last.every((x) => x.reps >= top);
  if (allTop && last.length >= 2 && top > ps.reps) {
    return { load: last[0].load + step, reps: ps.reps, hint: `${top} reps partout la dernière fois : +${kgText(step)} kg.` };
  }
  const same = last[Math.min(st.set, last.length - 1)];
  const goal = Math.min(same.reps + 1, top);
  return { load: same.load, reps: goal, hint: goal > same.reps ? `La dernière fois : ${same.reps} reps. Vise ${goal}.` : `La dernière fois : ${kgText(same.load)} kg × ${same.reps}.` };
}

/** Heavy sets where the reps left in the tank are worth noting. */
export const needsEffort = (p: PlannedSet, lift: boolean) => !!p.ref || p.type === 'top' || p.type === 'test' || (lift && p.type === 'work');

export function logSet(
  s: SessionLog,
  st: Step,
  entry: { load: number; reps: number; rpe?: number; failed?: boolean },
  now: number,
): SessionLog {
  const ex = s.plan[st.ex];
  const ps = ex.sets[st.set];
  const row: LoggedSet = {
    plannedId: ps.id,
    exId: ex.exId,
    type: ps.type,
    load: entry.load,
    reps: entry.reps,
    rpe: entry.rpe,
    failed: entry.failed || entry.reps === 0,
    at: now,
  };
  const sets = s.sets.filter((x) => x.plannedId !== ps.id).concat(row);
  return { ...s, sets, updatedAt: now };
}

export function undoLast(s: SessionLog, now: number): SessionLog {
  if (!s.sets.length) return s;
  return { ...s, sets: s.sets.slice(0, -1), restUntil: undefined, restTotal: undefined, updatedAt: now };
}

export function skipExercise(s: SessionLog, exIndex: number, now: number): SessionLog {
  const ids = s.plan[exIndex].sets.map((x) => x.id).filter((id) => !isDone(s, id));
  return { ...s, skipped: [...new Set([...s.skipped, ...ids])], restUntil: undefined, restTotal: undefined, updatedAt: now };
}

export function addSet(s: SessionLog, exIndex: number, now: number): SessionLog {
  const plan = structuredClone(s.plan);
  const ex = plan[exIndex];
  const model = ex.sets[ex.sets.length - 1];
  const n = ex.sets.filter((x) => x.id.includes('-x')).length + 1;
  ex.sets.push({ ...model, id: `${model.id.split('-x')[0]}-x${n}`, type: model.type === 'ramp' ? 'work' : model.type, ref: false });
  return { ...s, plan, updatedAt: now };
}

export function replaceExercise(s: SessionLog, exIndex: number, newExId: string, now: number): SessionLog {
  const plan = structuredClone(s.plan);
  const ex = plan[exIndex];
  const pending = ex.sets.filter((x) => !isDone(s, x.id) && !s.skipped.includes(x.id));
  if (!pending.length) return s;
  if (pending.length === ex.sets.length) {
    ex.exId = newExId;
    ex.sets = ex.sets.map((x) => ({ ...x, pct: undefined, type: 'acc', reps: x.repsMax ?? Math.max(x.reps, 8), repsMax: x.repsMax ?? 12 }));
    ex.note = undefined;
  } else {
    ex.sets = ex.sets.filter((x) => !pending.includes(x));
    plan.splice(exIndex + 1, 0, {
      exId: newExId,
      group: undefined,
      sets: pending.map((x) => ({ ...x, id: `r-${x.id}`, pct: undefined, type: 'acc' as const, repsMax: x.repsMax ?? 12 })),
    });
  }
  return { ...s, plan, updatedAt: now };
}

export function restFor(s: SessionLog, st: Step, next: Step | null): number {
  const ex = s.plan[st.ex];
  const ps = ex.sets[st.set];
  if (next && ex.group && s.plan[next.ex].group === ex.group && next.ex > st.ex) return 0;
  const base = EXERCISES[ex.exId]?.rest ?? 90;
  if (ps.type === 'ramp') return Math.min(120, base);
  if (ps.type === 'test') return 300;
  if (ps.type === 'work' || ps.type === 'drop') return Math.round((base * 0.8) / 15) * 15;
  return base;
}

export interface FormRead {
  delta: number;
  level: 'keep' | 'lighter' | 'light';
  multiplier: number;
  message: string;
  basis: 'history' | 'plan';
}

function median(v: number[]): number {
  const a = [...v].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Reads the fixed reference load against the median of the last four times, or the plan. */
export function readForm(s: SessionLog, st: Step, rpe: number, history: SessionLog[]): FormRead | null {
  const ps = plannedAt(s, st);
  if (!ps.ref || ps.rpe === undefined) return null;
  const exId = s.plan[st.ex].exId;
  const past = history
    .flatMap((h) => h.sets.filter((x) => x.exId === exId && x.rpe !== undefined && h.plan.some((e) => e.sets.some((p) => p.id === x.plannedId && p.ref))))
    .map((x) => x.rpe as number);
  const useHistory = past.length >= 4;
  const reference = useHistory ? median(past.slice(-4)) : ps.rpe;
  const delta = rpe - reference;
  const basis = useHistory ? ('history' as const) : ('plan' as const);
  if (delta >= 2) {
    return { delta, level: 'light', multiplier: 0.875, basis, message: 'Barre lourde aujourd\'hui. Je te propose −12,5 % sur la suite, avec 3 reps en réserve.' };
  }
  if (delta >= 1) {
    return { delta, level: 'lighter', multiplier: 0.965, basis, message: 'Un peu plus dur que prévu. Je te propose −3,5 % sur la suite.' };
  }
  return { delta, level: 'keep', multiplier: 1, basis, message: 'La barre monte comme prévu. Plan maintenu.' };
}

export function applyAdjust(s: SessionLog, exId: string, multiplier: number, now: number): SessionLog {
  return { ...s, adjust: { ...s.adjust, [exId]: multiplier }, updatedAt: now };
}

export function finishSession(s: SessionLog, post: PostCheck | undefined, now: number, history: SessionLog[], best: Record<LiftKey, number>): SessionLog {
  return {
    ...s,
    status: 'done',
    endedAt: now,
    post,
    restUntil: undefined,
    restTotal: undefined,
    prs: detectPRs(s.sets, history, best, s.block),
    updatedAt: now,
  };
}

export function durationMin(s: SessionLog): number {
  return Math.max(1, Math.round(((s.endedAt ?? s.updatedAt) - s.startedAt) / 60_000));
}

/** Warm-up ladder shown before the first set of a heavy barbell exercise. */
export function warmupLadder(firstLoad: number): { load: number; reps: number }[] {
  const rows: { load: number; reps: number }[] = [{ load: 20, reps: 8 }];
  for (const [pct, reps] of [[0.5, 5], [0.7, 3]] as const) {
    const load = floorLoad(firstLoad * pct);
    if (load > rows[rows.length - 1].load) rows.push({ load, reps });
  }
  return rows;
}
