import { useEffect, useRef } from 'react';

/** While playing, the position is saved after every this many seconds of playback. */
export const SAVE_EVERY_S = 10;

interface SavePositionOptions {
  /** What is playing; leaving it saves where it was left. */
  episode: string | undefined;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  save?: (position: number, duration: number) => void;
}

/**
 * Reports where playback is, for resuming the file later: every ten seconds of
 * playback, on pause, and when the episode changes or the page goes away. Nothing is
 * saved for a file that has not played yet, so loading it never overwrites where it was
 * left with 0.
 */
export function useSavePosition({ episode, currentTime, duration, isPlaying, save }: SavePositionOptions) {
  const hasPlayedRef = useRef(false);
  const lastSavedRef = useRef(0);
  // Read when leaving an episode, so it must still describe that episode: updated after
  // render, and effect cleanups run before that.
  const latestRef = useRef({ currentTime, duration, save });
  useEffect(() => {
    latestRef.current = { currentTime, duration, save };
  });

  const flush = () => {
    const latest = latestRef.current;
    if (hasPlayedRef.current && latest.currentTime > 0) {
      latest.save?.(latest.currentTime, latest.duration);
      lastSavedRef.current = latest.currentTime;
    }
  };

  useEffect(() => {
    hasPlayedRef.current = false;
    lastSavedRef.current = 0;
    return flush;
  }, [episode]);

  useEffect(() => {
    if (isPlaying) {
      hasPlayedRef.current = true;
    } else {
      flush();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (hasPlayedRef.current && Math.abs(currentTime - lastSavedRef.current) >= SAVE_EVERY_S) {
      save?.(currentTime, duration);
      lastSavedRef.current = currentTime;
    }
  }, [currentTime]);

  useEffect(() => {
    window.addEventListener('beforeunload', flush);
    return () => window.removeEventListener('beforeunload', flush);
  }, []);
}
