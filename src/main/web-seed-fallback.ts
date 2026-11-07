/** How long a torrent may have no peers before its web seeds are tried. */
export const WEB_SEED_FALLBACK_MS = 15_000;

export interface WebSeedFallbackState {
  peers: number;
  done: boolean;
  /** Whether the web seeds were already added to this torrent. */
  added: boolean;
  /** When the torrent was added or its peer count last dropped to 0, in ms. */
  noPeersSince: number;
  now: number;
}

/**
 * Web seeds only fill in where peers cannot: a web seed takes a whole piece in one
 * request, and one that never answers keeps the piece from every peer (#108). So they
 * are added once, after a torrent has had no peers for a while.
 */
export function shouldAddWebSeeds({ peers, done, added, noPeersSince, now }: WebSeedFallbackState): boolean {
  return !added && !done && peers === 0 && now - noPeersSince >= WEB_SEED_FALLBACK_MS;
}
