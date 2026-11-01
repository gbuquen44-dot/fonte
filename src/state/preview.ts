import type { DayLog, LoggedSet, PlannedExercise, Profile, SessionKey, SessionLog } from '../core/types';
import { addDays, todayISO } from '../core/dates';
import { buildSession } from '../core/program';
import { EXERCISES } from '../data/exercises';

/** Sample data for the local dev server only. */
export const PREVIEW_PROFILE: Profile = {
  tm: { squat: 140, bench: 95, deadlift: 180 },
  best: { squat: 140, bench: 95, deadlift: 180 },
  bestEver: { squat: 150, bench: 100, deadlift: 190 },
  goal: { squat: 180, bench: 120, deadlift: 220 },
  goalDate: '2027-06-30',
  milestones: [
    { label: 'Ancien total', total: 440 },
    { label: 'Repère de juin', total: 480 },
    { label: 'Objectif', total: 520 },
  ],
  programStart: addDays(todayISO(), -2),
  maintenance: 2300,
  maintenanceLow: 2000,
  maintenanceHigh: 2600,
  phase: 'recuperation',
  gainPct: 0.25,
  kcalPlan: [
    { from: addDays(todayISO(), -1), kcal: 2000, reason: 'Palier 1' },
    { from: addDays(todayISO(), 3), kcal: 2200, reason: 'Palier 2' },
    { from: addDays(todayISO(), 8), kcal: 2400, reason: 'Palier 3' },
  ],
  events: [],
  symptoms: [],
  usualMeal: { label: 'Riz, poulet, compote', mealDelay: '2-3', carbs: 'high' },
  usualCaffeineMg: 200,
  onboarded: true,
  updatedAt: 1,
};

export function previewDays(rich: boolean): Record<string, DayLog> {
  const out: Record<string, DayLog> = {};
  const today = todayISO();
  for (let i = rich ? 45 : 3; i >= 1; i--) {
    const date = addDays(today, -i);
    const n = (i * 7) % 11;
    out[date] = {
      date,
      weight: 70 + (45 - i) * 0.015 + (n - 5) * 0.08,
      sleepH: 6 + ((i * 3) % 7) * 0.5,
      sleepQ: 2 + (i % 4),
      recovery: 4 + ((i * 5) % 6),
      stress: i % 4,
      kcal: 1900 + (i % 6) * 90,
      protein: 118 + (i % 5) * 7,
      carbs: 190 + (i % 7) * 18,
      fat: 42 + (i % 4) * 5,
      steps: 5200 + ((i * 13) % 9) * 900,
      checkinAt: 1,
      tags: i % 6 === 0 ? ['Caféine tardive'] : [],
      updatedAt: 1,
    };
  }
  return out;
}

function fakeSets(plan: PlannedExercise[], tm: Profile['tm'], at: number, boost: number): LoggedSet[] {
  return plan.flatMap((e) => {
    const def = EXERCISES[e.exId];
    const lift = def?.lift ?? def?.tm;
    return e.sets.map((s, i) => ({
      plannedId: s.id,
      exId: e.exId,
      type: s.type,
      load: s.pct !== undefined && lift ? Math.round((tm[lift] * s.pct * boost) / 250) * 2.5 : 30,
      reps: s.reps,
      rpe: s.rpe,
      at: at + i * 180_000,
    }));
  });
}

export function previewSessions(): Record<string, SessionLog> {
  const out: Record<string, SessionLog> = {};
  const today = todayISO();
  const keys: SessionKey[] = ['tue', 'fri', 'sun', 'wed', 'sat'];
  for (let i = 0; i < 26; i++) {
    const date = addDays(today, -44 + i * 1.7 | 0);
    const key = keys[i % keys.length];
    const week = (i % 4) + 1;
    const plan = buildSession(1, week, key);
    const at = new Date(`${date}T17:30:00`).getTime();
    const id = `${date}-${key}-p${i}`;
    out[id] = {
      id,
      date,
      block: 1,
      week,
      key: key,
      title: plan.title,
      startedAt: at,
      endedAt: at + 95 * 60_000,
      status: 'done',
      plan: plan.exercises,
      sets: fakeSets(plan.exercises, PREVIEW_PROFILE.tm, at, 1 + i * 0.002 + ((i * 5) % 4) * 0.004),
      skipped: [],
      adjust: {},
      pre: { mealDelay: i % 3 ? '1-2' : '3-4', carbs: i % 4 ? 'high' : 'low', caffeineMg: i % 2 ? 200 : 0 },
      post: { srpe: 6 + (i % 3), vsPlan: 2 + (i % 3), unusual: [] },
      prs: [],
      updatedAt: at,
    };
  }
  return out;
}
