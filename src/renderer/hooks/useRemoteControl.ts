import { useCallback, useEffect, useRef } from 'react';
import type { RemoteState } from '@/shared/remote';

/** The time on the phone moves once a second; anything finer is wasted traffic. */
export const REMOTE_TIME_INTERVAL_MS = 1000;

interface RemoteControlOptions extends Omit<RemoteState, 'title'> {
  /** Whether remote control is on; while it is not, nothing is sent. */
  enabled: boolean;
  title: string | undefined;
  togglePlay: () => void;
}

/**
 * Connects the player to the phone: a command from it runs the same action as the key or
 * button, and while the remote is on the player's state is sent to it. A change of what
 * is playing or whether it plays goes out at once; the time at most once a second.
 */
export function useRemoteControl({
  enabled,
  hasVideo,
  title,
  isPlaying,
  currentTime,
  duration,
  togglePlay,
}: RemoteControlOptions) {
  const latestRef = useRef({ hasVideo, title: title ?? null, isPlaying, currentTime, duration, togglePlay });
  useEffect(() => {
    latestRef.current = { hasVideo, title: title ?? null, isPlaying, currentTime, duration, togglePlay };
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSentAtRef = useRef(0);

  useEffect(() => {
    window.electronAPI.onRemoteCommand((command) => {
      if (command.type === 'toggle-play') latestRef.current.togglePlay();
    });
    return () => window.electronAPI.removeAllListeners('remote:command');
  }, []);

  const send = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
    lastSentAtRef.current = Date.now();
    const { hasVideo, title, isPlaying, currentTime, duration } = latestRef.current;
    window.electronAPI.sendRemoteState({ hasVideo, title, isPlaying, currentTime, duration });
  }, []);

  useEffect(() => {
    if (enabled) send();
  }, [enabled, hasVideo, title, isPlaying, send]);

  // Trailing, so the last time before a pause is not lost to the interval.
  useEffect(() => {
    if (!enabled || timerRef.current !== undefined) return;
    const wait = Math.max(0, lastSentAtRef.current + REMOTE_TIME_INTERVAL_MS - Date.now());
    timerRef.current = setTimeout(send, wait);
  }, [enabled, currentTime, send]);

  useEffect(() => {
    if (!enabled) return;
    return () => {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    };
  }, [enabled]);
}
