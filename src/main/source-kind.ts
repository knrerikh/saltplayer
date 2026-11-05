/** A source that is a link (a magnet, or a URL of a `.torrent`), whatever its text ends with. */
export function isLinkSource(source: string): boolean {
  return /^(magnet:|https?:)/i.test(source);
}
