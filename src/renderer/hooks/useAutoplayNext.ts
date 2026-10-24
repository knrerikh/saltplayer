import { useCallback, useEffect, useRef, useState } from 'react';

/** The overlay appears this many seconds of playback before the end of an episode. */
export const AUTOPLAY_COUNTDOWN_S = 5;

/** The start of the next episode is fetched this long before the current one ends. */
export const PREFETCH_BEFORE_END_S = 120;

interface AutoplayNextOptions {
  /** What is playing; a new episode starts a new countdown. */
  episode: string | undefined;
  currentTime: number;
  duration: number;
  enabled: boolean;
  /** Absent on the last episode. */
  onNext?: () => void;
  onPrefetchNext?: () => void;
}

/**
 * Counts down to the next episode over the last seconds of the current one. The
 * countdown follows playback time, so it holds while the video is paused; the video
 * ending is the countdown running out.
 */
export function useAutoplayNext({
  episode,
  currentTime,
  duration,
  enabled,
  onNext,
  onPrefetchNext,
}: AutoplayNextOptions) {
  // Cancelled, or already switched: either way this episode is done with autoplay.
  const [isDismissed, setIsDismissed] = useState(false);
  const hasPrefetchedRef = useRef(false);

  useEffect(() => {
    setIsDismissed(false);
    hasPrefetchedRef.current = false;
  }, [episode]);

  const remaining = duration > 0 ? duration - currentTime : Infinity;

  useEffect(() => {
    if (onPrefetchNext && !hasPrefetchedRef.current && remaining <= PREFETCH_BEFORE_END_S) {
      hasPrefetchedRef.current = true;
      onPrefetchNext();
    }
  }, [remaining, onPrefetchNext]);

  const isArmed = enabled && onNext !== undefined && !isDismissed;

  const cancel = useCallback(() => setIsDismissed(true), []);

  const playNext = () => {
    if (!isArmed) return;
    setIsDismissed(true);
    onNext();
  };

  return {
    /** Whole seconds left to show in the overlay, or null when it is hidden. */
    secondsLeft: isArmed && remaining <= AUTOPLAY_COUNTDOWN_S ? Math.max(1, Math.ceil(remaining)) : null,
    cancel,
    playNext,
  };
}
