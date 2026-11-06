/**
 * Downloads the pinned jellyfin-ffmpeg build for a platform into vendor/ffmpeg/<platform>-<arch>/
 * and keeps only ffmpeg and ffprobe: node scripts/fetch-ffmpeg.mjs [--platform p --arch a]
 *
 * Without options it fetches the host's build; `npm install` does that (postinstall).
 * The release workflow passes the target arch of a cross-build. Versions, URLs and
 * SHA-256 sums live in ffmpeg-manifest.json.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs, promisify } from 'node:util';

const run = promisify(execFile);
const STAMP_FILE = '.stamp';

export function pickTarget(manifest, platform, arch) {
  const target = manifest.targets[`${platform}-${arch}`];
  if (!target) {
    const shipped = Object.keys(manifest.targets).join(', ');
    throw new Error(`No ffmpeg build for ${platform}-${arch}; the manifest has: ${shipped}`);
  }
  return target;
}

export function binaryNames(platform) {
  const suffix = platform === 'win32' ? '.exe' : '';
  return [`ffmpeg${suffix}`, `ffprobe${suffix}`];
}

export function assertChecksum(actual, expected, asset) {
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${asset}: expected ${expected}, got ${actual}`);
  }
}

export async function sha256OfFile(file) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

/**
 * Windows ships bsdtar, which reads zip and tar.xz alike; a GNU tar earlier on the PATH
 * (Git for Windows) reads neither the zip nor a `C:` path.
 */
export function tarCommand() {
  return process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
}

async function download(url, dest) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`Download of ${url} failed: HTTP ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));
}

async function isInstalled(dir, platform, sha256) {
  try {
    const present = new Set(await readdir(dir));
    const stamp = await readFile(join(dir, STAMP_FILE), 'utf8');
    return stamp === sha256 && binaryNames(platform).every((name) => present.has(name));
  } catch {
    return false;
  }
}

/** Installs the build unless the binaries already match the manifest entry; returns whether it did. */
export async function fetchFfmpeg({ manifest, platform, arch, vendorDir, download: fetchAsset = download, log = console.log }) {
  const { url, sha256 } = pickTarget(manifest, platform, arch);
  const dir = join(vendorDir, `${platform}-${arch}`);
  if (await isInstalled(dir, platform, sha256)) return false;

  const work = await mkdtemp(join(tmpdir(), 'fetch-ffmpeg-'));
  try {
    const archive = join(work, 'asset');
    log(`Downloading ffmpeg ${manifest.version} for ${platform}-${arch}`);
    await fetchAsset(url, archive);
    assertChecksum(await sha256OfFile(archive), sha256, url);

    // Staged next to the destination so the final rename never crosses drives.
    const staging = join(vendorDir, `.${platform}-${arch}.partial`);
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging, { recursive: true });
    await run(tarCommand(), ['-xf', archive, '-C', staging, ...binaryNames(platform)]);
    await writeFile(join(staging, STAMP_FILE), sha256);

    await rm(dir, { recursive: true, force: true });
    await rename(staging, dir);
    return true;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: { platform: { type: 'string', default: process.platform }, arch: { type: 'string', default: process.arch } },
  });
  const scriptsDir = fileURLToPath(new URL('.', import.meta.url));
  const manifest = JSON.parse(await readFile(join(scriptsDir, 'ffmpeg-manifest.json'), 'utf8'));
  const vendorDir = join(scriptsDir, '..', 'vendor', 'ffmpeg');
  fetchFfmpeg({ manifest, platform: values.platform, arch: values.arch, vendorDir }).catch((error) => {
    console.error(`Could not fetch ffmpeg: ${error.message}`);
    process.exitCode = 1;
  });
}
