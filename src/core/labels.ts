import type { SetType } from './types';

export const SET_LABEL: Record<SetType, string> = {
  ramp: 'Montée',
  top: 'Série lourde',
  work: 'Travail',
  drop: 'Série allégée',
  test: 'Essai',
  acc: '',
};

export const SET_HELP: Record<SetType, string> = {
  ramp: 'Pour monter en charge, pas pour forcer.',
  top: 'La plus lourde du jour.',
  work: 'Le gros du travail.',
  drop: 'Plus léger pour finir propre.',
  test: 'Essai de record.',
  acc: '',
};

/** RPE in everyday words: how many reps were left in the tank. */
export function rirText(rpe: number): string {
  const left = 10 - rpe;
  if (left <= 0) return 'à fond';
  if (Number.isInteger(left)) return `il reste ${left} rep${left > 1 ? 's' : ''}`;
  const low = Math.floor(left);
  if (low === 0) return 'à fond ou presque';
  return `il reste ${low} à ${low + 1} reps`;
}

/** The RPE and what it means: « RPE 7,5 · il reste 2 à 3 reps ». */
export const effortText = (rpe: number) => `RPE ${String(rpe).replace('.', ',')} · ${rirText(rpe)}`;

export function repsText(reps: number, repsMax?: number, max?: boolean): string {
  if (max) return 'max';
  return repsMax && repsMax !== reps ? `${reps} à ${repsMax}` : `${reps}`;
}

export const plural = (n: number, one: string, many = `${one}s`) => (n > 1 ? many : one);
