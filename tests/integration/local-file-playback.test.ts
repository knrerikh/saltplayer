import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import ffmpegPath from 'ffmpeg-static';
import { TorrentEngine } from '@/main/torrent';
import { StorageManager } from '@/main/storage';
import { IPC_CHANNELS } from '@/shared/types';

const send = vi.fn();

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => [{ webContents: { send } }]) },
}));

/** Real ffprobe and ffmpeg run here; a cold start on a CI runner can take seconds. */
const MEDIA_TIMEOUT_MS = 30_000;

/** Every Matroska file starts with the EBML header magic. */
const EBML_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

function sent<T>(channel: string): Promise<T> {
  return vi.waitFor(
    () => {
      const call = send.mock.calls.find(([name]) => name === channel);
      if (!call) throw new Error(`Nothing sent on ${channel} yet`);
      return call[1] as T;
    },
    { timeout: MEDIA_TIMEOUT_MS },
  );
}

/**
 * The whole path a local file takes, with real media and the bundled ffprobe and
 * ffmpeg: a two-second MKV whose AC3 audio Chromium cannot play.
 */
describe('Playing a local MKV with AC3 audio (#33)', () => {
  let dir: string;
  let moviePath: string;
  let engine: TorrentEngine;

  beforeAll(() => {
    // Not `saltplayer-*`: StorageManager deletes those as stale sessions, even mid-test.
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-playback-test-'));
    moviePath = path.join(dir, 'Sample.mkv');
    execFileSync(ffmpegPath!, [
      '-v', 'error',
      '-f', 'lavfi', '-i', 'testsrc=duration=2:size=128x72:rate=10',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-c:v', 'mpeg4', '-c:a', 'ac3', '-shortest',
      moviePath,
    ]);
  }, MEDIA_TIMEOUT_MS);

  afterEach(async () => {
    await engine.destroy();
    send.mockClear();
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('probes the file and asks the player for the transcoded stream', async () => {
    engine = new TorrentEngine(new StorageManager());

    await engine.openLocalFile(moviePath);
    const url = new URL(await sent<string>(IPC_CHANNELS.VIDEO_URL));
    const audio = await sent<{ tracks: { codec: string }[] }>(IPC_CHANNELS.AUDIO_TRACKS);
    const { duration } = await sent<{ duration: number }>(IPC_CHANNELS.VIDEO_METADATA);

    expect(url.searchParams.get('transcode')).toBe('true');
    expect(audio.tracks.map((track) => track.codec)).toEqual(['ac3']);
    expect(duration).toBeCloseTo(2, 0);
  }, MEDIA_TIMEOUT_MS + 5_000);

  it('streams it through ffmpeg as Matroska', async () => {
    engine = new TorrentEngine(new StorageManager());

    await engine.openLocalFile(moviePath);
    const response = await fetch(await sent<string>(IPC_CHANNELS.VIDEO_URL));
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    await reader.cancel();

    expect(response.status).toBe(200);
    expect(Buffer.from(value!).subarray(0, 4)).toEqual(EBML_MAGIC);
  }, MEDIA_TIMEOUT_MS + 5_000);
});
