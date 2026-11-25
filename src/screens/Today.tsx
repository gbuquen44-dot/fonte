import { addDays, type ISODate } from '../core/dates';
import { plannedFor } from '../core/program';
import type { PlannedSession, Profile, SessionLog } from '../core/types';

/** Session helpers shared by the home tiles and the program screen. */
export const sameSession = (sessions: SessionLog[], plan: PlannedSession) => sessions.find((s) => s.block === plan.block && s.week === plan.week && s.key === plan.key);

export function nextPlanned(today: ISODate, p: Profile, sessions: SessionLog[]): { date: ISODate; plan: PlannedSession } | null {
  for (let i = 0; i < 9; i++) {
    const date = addDays(today, i);
    const plan = plannedFor(date, p);
    if (plan && !sameSession(sessions, plan)) return { date, plan };
  }
  return null;
}
