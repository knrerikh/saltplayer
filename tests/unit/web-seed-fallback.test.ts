import { describe, it, expect } from 'vitest';
import { WEB_SEED_FALLBACK_MS, shouldAddWebSeeds } from '@/main/web-seed-fallback';

const state = { peers: 0, done: false, added: false, noPeersSince: 0, now: WEB_SEED_FALLBACK_MS };

describe('shouldAddWebSeeds', () => {
  it('adds them after 15 s without peers', () => {
    expect(WEB_SEED_FALLBACK_MS).toBe(15_000);
    expect(shouldAddWebSeeds(state)).toBe(true);
  });

  it('waits until the 15 s are over', () => {
    expect(shouldAddWebSeeds({ ...state, now: WEB_SEED_FALLBACK_MS - 1 })).toBe(false);
  });

  it('does not add them while peers are connected', () => {
    expect(shouldAddWebSeeds({ ...state, peers: 1 })).toBe(false);
  });

  it('does not add them to a complete torrent', () => {
    expect(shouldAddWebSeeds({ ...state, done: true })).toBe(false);
  });

  it('adds them only once', () => {
    expect(shouldAddWebSeeds({ ...state, added: true })).toBe(false);
  });

  it('counts from the moment the peers dropped to 0', () => {
    const later = { ...state, noPeersSince: 100_000, now: 100_000 + WEB_SEED_FALLBACK_MS };
    expect(shouldAddWebSeeds(later)).toBe(true);
    expect(shouldAddWebSeeds({ ...later, now: 100_000 + 5_000 })).toBe(false);
  });
});
