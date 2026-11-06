import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  assertChecksum,
  binaryNames,
  fetchFfmpeg,
  pickTarget,
  sha256OfFile,
  tarCommand,
} from '../../scripts/fetch-ffmpeg.mjs';
import manifest from '../../scripts/ffmpeg-manifest.json';

const sha256 = (data: string) => createHash('sha256').update(data).digest('hex');

describe('pickTarget', () => {
  it('finds the release asset of every platform we ship', () => {
    for (const key of ['darwin-x64', 'darwin-arm64', 'win32-x64', 'linux-x64']) {
      const [platform, arch] = key.split('-');
      const target = pickTarget(manifest, platform, arch);
      expect(target.url).toContain(`jellyfin-ffmpeg_${manifest.version}_`);
      expect(target.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('refuses a platform we ship no ffmpeg for, naming it', () => {
    expect(() => pickTarget(manifest, 'linux', 'arm64')).toThrow(/linux-arm64/);
  });
});

describe('binaryNames', () => {
  it('adds .exe on Windows only', () => {
    expect(binaryNames('win32')).toEqual(['ffmpeg.exe', 'ffprobe.exe']);
    expect(binaryNames('darwin')).toEqual(['ffmpeg', 'ffprobe']);
    expect(binaryNames('linux')).toEqual(['ffmpeg', 'ffprobe']);
  });
});

describe('assertChecksum', () => {
  it('accepts the expected sum', () => {
    expect(() => assertChecksum('abc', 'abc', 'asset.tar.xz')).not.toThrow();
  });

  it('rejects any other sum, naming the asset and both sums', () => {
    expect(() => assertChecksum('aaa', 'bbb', 'asset.tar.xz')).toThrow(/asset\.tar\.xz.*bbb.*aaa/s);
  });
});

describe('fetchFfmpeg', () => {
  let work: string;

  beforeEach(() => {
    // Not `saltplayer-*`: StorageManager deletes those as stale sessions.
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-ffmpeg-test-'));
  });

  afterEach(() => {
    fs.rmSync(work, { recursive: true, force: true });
  });

  /** A tar with the two binaries, an extra file the app does not need, and its manifest. */
  function fixture(platform: string) {
    const source = path.join(work, 'source');
    fs.mkdirSync(source);
    const names = binaryNames(platform);
    for (const name of [...names, 'LICENSE.txt']) fs.writeFileSync(path.join(source, name), `content of ${name}`);
    const archive = path.join(work, 'asset.tar');
    execFileSync(tarCommand(), ['-cf', archive, '-C', source, ...names, 'LICENSE.txt']);
    const sum = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    return {
      names,
      archive,
      manifest: { version: '1.0.0-1', targets: { [`${platform}-x64`]: { url: 'https://example.invalid/asset.tar', sha256: sum } } },
    };
  }

  const downloadOf = (archive: string, calls: string[] = []) => async (url: string, dest: string) => {
    calls.push(url);
    fs.copyFileSync(archive, dest);
  };

  it('downloads, verifies and unpacks only ffmpeg and ffprobe into vendor/ffmpeg/<platform>-<arch>', async () => {
    const { names, archive, manifest: m } = fixture('linux');
    const vendorDir = path.join(work, 'vendor');

    await fetchFfmpeg({ manifest: m, platform: 'linux', arch: 'x64', vendorDir, download: downloadOf(archive), log: () => {} });

    const dir = path.join(vendorDir, 'linux-x64');
    expect(fs.readdirSync(dir).filter((name) => !name.startsWith('.')).sort()).toEqual([...names].sort());
    expect(fs.readFileSync(path.join(dir, 'ffmpeg'), 'utf8')).toBe('content of ffmpeg');
  });

  it('does not download again while the installed binaries match the manifest', async () => {
    const { archive, manifest: m } = fixture('linux');
    const vendorDir = path.join(work, 'vendor');
    const calls: string[] = [];
    const options = { manifest: m, platform: 'linux', arch: 'x64', vendorDir, download: downloadOf(archive, calls), log: () => {} };

    await fetchFfmpeg(options);
    await fetchFfmpeg(options);

    expect(calls).toHaveLength(1);
  });

  it('downloads again when the manifest names another build', async () => {
    const { archive, manifest: m } = fixture('linux');
    const vendorDir = path.join(work, 'vendor');
    const calls: string[] = [];
    await fetchFfmpeg({ manifest: m, platform: 'linux', arch: 'x64', vendorDir, download: downloadOf(archive, calls), log: () => {} });

    fs.writeFileSync(path.join(vendorDir, 'linux-x64', '.stamp'), 'an older build');
    await fetchFfmpeg({ manifest: m, platform: 'linux', arch: 'x64', vendorDir, download: downloadOf(archive, calls), log: () => {} });

    expect(calls).toHaveLength(2);
  });

  it('installs nothing when the download does not match its checksum', async () => {
    const { archive, manifest: m } = fixture('linux');
    const vendorDir = path.join(work, 'vendor');
    m.targets['linux-x64'].sha256 = sha256('something else');

    await expect(
      fetchFfmpeg({ manifest: m, platform: 'linux', arch: 'x64', vendorDir, download: downloadOf(archive), log: () => {} }),
    ).rejects.toThrow(/checksum/i);

    expect(fs.existsSync(path.join(vendorDir, 'linux-x64'))).toBe(false);
  });

  it('unpacks the .exe names on Windows', async () => {
    const { names, archive, manifest: m } = fixture('win32');
    const vendorDir = path.join(work, 'vendor');

    await fetchFfmpeg({ manifest: m, platform: 'win32', arch: 'x64', vendorDir, download: downloadOf(archive), log: () => {} });

    expect(fs.readdirSync(path.join(vendorDir, 'win32-x64')).filter((n) => !n.startsWith('.')).sort()).toEqual([...names].sort());
  });
});

describe('sha256OfFile', () => {
  it('hashes a file the way sha256sum does', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fetch-ffmpeg-hash-'));
    const file = path.join(dir, 'data');
    fs.writeFileSync(file, 'hello');
    try {
      expect(await sha256OfFile(file)).toBe(sha256('hello'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
