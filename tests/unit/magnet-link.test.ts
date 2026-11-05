import { describe, it, expect } from 'vitest';
import { parseMagnetLink, MAX_MAGNET_LENGTH } from '@/main/magnet-link';

const HEX = '0123456789abcdef0123456789abcdef01234567';
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const MULTIHASH = `1220${'ab'.repeat(32)}`;

describe('parseMagnetLink (#90)', () => {
  it('accepts a 40-character hex btih and returns its lowercase hash', () => {
    const uri = `magnet:?xt=urn:btih:${HEX.toUpperCase()}&dn=Movie`;

    expect(parseMagnetLink(uri)).toEqual({ uri, name: 'Movie', infoHash: HEX });
  });

  it('accepts a 32-character base32 btih, without a hex info hash', () => {
    const uri = `magnet:?xt=urn:btih:${BASE32}`;

    expect(parseMagnetLink(uri)).toEqual({ uri, name: null, infoHash: null });
  });

  it('accepts a btmh multihash', () => {
    const uri = `magnet:?xt=urn:btmh:${MULTIHASH}`;

    expect(parseMagnetLink(uri)).toEqual({ uri, name: null, infoHash: null });
  });

  it('accepts a hybrid link and takes the info hash from its btih', () => {
    const uri = `magnet:?xt=urn:btmh:${MULTIHASH}&xt=urn:btih:${HEX}`;

    expect(parseMagnetLink(uri)?.infoHash).toBe(HEX);
  });

  it('accepts the scheme in any case and a percent-encoded xt', () => {
    expect(parseMagnetLink(`MAGNET:?xt=urn:btih:${HEX}`)?.infoHash).toBe(HEX);
    expect(parseMagnetLink(`Magnet:?xt=urn%3Abtih%3A${HEX}`)?.infoHash).toBe(HEX);
  });

  it('returns the link with a lowercase scheme and the rest untouched', () => {
    const rest = `?xt=urn:btih:${HEX.toUpperCase()}&dn=Big%20Movie`;

    expect(parseMagnetLink(`MAGNET:${rest}`)?.uri).toBe(`magnet:${rest}`);
    expect(parseMagnetLink(`Magnet:${rest}`)?.uri).toBe(`magnet:${rest}`);
  });

  it('rejects an uppercase xt key or urn, which the torrent parser would not read', () => {
    expect(parseMagnetLink(`magnet:?XT=urn:btih:${HEX}`)).toBeNull();
    expect(parseMagnetLink(`magnet:?xt=URN:BTIH:${HEX}`)).toBeNull();
  });

  it('ignores surrounding whitespace', () => {
    expect(parseMagnetLink(` magnet:?xt=urn:btih:${HEX}\n`)?.uri).toBe(`magnet:?xt=urn:btih:${HEX}`);
  });

  it.each([
    ['another scheme', `http:?xt=urn:btih:${HEX}`],
    ['no query', `magnet:${HEX}`],
    ['text before the scheme', `x magnet:?xt=urn:btih:${HEX}`],
    ['no xt', 'magnet:?dn=Movie&tr=udp://tracker'],
    ['another xt urn', `magnet:?xt=urn:sha1:${HEX}`],
    ['a short hash', `magnet:?xt=urn:btih:${HEX.slice(1)}`],
    ['a long hash', `magnet:?xt=urn:btih:${HEX}0`],
    ['a non-hex 40 character hash', `magnet:?xt=urn:btih:${'g'.repeat(40)}`],
    ['a non-hex multihash', `magnet:?xt=urn:btmh:${'zz'.repeat(34)}`],
    ['an empty string', ''],
  ])('rejects %s', (_name, value) => {
    expect(parseMagnetLink(value)).toBeNull();
  });

  it('rejects a link over 8 KB and accepts one at the limit', () => {
    const base = `magnet:?xt=urn:btih:${HEX}&dn=`;

    expect(parseMagnetLink(base + 'a'.repeat(MAX_MAGNET_LENGTH - base.length))).not.toBeNull();
    expect(parseMagnetLink(base + 'a'.repeat(MAX_MAGNET_LENGTH - base.length + 1))).toBeNull();
  });

  it.each([null, undefined, 42, {}, [`magnet:?xt=urn:btih:${HEX}`]])('rejects non-string input %j', (value) => {
    expect(parseMagnetLink(value)).toBeNull();
  });

  describe('name', () => {
    const nameOf = (dn: string) => parseMagnetLink(`magnet:?xt=urn:btih:${HEX}&dn=${dn}`)?.name;

    it('decodes percent-encoding and plus signs', () => {
      expect(nameOf('Big%20Buck+Bunny%20%E2%80%93%20%D1%84%D0%B8%D0%BB%D1%8C%D0%BC')).toBe('Big Buck Bunny – фильм');
    });

    it('strips control and direction-override characters', () => {
      expect(nameOf('a%00b%0Ac%1Bd%7Fe%E2%80%AEf')).toBe('abcdef');
    });

    it('does not throw on malformed percent-encoding', () => {
      expect(nameOf('100%+%E2%80')).toBe('100% %E2%80');
    });

    it('strips zero-width and direction-control characters', () => {
      const invisible = ['\u200b', '\u200f', '\u202a', '\u202e', '\u2066', '\u2069', '\ufeff'];
      const dn = invisible.map((char) => `a${encodeURIComponent(char)}`).join('');

      expect(nameOf(dn)).toBe('a'.repeat(invisible.length));
      expect(nameOf(`x${invisible.join('')}y`)).toBe('xy');
    });

    it('caps the length', () => {
      expect(nameOf('a'.repeat(500))).toHaveLength(200);
    });

    it('is null when empty or only control characters', () => {
      expect(nameOf('')).toBeNull();
      expect(nameOf('%00%0A')).toBeNull();
      expect(parseMagnetLink(`magnet:?xt=urn:btih:${HEX}`)?.name).toBeNull();
    });
  });
});
