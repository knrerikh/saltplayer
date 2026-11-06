import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { once } from 'events';
import * as http from 'http';
import type { AddressInfo, Server } from 'net';
import type { PassThrough } from 'stream';
import { TorrentEngine } from '@/main/torrent';
import { StorageManager } from '@/main/storage';
import { IPC_CHANNELS } from '@/shared/types';
import type { VideoConversion } from '@/main/video-conversion';

const send = vi.fn();

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => [{ webContents: { send } }]) },
}));

/** A stand-in for fluent-ffmpeg's command that records how it was set up and plays a scripted outcome. */
const ffmpegDouble = vi.hoisted(() => {
  class FakeCommand {
    input: string;
    seek: number | undefined;
    options: string[] = [];
    audioCodecs: string[] = [];
    videoCodecs: string[] = [];
    private handlers: Record<string, (...args: any[]) => void> = {};

    constructor(input: string) {
      this.input = input;
    }

    seekInput(seconds: number) { this.seek = seconds; return this; }
    outputOptions(options: string[]) { this.options.push(...options); return this; }
    audioCodec(codec: string) { this.audioCodecs.push(codec); return this; }
    audioChannels() { return this; }
    videoCodec(codec: string) { this.videoCodecs.push(codec); return this; }
    format() { return this; }
    kill() { return this; }
    on(event: string, handler: (...args: any[]) => void) { this.handlers[event] = handler; return this; }
    emit(event: string, ...args: unknown[]) { this.handlers[event]?.(...args); }
    pipe(out: PassThrough) { state.onPipe(this, out); return out; }
  }

  const state = {
    commands: [] as FakeCommand[],
    onPipe: (_command: FakeCommand, out: PassThrough): void => {
      out.end('matroska bytes');
    },
  };
  const factory = Object.assign(
    (input: string) => {
      const command = new FakeCommand(input);
      state.commands.push(command);
      return command;
    },
    { setFfmpegPath: () => {}, setFfprobePath: () => {} },
  );
  return { state, factory };
});

vi.mock('fluent-ffmpeg', () => ({ default: ffmpegDouble.factory }));

const DOLBY_VISION: VideoConversion = { kind: 'dolby-vision-sdr', width: 3840, height: 2160 };

function loadFakeTorrent(engine: TorrentEngine) {
  const file = { name: 'Movie.mp4', length: 1024, offset: 0, select: vi.fn(), deselect: vi.fn(), createReadStream: vi.fn() };
  (engine as any).currentTorrent = { files: [file], pieceLength: 16384, select: vi.fn() };
  return file;
}

/** Replaces what ffprobe would say about the file. */
function stubProbe(engine: TorrentEngine, result: { needsTranscode?: boolean; videoConversion?: VideoConversion | null }) {
  (engine as any).probeStream = vi.fn().mockResolvedValue({ needsTranscode: false, duration: 0, videoConversion: null, ...result });
  (engine as any).extractSubtitles = vi.fn().mockResolvedValue(undefined);
  (engine as any).audioTracks = [
    { index: 1, language: 'eng', title: 'English', codec: 'eac3', channels: 6 },
    { index: 2, language: 'rus', title: 'Russian', codec: 'aac', channels: 2 },
  ];
}

async function serverPort(engine: TorrentEngine): Promise<number> {
  const server: Server = (engine as any).server;
  if (!server.listening) await once(server, 'listening');
  return (server.address() as AddressInfo).port;
}

/** The URLs sent to the player so far for this engine's server. */
async function sentUrls(engine: TorrentEngine): Promise<URL[]> {
  const port = await serverPort(engine);
  return send.mock.calls
    .filter(([channel]) => channel === IPC_CHANNELS.VIDEO_URL)
    .map(([, url]) => new URL(url as string))
    .filter((url) => url.port === String(port));
}

async function firstUrl(engine: TorrentEngine): Promise<URL> {
  return vi.waitFor(async () => {
    const [url] = await sentUrls(engine);
    if (!url) throw new Error('No video URL yet');
    return url;
  });
}

/** Requests a stream from the engine's server as the player would. */
async function request(engine: TorrentEngine, query: string): Promise<{ status: number; body: string }> {
  const port = await serverPort(engine);
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: `/Movie.mp4?${query}` }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
        res.on('close', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

const lastCommand = () => ffmpegDouble.state.commands[ffmpegDouble.state.commands.length - 1];
const valueAfter = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe('Converting a Dolby Vision video (#94)', () => {
  let engine: TorrentEngine;

  beforeEach(() => {
    send.mockClear();
    ffmpegDouble.state.commands.length = 0;
    ffmpegDouble.state.onPipe = (_command, out) => { out.end('matroska bytes'); };
    engine = new TorrentEngine(new StorageManager());
    loadFakeTorrent(engine);
  });

  afterEach(async () => {
    await engine.destroy();
  });

  describe('the URL the player gets', () => {
    it('asks for a converted picture when the probe found Dolby Vision profile 5', async () => {
      stubProbe(engine, { videoConversion: DOLBY_VISION });
      await engine.selectFile('Movie.mp4');

      const url = await firstUrl(engine);

      expect(url.searchParams.get('transcode')).toBe('true');
      expect(url.searchParams.get('video')).toBe('sdr');
    });

    it('asks only for a transcode when just the audio needs it', async () => {
      stubProbe(engine, { needsTranscode: true });
      await engine.selectFile('Movie.mp4');

      const url = await firstUrl(engine);

      expect(url.searchParams.get('transcode')).toBe('true');
      expect(url.searchParams.has('video')).toBe(false);
    });

    it('plays an ordinary video as is', async () => {
      stubProbe(engine, {});
      await engine.selectFile('Movie.mp4');

      const url = await firstUrl(engine);

      expect(url.search).toBe('');
    });

    it('keeps the conversion when another audio track is chosen', async () => {
      stubProbe(engine, { videoConversion: DOLBY_VISION });
      await engine.selectFile('Movie.mp4');
      await firstUrl(engine);

      await engine.selectAudioTrack(2);

      const url = (await sentUrls(engine)).pop()!;
      expect(url.searchParams.get('audioTrack')).toBe('2');
      expect(url.searchParams.get('transcode')).toBe('true');
      expect(url.searchParams.get('video')).toBe('sdr');
    });
  });

  describe('the ffmpeg the server starts', () => {
    it('converts the picture and takes the first audio track, as stereo AAC', async () => {
      stubProbe(engine, { videoConversion: DOLBY_VISION });
      await engine.selectFile('Movie.mp4');

      const { body } = await request(engine, 'transcode=true&video=sdr');

      const command = lastCommand();
      expect(body).toBe('matroska bytes');
      expect(valueAfter(command.options, '-vf')).toMatch(/^scale=1920:1080,tonemapx=/);
      expect(valueAfter(command.options, '-c:v')).toMatch(/^(libx264|h264_videotoolbox)$/);
      expect(command.options).toContain('0:a:0?');
      expect(command.videoCodecs).toEqual([]);
      expect(command.audioCodecs).toEqual(['aac']);
      expect(command.seek).toBeUndefined();
    });

    it('restarts the conversion at the requested time', async () => {
      stubProbe(engine, { videoConversion: DOLBY_VISION });
      await engine.selectFile('Movie.mp4');

      await request(engine, 'transcode=true&video=sdr&startTime=1200');

      expect(lastCommand().seek).toBe(1200);
    });

    it('converts the picture with the chosen audio track, copying audio Chromium plays', async () => {
      stubProbe(engine, { videoConversion: DOLBY_VISION });
      await engine.selectFile('Movie.mp4');

      await request(engine, 'transcode=true&video=sdr&audioTrack=2&startTime=60');

      const command = lastCommand();
      expect(command.options).toContain('0:2');
      expect(command.options).not.toContain('0:a:0?');
      expect(command.options.filter((option) => option === '-map')).toHaveLength(2);
      expect(command.audioCodecs).toEqual(['copy']);
      expect(command.seek).toBe(60);
    });

    it('still copies the picture when the URL asks for audio conversion only', async () => {
      stubProbe(engine, { needsTranscode: true });
      await engine.selectFile('Movie.mp4');

      await request(engine, 'transcode=true');

      const command = lastCommand();
      expect(command.videoCodecs).toEqual(['copy']);
      expect(command.options).not.toContain('-vf');
    });

    it('copies the picture when the URL asks for a conversion the probe did not find', async () => {
      stubProbe(engine, {});
      await engine.selectFile('Movie.mp4');

      await request(engine, 'transcode=true&video=sdr');

      expect(lastCommand().videoCodecs).toEqual(['copy']);
    });
  });

  describe('when the conversion cannot start', () => {
    const failBeforeAnyBytes = () => {
      ffmpegDouble.state.onPipe = (command) => {
        queueMicrotask(() => command.emit('error', new Error('No such filter: tonemapx')));
      };
    };

    const errorNotices = () => send.mock.calls.filter(([channel]) => channel === IPC_CHANNELS.ERROR);

    it('tells the user once and asks the player for the video as it is', async () => {
      stubProbe(engine, { videoConversion: DOLBY_VISION });
      await engine.selectFile('Movie.mp4');
      await firstUrl(engine);
      failBeforeAnyBytes();

      await request(engine, 'transcode=true&video=sdr');
      await vi.waitFor(async () => expect(await sentUrls(engine)).toHaveLength(2));

      const retry = (await sentUrls(engine))[1];
      expect(retry.search).toBe('');
      expect(errorNotices()).toHaveLength(1);
      expect(errorNotices()[0][1]).toEqual({
        code: 'VIDEO_CONVERSION_FAILED',
        message: expect.stringMatching(/Dolby Vision.*colours may be wrong/i),
      });
    });

    it('keeps the audio conversion in the video it falls back to', async () => {
      stubProbe(engine, { needsTranscode: true, videoConversion: DOLBY_VISION });
      await engine.selectFile('Movie.mp4');
      await firstUrl(engine);
      failBeforeAnyBytes();

      await request(engine, 'transcode=true&video=sdr&startTime=300');
      await vi.waitFor(async () => expect(await sentUrls(engine)).toHaveLength(2));

      const retry = (await sentUrls(engine))[1];
      expect(retry.searchParams.get('transcode')).toBe('true');
      expect(retry.searchParams.has('video')).toBe(false);
      expect(send).toHaveBeenCalledWith(IPC_CHANNELS.VIDEO_URL, retry.toString(), 300);
    });

    it('does not report it again, nor convert again, afterwards', async () => {
      stubProbe(engine, { videoConversion: DOLBY_VISION });
      await engine.selectFile('Movie.mp4');
      await firstUrl(engine);
      failBeforeAnyBytes();
      await request(engine, 'transcode=true&video=sdr');
      await vi.waitFor(async () => expect(await sentUrls(engine)).toHaveLength(2));
      ffmpegDouble.state.onPipe = (_command, out) => { out.end('matroska bytes'); };

      await request(engine, 'transcode=true&video=sdr&startTime=5');

      expect(lastCommand().videoCodecs).toEqual(['copy']);
      expect(errorNotices()).toHaveLength(1);
      expect(await sentUrls(engine)).toHaveLength(2);
    });

    it('ignores an ffmpeg that stops after it has produced the picture', async () => {
      stubProbe(engine, { videoConversion: DOLBY_VISION });
      await engine.selectFile('Movie.mp4');
      await firstUrl(engine);
      ffmpegDouble.state.onPipe = (command, out) => {
        out.write('some bytes');
        queueMicrotask(() => command.emit('error', new Error('Conversion failed halfway')));
        setTimeout(() => out.end(), 20);
      };

      await request(engine, 'transcode=true&video=sdr');

      expect(errorNotices()).toHaveLength(0);
      expect(await sentUrls(engine)).toHaveLength(1);
    });

    it('does not take a player that left for a failure', async () => {
      stubProbe(engine, { videoConversion: DOLBY_VISION });
      await engine.selectFile('Movie.mp4');
      await firstUrl(engine);
      ffmpegDouble.state.onPipe = (command) => {
        // A seek replaces the stream: the player hangs up and ffmpeg is killed.
        setTimeout(() => command.emit('error', new Error('ffmpeg was killed with signal SIGKILL')), 30);
      };
      const port = await serverPort(engine);
      const req = http.get({ host: '127.0.0.1', port, path: '/Movie.mp4?transcode=true&video=sdr' });
      req.on('error', () => {});
      setTimeout(() => req.destroy(), 10);

      await new Promise((resolve) => setTimeout(resolve, 80));

      expect(errorNotices()).toHaveLength(0);
      expect(await sentUrls(engine)).toHaveLength(1);
    });
  });
});
