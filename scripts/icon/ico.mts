/**
 * Minimal Windows .ico encoder. Since Vista an ICO may embed PNG payloads
 * directly, so each image is stored as-is behind a 16-byte directory entry.
 */

export interface IcoImage {
  /** Square edge in pixels, 1–256. */
  size: number;
  /** PNG-encoded bitmap. */
  data: Buffer;
}

const HEADER_BYTES = 6;
const ENTRY_BYTES = 16;
const ICON_TYPE = 1;
const BITS_PER_PIXEL = 32;

export function encodeIco(images: readonly IcoImage[]): Buffer {
  if (images.length === 0) {
    throw new Error('An .ico needs at least one image');
  }
  for (const { size } of images) {
    if (!Number.isInteger(size) || size < 1 || size > 256) {
      throw new RangeError(`Icon size ${size} is outside 1–256`);
    }
  }

  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(ICON_TYPE, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = HEADER_BYTES + ENTRY_BYTES * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(ENTRY_BYTES);
    entry.writeUInt8(size % 256, 0); // width; 0 means 256
    entry.writeUInt8(size % 256, 1); // height; 0 means 256
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(BITS_PER_PIXEL, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images.map(({ data }) => data)]);
}
