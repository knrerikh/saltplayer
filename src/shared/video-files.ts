/** Extensions Salt Player treats as playable video, lowercase with the leading dot. */
export const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.flv', '.wmv'] as const;

/** Files at most this share of the largest video, and under MIN_MAIN_BYTES, are samples or extras. */
const EXTRA_MAX_SHARE = 0.1;
const MIN_MAIN_BYTES = 50 * 1024 * 1024;

export function isVideoFile(name: string): boolean {
  const extension = name.toLowerCase().match(/\.[^./]+$/)?.[0];
  return (VIDEO_EXTENSIONS as readonly string[]).includes(extension ?? '');
}

/** Orders files the way the playlist shows them, so episodes run S01E01, S01E02, … */
export function compareFileNames(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name);
}

/**
 * The file to start playing: drop non-video files, then samples and extras, and take
 * the first remaining file by name — the movie, or the first episode of a series.
 */
export function pickMainVideoFile<T extends { name: string }>(
  files: readonly T[],
  sizeOf: (file: T) => number,
): T | null {
  const videos = files.filter((file) => isVideoFile(file.name));
  if (videos.length === 0) return null;

  const largest = Math.max(...videos.map(sizeOf));
  const candidates = videos.filter(
    (file) => sizeOf(file) > largest * EXTRA_MAX_SHARE || sizeOf(file) > MIN_MAIN_BYTES,
  );

  return [...(candidates.length > 0 ? candidates : videos)].sort(compareFileNames)[0];
}
