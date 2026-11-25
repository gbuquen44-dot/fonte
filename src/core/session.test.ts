import { describe, expect, it } from 'vitest';
import type { PlannedExercise, SessionLog } from './types';
import { currentStep, doLater, doNow, flowSteps, leaveSuperset, logSet, pendingExercises, prefill, supersetWith } from './session';
import { tonnage } from './lifting';

const ex = (exId: string, n = 2, group?: string): PlannedExercise => ({
  exId,
  group,
  sets: Array.from({ length: n }, (_, i) => ({ id: `${exId}-${i}`, type: 'acc' as const, reps: 10, repsMax: 12 })),
});

const session = (plan: PlannedExercise[]): SessionLog => ({
  id: 's',
  date: '2026-11-26',
  block: 1,
  week: 1,
  key: 'tue',
  title: 'Test',
  startedAt: 0,
  status: 'active',
  plan,
  sets: [],
  skipped: [],
  adjust: {},
  prs: [],
  updatedAt: 0,
});

const order = (s: SessionLog) => s.plan.map((e) => e.exId).join(' ');
const tm = { squat: 175, bench: 135, deadlift: 180 } as never;

describe('session order', () => {
  it('runs a free machine now and comes back to the one he was on', () => {
    let s = session([ex('A'), ex('B'), ex('C')]);
    s = logSet(s, { ex: 0, set: 0 }, { load: 20, reps: 10 }, 1);
    s = doNow(s, 2, 2);
    expect(order(s)).toBe('C A B');
    expect(currentStep(s)).toEqual({ ex: 0, set: 0 });
    expect(s.plan[0].exId).toBe('C');
  });

  it('sends a taken machine to the end, with its superset', () => {
    const s = doLater(session([ex('A', 2, 'a'), ex('B', 2, 'a'), ex('C')]), 1, 1);
    expect(order(s)).toBe('C A B');
    expect(s.plan.map((e) => e.group)).toEqual([undefined, 'a', 'a']);
  });

  it('lists what is left outside the current superset', () => {
    let s = session([ex('A', 1), ex('B', 2, 'a'), ex('C', 2, 'a'), ex('D')]);
    s = logSet(s, { ex: 0, set: 0 }, { load: 20, reps: 10 }, 1);
    expect(pendingExercises(s, 1)).toEqual([3]);
  });

  it('builds a superset on the spot and alternates set by set', () => {
    let s = session([ex('A'), ex('B'), ex('C')]);
    s = logSet(s, { ex: 0, set: 0 }, { load: 20, reps: 10 }, 1);
    s = supersetWith(s, 0, 2, 2);
    expect(order(s)).toBe('A C B');
    expect(s.plan[0].group).toBe(s.plan[1].group);
    expect(s.plan[2].group).toBeUndefined();
    expect(currentStep(s)).toEqual({ ex: 1, set: 0 });
    expect(flowSteps(s.plan).map((x) => `${s.plan[x.ex].exId}${x.set}`).join(' ')).toBe('A0 C0 A1 C1 B0 B1');
  });

  it('takes an exercise out of its superset', () => {
    const s = leaveSuperset(session([ex('A', 2, 'a'), ex('B', 2, 'a'), ex('C')]), 0, 1);
    expect(order(s)).toBe('B A C');
    expect(s.plan.every((e) => !e.group)).toBe(true);
  });
});

describe('left and right loads', () => {
  it('keeps both sides, the weaker one as the load', () => {
    const s = logSet(session([ex('curlIncline')]), { ex: 0, set: 0 }, { load: 0, left: 12, right: 14, reps: 10 }, 1);
    expect(s.sets[0]).toMatchObject({ load: 12, left: 12, right: 14 });
    expect(tonnage(s.sets)).toBe(130);
  });

  it('starts the next set and the next session from both sides', () => {
    let s = session([ex('curlIncline', 3)]);
    s = logSet(s, { ex: 0, set: 0 }, { load: 0, left: 12, right: 14, reps: 12 }, 1);
    expect(prefill(s, { ex: 0, set: 1 }, tm, [])).toMatchObject({ left: 12, right: 14 });
    const done = { ...s, status: 'done' as const, startedAt: 1 };
    const next = prefill(session([ex('curlIncline', 3)]), { ex: 0, set: 0 }, tm, [done]);
    expect(next).toMatchObject({ load: 12, left: 12, right: 14 });
    expect(next.hint).toContain('gauche 12, droite 14');
  });
});
