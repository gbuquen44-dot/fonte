export type ISODate = string;
export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISO(now);
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Whole days from b to a: positive when a is later. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 86_400_000);
}

const KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function dayKey(s: ISODate): DayKey {
  return KEYS[fromISO(s).getDay()];
}

export const DAY_LABEL: Record<DayKey, string> = {
  mon: 'Lundi',
  tue: 'Mardi',
  wed: 'Mercredi',
  thu: 'Jeudi',
  fri: 'Vendredi',
  sat: 'Samedi',
  sun: 'Dimanche',
};

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function longDate(s: ISODate): string {
  const d = fromISO(s);
  return `${DAY_LABEL[dayKey(s)]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function dayMonth(s: ISODate): string {
  const d = fromISO(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function shortDate(s: ISODate): string {
  const d = fromISO(s);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** Most recent Monday on or before the date. */
export function mondayOf(s: ISODate): ISODate {
  const dow = (fromISO(s).getDay() + 6) % 7;
  return addDays(s, -dow);
}

export function dateRange(end: ISODate, days: number): ISODate[] {
  const out: ISODate[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(addDays(end, -i));
  return out;
}
