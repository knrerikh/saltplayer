import { describe, it, expect } from 'vitest';
import { RateLimiter } from '@/main/remote-control/rate-limiter';

describe('RateLimiter (#64)', () => {
  it('lets a key through up to the limit, then refuses until its window is over', () => {
    const limiter = new RateLimiter(2, 1000);

    expect([0, 1, 2].map(() => limiter.isOverLimit('a', 0))).toEqual([false, false, true]);
    expect(limiter.isOverLimit('a', 999)).toBe(true);
    expect(limiter.isOverLimit('a', 1000)).toBe(false);
  });

  it('counts every key on its own', () => {
    const limiter = new RateLimiter(1, 1000);
    limiter.isOverLimit('a', 0);

    expect(limiter.isOverLimit('a', 0)).toBe(true);
    expect(limiter.isOverLimit('b', 0)).toBe(false);
  });

  it('forgets keys whose window is over, so the table stays bounded', () => {
    const limiter = new RateLimiter(1, 1000);
    for (let i = 0; i < 50; i++) limiter.isOverLimit(`10.0.0.${i}`, 0);
    expect(limiter.size).toBe(50);

    limiter.isOverLimit('10.0.1.1', 1000);

    expect(limiter.size).toBe(1);
  });
});
