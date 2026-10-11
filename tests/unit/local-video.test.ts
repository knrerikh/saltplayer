import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Readable } from 'stream';
import { openLocalVideo } from '@/main/local-video';

const CONTENT = Buffer.from('0123456789abcdef');

async function readAll(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString();
}

describe('openLocalVideo (#33)', () => {
  let dir: string;
  let moviePath: string;

  beforeAll(() => {
    // Not `saltplayer-*`: StorageManager deletes those as stale sessions, even mid-test.
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-video-test-'));
    moviePath = path.join(dir, 'Movie.mkv');
    fs.writeFileSync(moviePath, CONTENT);
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a video');
    fs.mkdirSync(path.join(dir, 'Folder.mkv'));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('describes the file by its name, size and path', async () => {
    const source = await openLocalVideo(moviePath);

    expect(source.name).toBe('Movie.mkv');
    expect(source.length).toBe(CONTENT.length);
    expect(source.path).toBe(moviePath);
  });

  it('reads the whole file', async () => {
    const source = await openLocalVideo(moviePath);

    expect(await readAll(source.createReadStream())).toBe(CONTENT.toString());
  });

  it('reads an inclusive byte range, as HTTP Range requests ask for', async () => {
    const source = await openLocalVideo(moviePath);

    expect(await readAll(source.createReadStream({ start: 2, end: 5 }))).toBe('2345');
  });

  it('refuses a relative path', async () => {
    await expect(openLocalVideo('Movie.mkv')).rejects.toThrow(/absolute/);
  });

  it('refuses a file that is not a video', async () => {
    await expect(openLocalVideo(path.join(dir, 'notes.txt'))).rejects.toThrow(/not a video/i);
  });

  it('refuses a directory, whatever its name', async () => {
    await expect(openLocalVideo(path.join(dir, 'Folder.mkv'))).rejects.toThrow(/not a file/i);
  });

  it('reports a missing file', async () => {
    await expect(openLocalVideo(path.join(dir, 'Missing.mkv'))).rejects.toThrow(/ENOENT/);
  });

  it('refuses anything but a string', async () => {
    await expect(openLocalVideo(42 as unknown as string)).rejects.toThrow(/absolute/);
  });
});
