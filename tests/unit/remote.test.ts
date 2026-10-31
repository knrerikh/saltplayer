import { describe, it, expect } from 'vitest';
import { parseRemoteCommand, parseRemoteState } from '@/shared/remote';

describe('parseRemoteCommand (#64)', () => {
  it('accepts toggle-play and drops any extra field', () => {
    expect(parseRemoteCommand({ type: 'toggle-play', extra: 1 })).toEqual({ type: 'toggle-play' });
  });

  it('accepts seek-by within an hour, either way, and seek-to from 0', () => {
    expect(parseRemoteCommand({ type: 'seek-by', seconds: -30, extra: 1 })).toEqual({ type: 'seek-by', seconds: -30 });
    expect(parseRemoteCommand({ type: 'seek-by', seconds: 3600 })).toEqual({ type: 'seek-by', seconds: 3600 });
    expect(parseRemoteCommand({ type: 'seek-to', time: 0, extra: 1 })).toEqual({ type: 'seek-to', time: 0 });
    expect(parseRemoteCommand({ type: 'seek-to', time: 12.5 })).toEqual({ type: 'seek-to', time: 12.5 });
  });

  it('accepts a volume from 0 to 1, mute, fullscreen and close, and drops any extra field', () => {
    expect(parseRemoteCommand({ type: 'set-volume', volume: 0, extra: 1 })).toEqual({ type: 'set-volume', volume: 0 });
    expect(parseRemoteCommand({ type: 'set-volume', volume: 1 })).toEqual({ type: 'set-volume', volume: 1 });
    expect(parseRemoteCommand({ type: 'set-volume', volume: 0.35 })).toEqual({ type: 'set-volume', volume: 0.35 });
    expect(parseRemoteCommand({ type: 'set-muted', muted: false, extra: 1 })).toEqual({ type: 'set-muted', muted: false });
    expect(parseRemoteCommand({ type: 'toggle-fullscreen', extra: 1 })).toEqual({ type: 'toggle-fullscreen' });
    expect(parseRemoteCommand({ type: 'close-video', extra: 1 })).toEqual({ type: 'close-video' });
  });

  it.each([
    ['set-volume without volume', { type: 'set-volume' }],
    ['set-volume over 1', { type: 'set-volume', volume: 1.01 }],
    ['set-volume below 0', { type: 'set-volume', volume: -0.01 }],
    ['set-volume of NaN', { type: 'set-volume', volume: NaN }],
    ['set-volume of Infinity', { type: 'set-volume', volume: Infinity }],
    ['set-volume of a string', { type: 'set-volume', volume: '0.5' }],
    ['set-muted without muted', { type: 'set-muted' }],
    ['set-muted of a string', { type: 'set-muted', muted: 'true' }],
    ['set-muted of a number', { type: 'set-muted', muted: 1 }],
  ])('rejects %s', (_, value) => {
    expect(parseRemoteCommand(value)).toBeNull();
  });

  it.each([
    ['seek-by without seconds', { type: 'seek-by' }],
    ['seek-by of zero', { type: 'seek-by', seconds: 0 }],
    ['seek-by of NaN', { type: 'seek-by', seconds: NaN }],
    ['seek-by of Infinity', { type: 'seek-by', seconds: Infinity }],
    ['seek-by over an hour', { type: 'seek-by', seconds: 3601 }],
    ['seek-by under minus an hour', { type: 'seek-by', seconds: -3601 }],
    ['seek-by of a string', { type: 'seek-by', seconds: '10' }],
    ['seek-by with time instead', { type: 'seek-by', time: 10 }],
    ['seek-to without time', { type: 'seek-to' }],
    ['seek-to a negative time', { type: 'seek-to', time: -1 }],
    ['seek-to NaN', { type: 'seek-to', time: NaN }],
    ['seek-to Infinity', { type: 'seek-to', time: Infinity }],
    ['seek-to a string', { type: 'seek-to', time: '10' }],
    ['seek-to with seconds instead', { type: 'seek-to', seconds: 10 }],
  ])('rejects %s', (_, value) => {
    expect(parseRemoteCommand(value)).toBeNull();
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
  const state = { hasVideo: true, title: 'a.mkv', isPlaying: false, currentTime: 12, duration: 60, volume: 0.5, muted: false, isFullscreen: true };

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
    ['a volume over 1', { ...state, volume: 1.1 }],
    ['a volume below 0', { ...state, volume: -1 }],
    ['a missing volume', { ...state, volume: undefined }],
    ['a non-boolean muted', { ...state, muted: 0 }],
    ['a missing fullscreen flag', { ...state, isFullscreen: undefined }],
  ])('rejects %s', (_, value) => {
    expect(parseRemoteState(value)).toBeNull();
  });
});
