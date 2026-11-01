import type { ISODate } from './dates';
import type { DayLog } from './types';

export interface HealthDay {
  date: ISODate;
  steps?: number;
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  weight?: number;
}

const KEYS = ['steps', 'kcal', 'protein', 'carbs', 'fat', 'weight'] as const;
type Key = (typeof KEYS)[number];

/** Numbers come formatted by the phone's locale, with commas and thin spaces. */
export function readNumber(text: string): number | undefined {
  const clean = text.replace(/[\s  ]/g, '').replace(',', '.');
  if (!clean) return undefined;
  const n = Number(clean);
  return Number.isFinite(n) ? n : undefined;
}

/** One line per metric and day: key, date, value, separated by tabs. */
export function parseHealthExport(text: string): HealthDay[] {
  const days: Record<ISODate, HealthDay> = {};
  for (const line of text.split(/\r?\n/)) {
    const [key, date, raw] = line.split('\t');
    if (!KEYS.includes(key as Key) || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) continue;
    const value = readNumber(raw ?? '');
    if (value === undefined || value < 0) continue;
    const day = (days[date] ??= { date });
    day[key as Key] = key === 'weight' ? Math.round(value * 10) / 10 : Math.round(value);
  }
  return Object.values(days);
}

/** What a Health export changes on a day. Hand-typed fields always win. */
export function healthPatch(day: DayLog | undefined, h: HealthDay, at: number): Partial<DayLog> | null {
  const patch: Partial<DayLog> = {};
  if (!day?.manualFood) {
    for (const k of ['kcal', 'protein', 'carbs', 'fat'] as const) {
      const v = h[k];
      if (v !== undefined && v > 0 && v !== day?.[k]) patch[k] = v;
    }
  }
  if (!day?.manualSteps && h.steps !== undefined && h.steps > (day?.steps ?? 0)) patch.steps = h.steps;
  if (h.weight !== undefined && h.weight > 0 && day?.weight === undefined) patch.weight = h.weight;
  if (!Object.keys(patch).length) return null;
  return { ...patch, healthAt: at };
}
