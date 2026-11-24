import type { ExerciseDef, Muscle, Slot } from './types';
import { EXERCISES } from '../data/exercises';

/** A group only means a superset while at least two slots next to each other share it. */
export function normalizeGroups(slots: Slot[]): Slot[] {
  return slots.map((x, i) => {
    if (!x.group) return x;
    const near = slots[i - 1]?.group === x.group || slots[i + 1]?.group === x.group;
    if (near) return x;
    const { group: _drop, ...rest } = x;
    return rest;
  });
}

export function moveSlot(slots: Slot[], from: number, to: number): Slot[] {
  const t = Math.max(0, Math.min(slots.length - 1, to));
  if (t === from) return slots;
  const out = [...slots];
  const [item] = out.splice(from, 1);
  out.splice(t, 0, item);
  return normalizeGroups(out);
}

/** Joins a slot with the next one, or splits it off. */
export function toggleSuperset(slots: Slot[], i: number): Slot[] {
  const a = slots[i];
  const b = slots[i + 1];
  if (!a || !b) return slots;
  const out = [...slots];
  if (a.group && a.group === b.group) {
    out[i + 1] = { ...b, group: undefined };
    return normalizeGroups(out);
  }
  const used = new Set(slots.map((x) => x.group).filter(Boolean));
  const group = a.group ?? b.group ?? 'abcdefghijklmnopqrstuvwxyz'.split('').find((g) => !used.has(g)) ?? `g${i}`;
  out[i] = { ...a, group };
  out[i + 1] = { ...b, group };
  return normalizeGroups(out);
}

export const linkedToNext = (slots: Slot[], i: number) => !!slots[i]?.group && slots[i].group === slots[i + 1]?.group;

export function setsOf(slots: Slot[]): number {
  return slots.reduce((a, x) => a + x.sets, 0);
}

/** Muscle an exercise is filed under in the picker. */
export function mainMuscle(def: ExerciseDef): Muscle | undefined {
  return (Object.entries(def.muscles) as [Muscle, number][]).find(([, w]) => w === 1)?.[0];
}

/** He never trains calves: they stay out of the picker. */
export function pickable(): ExerciseDef[] {
  return Object.values(EXERCISES).filter((e) => e.id !== 'mollets' && mainMuscle(e) !== 'mollets');
}

/** Puts his own exercises next to the built-in ones. */
export function registerCustom(list?: ExerciseDef[]) {
  for (const e of list ?? []) EXERCISES[e.id] = e;
}
