/**
 * Salt Player app icon: a faceted salt-crystal play button on a deep blue
 * squircle. Pure geometry and SVG markup; rasterising lives in
 * scripts/generate-icons.mts.
 */

export interface Point {
  x: number;
  y: number;
}

export const CANVAS = 1024;

/** Icon body size on the macOS grid; the margin leaves room for the drop shadow. */
export const BODY = 824;

const BODY_ORIGIN: Point = { x: (CANVAS - BODY) / 2, y: (CANVAS - BODY) / 2 };

/** Superellipse exponent: 2 is a circle, ∞ a square. ~4.6 matches Apple's continuous corners. */
const SQUIRCLE_EXPONENT = 4.6;

const fmt = (p: Point) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;

const lerp = (from: Point, to: Point, t: number): Point => ({
  x: from.x + (to.x - from.x) * t,
  y: from.y + (to.y - from.y) * t,
});

const polygonPath = (points: readonly Point[]) => `M${points.map(fmt).join(' L')} Z`;

export function squirclePath(origin: Point, size: number, segments = 720): string {
  const half = size / 2;
  const centre = { x: origin.x + half, y: origin.y + half };
  const exponent = 2 / SQUIRCLE_EXPONENT;
  const points = Array.from({ length: segments }, (_, i) => {
    const angle = (2 * Math.PI * i) / segments;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: centre.x + half * Math.sign(cos) * Math.abs(cos) ** exponent,
      y: centre.y + half * Math.sign(sin) * Math.abs(sin) ** exponent,
    };
  });
  return polygonPath(points);
}

/** Convex polygon (clockwise) with every corner replaced by a circular arc of `radius`. */
export function roundedPolygonPath(points: readonly Point[], radius: number): string {
  const commands = points.flatMap((corner, i) => {
    const prev = points[(i + points.length - 1) % points.length];
    const next = points[(i + 1) % points.length];
    const toPrev = Math.hypot(prev.x - corner.x, prev.y - corner.y);
    const toNext = Math.hypot(next.x - corner.x, next.y - corner.y);
    const cosAngle =
      ((prev.x - corner.x) * (next.x - corner.x) + (prev.y - corner.y) * (next.y - corner.y)) /
      (toPrev * toNext);
    const tangent = radius / Math.tan(Math.acos(cosAngle) / 2);
    const arcStart = lerp(corner, prev, tangent / toPrev);
    const arcEnd = lerp(corner, next, tangent / toNext);
    return [`${i === 0 ? 'M' : 'L'}${fmt(arcStart)}`, `A${radius},${radius} 0 0 1 ${fmt(arcEnd)}`];
  });
  return `${commands.join(' ')} Z`;
}

export interface PlayTriangle {
  topLeft: Point;
  tip: Point;
  bottomLeft: Point;
  cornerRadius: number;
}

/**
 * Equilateral play glyph. The centroid sits left of the canvas centre so that
 * the rounded outline, whose tip is pulled back by the corner radius, reads as
 * centred with a slight optical nudge towards the tip.
 */
export function playTriangle(height = 500, cornerRadius = 58): PlayTriangle {
  const width = (height * Math.sqrt(3)) / 2;
  const centroid = { x: CANVAS / 2 - 33, y: CANVAS / 2 };
  return {
    topLeft: { x: centroid.x - width / 3, y: centroid.y - height / 2 },
    tip: { x: centroid.x + (width * 2) / 3, y: centroid.y },
    bottomLeft: { x: centroid.x - width / 3, y: centroid.y + height / 2 },
    cornerRadius,
  };
}

/** Isometric salt cube: lit top, mid-tone left face, shaded right face. */
function saltCube(centre: Point, edge: number, opacity: number): string {
  const { x, y } = centre;
  const dx = (edge * Math.sqrt(3)) / 2;
  const top = polygonPath([
    { x, y: y - edge },
    { x: x + dx, y: y - edge / 2 },
    { x, y },
    { x: x - dx, y: y - edge / 2 },
  ]);
  const left = polygonPath([
    { x: x - dx, y: y - edge / 2 },
    { x, y },
    { x, y: y + edge },
    { x: x - dx, y: y + edge / 2 },
  ]);
  const right = polygonPath([
    { x, y },
    { x: x + dx, y: y - edge / 2 },
    { x: x + dx, y: y + edge / 2 },
    { x, y: y + edge },
  ]);
  return [
    `<g opacity="${opacity}">`,
    `<path d="${top}" fill="#ffffff"/>`,
    `<path d="${left}" fill="#b9d6f7"/>`,
    `<path d="${right}" fill="#7fa9e0"/>`,
    `</g>`,
  ].join('');
}

const SALT_CUBES: ReadonlyArray<{ centre: Point; edge: number; opacity: number }> = [
  { centre: { x: 258, y: 262 }, edge: 30, opacity: 1 },
  { centre: { x: 204, y: 372 }, edge: 17, opacity: 0.75 },
  { centre: { x: 770, y: 760 }, edge: 22, opacity: 0.7 },
];

/** Inner "table" facet of the cut: the triangle scaled towards its light centre. */
const TABLE_SCALE = 0.5;

export function buildIconSvg(): string {
  const triangle = playTriangle();
  const { topLeft, tip, bottomLeft } = triangle;
  const lightCentre = { x: (topLeft.x + tip.x + bottomLeft.x) / 3, y: tip.y - 4 };
  const [innerTopLeft, innerTip, innerBottomLeft] = [topLeft, tip, bottomLeft].map((p) =>
    lerp(lightCentre, p, TABLE_SCALE),
  );

  const body = squirclePath(BODY_ORIGIN, BODY);
  const glyph = roundedPolygonPath([topLeft, tip, bottomLeft], triangle.cornerRadius);

  // Light comes from the top left: the top bevel is brightest, the lower right darkest.
  const facets = [
    { points: [topLeft, tip, innerTip, innerTopLeft], fill: '#f4f9ff' },
    { points: [tip, bottomLeft, innerBottomLeft, innerTip], fill: '#7fabe6' },
    { points: [bottomLeft, topLeft, innerTopLeft, innerBottomLeft], fill: '#c6defa' },
    { points: [innerTopLeft, innerTip, innerBottomLeft], fill: 'url(#table)' },
  ];
  const facetEdges = [
    [topLeft, innerTopLeft],
    [tip, innerTip],
    [bottomLeft, innerBottomLeft],
  ]
    .map(([from, to]) => `M${fmt(from)} L${fmt(to)}`)
    .join(' ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}">
<defs>
  <linearGradient id="background" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="#2a4c8f"/>
    <stop offset="0.55" stop-color="#16285a"/>
    <stop offset="1" stop-color="#0b1433"/>
  </linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.47" r="0.5">
    <stop offset="0" stop-color="#5fa8ff" stop-opacity="0.45"/>
    <stop offset="1" stop-color="#5fa8ff" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/>
    <stop offset="0.3" stop-color="#ffffff" stop-opacity="0.04"/>
    <stop offset="1" stop-color="#ffffff" stop-opacity="0.10"/>
  </linearGradient>
  <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/>
    <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
  </linearGradient>
  <linearGradient id="table" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="1" stop-color="#a6c9f3"/>
  </linearGradient>
  <clipPath id="glyph"><path d="${glyph}"/></clipPath>
  <clipPath id="body"><path d="${body}"/></clipPath>
  <filter id="body-shadow" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="14"/>
    <feOffset dy="12"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.45"/></feComponentTransfer>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <filter id="glyph-shadow"><feGaussianBlur stdDeviation="22"/></filter>
</defs>
<g filter="url(#body-shadow)">
  <path d="${body}" fill="url(#background)"/>
</g>
<g clip-path="url(#body)">
  <rect width="${CANVAS}" height="${CANVAS}" fill="url(#glow)"/>
  <path d="${glyph}" fill="#020818" opacity="0.55" filter="url(#glyph-shadow)" transform="translate(0 22)"/>
  ${SALT_CUBES.map(({ centre, edge, opacity }) => saltCube(centre, edge, opacity)).join('')}
  <g clip-path="url(#glyph)">
    ${facets.map(({ points, fill }) => `<path d="${polygonPath(points)}" fill="${fill}"/>`).join('')}
    <path d="${glyph}" fill="url(#sheen)"/>
    <g stroke="#ffffff" stroke-opacity="0.6" stroke-width="2" fill="none">
      <path d="${facetEdges}"/>
      <path d="${polygonPath([innerTopLeft, innerTip, innerBottomLeft])}"/>
    </g>
  </g>
  <path d="${glyph}" fill="none" stroke="#ffffff" stroke-opacity="0.85" stroke-width="3"/>
  <path d="${body}" fill="none" stroke="url(#rim)" stroke-width="4"/>
</g>
</svg>
`;
}
