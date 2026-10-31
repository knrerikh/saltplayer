import { describe, it, expect } from 'vitest';
import { parseRemoteCommand, parseRemoteState } from '@/shared/remote';

describe('parseRemoteCommand (#64)', () => {
  it('accepts toggle-play and drops any extra field', () => {
    expect(parseRemoteCommand({ type: 'toggle-play', extra: 1 })).toEqual({ type: 'toggle-play' });
  });

  it.each([
    ['null', null],
    ['a string', 'toggle-play'],
    ['an array', ['toggle-play']],
    ['no type', {}],
    ['an unknown type', { type: 'format-disk' }],
    ['a non-string type', { type: 1 }],
  ])('rejects %s', (_, value) => {
    expect(parseRemoteCommand(value)).toBeNull();
  });
});

describe('parseRemoteState (#64)', () => {
  const state = { hasVideo: true, title: 'a.mkv', isPlaying: false, currentTime: 12, duration: 60 };

  it('accepts a well-formed state, with or without a title', () => {
    expect(parseRemoteState(state)).toEqual(state);
    expect(parseRemoteState({ ...state, title: null })).toEqual({ ...state, title: null });
  });

  it.each([
    ['null', null],
    ['a missing field', { ...state, duration: undefined }],
    ['a non-boolean flag', { ...state, isPlaying: 'yes' }],
    ['a non-string title', { ...state, title: 5 }],
    ['a non-finite time', { ...state, currentTime: Infinity }],
  ])('rejects %s', (_, value) => {
    expect(parseRemoteState(value)).toBeNull();
  });
});
