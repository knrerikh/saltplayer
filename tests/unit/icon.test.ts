import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  CANVAS,
  BODY,
  buildIconSvg,
  playTriangle,
  roundedPolygonPath,
  squirclePath,
  type Point,
} from '../../scripts/icon/design.mts';
import { encodeIco } from '../../scripts/icon/ico.mts';

const coords = (d: string): Point[] =>
  [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map(([, x, y]) => ({ x: +x, y: +y }));

const distanceToSegment = (p: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};

describe('squirclePath', () => {
  it('fills exactly the requested square', () => {
    const points = coords(squirclePath({ x: 100, y: 100 }, 824));
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);

    expect(Math.min(...xs)).toBeCloseTo(100, 1);
    expect(Math.max(...xs)).toBeCloseTo(924, 1);
    expect(Math.min(...ys)).toBeCloseTo(100, 1);
    expect(Math.max(...ys)).toBeCloseTo(924, 1);
  });

  it('cuts the corners like a rounded square, not a circle or a box', () => {
    const points = coords(squirclePath({ x: 0, y: 0 }, 100));
    const diagonal = Math.max(...points.map((p) => (p.x + p.y) / 2));

    expect(diagonal).toBeGreaterThan(85);
    expect(diagonal).toBeLessThan(95);
  });
});

describe('roundedPolygonPath', () => {
  const triangle: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 50 },
    { x: 0, y: 100 },
  ];

  it('starts and ends every corner arc on the adjacent edges', () => {
    const arcRadii = /A[\d.]+,[\d.]+ /g;
    const points = coords(roundedPolygonPath(triangle, 10).replace(arcRadii, ''));
    const edges = triangle.map((a, i) => [a, triangle[(i + 1) % triangle.length]] as const);

    expect(points).toHaveLength(triangle.length * 2);
    for (const point of points) {
      const nearest = Math.min(...edges.map(([a, b]) => distanceToSegment(point, a, b)));
      expect(nearest).toBeLessThan(1e-2);
    }
  });

  it('uses the requested radius for every arc', () => {
    const radii = [...roundedPolygonPath(triangle, 10).matchAll(/A(\S+),(\S+) /g)];

    expect(radii).toHaveLength(3);
    for (const [, rx, ry] of radii) {
      expect(+rx).toBe(10);
      expect(+ry).toBe(10);
    }
  });
});

describe('playTriangle', () => {
  it('is an equilateral triangle pointing right', () => {
    const { topLeft, tip, bottomLeft } = playTriangle();
    const sides = [
      Math.hypot(tip.x - topLeft.x, tip.y - topLeft.y),
      Math.hypot(bottomLeft.x - tip.x, bottomLeft.y - tip.y),
      bottomLeft.y - topLeft.y,
    ];

    expect(sides[0]).toBeCloseTo(sides[2], 6);
    expect(sides[1]).toBeCloseTo(sides[2], 6);
    expect(tip.x).toBeGreaterThan(topLeft.x);
  });

  it('is visually centred: its rounded outline sits just right of the canvas centre', () => {
    const { topLeft, tip, bottomLeft, cornerRadius } = playTriangle();
    // A 60° corner rounded with radius r pulls the visible tip back by r.
    const visibleRight = tip.x - cornerRadius;
    const visibleCentre = (topLeft.x + visibleRight) / 2;

    expect(visibleCentre - CANVAS / 2).toBeGreaterThan(0);
    expect(visibleCentre - CANVAS / 2).toBeLessThan(16);
    expect((topLeft.y + bottomLeft.y) / 2).toBe(CANVAS / 2);
  });

  it('fits comfortably inside the icon body', () => {
    const { topLeft, tip, bottomLeft } = playTriangle();
    const inset = (CANVAS - BODY) / 2;

    expect(topLeft.x).toBeGreaterThan(inset + BODY * 0.2);
    expect(tip.x).toBeLessThan(inset + BODY * 0.85);
    expect(bottomLeft.y - topLeft.y).toBeLessThan(BODY * 0.65);
  });
});

describe('buildIconSvg', () => {
  it('produces a square SVG document of the canvas size', () => {
    const svg = buildIconSvg();

    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain(`viewBox="0 0 ${CANVAS} ${CANVAS}"`);
    expect(svg.trimEnd()).toMatch(/<\/svg>$/);
  });

  it('only references definitions it declares', () => {
    const svg = buildIconSvg();
    const declared = new Set([...svg.matchAll(/id="([^"]+)"/g)].map(([, id]) => id));
    const referenced = new Set([...svg.matchAll(/url\(#([^)]+)\)/g)].map(([, id]) => id));

    expect([...referenced].filter((id) => !declared.has(id))).toEqual([]);
    expect([...declared].filter((id) => !referenced.has(id))).toEqual([]);
  });

  it('matches the committed vector source', () => {
    const committed = readFileSync(path.resolve(__dirname, '../../build/icon.svg'), 'utf8');

    expect(buildIconSvg()).toBe(committed);
  });
});

describe('encodeIco', () => {
  const png = (size: number) => ({ size, data: Buffer.from(`png-${size}`) });

  it('writes an ICONDIR header with the image count', () => {
    const ico = encodeIco([png(16), png(32)]);

    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(2);
  });

  it('points each directory entry at its PNG payload', () => {
    const images = [png(16), png(48), png(256)];
    const ico = encodeIco(images);

    images.forEach(({ size, data }, i) => {
      const entry = 6 + i * 16;
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);

      expect(ico.readUInt8(entry)).toBe(size % 256);
      expect(ico.readUInt8(entry + 1)).toBe(size % 256);
      expect(ico.readUInt16LE(entry + 6)).toBe(32);
      expect(ico.subarray(offset, offset + length)).toEqual(data);
    });
  });

  it('rejects sizes the format cannot describe', () => {
    expect(() => encodeIco([png(512)])).toThrow(/256/);
    expect(() => encodeIco([])).toThrow();
  });
});
