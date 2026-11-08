import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TorrentEngine } from '@/main/torrent';
import { StorageManager } from '@/main/storage';
import { IPC_CHANNELS } from '@/shared/types';
import netflixProfile5 from '../fixtures/ffprobe-dolby-vision-p5.json';

const send = vi.fn();

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => [{ webContents: { send } }]) },
}));

/** The scripted ffprobe processes spawned so far: the test decides when each answers. */
const probes = vi.hoisted(() => ({ list: [] as any[] }));

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  const { EventEmitter } = await import('events');
  const spawn = vi.fn(() => {
    const proc: any = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.kill = vi.fn(() => { proc.emit('close', null); return true; });
    probes.list.push(proc);
    return proc;
  });
  return { ...actual, spawn, default: { ...actual, spawn } };
});

const answer = (proc: any, json: unknown) => {
  proc.stdout.emit('data', Buffer.from(JSON.stringify(json)));
  proc.emit('close', 0);
};

/** Lets real I/O (the server starting) run while the fake clock stands still. */
async function until(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !condition(); i++) await new Promise((r) => setImmediate(r));
  expect(condition()).toBe(true);
}

const urls = () => send.mock.calls.filter(([c]) => c === IPC_CHANNELS.VIDEO_URL).map(([, u]) => new URL(u as string));

describe('A probe that answers after its 10 s timeout (#113)', () => {
  let engine: TorrentEngine;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    send.mockClear();
    probes.list.length = 0;
    engine = new TorrentEngine(new StorageManager());
    const file = { name: 'Movie.mkv', length: 1024, offset: 0, select: vi.fn(), deselect: vi.fn(), createReadStream: vi.fn() };
    (engine as any).currentTorrent = { files: [file], pieceLength: 16384, select: vi.fn() };
    (engine as any).extractSubtitles = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await engine.destroy();
  });

  async function openAndTimeOut() {
    await engine.selectFile('Movie.mkv');
    await until(() => probes.list.length === 1);
    await vi.advanceTimersByTimeAsync(10_000);
    await until(() => urls().length === 1);
  }

  it('plays unconverted at first, then restarts converted once Dolby Vision is found', async () => {
    await openAndTimeOut();
    expect(urls()[0].searchParams.has('video')).toBe(false);

    answer(probes.list[0], netflixProfile5);

    await until(() => urls().length === 2);
    expect(urls()[1].searchParams.get('transcode')).toBe('true');
    expect(urls()[1].searchParams.get('video')).toBe('sdr');
  });

  it('keeps the chosen audio track in the restarted stream', async () => {
    await openAndTimeOut();
    (engine as any).selectedAudioIndex = 2;

    answer(probes.list[0], netflixProfile5);

    await until(() => urls().length === 2);
    expect(urls()[1].searchParams.get('audioTrack')).toBe('2');
    expect(urls()[1].searchParams.get('video')).toBe('sdr');
  });

  it('does not restart a video that needs no conversion', async () => {
    await openAndTimeOut();
    // .mkv guesses "transcode" on timeout; a late H.264/AAC answer needs nothing more, so the playing stream is kept.
    answer(probes.list[0], { streams: [{ index: 0, codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080 }], format: {} });

    await new Promise((r) => setImmediate(r));
    expect(urls()).toHaveLength(1);
  });

  it('forgets a late answer for a file that was switched away', async () => {
    await openAndTimeOut();
    await engine.selectFile('Movie.mkv');
    send.mockClear();

    answer(probes.list[0], netflixProfile5);

    await new Promise((r) => setImmediate(r));
    expect(urls().filter((u) => u.searchParams.has('video'))).toHaveLength(0);
  });
});
