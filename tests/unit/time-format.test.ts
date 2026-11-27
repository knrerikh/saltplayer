import { describe, it, expect } from 'vitest';
import { formatClock } from '@/shared/time-format';

describe('formatClock (#120)', () => {
  it.each([
    [0, '00:00:00'],
    [8, '00:00:08'],
    [90, '00:01:30'],
    [17 * 60 + 36, '00:17:36'],
    [3600, '01:00:00'],
    [2 * 3600 + 5 * 60 + 9, '02:05:09'],
  ])('shows %i s as %s', (seconds, clock) => {
    expect(formatClock(seconds)).toBe(clock);
  });

  it('drops fractions of a second', () => {
    expect(formatClock(90.9)).toBe('00:01:30');
  });

  it('keeps counting hours past 99', () => {
    expect(formatClock(100 * 3600)).toBe('100:00:00');
  });

  it.each([Infinity, NaN, -5])('shows %s as zero', (seconds) => {
    expect(formatClock(seconds)).toBe('00:00:00');
  });
});
