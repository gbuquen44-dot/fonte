import { describe, expect, it } from 'vitest';
import { bedValue, clockFr, guessWake, sleptHours, toClock, toMinutes } from './checkin';

describe('morning check-in times', () => {
  it('counts the night across midnight', () => {
    expect(sleptHours('22:00', '03:23')).toBe(5.38);
    expect(sleptHours('23:30', '04:00')).toBe(4.5);
    expect(sleptHours('00:15', '04:45')).toBe(4.5);
  });

  it('reads and writes clock times', () => {
    expect(toMinutes('03:23')).toBe(203);
    expect(toClock(1440 + 15)).toBe('00:15');
    expect(clockFr(1320)).toBe('22 h');
    expect(clockFr(205)).toBe('3 h 25');
  });

  it('puts times after midnight after 24 h on the bed wheel', () => {
    expect(bedValue('23:00')).toBe(1380);
    expect(bedValue('00:30')).toBe(1470);
  });

  it('guesses the wake time from now in the morning only', () => {
    expect(guessWake(new Date(2026, 10, 25, 3, 27), '04:00')).toBe(205);
    expect(guessWake(new Date(2026, 10, 25, 13, 0), '04:00')).toBe(240);
  });
});
