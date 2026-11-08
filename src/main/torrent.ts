import { TorrentFile, TorrentMetadata, TorrentStatus, IPC_CHANNELS, SubtitleTrack, AudioTrack } from '@/shared/types';
import { StorageManager } from './storage';
import { pickStartFile } from '@/shared/video-files';
import { playbackKey } from '@/shared/playback-key';
import { LocalVideo, MediaSource, openLocalVideo } from './local-video';
import type { WatchHistory } from './watch-history';
import {
  READ_CHUNK_BYTES,
  PieceRange,
  planRelease,
  readAheadBytes,
  readAheadPieces,
  readInChunks,
} from './download-window';
import { shouldAddWebSeeds } from './web-seed-fallback';
import { BrowserWindow } from 'electron';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn as spawnChild } from 'child_process';
import { pipeline, PassThrough, Transform } from 'stream';
import ffmpeg from 'fluent-ffmpeg';
import { hostMediaTools } from './media-tools';
import {
  DOLBY_VISION_SDR_VALUE,
  VIDEO_CONVERSION_PARAM,
  VideoConversion,
  buildConversionArgs,
  detectVideoConversion,
} from './video-conversion';

const mediaTools = hostMediaTools();
ffmpeg.setFfmpegPath(mediaTools.ffmpeg);
ffmpeg.setFfprobePath(mediaTools.ffprobe);

/** The `startTime` of a request in seconds; 0 when it is missing, negative or not a finite number. */
function parseStartTime(raw: string | null): number {
  const seconds = Number(raw || '0');
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

// Write startup diagnostics so architecture/path issues are visible in the crash log
try {
  const logDir = path.join(os.homedir(), 'Library', 'Logs', 'saltplayer');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const diag = [
    `${new Date().toISOString()} [startup-diagnostics]`,
    `  process.arch: ${process.arch}`,
    `  ffmpeg: ${mediaTools.ffmpeg}`,
    `  ffmpeg exists: ${fs.existsSync(mediaTools.ffmpeg)}`,
    `  ffprobe: ${mediaTools.ffprobe}`,
    `  ffprobe exists: ${fs.existsSync(mediaTools.ffprobe)}`,
  ].join('\n') + '\n\n';
  fs.appendFileSync(path.join(logDir, 'crash.log'), diag);
} catch { /* ignore */ }

// WebTorrent will be loaded dynamically since it's an ESM module
let WebTorrentClass: any = null;

interface ProbeResult {
  needsTranscode: boolean;
  duration: number;
  videoConversion: VideoConversion | null;
}

const UNSUPPORTED_AUDIO_CODECS = ['ac3', 'ac-3', 'eac3', 'ec-3', 'dts', 'truehd', 'mlp', 'vorbis'];

/**
 * The streaming server binds here, never to all interfaces: anyone on the network
 * could otherwise stream the current video and its subtitles.
 */
const STREAM_HOST = '127.0.0.1';

/**
 * Marks requests from our own ffprobe and subtitle extraction, so their reads do not
 * move the download window away from the player's position.
 */
const INTERNAL_READ_PARAM = 'internal';
const internalUrl = (url: string) => `${url}?${INTERNAL_READ_PARAM}=1`;

/** How long `load()` waits for WebTorrent's `ontorrent` callback before giving up. */
export const TORRENT_LOAD_TIMEOUT_MS = 60_000;

/**
 * Static fallback trackers appended to every `client.add()` call. WebTorrent
 * concatenates these with any trackers embedded in the magnet/.torrent itself,
 * so this only helps when the source's own trackers are unreachable.
 */
export const FALLBACK_TRACKERS = [
  'udp://open.demonii.com:1337/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'http://tracker.opentrackr.org:1337/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://open.stealth.si:80/announce',
];

/**
 * How much of the next episode `prefetchFile()` fetches ahead: enough for ffprobe and
 * the first seconds of playback, so autoplay does not start on an empty buffer.
 */
export const PREFETCH_BYTES = 16 * 1024 * 1024;

/** Extract ISO 639-2 language code from values like "rus-sub", "eng-forced" */
function normalizeLanguage(raw: string): string {
  const s = (raw || 'und').trim().toLowerCase();
  if (!s || s === 'und') return 'und';
  const match = s.match(/^([a-z]{2,3})(?:[-_].*)?$/);
  return match ? match[1] : s;
}

/** How long stop() and destroy() wait for probes and files to let go before giving up. */
const CLOSE_TIMEOUT_MS = 3000;

export class TorrentEngine {
  private client: any | null = null;
  private currentTorrent: any | null = null;
  private selectedFile: any | null = null;
  private prefetchedFile: any | null = null;
  private readAheadRange: PieceRange | null = null;
  private lastKnownDurationSec = 0;
  private storageManager: StorageManager;
  private server: http.Server | null = null;
  private probes = new Set<ReturnType<typeof spawnChild>>();
  /** Settles when a probe's process has exited, which is when Windows frees what it had open. */
  private probeExits = new Set<Promise<void>>();
  private localVideo: LocalVideo | null = null;
  /** True from stop() until the next stream starts: nothing may be probed in between. */
  private serverClosed = false;
  private closeTimeoutMs = CLOSE_TIMEOUT_MS;
  private serverPort: number | null = null;
  private statusInterval: NodeJS.Timeout | null = null;
  private webSeedTimer: NodeJS.Timeout | null = null;
  private subtitleTracks: SubtitleTrack[] = [];
  private audioTracks: AudioTrack[] = [];
  private selectedAudioIndex: number | null = null;
  private currentStreamUrl: string | null = null;
  private currentFilePathname: string | null = null;
  /** The picture conversion of the open file, or null while it plays as it is. */
  private videoConversion: VideoConversion | null = null;
  /** Whether the open file's audio is in a codec Chromium cannot play. */
  private audioNeedsTranscode = false;

  /**
   * @param history Where files were left: a torrent starts with the episode watched
   *   last, and a file from where it stopped.
   */
  constructor(
    storageManager: StorageManager,
    private readonly history?: Pick<WatchHistory, 'resumePosition' | 'lastWatched'>,
  ) {
    this.storageManager = storageManager;
  }

  /**
   * Initialize WebTorrent client (async because it's an ESM module)
   */
  private async initializeClient(): Promise<void> {
    // Load WebTorrent dynamically (it's an ESM module with top-level await)
    if (!WebTorrentClass) {
      // Stub node-datachannel native binary before loading webtorrent.
      // webrtc-polyfill (loaded by simple-peer → webtorrent) eagerly requires
      // node_datachannel.node via createRequire, which fails in the packaged app
      // because cmake-js native modules aren't rebuilt by @electron/rebuild.
      // Desktop torrent clients only need TCP/UDP peers, so disabling WebRTC is safe.
      const Module = require('module') as { _load: Function };
      const origLoad = Module._load;
      const noop = (): void => {};
      // Regular function (not arrow) so it can be called with `new`. Returning a plain
      // object from a constructor makes JS use that object as the instance, giving us
      // a Proxy where any method call (onLocalDescription, createOffer, etc.) returns noop.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function NoopClass(this: unknown, ...args: unknown[]): any {
        return new Proxy({} as Record<string, unknown>, { get: () => noop });
      }
      const ndcStub = new Proxy(
        {
          initLogger: noop, cleanup: noop, preload: noop, setSctpSettings: noop,
          RtcpReceivingSession: NoopClass, Track: NoopClass, Video: NoopClass,
          Audio: NoopClass, DataChannel: NoopClass, PeerConnection: NoopClass, WebSocket: NoopClass,
        } as Record<string, unknown>,
        { get: (t, p) => (typeof p === 'string' && p in t ? t[p] : NoopClass) }
      );
      Module._load = function(request: string, ...rest: unknown[]) {
        if (typeof request === 'string' && request.includes('node_datachannel.node')) {
          return ndcStub;
        }
        return origLoad.call(this, request, ...rest);
      };

      try {
        const WebTorrentModule = await import('webtorrent');

        // If default is a Promise, await it (top-level await in ESM)
        let resolved = WebTorrentModule.default;
        if (resolved instanceof Promise) {
          resolved = await resolved;
        }

        // Try different export patterns: check resolved object first
        WebTorrentClass = (resolved as any)?.default || (resolved as any)?.WebTorrent || (WebTorrentModule as any).WebTorrent || resolved || WebTorrentModule;
      } catch (error: any) {
        throw error;
      } finally {
        Module._load = origLoad;
      }
    }
    
    this.client = new WebTorrentClass({
      downloadLimit: -1,
      uploadLimit: -1,
      maxConns: 100,
      // uTP connect attempts on some networks hang for ~10s per peer with three
      // retries before falling back to TCP (~41-45s to first wire). Disabling uTP
      // makes peers connect over TCP immediately (~2.5s to first wire).
      utp: false,
      // The stub above lets webrtc-polyfill load but cannot make peers. Without this
      // a wss:// tracker would still build a WebRTC peer, which throws out of the
      // tracker's announce and kills the app (#106). With it bittorrent-tracker skips
      // wss:// trackers with a warning; UDP/HTTP trackers and DHT remain.
      tracker: { wrtc: false },
      // Web seeds stay off while peers can serve: a web seed takes a whole piece in one
      // request, and for a piece shared by several files that is one HTTP request per
      // file. If one never answers the piece stays reserved, no peer may take it and the
      // download ends one piece short (#108). watchForWebSeedFallback() adds them
      // when a torrent has no peers.
      webSeeds: false,
    });

    this.client.on('error', (error: any) => {
      console.error('WebTorrent client error:', error);
      const message = error instanceof Error ? error.message : String(error);
      this.sendError('TORRENT_ERROR', message);
    });
  }

  /**
   * Calls `client.remove()` for a torrent (or infoHash) and resolves once it
   * settles, however it settles.
   *
   * webtorrent's real `remove()` is `async`: when the torrent has already
   * detached itself from the client (its own error, or webtorrent's
   * duplicate-torrent branch calling `client._remove(this)`), it `throw`s
   * inside — which rejects the RETURNED promise — and never invokes the
   * supplied callback at all. A plain callback-only wait therefore hangs
   * forever in that case. This never throws, never resolves more than once,
   * and never leaves a returned promise unhandled; a mock that returns a
   * non-thenable (e.g. `undefined`) is handled too — only the callback path
   * applies then.
   */
  private removeTorrentSafely(torrentOrInfoHash: any): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.client) {
        resolve();
        return;
      }

      let settled = false;
      const finish = (err?: unknown) => {
        if (settled) return;
        settled = true;
        if (err) console.error('Error removing torrent:', err);
        resolve();
      };

      let result: any;
      try {
        result = this.client.remove(torrentOrInfoHash, undefined, (err: Error | string | null) => {
          finish(err ?? undefined);
        });
      } catch (err) {
        finish(err);
        return;
      }

      if (result && typeof result.then === 'function') {
        result.then(
          () => finish(),
          (err: unknown) => finish(err)
        );
      }
    });
  }

  /**
   * Load a torrent from magnet link or .torrent file
   */
  async load(source: string): Promise<TorrentMetadata> {
    // Initialize client if not already initialized (lazy initialization)
    if (!this.client) {
      await this.initializeClient();
    }

    // The temp dir may have been removed by a previous cleanup() — recreate it
    // rather than failing the load with "Storage manager not initialized".
    await this.storageManager.ensureInitialized();

    // Stop any previous torrent and WAIT for the removal to actually finish
    // before adding a new one. `client.add()` for a magnet whose infohash is
    // still registered on the client falls into webtorrent's duplicate-torrent
    // branch, which fires `ontorrent` with the stale, not-yet-ready torrent
    // instead of a fresh one.
    await this.stop();

    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('Torrent client not initialized'));
        return;
      }

      // Ensures load()'s promise settles exactly once, whichever of
      // timeout/success/error happens first. A callback arriving after this
      // is true (e.g. webtorrent's duplicate-torrent branch invoking the OLD
      // ontorrent callback after a timeout already rejected this attempt)
      // must not resolve/reject again or touch this.currentTorrent.
      let settled = false;
      // Torrent instance synchronously returned by client.add(), kept locally
      // so the timeout handler can remove it even though `torrent.ready`/the
      // ontorrent callback may never fire.
      let addedTorrent: any = null;

      const settleResolve = (metadata: TorrentMetadata) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(metadata);
      };

      const settleReject = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(error);
      };

      const options = {
        path: this.storageManager.getTempDir(),
        announce: FALLBACK_TRACKERS,
        // Nothing downloads until prioritizeStreamingPieces() selects it; by default
        // WebTorrent selects the whole torrent, and selects again any piece that fails
        // verification.
        deselect: true,
      };

      // Set a timeout to detect if callback is never called
      const timeoutId = setTimeout(() => {
        // Snapshot the timed-out torrent so a later, unrelated load() doesn't
        // ever get its (different) torrent removed by this handler.
        const staleTorrent = addedTorrent;
        if (staleTorrent) {
          // Fire-and-forget: removal must never delay or change the timeout
          // rejection below, only be attempted without throwing or leaving an
          // unhandled promise rejection (see removeTorrentSafely).
          void this.removeTorrentSafely(staleTorrent);
        }
        settleReject(new Error('Timeout: torrent loading took too long or invalid source'));
      }, TORRENT_LOAD_TIMEOUT_MS);

      addedTorrent = this.client.add(source, options, (torrent: any) => {
        // Late callback from a previous, already-settled load() attempt
        // (webtorrent's duplicate-torrent branch): ignore entirely.
        if (settled) return;

        this.currentTorrent = torrent;

        // Helper function to process ready torrent
        const processReadyTorrent = () => {
          console.log('Torrent ready:', torrent.name);

          // Select video file
          const videoFile = pickStartFile<MediaSource>(
            torrent.files,
            (file) => file.length,
            this.history?.lastWatched(torrent.infoHash) ?? null,
          );

          if (!videoFile) {
            const error = new Error('No video file found in torrent');
            this.sendError('NO_VIDEO_FILE', error.message);
            settleReject(error);
            return;
          }

          // Start streaming server
          this.startStreamingServer(videoFile);

          // Start status updates
          this.startStatusUpdates();

          // Prepare metadata
          const metadata: TorrentMetadata = {
            name: torrent.name,
            files: torrent.files.map((f: any) => ({
              name: f.name,
              size: f.length,
              path: f.path,
            })),
            totalSize: torrent.length,
            infoHash: torrent.infoHash,
          };

          settleResolve(metadata);
        };

        // Check if torrent is already ready (synchronous)
        if (torrent.ready) {
          processReadyTorrent();
          return;
        }

        torrent.on('error', (error: any) => {
          console.error('Torrent error:', error);
          const message = error instanceof Error ? error.message : String(error);
          this.sendError('TORRENT_ERROR', message);
          settleReject(error);
        });

        torrent.on('warning', (warning: any) => {
          console.warn('Torrent warning:', warning);
        });

        torrent.on('ready', () => {
          processReadyTorrent();
        });

        torrent.on('download', () => {
          // Status is sent via interval, no need to send on every download event
        });

        torrent.on('done', () => {
          console.log('Torrent download complete');
        });
      });
      this.watchForWebSeedFallback(addedTorrent);
    });
  }

  /**
   * Adds the torrent's own web seeds (`ws=` of a magnet, `url-list` of a .torrent) once
   * it has had no peers for WEB_SEED_FALLBACK_MS, so a torrent that only has web seeds
   * still downloads. The wait starts when the torrent is added and again whenever the
   * peers drop to 0. The timer ends with the torrent.
   */
  private watchForWebSeedFallback(torrent: any): void {
    this.stopWebSeedFallback();
    let noPeersSince: number | null = Date.now();
    let added = false;

    this.webSeedTimer = setInterval(() => {
      if (torrent.destroyed || torrent.done) {
        this.stopWebSeedFallback();
        return;
      }
      const now = Date.now();
      if (torrent.numPeers > 0) {
        noPeersSince = null;
        return;
      }
      noPeersSince ??= now;
      if (!shouldAddWebSeeds({ peers: torrent.numPeers, done: torrent.done, added, noPeersSince, now })) return;

      added = true;
      this.stopWebSeedFallback();
      const urls: string[] = torrent.urlList ?? [];
      if (urls.length === 0) return;
      console.log(`No peers: adding ${urls.length} web seed(s)`);
      urls.forEach((url) => torrent.addWebSeed(url));
    }, 1000);
  }

  private stopWebSeedFallback(): void {
    if (this.webSeedTimer) clearInterval(this.webSeedTimer);
    this.webSeedTimer = null;
  }

  /**
   * Select a specific file to play
   */
  async selectFile(fileName: string): Promise<void> {
    if (!this.currentTorrent) {
      throw new Error('No torrent loaded');
    }

    const file = this.currentTorrent.files.find((f: any) => f.name === fileName);
    
    if (!file) {
      throw new Error(`File not found: ${fileName}`);
    }

    // Restart streaming server with new file
    this.startStreamingServer(file);
  }

  /**
   * Fetch the start of another file of the torrent ahead of time — the next episode,
   * shortly before the current one ends. A local file has no torrent to fetch from.
   */
  async prefetchFile(fileName: string): Promise<void> {
    if (!this.currentTorrent) return;

    const file = this.currentTorrent.files.find((f: any) => f.name === fileName);
    if (!file) {
      throw new Error(`File not found: ${fileName}`);
    }
    if (file === this.selectedFile) return;

    this.prefetchedFile = file;
    this.selectFileStart(file);
  }

  private selectFileStart(file: any): void {
    const pieceLength = this.currentTorrent.pieceLength;
    const startPiece = Math.floor(file.offset / pieceLength);
    const endByte = file.offset + Math.min(file.length, PREFETCH_BYTES) - 1;
    this.currentTorrent.select(startPiece, Math.floor(endByte / pieceLength), false);
  }

  /**
   * Play a video file from disk through the same streaming server as torrents, so
   * probing, transcoding, audio tracks and subtitles work unchanged. Whatever was
   * playing keeps playing if the file cannot be opened.
   */
  async openLocalFile(filePath: string): Promise<TorrentMetadata> {
    const video = await openLocalVideo(filePath);
    await this.stop();

    this.startStreamingServer(video);
    this.localVideo = video;

    return {
      name: video.name,
      files: [{ name: video.name, size: video.length, path: video.path }],
      totalSize: video.length,
    };
  }

  /**
   * Probe stream for codecs and duration.
   * Spawns ffprobe directly to avoid fluent-ffmpeg's getAvailableFormats() capability check,
   * which calls spawn() synchronously in a way that can propagate EBADARCH as an uncaughtException.
   */
  private async probeStream(streamUrl: string, onLateResult?: (result: ProbeResult) => void): Promise<ProbeResult> {
    const ffprobeBin = mediaTools.ffprobe;

    return new Promise((resolve) => {
      let settled = false;
      const done = (result: ProbeResult) => {
        if (!settled) { settled = true; resolve(result); }
      };

      const fallback = () => {
        const ext = streamUrl.split('?')[0].split('.').pop()?.toLowerCase();
        done({ needsTranscode: ['mkv', 'avi', 'wmv', 'flv', 'mov'].includes(ext || ''), duration: 0, videoConversion: null });
      };

      const timeoutId = setTimeout(() => {
        console.warn('FFprobe timed out, proceeding with fallback check');
        fallback();
      }, 10000);

      let proc: ReturnType<typeof spawnChild>;
      try {
        proc = this.spawnProbe(ffprobeBin, [
          '-v', 'quiet',
          '-probesize', '5000000',       // stop reading after 5 MB — enough for any container header
          '-analyzeduration', '5000000', // 5 s of analysis max
          '-print_format', 'json',
          '-show_format',
          '-show_streams',
          streamUrl,
        ]);
      } catch (err: any) {
        clearTimeout(timeoutId);
        console.error('FFprobe spawn failed:', err.message);
        done({ needsTranscode: false, duration: 0, videoConversion: null });
        return;
      }

      let stdout = '';
      proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });

      proc.on('error', (err: Error) => {
        clearTimeout(timeoutId);
        console.error('FFprobe error:', err.message);
        fallback();
      });

      proc.on('close', () => {
        clearTimeout(timeoutId);

        // Always try to extract audio tracks — even if the timeout already fired.
        // The original fluent-ffmpeg path had the same behaviour: the callback
        // ran after isResolved=true and still called extractAudioTracks so that
        // the renderer received audio track data even on slow torrent starts.
        try {
          const data = JSON.parse(stdout);
          const duration = data.format?.duration ? Number(data.format.duration) : 0;
          this.extractAudioTracks(data);  // sends audio tracks regardless of timeout

          {
            let needsTranscode = false;
            const audioStream = (data.streams || []).find((s: any) => s.codec_type === 'audio');
            if (audioStream) {
              const codec = (audioStream.codec_name || '').toLowerCase();
              if (UNSUPPORTED_AUDIO_CODECS.includes(codec)) {
                console.log(`Transcoding required for codec: ${codec}`);
                needsTranscode = true;
              }
            }
            const result = { needsTranscode, duration, videoConversion: detectVideoConversion(data) };
            // After the timeout the file was already started on the fallback guess; ffprobe kept
            // waiting for the header's pieces and has now read it, so the caller can correct course.
            if (settled) onLateResult?.(result);
            else done(result);
          }
        } catch (e) {
          if (!settled) {
            console.error('FFprobe parse error:', e);
            done({ needsTranscode: false, duration: 0, videoConversion: null });
          }
        }
      });
    });
  }

  private async extractSubtitles(streamUrl: string): Promise<void> {
    this.subtitleTracks = [];

    const ffprobeBin = mediaTools.ffprobe;

    return new Promise((resolve) => {
      let settled = false;
      const done = () => { if (!settled) { settled = true; resolve(); } };

      const timeoutId = setTimeout(() => {
        console.warn('Subtitle extraction timed out');
        this.sendSubtitles([]);
        done();
      }, 15000);

      let proc: ReturnType<typeof spawnChild>;
      try {
        proc = this.spawnProbe(ffprobeBin, [
          '-v', 'quiet',
          '-print_format', 'json',
          '-show_streams',
          streamUrl,
        ]);
      } catch (err: any) {
        clearTimeout(timeoutId);
        console.error('FFprobe subtitle spawn failed:', err.message);
        this.sendSubtitles([]);
        done();
        return;
      }

      let stdout = '';
      proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });

      proc.on('error', (err: Error) => {
        clearTimeout(timeoutId);
        console.error('FFprobe subtitle error:', err.message);
        this.sendSubtitles([]);
        done();
      });

      proc.on('close', () => {
        clearTimeout(timeoutId);
        if (settled || proc.killed) return;

        try {
          const data = JSON.parse(stdout);
          const subtitleStreams = (data.streams || []).filter((s: any) => s.codec_type === 'subtitle');

          if (subtitleStreams.length === 0) {
            console.log('No embedded subtitles found');
            this.sendSubtitles([]);
            done();
            return;
          }

          console.log(`Found ${subtitleStreams.length} subtitle track(s)`);
          subtitleStreams.forEach((stream: any, index: number) => {
            const rawLang = stream.tags?.language ?? stream.tags?.LANGUAGE ?? stream.language ?? 'und';
            const lang = normalizeLanguage(typeof rawLang === 'string' ? rawLang : 'und');
            const track: SubtitleTrack = {
              index: stream.index,
              language: lang,
              title: stream.tags?.title ?? `Track ${index + 1}`,
              url: `http://${STREAM_HOST}:${this.serverPort}/subtitle/${stream.index}.vtt`,
            };
            this.subtitleTracks.push(track);
          });
          this.sendSubtitles(this.subtitleTracks);
        } catch (e) {
          console.error('FFprobe subtitle parse error:', e);
          this.sendSubtitles([]);
        }
        done();
      });
    });
  }

  private spawnProbe(bin: string, args: string[]): ReturnType<typeof spawnChild> {
    // A stopped engine has no stream to probe.
    if (this.serverClosed) throw new Error('Streaming server is closed');
    const proc = spawnChild(bin, args);
    this.probes.add(proc);
    const exited = new Promise<void>((resolve) => {
      proc.once('close', () => resolve());
      proc.once('error', () => resolve());
    });
    this.probeExits.add(exited);
    void exited.then(() => {
      this.probes.delete(proc);
      this.probeExits.delete(exited);
    });
    return proc;
  }

  /**
   * Ends the server's open responses, which closes their read streams and the file, and kills
   * the probes. Resolves once the server is closed, the probes have exited and the file is closed,
   * or after `closeTimeoutMs`, so a process or stream that never settles cannot block quitting.
   */
  private async closeServer(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.serverClosed = true;
    const serverEnded = server
      ? new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        })
      : Promise.resolve();
    this.probes.forEach(probe => probe.kill());
    const localVideo = this.localVideo;
    this.localVideo = null;

    const pending = new Set(['server', 'ffprobe', 'file']);
    const settled = [
      serverEnded.then(() => pending.delete('server')),
      Promise.all(this.probeExits).then(() => pending.delete('ffprobe')),
      (localVideo?.whenClosed() ?? Promise.resolve()).then(() => pending.delete('file')),
    ];
    let timer: NodeJS.Timeout | undefined;
    const ceiling = new Promise<void>((resolve) => { timer = setTimeout(resolve, this.closeTimeoutMs); });
    await Promise.race([Promise.all(settled), ceiling]);
    clearTimeout(timer);
    if (pending.size > 0) {
      console.warn(`Did not finish closing within ${this.closeTimeoutMs} ms: ${[...pending].join(', ')}`);
    }
  }

  /**
   * Start HTTP streaming server
   */
  private startStreamingServer(file: MediaSource): void {
    void this.closeServer();
    this.serverClosed = false;
    // What was learned about the previous file says nothing about this one, and a conversion
    // of the old file that fails while the server is closing must not find it still set.
    this.videoConversion = null;
    this.audioNeedsTranscode = false;
    const encodedName = encodeURIComponent(file.name);
    const pathname = `/${encodedName}`;
    const totalSize: number = typeof file.length === 'number' ? file.length : Number(file.length);
    let lastReprioritizedStart = 0;
    // The download window follows what the player (or the transcoding ffmpeg) reads.
    const followPlayback = (position: number) => {
      if (isCurrent()) this.moveReadAhead(position);
    };

    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url ?? '/', `http://${STREAM_HOST}`);
        const isTranscode = reqUrl.searchParams.get('transcode') === 'true';
        const startTime = parseStartTime(reqUrl.searchParams.get('startTime'));

        const subtitleMatch = reqUrl.pathname.match(/^\/subtitle\/(\d+)\.vtt$/);
        if (subtitleMatch) {
          const streamIndex = parseInt(subtitleMatch[1], 10);
          await this.serveSubtitle(streamIndex, res, file, startTime);
          return;
        }

        if (reqUrl.pathname !== pathname) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }

        if (isTranscode) {
          this.serveTranscode(reqUrl, res, file, pathname, startTime);
          return;
        }

        const isInternalRead = reqUrl.searchParams.has(INTERNAL_READ_PARAM);
        const rangeHeader = req.headers.range;
        const contentType = this.guessVideoContentType(file.name);

        if (!rangeHeader || typeof rangeHeader !== 'string') {
          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': String(totalSize),
            'Accept-Ranges': 'bytes',
          });
          const onChunk = isInternalRead ? undefined : followPlayback;
          pipeline(readInChunks(file, { start: 0, end: totalSize - 1 }, READ_CHUNK_BYTES, onChunk), res, () => {});
          return;
        }

        const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
        if (!m) {
          res.statusCode = 416;
          res.end();
          return;
        }

        const startStr = m[1];
        const endStr = m[2];
        let start: number;
        let end: number;

        if (startStr === '' && endStr !== '') {
          const suffixLen = Math.max(0, Number(endStr));
          start = Math.max(0, totalSize - suffixLen);
          end = totalSize - 1;
        } else {
          start = Number(startStr || 0);
          end = endStr ? Number(endStr) : totalSize - 1;
        }

        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= totalSize) {
          res.statusCode = 416;
          res.setHeader('Content-Range', `bytes */${totalSize}`);
          res.end();
          return;
        }

        const chunkSize = end - start + 1;
        const jumpFromLastPriority = Math.abs(start - lastReprioritizedStart);
        const isLargeJump = jumpFromLastPriority > 8 * 1024 * 1024;
        const isNearEnd = start >= Math.max(0, totalSize - 2 * 1024 * 1024);
        const isTinyRange = chunkSize <= 256 * 1024;
        const isLikelyMetadataProbe = isNearEnd && isTinyRange;
        const isPlaybackRead = !isLikelyMetadataProbe && !isInternalRead;
        const shouldReprioritize = isLargeJump && isPlaybackRead;

        if (shouldReprioritize) {
          this.prioritizeStreamingPieces(file, start);
          lastReprioritizedStart = start;
        }

        res.writeHead(206, {
          'Content-Type': contentType,
          'Content-Length': String(chunkSize),
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
          'Accept-Ranges': 'bytes',
        });
        const onChunk = isPlaybackRead ? followPlayback : undefined;
        pipeline(readInChunks(file, { start, end }, READ_CHUNK_BYTES, onChunk), res, () => {});
      } catch (e) {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end('Internal error');
        }
        console.error('Server error:', e);
      }
    });

    this.server = server;

    // Stopping or switching files replaces this.server, possibly before this one has
    // even started listening; a replaced server must not report its stream.
    const isCurrent = () => this.server === server;

    server.listen(0, STREAM_HOST, async () => {
      if (!isCurrent()) return;
      const address = server.address() as AddressInfo;
      this.serverPort = address.port;
      this.currentFilePathname = pathname;
      this.selectedAudioIndex = null;
      this.videoConversion = null;
      this.audioNeedsTranscode = false;
      const streamUrl = `http://${STREAM_HOST}:${this.serverPort}${pathname}`;

      console.log(`Streaming server started at ${streamUrl}`);
      this.prioritizeStreamingPieces(file, 0);
      const probeResult = await this.probeStream(internalUrl(streamUrl), (late) => {
        if (isCurrent()) this.applyLateProbe(late, file);
      });
      if (!isCurrent()) return;
      this.currentStreamUrl = streamUrl;
      this.videoConversion = probeResult.videoConversion;
      this.audioNeedsTranscode = probeResult.needsTranscode;

      if (probeResult.duration > 0) {
        this.sendVideoMetadata(probeResult.duration);
      }

      this.extractSubtitles(internalUrl(streamUrl));

      if (probeResult.videoConversion) console.log('Converting the picture: Dolby Vision profile 5');
      if (probeResult.needsTranscode) console.log('Transcoding enabled due to unsupported audio codec');

      this.sendVideoUrl(this.buildStreamUrl({ transcode: probeResult.needsTranscode }), this.resumePositionOf(file));
    });
  }

  /**
   * The probe finished after its timeout, when the file was already playing on the fallback
   * guess. A picture or audio conversion it found now restarts the stream where it is, the way
   * choosing another audio track does.
   */
  private applyLateProbe(late: ProbeResult, file: MediaSource): void {
    if (late.duration > 0) this.sendVideoMetadata(late.duration);
    const audioTrack = this.selectedAudioIndex ?? undefined;
    const transcoding = this.audioNeedsTranscode || audioTrack !== undefined;
    const gainsConversion = late.videoConversion !== null && this.videoConversion === null;
    const gainsTranscode = late.needsTranscode && !transcoding;
    // Only restart for something the playing stream lacks; anything else would just interrupt it.
    if (!gainsConversion && !gainsTranscode) return;

    if (gainsConversion) {
      this.videoConversion = late.videoConversion;
      console.log('Converting the picture: Dolby Vision profile 5 (found after the probe timeout)');
    }
    this.audioNeedsTranscode = transcoding || late.needsTranscode;
    this.sendVideoUrl(this.buildStreamUrl({ transcode: this.audioNeedsTranscode, audioTrack }));
  }

  /**
   * The stream the player plays: the file as it is, or (`transcode`) through ffmpeg with
   * its audio converted and, when the open video needs it, its picture converted too.
   * Every URL goes through here, so no path can lose the picture conversion.
   */
  private buildStreamUrl({ transcode, audioTrack }: { transcode: boolean; audioTrack?: number }): string {
    const url = new URL(`http://${STREAM_HOST}:${this.serverPort}${this.currentFilePathname}`);
    if (transcode || this.videoConversion) url.searchParams.set('transcode', 'true');
    if (audioTrack !== undefined) url.searchParams.set('audioTrack', String(audioTrack));
    if (this.videoConversion) url.searchParams.set(VIDEO_CONVERSION_PARAM, DOLBY_VISION_SDR_VALUE);
    return url.toString();
  }

  /** Streams the file through ffmpeg as Matroska: the transcode route (`?transcode=true`). */
  private serveTranscode(reqUrl: URL, res: http.ServerResponse, file: MediaSource, pathname: string, startTime: number): void {
    const rawFileUrl = `http://${STREAM_HOST}:${this.serverPort}${pathname}`;
    const audioTrackParam = reqUrl.searchParams.get('audioTrack');
    // The URL only asks; the probe decides, so a stale URL cannot convert a video that needs no conversion.
    const conversion = reqUrl.searchParams.get(VIDEO_CONVERSION_PARAM) === DOLBY_VISION_SDR_VALUE ? this.videoConversion : null;
    const serving = this.server;

    res.writeHead(200, {
      'Content-Type': 'video/x-matroska',
      'Transfer-Encoding': 'chunked',
    });

    const command = ffmpeg(rawFileUrl);

    if (startTime > 0) {
      command.seekInput(startTime);
    }

    if (conversion) {
      command.outputOptions(buildConversionArgs({ platform: process.platform, width: conversion.width, height: conversion.height }));
    } else {
      command.videoCodec('copy');
    }

    if (audioTrackParam) {
      const audioStreamIndex = parseInt(audioTrackParam, 10);
      command.outputOptions(conversion ? ['-map', `0:${audioStreamIndex}`] : ['-map 0:v:0', `-map 0:${audioStreamIndex}`]);
      const track = this.audioTracks.find(t => t.index === audioStreamIndex);
      const codec = track?.codec?.toLowerCase() ?? '';
      if (codec && UNSUPPORTED_AUDIO_CODECS.includes(codec)) {
        command.audioCodec('aac').audioChannels(2);
      } else {
        command.audioCodec('copy');
      }
    } else {
      // Mapping the picture by hand switches off ffmpeg's default choice of an audio stream.
      if (conversion) command.outputOptions(['-map', '0:a:0?']);
      command.audioCodec('aac').audioChannels(2);
    }

    let producedBytes = false;
    let playerLeft = false;
    const out = new Transform({
      transform(chunk, _encoding, done) {
        producedBytes = true;
        done(null, chunk);
      },
    });

    command
      .format('matroska')
      .on('codecData', (data) => {
        if (data.duration) {
          const parts = data.duration.split(':');
          if (parts.length === 3) {
            const seconds = (+parts[0]) * 3600 + (+parts[1]) * 60 + (+parts[2]);
            if (seconds > 0) {
              this.sendVideoMetadata(seconds);
            }
          }
        }
      })
      .on('error', (err) => {
        if (!err.message.includes('Output stream closed') && !err.message.includes('Premature close')) {
          console.error('FFmpeg error:', err);
        }
        if (conversion && !producedBytes && !playerLeft) {
          res.end();
          // Only a conversion of the file now open can fail it: one that dies because its
          // server was closed (episode switch, stop) belongs to a file that is gone.
          if (this.server === serving && this.videoConversion === conversion) this.fallBackToUnconvertedVideo(startTime);
        }
      });

    res.once('close', () => {
      playerLeft = true;
      try {
        command.kill('SIGKILL');
      } catch {
        // no-op
      }
    });

    command.pipe(out, { end: true });
    pipeline(out, res, () => {});
  }

  /**
   * The picture conversion could not start: show the video as it is, and say once that its
   * colours may be wrong. `startAt` keeps the player where the failed stream was to begin.
   */
  private fallBackToUnconvertedVideo(startAt: number): void {
    if (!this.videoConversion) return;

    this.videoConversion = null;
    this.sendError('VIDEO_CONVERSION_FAILED', 'This video is Dolby Vision, which could not be converted; its colours may be wrong.');
    const audioTrack = this.selectedAudioIndex ?? undefined;
    this.sendVideoUrl(this.buildStreamUrl({ transcode: this.audioNeedsTranscode || audioTrack !== undefined, audioTrack }), startAt > 0 ? startAt : null);
  }

  private guessVideoContentType(filename: string): string {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.mp4') || lower.endsWith('.m4v')) return 'video/mp4';
    if (lower.endsWith('.webm')) return 'video/webm';
    if (lower.endsWith('.mkv')) return 'video/x-matroska';
    if (lower.endsWith('.avi')) return 'video/x-msvideo';
    if (lower.endsWith('.mov')) return 'video/quicktime';
    return 'application/octet-stream';
  }

  /**
   * Extracts one subtitle stream as WebVTT. With `startTime` it starts there, so cue times
   * count from the same zero as the transcoded stream restarted at that offset.
   */
  private async serveSubtitle(streamIndex: number, res: http.ServerResponse, file: MediaSource, startTime = 0): Promise<void> {
    const rawFileUrl = internalUrl(`http://${STREAM_HOST}:${this.serverPort}/${encodeURIComponent(file.name)}`);
    
    res.writeHead(200, {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Cache-Control': 'no-cache',
    });

    const command = ffmpeg(rawFileUrl);

    if (startTime > 0) {
      command.seekInput(startTime);
    }

    command
      .outputOptions([`-map 0:${streamIndex}`])
      .format('webvtt');

    const out = new PassThrough();

    res.once('close', () => {
      try {
        command.kill('SIGKILL');
      } catch {}
    });

    command.on('error', (err) => {
      console.error('Subtitle extraction error:', err.message);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Subtitle extraction failed');
      }
    });

    command.pipe(out, { end: true });
    pipeline(out, res, () => {});
  }

  /**
   * Point the download at a byte offset of a file: the first pieces there at high
   * priority, then a read-ahead window that moveReadAhead() keeps in step with playback.
   * Nothing else of the torrent downloads, except the start of a prefetched next file.
   * Switching to another file frees the one left behind. A local file has no torrent
   * and nothing to prioritize.
   */
  private prioritizeStreamingPieces(file: any, startByte: number = 0): void {
    if (!this.currentTorrent) return;

    const previousFile = this.selectedFile;
    this.selectedFile = file;

    // Drops every selection but those of open read streams.
    this.currentTorrent.files.forEach((f: any) => {
      f.deselect();
    });
    this.readAheadRange = null;

    const pieceLength = this.currentTorrent.pieceLength;
    const startPiece = Math.floor((file.offset + startByte) / pieceLength);
    const endPiece = Math.floor((file.offset + file.length - 1) / pieceLength);
    const criticalPiecesCount = Math.min(10, endPiece - startPiece + 1);

    for (let i = 0; i < criticalPiecesCount; i++) {
      this.currentTorrent.select(startPiece + i, startPiece + i, true);
    }

    if (this.prefetchedFile === file) {
      this.prefetchedFile = null;
    }

    this.moveReadAhead(startByte);

    if (previousFile && previousFile !== file) {
      this.releaseFile(previousFile).catch((error) => {
        console.error(`Could not free ${previousFile.name}:`, error);
      });
    }

    console.log(`Prioritized streaming for file: ${file.name}`);
    console.log(`File pieces: ${startPiece} to ${endPiece} (total: ${endPiece - startPiece + 1})`);
    console.log(`Critical pieces: ${criticalPiecesCount}, read-ahead: ${this.readAheadRange!.from} to ${this.readAheadRange!.to}`);
  }

  /** Slide the read-ahead window of the playing file to start at `byteOffset`. */
  private moveReadAhead(byteOffset: number): void {
    const torrent = this.currentTorrent;
    const file = this.selectedFile;
    if (!torrent || !file) return;

    const bytes = readAheadBytes(file.length, this.lastKnownDurationSec);
    const range = readAheadPieces(file, byteOffset, bytes, torrent.pieceLength);
    if (this.readAheadRange) {
      torrent.deselect(this.readAheadRange.from, this.readAheadRange.to);
    }
    torrent.select(range.from, range.to, false);
    this.readAheadRange = range;

    // Deselecting the old window may have cut into a boundary piece of the prefetch.
    if (this.prefetchedFile) {
      this.selectFileStart(this.prefetchedFile);
    }
  }

  /**
   * Free the disk space of a file no longer played: forget its downloaded pieces and
   * truncate it, keeping what the playing and prefetched files share with it (see
   * planRelease). Coming back to it downloads it again.
   */
  private async releaseFile(file: any): Promise<void> {
    const torrent = this.currentTorrent;
    if (!torrent) return;

    const needed = [this.selectedFile, this.prefetchedFile].filter(Boolean);
    const { pieces, keepBytes } = planRelease(file, needed, torrent.pieceLength);
    if (pieces) {
      for (let index = pieces.from; index <= pieces.to; index++) {
        // Private WebTorrent API: resets the piece and clears it from the bitfield.
        // With the torrent added deselected, this does not select it again.
        if (torrent.bitfield.get(index)) torrent._markUnverified(index);
      }
    }

    try {
      await fs.promises.truncate(path.join(torrent.path, file.path), keepBytes);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`Could not free ${file.name}:`, error);
      }
    }
  }

  /**
   * Start sending status updates to renderer
   */
  private startStatusUpdates(): void {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }

    this.statusInterval = setInterval(() => {
      if (this.currentTorrent) {
        const status = this.getStatus();
        this.sendStatus(status);
      }
    }, 1000);
  }

  /**
   * Get current torrent status
   */
  private getStatus(): TorrentStatus {
    if (!this.currentTorrent) {
      return {
        progress: 0,
        downloadSpeed: 0,
        uploadSpeed: 0,
        numPeers: 0,
        downloaded: 0,
        uploaded: 0,
        timeRemaining: Infinity,
        isReady: false,
        isBuffering: false,
      };
    }

    // If a file is selected, show progress relative to that file
    const progress = this.selectedFile 
      ? this.selectedFile.progress * 100 
      : this.currentTorrent.progress * 100;

    // Use total downloaded bytes for the torrent, as that's accurate network usage
    // But for progress bar, we want to see completion of the video

    return {
      progress: progress,
      downloadSpeed: this.currentTorrent.downloadSpeed,
      uploadSpeed: this.currentTorrent.uploadSpeed,
      numPeers: this.currentTorrent.numPeers,
      downloaded: this.currentTorrent.downloaded,
      uploaded: this.currentTorrent.uploaded,
      timeRemaining: this.currentTorrent.timeRemaining,
      isReady: this.currentTorrent.ready,
      isBuffering: this.selectedFile ? this.selectedFile.progress < 0.05 : this.currentTorrent.progress < 0.05,
    };
  }

  /**
   * Stop current torrent
   */
  /** Whether a video is open: loaded and playing, or on its way. */
  hasMedia(): boolean {
    return this.serverPort !== null || this.currentTorrent !== null;
  }

  /** The lowercase hex info hash of the open torrent; null for a local file or nothing open. */
  openInfoHash(): string | null {
    const infoHash = this.currentTorrent?.infoHash;
    return typeof infoHash === 'string' ? infoHash.toLowerCase() : null;
  }

  async stop(): Promise<void> {
    this.stopWebSeedFallback();
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }

    await this.closeServer();
    this.serverPort = null;

    if (this.currentTorrent && this.client) {
      const infoHash = this.currentTorrent.infoHash;
      // Waits for removal to settle however it settles (callback, resolved
      // promise, or rejected promise) — see removeTorrentSafely. A torrent
      // that already detached itself from the client (its own error, or
      // webtorrent's duplicate-torrent branch) must not hang stop() forever.
      await this.removeTorrentSafely(infoHash);
      console.log('Torrent stopped');
    }

    this.currentTorrent = null;
    this.selectedFile = null;
    this.prefetchedFile = null;
    this.readAheadRange = null;
  }

  /**
   * Control playback (implemented at renderer level, this is placeholder)
   */
  async controlPlayback(action: 'play' | 'pause' | 'stop'): Promise<void> {
    console.log(`Playback control: ${action}`);
    // Playback is controlled by HTML5 video element in renderer
    // This is here for potential future server-side control
  }

  /**
   * Handle seek request
   */
  async seek(time: number): Promise<void> {
    console.log(`Seek requested: ${time}s`);

    if (!this.currentTorrent || !this.selectedFile) return;

    const durationSec = this.lastKnownDurationSec;
    if (!Number.isFinite(durationSec) || durationSec <= 0 || !Number.isFinite(time) || time < 0) {
      return;
    }

    const ratio = Math.max(0, Math.min(1, time / durationSec));
    const fileLength = Number(this.selectedFile.length || 0);
    const startByte = Math.floor(fileLength * ratio);

    this.prioritizeStreamingPieces(this.selectedFile, startByte);
  }

  /**
   * Destroy torrent client and cleanup
   */
  async destroy(): Promise<void> {
    this.stopWebSeedFallback();
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }

    await this.closeServer();

    return new Promise((resolve) => {
      if (this.client) {
        this.client.destroy((err: Error | string) => {
          if (err) console.error('Error destroying client:', err);
          this.client = null;
          this.currentTorrent = null;
          this.selectedFile = null;
          console.log('Torrent client destroyed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Send status to renderer
   */
  private sendStatus(status: TorrentStatus): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send(IPC_CHANNELS.TORRENT_STATUS, status);
    });
  }

  /**
   * Send video URL to renderer
   */
  /** Where to start this file: from where it was left, or (null) from the beginning. */
  private resumePositionOf(file: MediaSource): number | null {
    const source = { infoHash: this.currentTorrent?.infoHash, path: (file as Partial<LocalVideo>).path };
    return this.history?.resumePosition(playbackKey(source, file.name)) ?? null;
  }

  /** `startAt` is where to resume a newly opened file; a restarted stream passes none. */
  private sendVideoUrl(url: string, startAt: number | null = null): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send(IPC_CHANNELS.VIDEO_URL, url, startAt);
    });
  }

  /**
   * Send video metadata (duration) to renderer
   */
  private sendVideoMetadata(duration: number): void {
    this.lastKnownDurationSec = duration;

    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send(IPC_CHANNELS.VIDEO_METADATA, { duration });
    });
  }

  private sendSubtitles(tracks: SubtitleTrack[]): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send(IPC_CHANNELS.SUBTITLES, { tracks, hasEmbeddedSubtitles: tracks.length > 0 });
    });
  }

  private extractAudioTracks(metadata: { streams: any[] }): void {
    this.audioTracks = [];
    const audioStreams = (metadata.streams ?? []).filter((s: any) => s.codec_type === 'audio');

    if (audioStreams.length === 0) {
      this.sendAudioTracks();
      return;
    }

    console.log(`Found ${audioStreams.length} audio track(s)`);

    audioStreams.forEach((stream: any, index: number) => {
      const rawLang = stream.tags?.language ?? stream.tags?.LANGUAGE ?? stream.language ?? 'und';
      const lang = normalizeLanguage(typeof rawLang === 'string' ? rawLang : 'und');
      const track: AudioTrack = {
        index: stream.index,
        language: lang,
        title: stream.tags?.title ?? `Track ${index + 1}`,
        codec: stream.codec_name ?? 'unknown',
        channels: stream.channels ?? 2,
      };
      this.audioTracks.push(track);
    });

    this.sendAudioTracks();
  }

  private sendAudioTracks(): void {
    const windows = BrowserWindow.getAllWindows();
    const data = { tracks: this.audioTracks, currentTrackIndex: 0 };
    windows.forEach(window => {
      window.webContents.send(IPC_CHANNELS.AUDIO_TRACKS, data);
    });
  }

  async selectAudioTrack(streamIndex: number): Promise<void> {
    if (!this.currentStreamUrl || !this.currentFilePathname) {
      throw new Error('No active stream');
    }

    const track = this.audioTracks.find(t => t.index === streamIndex);
    if (!track) {
      throw new Error(`Audio track not found: ${streamIndex}`);
    }

    this.selectedAudioIndex = streamIndex;
    console.log(`Selecting audio track: ${track.title} (index ${streamIndex}, codec ${track.codec})`);

    this.sendVideoUrl(this.buildStreamUrl({ transcode: true, audioTrack: streamIndex }));
  }

  /**
   * Send error to renderer
   */
  private sendError(code: string, message: string): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send(IPC_CHANNELS.ERROR, { code, message });
    });
  }

  /**
   * Validate magnet link format
   */
  static isValidMagnet(magnetUri: string): boolean {
    return magnetUri.startsWith('magnet:?') && magnetUri.includes('xt=urn:btih:');
  }
}
