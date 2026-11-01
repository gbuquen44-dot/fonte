import { healthPatch, parseHealthExport, readNumber } from './health';
import { buildLinks } from './links';
import { rirText } from './labels';
import { describe, expect, it } from 'vitest';
import { addDays, dayKey, diffDays, mondayOf } from './dates';
import { attempts, detectPRs, e1rm, platesPerSide, roundLoad, rolling3 } from './lifting';
import { buildSession, buildWeek, dateOfSession, estimateMinutes, hardSets, isTestBlock, locate, planRows, SESSION_KEYS } from './program';
import { EXERCISES } from '../data/exercises';
import {
  addSet,
  createSession,
  currentStep,
  finishSession,
  flowSteps,
  logSet,
  peekNext,
  prefill,
  progress,
  readForm,
  replaceExercise,
  restFor,
  skipExercise,
  undoLast,
  warmupLadder,
} from './session';
import { estimateMaintenance, ewma, gelDates, gelEnd, macrosFor, mondayDecision, regress, stepsRead, targetKcal } from './energy';
import { plannedVolume } from './volume';
import { analyze, evidence, fitEffect, sessionPerformance } from './insights';
import { tipOfDay } from './rules';
import type { DayLog, Profile, SessionLog } from './types';

const TM = { squat: 135, bench: 85, deadlift: 175 };

function profile(over: Partial<Profile> = {}): Profile {
  return {
    tm: TM,
    best: TM,
    bestEver: { squat: 165, bench: 85, deadlift: 180 },
    goal: { squat: 200, bench: 110, deadlift: 230 },
    goalDate: '2027-06-30',
    milestones: [],
    programStart: '2026-11-03',
    maintenance: 2200,
    maintenanceLow: 1850,
    maintenanceHigh: 2550,
    phase: 'recuperation',
    gainPct: 0.25,
    kcalPlan: [
      { from: '2026-11-01', kcal: 1800, reason: 'Départ' },
      { from: '2026-11-02', kcal: 2000, reason: 'Palier' },
      { from: '2026-11-07', kcal: 2200, reason: 'Palier' },
      { from: '2026-11-12', kcal: 2400, reason: 'Palier' },
    ],
    events: [],
    symptoms: [],
    onboarded: true,
    updatedAt: 0,
    ...over,
  };
}

describe('dates', () => {
  it('computes weekdays and differences', () => {
    expect(dayKey('2026-11-01')).toBe('sun');
    expect(dayKey('2026-11-03')).toBe('tue');
    expect(diffDays('2026-12-14', '2026-11-02')).toBe(42);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(mondayOf('2026-11-08')).toBe('2026-11-02');
  });
});

describe('e1RM', () => {
  it('applies Brzycki on effective reps', () => {
    expect(e1rm(100, 5, 10)?.value).toBeCloseTo((100 * 36) / 32, 5);
    expect(e1rm(100, 3, 8)?.value).toBeCloseTo((100 * 36) / 32, 5);
    expect(e1rm(140, 1, 10)?.value).toBe(140);
  });
  it('refuses weak readings', () => {
    expect(e1rm(100, 5, 6.5)).toBeNull();
    expect(e1rm(100, 8, 7)).toBeNull();
    expect(e1rm(100, 5)).toBeNull();
  });
  it('flags confidence', () => {
    expect(e1rm(100, 3, 8)?.high).toBe(true);
    expect(e1rm(100, 6, 8)?.high).toBe(false);
  });
});

describe('plates', () => {
  it('loads a bar for each side', () => {
    expect(platesPerSide(122.5).plates).toEqual([25, 25, 1.25]);
    expect(platesPerSide(100).plates).toEqual([25, 15]);
    expect(platesPerSide(20).plates).toEqual([]);
    expect(platesPerSide(132.5).rest).toBe(0);
    expect(platesPerSide(131).rest).toBeGreaterThan(0);
  });
  it('rounds to the nearest 2.5 kg', () => {
    expect(roundLoad(122.85)).toBe(122.5);
    expect(roundLoad(77.4)).toBe(77.5);
  });
});

describe('attempts', () => {
  it('builds three rising attempts within 2 % of the best', () => {
    const a = attempts(140);
    expect(a[0].load).toBe(127.5);
    expect(a[1].load).toBe(135);
    expect(a[2].load).toBeGreaterThan(a[1].load);
    expect(a[2].load).toBeLessThanOrEqual(142.5);
  });
});

describe('program', () => {
  it('locates dates in blocks', () => {
    expect(locate('2026-11-02', '2026-11-03')).toBeNull();
    expect(locate('2026-11-03', '2026-11-03')).toMatchObject({ week: 1, block: 1, blockWeek: 1, key: 'tue' });
    expect(locate('2026-11-05', '2026-11-03')?.key).toBeNull();
    expect(locate('2026-11-09', '2026-11-03')).toMatchObject({ week: 1, key: null });
    expect(locate('2026-12-08', '2026-11-03')).toMatchObject({ week: 6, block: 2, blockWeek: 1 });
    expect(dateOfSession('2026-11-03', 1, 5, 'sun')).toBe('2026-12-06');
    expect(dateOfSession('2026-11-03', 3, 5, 'tue')).toBe('2027-02-09');
  });

  it('uses only known exercises with unique set ids', () => {
    for (let b = 1; b <= 3; b++) {
      for (let w = 1; w <= 5; w++) {
        for (const k of SESSION_KEYS) {
          const s = buildSession(b, w, k);
          const ids = s.exercises.flatMap((e) => e.sets.map((x) => x.id));
          expect(new Set(ids).size).toBe(ids.length);
          for (const e of s.exercises) expect(EXERCISES[e.exId], e.exId).toBeDefined();
        }
      }
    }
  });

  it('keeps block 1 around 75 hard sets and block 2 near 85', () => {
    for (const w of [1, 2, 3]) {
      const total = buildWeek(1, w).reduce((a, s) => a + hardSets(s), 0);
      expect(total).toBeGreaterThanOrEqual(68);
      expect(total).toBeLessThanOrEqual(78);
    }
    const t2 = buildWeek(2, 1).reduce((a, s) => a + hardSets(s), 0);
    expect(t2).toBeGreaterThanOrEqual(80);
    expect(t2).toBeLessThanOrEqual(90);
  });

  it('halves the volume in week 5', () => {
    const w2 = buildWeek(1, 2).reduce((a, s) => a + hardSets(s), 0);
    const w5 = buildWeek(1, 5).reduce((a, s) => a + hardSets(s), 0);
    expect(w5 / w2).toBeLessThanOrEqual(0.6);
    expect(w5 / w2).toBeGreaterThanOrEqual(0.3);
  });

  it('never goes above RPE 8.5 on squat, bench or deadlift in block 1, and caps week 5 at 8', () => {
    for (let w = 1; w <= 5; w++) {
      for (const k of SESSION_KEYS) {
        for (const e of buildSession(1, w, k).exercises) {
          if (!EXERCISES[e.exId].lift) continue;
          for (const x of e.sets) {
            expect(x.rpe ?? 0).toBeLessThanOrEqual(8.5);
            if (w === 5) expect(x.rpe ?? 0).toBeLessThanOrEqual(8);
          }
        }
      }
    }
  });

  it('places a true max on blocks 3, 5 and 7 only', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(isTestBlock)).toEqual([false, false, true, false, true, false, true]);
    expect(buildSession(1, 5, 'tue').exercises[0].sets.some((x) => x.type === 'test')).toBe(false);
    expect(buildSession(3, 5, 'tue').exercises[0].sets.some((x) => x.type === 'test')).toBe(true);
  });

  it('covers every muscle above its minimum in block 1', () => {
    const v = plannedVolume(buildWeek(1, 1));
    expect(v.pecs).toBeGreaterThanOrEqual(10);
    expect(v.dos).toBeGreaterThanOrEqual(9);
    expect(v.deltLat).toBeGreaterThanOrEqual(8);
    expect(v.ischios).toBeGreaterThanOrEqual(4);
    expect(v.mollets).toBeGreaterThanOrEqual(4);
    expect(v.quads).toBeGreaterThanOrEqual(6);
    expect(v.biceps).toBeGreaterThanOrEqual(8);
    expect(v.triceps).toBeGreaterThanOrEqual(8);
  });
});

describe('session flow', () => {
  const planned = buildSession(1, 1, 'wed');
  const fresh = () => createSession(planned, '2026-11-04', 's1', 1000);

  it('alternates a superset set by set', () => {
    const s = fresh();
    const names = flowSteps(s.plan).map((st) => s.plan[st.ex].exId);
    const i = names.indexOf('marteau');
    expect(names.slice(i, i + 4)).toEqual(['marteau', 'elevHalteres', 'marteau', 'elevHalteres']);
  });

  it('rests nothing inside a superset, then a full rest', () => {
    const s = fresh();
    const steps = flowSteps(s.plan);
    const i = steps.findIndex((st) => s.plan[st.ex].exId === 'marteau');
    expect(restFor(s, steps[i], steps[i + 1])).toBe(0);
    expect(restFor(s, steps[i + 1], steps[i + 2])).toBeGreaterThan(0);
  });

  it('walks every set then ends', () => {
    let s = fresh();
    let guard = 0;
    while (currentStep(s) && guard++ < 100) s = logSet(s, currentStep(s)!, { load: 10, reps: 8, rpe: 8 }, 2000 + guard);
    expect(currentStep(s)).toBeNull();
    const p = progress(s);
    expect(p.done).toBe(p.total);
    expect(s.sets.length).toBe(p.total);
  });

  it('undoes the last set', () => {
    let s = fresh();
    const st = currentStep(s)!;
    s = logSet(s, st, { load: 10, reps: 8 }, 2000);
    s = undoLast(s, 2001);
    expect(s.sets.length).toBe(0);
    expect(currentStep(s)).toEqual(st);
  });

  it('overwrites a set logged twice', () => {
    let s = fresh();
    const st = currentStep(s)!;
    s = logSet(s, st, { load: 10, reps: 8 }, 2000);
    s = logSet(s, st, { load: 12.5, reps: 7 }, 2001);
    expect(s.sets).toHaveLength(1);
    expect(s.sets[0].load).toBe(12.5);
  });

  it('skips the remaining sets of an exercise', () => {
    let s = fresh();
    s = logSet(s, currentStep(s)!, { load: 0, reps: 8 }, 2000);
    s = skipExercise(s, 0, 2001);
    expect(s.plan[currentStep(s)!.ex].exId).toBe('dm');
    expect(progress(s).total).toBe(s.plan.flatMap((e) => e.sets).length - 2);
  });

  it('adds a set with a unique id', () => {
    let s = addSet(fresh(), 0, 2000);
    s = addSet(s, 0, 2001);
    const ids = s.plan[0].sets.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(5);
  });

  it('replaces an exercise entirely when nothing is logged', () => {
    const s = replaceExercise(fresh(), 3, 'elevPoulie', 2000);
    expect(s.plan[3].exId).toBe('elevPoulie');
  });

  it('splits an exercise when part of it is logged', () => {
    let s = fresh();
    s = logSet(s, currentStep(s)!, { load: 0, reps: 8 }, 2000);
    s = replaceExercise(s, 0, 'tirageLarge', 2001);
    expect(s.plan[0].exId).toBe('tractions');
    expect(s.plan[0].sets).toHaveLength(1);
    expect(s.plan[1].exId).toBe('tirageLarge');
    expect(s.plan[1].sets).toHaveLength(2);
    expect(currentStep(s)?.ex).toBe(1);
  });

  it('prefills percentage loads, rounded to the bar', () => {
    const s = createSession(buildSession(1, 1, 'tue'), '2026-11-03', 's2', 1000);
    const first = prefill(s, currentStep(s)!, TM, []);
    expect(first.load).toBe(105);
    expect(first.reps).toBe(1);
  });

  it('does not copy a ramp load onto work sets at the same percentage', () => {
    let s = createSession(buildSession(1, 1, 'tue'), '2026-11-03', 's2', 1000);
    const steps = flowSteps(s.plan);
    s = logSet(s, steps[0], { load: 107.5, reps: 1, rpe: 3 }, 2000);
    const idx = steps.findIndex((st) => s.plan[st.ex].sets[st.set].type === 'work');
    expect(prefill(s, steps[idx], TM, []).load).toBe(105);
  });

  it('carries a changed load to the next identical set', () => {
    let s = createSession(buildSession(1, 1, 'tue'), '2026-11-03', 's2', 1000);
    const steps = flowSteps(s.plan);
    const idx = steps.findIndex((st) => s.plan[st.ex].sets[st.set].type === 'work');
    s = logSet(s, steps[idx], { load: 102.5, reps: 5, rpe: 7 }, 2000);
    expect(prefill(s, steps[idx + 1], TM, []).load).toBe(102.5);
  });

  it('applies a lighter adjustment to work sets only', () => {
    const s = createSession(buildSession(1, 1, 'tue'), '2026-11-03', 's2', 1000);
    const adjusted = { ...s, adjust: { squat: 0.875 } };
    const steps = flowSteps(s.plan);
    expect(prefill(adjusted, steps[0], TM, []).load).toBe(prefill(s, steps[0], TM, []).load);
    expect(prefill(adjusted, steps[2], TM, []).load).toBeLessThan(prefill(s, steps[2], TM, []).load);
  });

  it('suggests a load increase when the top of the range was reached', () => {
    const old = createSession(planned, '2026-10-28', 'old', 500);
    old.plan = planned.exercises;
    old.status = 'done';
    old.sets = [
      { plannedId: 'dm-0', exId: 'dm', type: 'acc', load: 40, reps: 8, at: 501 },
      { plannedId: 'dm-1', exId: 'dm', type: 'acc', load: 40, reps: 8, at: 502 },
      { plannedId: 'dm-2', exId: 'dm', type: 'acc', load: 40, reps: 8, at: 503 },
    ];
    const s = fresh();
    const st = flowSteps(s.plan).find((x) => s.plan[x.ex].exId === 'dm')!;
    const p = prefill(s, st, TM, [old]);
    expect(p.load).toBe(42.5);
    expect(p.reps).toBe(6);
    expect(p.hint).toBeTruthy();
  });

  it('reads the form of the day from the reference load', () => {
    const s = createSession(buildSession(1, 1, 'tue'), '2026-11-03', 's2', 1000);
    const steps = flowSteps(s.plan);
    const refStep = steps[1];
    expect(readForm(s, refStep, 5, [])?.level).toBe('keep');
    expect(readForm(s, refStep, 6, [])?.level).toBe('lighter');
    expect(readForm(s, refStep, 7, [])?.level).toBe('light');
    expect(readForm(s, steps[0], 9, [])).toBeNull();
  });

  it('builds a warm-up ladder under the first load', () => {
    expect(warmupLadder(105)).toEqual([{ load: 20, reps: 8 }, { load: 52.5, reps: 5 }, { load: 72.5, reps: 3 }]);
    expect(warmupLadder(30)).toEqual([{ load: 20, reps: 8 }]);
  });

  it('peeks at the next pending step', () => {
    const s = fresh();
    const st = currentStep(s)!;
    expect(peekNext(s, st)).toEqual({ ex: 0, set: 1 });
  });
});

describe('PR detection', () => {
  const mk = (load: number, reps: number, rpe: number): SessionLog => {
    const s = createSession(buildSession(1, 1, 'tue'), '2026-11-03', 's', 1000);
    return { ...s, sets: [{ plannedId: 'squat-2', exId: 'squat', type: 'top', load, reps, rpe, at: 1 }] };
  };
  it('flags a heavier single and labels it recovery in block 1', () => {
    const prs = detectPRs(mk(137.5, 1, 9.5).sets, [], TM, 1);
    expect(prs[0]).toMatchObject({ lift: 'squat', kind: '1RM', value: 137.5, recovery: true });
  });
  it('ignores sets under the current best', () => {
    expect(detectPRs(mk(120, 1, 8).sets, [], TM, 1)).toHaveLength(0);
  });
  it('flags an estimated PR', () => {
    const prs = detectPRs(mk(120, 5, 9).sets, [], TM, 3);
    expect(prs[0]).toMatchObject({ kind: 'e1RM', recovery: false });
  });
  it('finishes a session with its PRs', () => {
    const done = finishSession(mk(140, 1, 10), undefined, 9000, [], TM);
    expect(done.status).toBe('done');
    expect(done.prs).toHaveLength(1);
  });
});

function weighSeries(start: string, n: number, w0: number, slopePerDay: number, kcal: number, jitter = 0): Record<string, DayLog> {
  const out: Record<string, DayLog> = {};
  for (let i = 0; i < n; i++) {
    const d = addDays(start, i);
    const noise = jitter ? Math.sin(i * 2.399) * jitter : 0;
    out[d] = { date: d, weight: w0 + slopePerDay * i + noise, kcal, updatedAt: 0 };
  }
  return out;
}

describe('energy', () => {
  it('computes a gap-corrected trend', () => {
    const t = ewma([{ date: '2026-10-01', weight: 74.1 }, { date: '2026-10-31', weight: 72.4 }]);
    expect(t[0].value).toBe(74.1);
    expect(t[1].value).toBeLessThan(72.7);
    expect(t[1].value).toBeGreaterThan(72.4);
  });

  it('regresses a clean line', () => {
    const r = regress([{ date: '2026-10-01', weight: 70 }, { date: '2026-10-11', weight: 69 }, { date: '2026-10-21', weight: 68 }]);
    expect(r?.slope).toBeCloseTo(-0.1, 6);
    expect(r?.sigma).toBeCloseTo(0, 6);
  });

  it('follows the calorie plan by date', () => {
    const p = profile();
    expect(targetKcal(p.kcalPlan, '2026-11-01')).toBe(1800);
    expect(targetKcal(p.kcalPlan, '2026-11-02')).toBe(2000);
    expect(targetKcal(p.kcalPlan, '2026-11-11')).toBe(2200);
    expect(targetKcal(p.kcalPlan, '2026-12-01')).toBe(2400);
  });

  it('freezes the scale until 10 days after the last step', () => {
    const g = gelDates(profile());
    expect(g.has('2026-11-06')).toBe(false);
    expect(g.has('2026-11-07')).toBe(true);
    expect(g.has('2026-11-22')).toBe(true);
    expect(g.has('2026-11-23')).toBe(false);
    expect(gelEnd(profile(), '2026-11-10')).toBe('2026-11-22');
  });

  it('adds a freeze on illness', () => {
    const g = gelDates(profile({ events: [{ date: '2027-01-10', kind: 'illness' }] }));
    expect(g.has('2027-01-15')).toBe(true);
  });

  it('follows the plan until its last step', () => {
    expect(mondayDecision(profile(), {}, '2026-11-09').kind).toBe('plan');
  });

  it('holds during the freeze', () => {
    expect(mondayDecision(profile(), {}, '2026-11-16').kind).toBe('frozen');
  });

  it('refuses to decide without data', () => {
    expect(mondayDecision(profile(), {}, '2026-12-14').kind).toBe('nodata');
  });

  it('adds 100 kcal when below the band', () => {
    const days = weighSeries('2026-11-16', 29, 68, 0, 2400, 0.1);
    expect(mondayDecision(profile(), days, '2026-12-14')).toMatchObject({ kind: 'up', delta: 100 });
  });

  it('keeps calories inside the band', () => {
    const days = weighSeries('2026-11-16', 29, 68, 0.045, 2400, 0.1);
    expect(mondayDecision(profile(), days, '2026-12-14').kind).toBe('keep');
  });

  it('removes 100 kcal when gaining too fast', () => {
    const days = weighSeries('2026-11-16', 29, 68, 0.1, 2400, 0.1);
    expect(mondayDecision(profile(), days, '2026-12-14')).toMatchObject({ kind: 'down', delta: -100 });
  });

  it('never reads a 1.5 kg water step in the window as fast gain', () => {
    const days = weighSeries('2026-10-20', 56, 68, 0, 2400, 0.1);
    for (const d of Object.keys(days)) if (d >= '2026-11-12') days[d].weight = (days[d].weight as number) + 1.5;
    const decision = mondayDecision(profile(), days, '2026-12-14');
    expect(decision.kind).not.toBe('down');
  });

  it('estimates maintenance from real data', () => {
    const days = weighSeries('2026-11-23', 22, 68, 0.03, 2400, 0.05);
    const m = estimateMaintenance(profile(), days, '2026-12-14');
    expect(m.source).toBe('data');
    expect(m.value).toBeCloseTo(2400 - 7700 * 0.03, -1);
    expect(m.low).toBeLessThan(m.value);
  });

  it('keeps the starting estimate without data', () => {
    expect(estimateMaintenance(profile(), {}, '2026-11-10')).toMatchObject({ value: 2200, source: 'estimate' });
  });

  it('builds macros that add up', () => {
    for (const k of [2000, 2200, 2400, 2700]) {
      const m = macrosFor(k, 72.4);
      expect(Math.abs(m.protein * 4 + m.fat * 9 + m.carbs * 4 - k)).toBeLessThan(25);
      expect(m.protein).toBe(145);
      expect(m.fat).toBeGreaterThanOrEqual(50);
    }
  });

  it('drops undercounted step days', () => {
    const days: Record<string, DayLog> = {};
    for (let i = 0; i < 7; i++) days[addDays('2026-11-01', i)] = { date: addDays('2026-11-01', i), steps: i === 2 ? 900 : 8000, updatedAt: 0 };
    expect(stepsRead(days, '2026-11-07', new Set(['2026-11-03'])).m7).toBe(8000);
  });
});

describe('rolling trend', () => {
  it('averages the last three points', () => {
    const r = rolling3([{ date: 'a', value: 100 }, { date: 'b', value: 110 }, { date: 'c', value: 120 }, { date: 'd', value: 130 }]);
    expect(r[3].value).toBe(120);
  });
});

describe('insights', () => {
  function history(n: number, effect = 0): { sessions: SessionLog[]; days: Record<string, DayLog> } {
    const sessions: SessionLog[] = [];
    const days: Record<string, DayLog> = {};
    let date = '2026-11-03';
    for (let i = 0; i < n; i++) {
      const sleep = 6 + ((i * 7) % 5) * 0.5;
      const noise = Math.sin(i * 1.7) * 1.5;
      const load = 110 * (1 + (noise + effect * (sleep - 7)) / 100);
      const s = createSession(buildSession(1, 1, 'tue'), date, `s${i}`, new Date(date).getTime());
      s.status = 'done';
      s.sets = [{ plannedId: 'squat-2', exId: 'squat', type: 'top', load, reps: 2, rpe: 8, at: 1 }];
      sessions.push(s);
      days[date] = { date, sleepH: sleep, updatedAt: 0 };
      date = addDays(date, i % 5 === 1 ? 2 : 1);
    }
    return { sessions, days };
  }

  it('builds a performance score once past the burn-in', () => {
    const { sessions } = history(12);
    const spr = sessionPerformance(sessions);
    expect(spr.length).toBe(8);
    for (const p of spr) expect(Number.isFinite(p.spr)).toBe(true);
  });

  it('stays silent during the first 30 days', () => {
    const { sessions, days } = history(15);
    const r = analyze(sessions, days, '2026-11-20');
    expect(r.budget).toBe(0);
    expect(r.findings.every((f) => f.label === 'observation')).toBe(true);
  });

  it('recovers a planted slope', () => {
    const y = Array.from({ length: 80 }, (_, i) => 2 * ((i * 7) % 5) + Math.sin(i * 1.3));
    const x = Array.from({ length: 80 }, (_, i) => (i * 7) % 5);
    const f = fitEffect(y, x, y.map(() => 'a'));
    expect(f?.b).toBeCloseTo(2, 0);
  });

  it('shrinks a noisy effect toward a sceptical prior', () => {
    const e = evidence(3, 2, 0, 1, 0.05, 1);
    expect(Math.abs(e.m)).toBeLessThan(3);
    expect(e.pip).toBeLessThan(0.5);
  });

  it('never calls the placebo a signal on a synthetic year', () => {
    const { sessions, days } = history(120);
    const r = analyze(sessions, days, '2027-04-01');
    expect(r.findings.find((f) => f.candidate.placebo)?.label).not.toBe('signal');
  });
});

describe('tip of the day', () => {
  const ctx = (days: Record<string, DayLog> = {}, today = '2026-11-03') => ({
    today,
    profile: profile(),
    days,
    sessions: [] as SessionLog[],
    planned: buildSession(1, 1, 'tue'),
  });

  it('puts a sleepless night before anything else', () => {
    expect(tipOfDay(ctx({ '2026-11-03': { date: '2026-11-03', sleepH: 3, updatedAt: 0 } })).id).toBe('sleep-3');
  });
  it('warns on two short nights in a row', () => {
    const days = {
      '2026-11-02': { date: '2026-11-02', sleepH: 6, updatedAt: 0 },
      '2026-11-03': { date: '2026-11-03', sleepH: 5.5, updatedAt: 0 },
    };
    expect(tipOfDay(ctx(days)).id).toBe('sleep-chain');
  });
  it('announces a calorie step on its day', () => {
    expect(tipOfDay(ctx({}, '2026-11-07')).id).toBe('kcal-step');
  });
  it('flags a high pain first', () => {
    const s = createSession(buildSession(1, 1, 'tue'), '2026-11-03', 's', 1);
    s.status = 'done';
    s.post = { srpe: 8, vsPlan: 3, painZone: 'Épaule', painLevel: 8, unusual: [] };
    const c = { ...ctx({ '2026-11-04': { date: '2026-11-04', sleepH: 3, updatedAt: 0 } }, '2026-11-04'), sessions: [s] };
    expect(tipOfDay(c).id).toBe('pain-high');
  });
  it('always returns a tip', () => {
    const t = tipOfDay({ ...ctx({}, '2026-11-30'), planned: null });
    expect(t.title.length).toBeGreaterThan(0);
  });
});

describe('Health export', () => {
  it('reads numbers formatted by the phone', () => {
    expect(readNumber('8\u202f432')).toBe(8432);
    expect(readNumber('1 985,4')).toBe(1985.4);
    expect(readNumber('')).toBeUndefined();
    expect(readNumber('abc')).toBeUndefined();
  });

  it('parses one line per metric and day', () => {
    const days = parseHealthExport('fonte-sante 1\nsteps\t2026-11-02\t8432\nweight\t2026-11-02\t72,44\nautre\t2026-11-02\t1\nkcal\t2026-11-01\t\n');
    expect(days).toEqual([{ date: '2026-11-02', steps: 8432, weight: 72.4 }]);
  });

  it('never lowers the steps of a day and never replaces a weigh-in', () => {
    const day: DayLog = { date: '2026-11-02', steps: 9000, weight: 72, updatedAt: 0 };
    expect(healthPatch(day, { date: '2026-11-02', steps: 8000, weight: 75 }, 1)).toBeNull();
    expect(healthPatch(day, { date: '2026-11-02', steps: 9500 }, 1)).toMatchObject({ steps: 9500, healthAt: 1 });
  });

  it('leaves typed numbers alone', () => {
    const day: DayLog = { date: '2026-11-02', kcal: 2100, manualFood: true, manualSteps: true, steps: 100, updatedAt: 0 };
    expect(healthPatch(day, { date: '2026-11-02', kcal: 1900, steps: 8000 }, 1)).toBeNull();
  });
});

describe('links', () => {
  const profile = { kcalPlan: [{ from: '2026-01-01', kcal: 2000, reason: '' }] } as unknown as Profile;
  const done = (date: string, vsPlan: number): SessionLog => ({ id: date, date, block: 1, week: 1, key: 'tue', title: '', startedAt: new Date(`${date}T18:00:00`).getTime(), status: 'done', plan: [], sets: [], skipped: [], adjust: {}, prs: [], post: { srpe: 7, vsPlan, unusual: [] }, updatedAt: 0 });

  it('waits until both sides hold 3 points', () => {
    const days: Record<string, DayLog> = { '2026-02-01': { date: '2026-02-01', sleepH: 8, updatedAt: 0 } };
    const l = buildLinks([done('2026-02-01', 4)], days, profile, '2026-02-02').find((x) => x.id === 'sleep');
    expect(l).toMatchObject({ state: 'attente', needed: 5 });
  });

  it('shows the better side once there is a gap', () => {
    const days: Record<string, DayLog> = {};
    const sessions: SessionLog[] = [];
    for (let i = 1; i <= 12; i++) {
      const date = `2026-02-${String(i).padStart(2, '0')}`;
      const good = i % 2 === 0;
      days[date] = { date, sleepH: good ? 8 : 6, updatedAt: 0 };
      sessions.push(done(date, good ? 4 : 2 + (i % 3 === 0 ? 1 : 0)));
    }
    const l = buildLinks(sessions, days, profile, '2026-02-13').find((x) => x.id === 'sleep');
    expect(l).toMatchObject({ state: 'tendance', better: 'hi', unit: 'note' });
    expect(l?.hi.n).toBe(6);
    expect(l?.hi.mean).toBeCloseTo(4);
  });

  it('calls a flat comparison what it is', () => {
    const days: Record<string, DayLog> = {};
    const sessions: SessionLog[] = [];
    for (let i = 1; i <= 8; i++) {
      const date = `2026-02-${String(i).padStart(2, '0')}`;
      days[date] = { date, sleepH: i % 2 ? 8 : 6, updatedAt: 0 };
      sessions.push(done(date, 3));
    }
    const l = buildLinks(sessions, days, profile, '2026-02-09').find((x) => x.id === 'sleep');
    expect(l).toMatchObject({ state: 'apercu', better: null });
  });

  it('sorts readable links first', () => {
    const links = buildLinks([], {}, profile, '2026-02-09');
    expect(links.every((x) => x.state === 'attente')).toBe(true);
    expect(links.length).toBeGreaterThan(12);
  });
});

describe('plan rows', () => {
  it('merges identical sets and converts to kilos', () => {
    const rows = planRows(buildSession(1, 1, 'tue').exercises[0], { squat: 135, bench: 85, deadlift: 175 });
    expect(rows.map((r) => [r.count, r.reps, r.load, r.type])).toEqual([
      [1, 1, 105, 'ramp'],
      [1, 1, 115, 'ramp'],
      [1, 1, 122.5, 'top'],
      [2, 5, 105, 'work'],
    ]);
  });

  it('keeps a rough length for a full session', () => {
    expect(estimateMinutes(buildSession(1, 1, 'tue'))).toBeGreaterThan(50);
    expect(estimateMinutes(buildSession(1, 1, 'tue'))).toBeLessThan(120);
  });
});

describe('words', () => {
  it('turns RPE into reps left', () => {
    expect(rirText(8)).toBe('il reste 2 reps');
    expect(rirText(9)).toBe('il reste 1 rep');
    expect(rirText(8.5)).toBe('il reste 1 à 2 reps');
    expect(rirText(10)).toBe('à fond');
  });
});
