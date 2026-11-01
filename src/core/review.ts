import { addDays, dateRange, type ISODate } from './dates';
import type { DayLog, SessionLog } from './types';
import { hardSetsLogged } from './volume';
import { tonnage } from './lifting';
import { durationMin } from './session';

export interface WeekNumbers {
  sessions: number;
  hardSets: number;
  tonnage: number;
  load: number;
  weight: number | null;
  sleep: number | null;
  recovery: number | null;
  stress: number | null;
  kcal: number | null;
  protein: number | null;
  steps: number | null;
  checkins: number;
}

function avg(days: Record<ISODate, DayLog>, dates: ISODate[], f: keyof DayLog): number | null {
  const v = dates.flatMap((d) => {
    const x = days[d]?.[f];
    return typeof x === 'number' ? [x] : [];
  });
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function weekNumbers(end: ISODate, days: Record<ISODate, DayLog>, sessions: SessionLog[]): WeekNumbers {
  const dates = dateRange(end, 7);
  const set = new Set(dates);
  const inWeek = sessions.filter((s) => s.status === 'done' && set.has(s.date));
  return {
    sessions: inWeek.length,
    hardSets: hardSetsLogged(inWeek),
    tonnage: inWeek.reduce((a, s) => a + tonnage(s.sets), 0),
    load: inWeek.reduce((a, s) => a + (s.post ? s.post.srpe * durationMin(s) : 0), 0),
    weight: avg(days, dates, 'weight'),
    sleep: avg(days, dates, 'sleepH'),
    recovery: avg(days, dates, 'recovery'),
    stress: avg(days, dates, 'stress'),
    kcal: avg(days, dates, 'kcal'),
    protein: avg(days, dates, 'protein'),
    steps: avg(days, dates, 'steps'),
    checkins: dates.filter((d) => typeof days[d]?.checkinAt === 'number').length,
  };
}

export function weekPair(end: ISODate, days: Record<ISODate, DayLog>, sessions: SessionLog[]) {
  return { current: weekNumbers(end, days, sessions), previous: weekNumbers(addDays(end, -7), days, sessions) };
}
