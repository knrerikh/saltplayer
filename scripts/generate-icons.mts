/**
 * Regenerates every app icon asset from scripts/icon/design.mts:
 *
 *   build/icon.svg   vector source
 *   assets/icon.png  1024px window / Linux icon
 *   build/icon.icns  macOS bundle icon (requires iconutil, macOS only)
 *   build/icon.ico   Windows icon
 *
 * Usage: npm run icons
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { CANVAS, buildIconSvg } from './icon/design.mts';
import { encodeIco } from './icon/ico.mts';

const root = path.resolve(import.meta.dirname, '..');
const out = (relative: string) => path.join(root, relative);

const ICNS_SIZES = [16, 32, 128, 256, 512];
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

const svg = buildIconSvg();
const render = (size: number): Buffer =>
  new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

function writeIcns(destination: string): void {
  const iconset = path.join(mkdtempSync(path.join(tmpdir(), 'saltplayer-icon-')), 'icon.iconset');
  try {
    mkdirSync(iconset);
    for (const size of ICNS_SIZES) {
      writeFileSync(path.join(iconset, `icon_${size}x${size}.png`), render(size));
      writeFileSync(path.join(iconset, `icon_${size}x${size}@2x.png`), render(size * 2));
    }
    execFileSync('iconutil', ['--convert', 'icns', iconset, '--output', destination]);
  } finally {
    rmSync(path.dirname(iconset), { recursive: true, force: true });
  }
}

writeFileSync(out('build/icon.svg'), svg);
writeFileSync(out('assets/icon.png'), render(CANVAS));
writeFileSync(out('build/icon.ico'), encodeIco(ICO_SIZES.map((size) => ({ size, data: render(size) }))));

if (process.platform === 'darwin') {
  writeIcns(out('build/icon.icns'));
} else {
  console.warn('Skipping build/icon.icns: iconutil is only available on macOS.');
}

console.log('Icons written to build/ and assets/.');
