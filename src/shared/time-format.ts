const pad = (value: number) => String(value).padStart(2, '0');

/** A playback position or length as `hh:mm:ss`, e.g. `00:17:36`; anything unknown or negative is `00:00:00`. */
export function formatClock(seconds: number): string {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor((whole % 3600) / 60))}:${pad(whole % 60)}`;
}
