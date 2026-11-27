const HOUR = 3600;

const pad = (value: number) => String(value).padStart(2, '0');

const wholeSeconds = (seconds: number) => (Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0);

/**
 * A playback position as `mm:ss`, or as `hh:mm:ss` when the video is an hour or
 * longer: `00:08 / 17:36`, `00:00:08 / 01:52:10`. The format follows `length` (the
 * video's duration), so both sides of the counter read alike and the counter does
 * not change shape at the one-hour mark. Unknown and negative values count as zero.
 */
export function formatClock(seconds: number, length: number = seconds): string {
  const whole = wholeSeconds(seconds);
  const minutesAndSeconds = `${pad(Math.floor((whole % HOUR) / 60))}:${pad(whole % 60)}`;
  return wholeSeconds(length) >= HOUR || whole >= HOUR
    ? `${pad(Math.floor(whole / HOUR))}:${minutesAndSeconds}`
    : minutesAndSeconds;
}
