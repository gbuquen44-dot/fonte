import type { Muscle, PlannedSession, SessionLog } from './types';
import { EXERCISES } from '../data/exercises';

export type VolumeMap = Partial<Record<Muscle, number>>;

function add(map: VolumeMap, exId: string, weight: number) {
  const def = EXERCISES[exId];
  if (!def) return;
  for (const [m, c] of Object.entries(def.muscles)) {
    const key = m as Muscle;
    map[key] = (map[key] ?? 0) + (c as number) * weight;
  }
}

const setWeight = (reps: number) => (reps <= 3 ? 0.5 : 1);

/** Fractional sets from logged work: ramps do not count, sets of 1 to 3 reps count half. */
export function loggedVolume(sessions: SessionLog[]): VolumeMap {
  const map: VolumeMap = {};
  for (const s of sessions) {
    for (const x of s.sets) {
      if (x.type === 'ramp' || x.failed) continue;
      if (x.rpe !== undefined && x.rpe < 6) continue;
      add(map, x.exId, setWeight(x.reps));
    }
  }
  return map;
}

export function plannedVolume(sessions: PlannedSession[]): VolumeMap {
  const map: VolumeMap = {};
  for (const s of sessions) {
    for (const e of s.exercises) {
      for (const x of e.sets) {
        if (x.type === 'ramp') continue;
        add(map, e.exId, setWeight(x.reps));
      }
    }
  }
  return map;
}

export function hardSetsLogged(sessions: SessionLog[]): number {
  return sessions.reduce((a, s) => a + s.sets.filter((x) => x.type !== 'ramp' && !x.failed).length, 0);
}
