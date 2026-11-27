import { describe, it, expect } from 'vitest';
import { formatClock } from '@/shared/time-format';

const HOUR = 3600;

describe('formatClock (#120)', () => {
  describe('under an hour: mm:ss', () => {
    it.each([
      [0, '00:00'],
      [8, '00:08'],
      [90, '01:30'],
      [17 * 60 + 36, '17:36'],
      [HOUR - 1, '59:59'],
    ])('shows %i s as %s', (seconds, clock) => {
      expect(formatClock(seconds)).toBe(clock);
    });
  });

  describe('an hour or more: hh:mm:ss', () => {
    it.each([
      [HOUR, '01:00:00'],
      [2 * HOUR + 5 * 60 + 9, '02:05:09'],
      [100 * HOUR, '100:00:00'],
    ])('shows %i s as %s', (seconds, clock) => {
      expect(formatClock(seconds)).toBe(clock);
    });
  });

  it('follows the length of the video, so position and length read alike', () => {
    const length = HOUR + 52 * 60 + 10;

    expect(`${formatClock(8, length)} / ${formatClock(length, length)}`).toBe('00:00:08 / 01:52:10');
    expect(formatClock(8, 17 * 60)).toBe('00:08');
  });

  it('drops fractions of a second', () => {
    expect(formatClock(90.9)).toBe('01:30');
  });

  it.each([Infinity, NaN, -5])('shows %s as zero', (seconds) => {
    expect(formatClock(seconds)).toBe('00:00');
  });
});
