/** A magnet link is a few hundred bytes; the cap stops a page from handing us megabytes. */
export const MAX_MAGNET_LENGTH = 8 * 1024;
const MAX_NAME_LENGTH = 200;

export interface MagnetLink {
  /** The link, trimmed, with the scheme in lowercase (the torrent parser only knows `magnet:?`). */
  uri: string;
  /** The `dn` display name: untrusted text from a website, safe to show but never to act on. */
  name: string | null;
  /** Lowercase hex info hash, when the link has a 40-hex `btih`. */
  infoHash: string | null;
}

// The downstream parser (magnet-uri) matches `xt`, `dn` and `urn:btih:` in lowercase only, so
// only the hash digits may vary in case here.
const BTIH_HEX = /^urn:btih:([0-9a-fA-F]{40})$/;
const BTIH_BASE32 = /^urn:btih:[a-zA-Z2-7]{32}$/;
// BEP 52: the multihash of a SHA-256 info hash, 0x12 0x20 and 32 bytes.
const BTMH = /^urn:btmh:1220[0-9a-fA-F]{64}$/;
// Control characters, zero-width and bidirectional marks that could disguise a name.
const UNSAFE_NAME_CHARS =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

function decode(value: string): string {
  const spaced = value.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(spaced);
  } catch {
    return spaced;
  }
}

function cleanName(value: string | undefined): string | null {
  const name = decode(value ?? '').replace(UNSAFE_NAME_CHARS, '').trim().slice(0, MAX_NAME_LENGTH).trim();
  return name === '' ? null : name;
}

/**
 * Validates a magnet link that came from outside (a website, a command line). Returns
 * null for anything that is not a `magnet:?` URI of at most 8 KB with a BitTorrent
 * `xt` hash; it never throws.
 */
export function parseMagnetLink(value: unknown): MagnetLink | null {
  if (typeof value !== 'string') return null;
  const uri = value.trim();
  if (uri.length > MAX_MAGNET_LENGTH || !/^magnet:\?/i.test(uri)) return null;

  const params = uri
    .slice('magnet:?'.length)
    .split('&')
    .map((pair): [string, string] => {
      const at = pair.indexOf('=');
      return at < 0 ? [pair, ''] : [pair.slice(0, at), pair.slice(at + 1)];
    });
  const xts = params.filter(([key]) => key === 'xt').map(([, v]) => decode(v));

  const hex = xts.map((xt) => BTIH_HEX.exec(xt)?.[1]).find((hash) => hash !== undefined);
  const valid = hex !== undefined || xts.some((xt) => BTIH_BASE32.test(xt) || BTMH.test(xt));
  if (!valid) return null;

  const dn = params.find(([key]) => key === 'dn');
  return { uri: `magnet:?${uri.slice('magnet:?'.length)}`, name: cleanName(dn?.[1]), infoHash: hex?.toLowerCase() ?? null };
}
