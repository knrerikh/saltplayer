import { useCallback, useEffect, useMemo, useRef } from 'react';
import { MAX_EPISODE_NAME_LENGTH, MAX_REMOTE_EPISODES, type RemoteState } from '@/shared/remote';

/** The time on the phone moves once a second; anything finer is wasted traffic. */
export const REMOTE_TIME_INTERVAL_MS = 1000;

interface RemoteControlOptions extends Omit<RemoteState, 'title' | 'episodes' | 'episodeIndex' | 'hasPrevious' | 'hasNext'> {
  /** Whether remote control is on; while it is not, nothing is sent. */
  enabled: boolean;
  title: string | undefined;
  togglePlay: () => void;
  /** Moves playback to a time in seconds, like a click on the progress bar. */
  seekTo: (time: number) => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  toggleFullscreen: (() => void) | undefined;
  close: (() => void) | undefined;
  /** The player's playlist; the phone is shown it only when there is more than one file. */
  videoFiles: { name: string }[] | undefined;
  /** Undefined at the first file, like the player's ⏮. */
  onPrev: (() => void) | undefined;
  /** Undefined at the last file, like the player's ⏭. */
  onNext: (() => void) | undefined;
  onSelectFile: ((fileName: string) => void) | undefined;
}

function episodeNames(videoFiles: { name: string }[] | undefined): string[] {
  if (!videoFiles || videoFiles.length < 2) return [];
  return videoFiles
    .map((file) => file.name)
    .filter((name) => name.length <= MAX_EPISODE_NAME_LENGTH)
    .slice(0, MAX_REMOTE_EPISODES);
}

/**
 * Connects the player to the phone: a command from it runs the same action as the key or
 * button, and while the remote is on the player's state is sent to it. A change of what
 * is playing, whether it plays, the volume, mute, fullscreen, the playlist and the episode goes out at once, and so does
 * the time after a seek; otherwise the time goes out at most once a second.
 */
export function useRemoteControl({
  enabled,
  hasVideo,
  title,
  isPlaying,
  currentTime,
  duration,
  volume,
  muted,
  isFullscreen,
  togglePlay,
  seekTo,
  setVolume,
  setMuted,
  toggleFullscreen,
  close,
  videoFiles,
  onPrev,
  onNext,
  onSelectFile,
}: RemoteControlOptions) {
  const episodes = useMemo(() => episodeNames(videoFiles), [videoFiles]);
  const episodeIndex = title === undefined ? -1 : episodes.indexOf(title);
  const hasPrevious = onPrev !== undefined;
  const hasNext = onNext !== undefined;
  const latestRef = useRef({
    enabled, hasVideo, title: title ?? null, isPlaying, currentTime, duration, volume, muted, isFullscreen,
    episodes, episodeIndex, hasPrevious, hasNext,
    togglePlay, seekTo, setVolume, setMuted, toggleFullscreen, close, onPrev, onNext, onSelectFile,
  });
  useEffect(() => {
    latestRef.current = {
      enabled, hasVideo, title: title ?? null, isPlaying, currentTime, duration, volume, muted, isFullscreen,
      episodes, episodeIndex, hasPrevious, hasNext,
      togglePlay, seekTo, setVolume, setMuted, toggleFullscreen, close, onPrev, onNext, onSelectFile,
    };
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSentAtRef = useRef(0);

  const send = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = undefined;
    lastSentAtRef.current = Date.now();
    const {
      hasVideo, title, isPlaying, currentTime, duration, volume, muted, isFullscreen,
      episodes, episodeIndex, hasPrevious, hasNext,
    } = latestRef.current;
    window.electronAPI.sendRemoteState({
      hasVideo, title, isPlaying, currentTime, duration, volume, muted, isFullscreen,
      episodes, episodeIndex, hasPrevious, hasNext,
    });
  }, []);

  useEffect(() => {
    window.electronAPI.onRemoteCommand((command) => {
      const latest = latestRef.current;
      switch (command.type) {
        case 'toggle-play':
          latest.togglePlay();
          return;
        case 'set-volume':
          latest.setVolume(command.volume);
          return;
        case 'set-muted':
          latest.setMuted(command.muted);
          return;
        case 'toggle-fullscreen':
          if (latest.hasVideo) latest.toggleFullscreen?.();
          return;
        case 'close-video':
          if (latest.hasVideo) latest.close?.();
          return;
        case 'previous-episode':
          if (latest.hasVideo) latest.onPrev?.();
          return;
        case 'next-episode':
          if (latest.hasVideo) latest.onNext?.();
          return;
        case 'select-episode':
          if (latest.hasVideo && latest.episodes.includes(command.name)) latest.onSelectFile?.(command.name);
          return;
      }
      if (!latest.hasVideo || !(latest.duration > 0)) return;
      const target = command.type === 'seek-by' ? latest.currentTime + command.seconds : command.time;
      const time = Math.min(Math.max(target, 0), latest.duration);
      latest.seekTo(time);
      // The player's own time catches up with the next timeupdate; the phone should not wait for it.
      latestRef.current = { ...latest, currentTime: time };
      if (latest.enabled) send();
    });
    return () => window.electronAPI.removeAllListeners('remote:command');
  }, [send]);

  useEffect(() => {
    if (enabled) send();
  }, [enabled, hasVideo, title, isPlaying, volume, muted, isFullscreen, episodes, episodeIndex, hasPrevious, hasNext, send]);

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
