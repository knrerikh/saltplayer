import { TorrentFile, TorrentMetadata, TorrentStatus, IPC_CHANNELS, SubtitleTrack, AudioTrack } from '@/shared/types';
import { StorageManager } from './storage';
import { BrowserWindow } from 'electron';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn as spawnChild } from 'child_process';
import { pipeline, PassThrough } from 'stream';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from 'ffprobe-static';

// Resolve binary paths (files inside asar cannot be executed; asarUnpack moves them to app.asar.unpacked)
const resolvedFfmpegPath = ffmpegPath
  ? ffmpegPath.replace('app.asar', 'app.asar.unpacked')
  : null;
const resolvedFfprobePath = ffprobePath?.path
  ? ffprobePath.path.replace('app.asar', 'app.asar.unpacked')
  : null;

if (resolvedFfmpegPath) ffmpeg.setFfmpegPath(resolvedFfmpegPath);
if (resolvedFfprobePath) ffmpeg.setFfprobePath(resolvedFfprobePath);

// Write startup diagnostics so architecture/path issues are visible in the crash log
try {
  const logDir = path.join(os.homedir(), 'Library', 'Logs', 'saltplayer');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const diag = [
    `${new Date().toISOString()} [startup-diagnostics]`,
    `  process.arch: ${process.arch}`,
    `  ffmpegPath raw: ${ffmpegPath}`,
    `  ffmpegPath resolved: ${resolvedFfmpegPath}`,
    `  ffmpeg exists: ${resolvedFfmpegPath ? fs.existsSync(resolvedFfmpegPath) : false}`,
    `  ffprobePath raw: ${ffprobePath?.path}`,
    `  ffprobePath resolved: ${resolvedFfprobePath}`,
    `  ffprobe exists: ${resolvedFfprobePath ? fs.existsSync(resolvedFfprobePath) : false}`,
  ].join('\n') + '\n\n';
  fs.appendFileSync(path.join(logDir, 'crash.log'), diag);
} catch { /* ignore */ }

// WebTorrent will be loaded dynamically since it's an ESM module
let WebTorrentClass: any = null;

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.flv', '.wmv'];

const UNSUPPORTED_AUDIO_CODECS = ['ac3', 'ac-3', 'eac3', 'ec-3', 'dts', 'truehd', 'mlp', 'vorbis'];

/** Extract ISO 639-2 language code from values like "rus-sub", "eng-forced" */
function normalizeLanguage(raw: string): string {
  const s = (raw || 'und').trim().toLowerCase();
  if (!s || s === 'und') return 'und';
  const match = s.match(/^([a-z]{2,3})(?:[-_].*)?$/);
  return match ? match[1] : s;
}

export class TorrentEngine {
  private client: any | null = null;
  private currentTorrent: any | null = null;
  private selectedFile: any | null = null;
  private lastKnownDurationSec = 0;
  private storageManager: StorageManager;
  private server: any = null;
  private serverPort: number | null = null;
  private statusInterval: NodeJS.Timeout | null = null;
  private subtitleTracks: SubtitleTrack[] = [];
  private audioTracks: AudioTrack[] = [];
  private selectedAudioIndex: number | null = null;
  private currentStreamUrl: string | null = null;
  private currentFilePathname: string | null = null;

  constructor(storageManager: StorageManager) {
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
    });

    this.client.on('error', (error: any) => {
      console.error('WebTorrent client error:', error);
      const message = error instanceof Error ? error.message : String(error);
      this.sendError('TORRENT_ERROR', message);
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
    
    return new Promise((resolve, reject) => {
      if (!this.client) {
        reject(new Error('Torrent client not initialized'));
        return;
      }

      // Stop current torrent if any
      if (this.currentTorrent) {
        this.stop();
      }

      const options = {
        path: this.storageManager.getTempDir(),
      };

      // Set a timeout to detect if callback is never called
      const timeoutId = setTimeout(() => {
        reject(new Error('Timeout: torrent loading took too long or invalid source'));
      }, 30000); // 30 seconds timeout

      this.client.add(source, options, (torrent: any) => {
        clearTimeout(timeoutId);
        this.currentTorrent = torrent;
        
        // Helper function to process ready torrent
        const processReadyTorrent = () => {
          console.log('Torrent ready:', torrent.name);
          
          // Select video file
          const videoFile = this.selectVideoFile(torrent.files);
          
          if (!videoFile) {
            const error = new Error('No video file found in torrent');
            this.sendError('NO_VIDEO_FILE', error.message);
            reject(error);
            return;
          }

          // Start streaming server
          this.startStreamingServer(torrent, videoFile);

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

          resolve(metadata);
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
          reject(error);
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
    });
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
    this.startStreamingServer(this.currentTorrent, file);
  }

  /**
   * Select the most likely video file from torrent
   */
  private selectVideoFile(files: any[]): any | null {
    // Filter video files
    const videoFiles = files.filter(file => {
      const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
      return ext && VIDEO_EXTENSIONS.includes(ext);
    });

    if (videoFiles.length === 0) {
      return null;
    }

    // Sort by size (largest first) to determine threshold
    videoFiles.sort((a, b) => b.length - a.length);
    const maxSize = videoFiles[0].length;

    // Filter out samples/extras (keep files > 10% of max size OR > 50MB)
    const mainFiles = videoFiles.filter(f => f.length > maxSize * 0.1 || f.length > 50 * 1024 * 1024);

    if (mainFiles.length === 0) {
      return videoFiles[0];
    }

    // Sort alphabetically to pick the first episode (e.g. S01E01)
    mainFiles.sort((a, b) => a.name.localeCompare(b.name));

    return mainFiles[0];
  }

  /**
   * Probe stream for codecs and duration.
   * Spawns ffprobe directly to avoid fluent-ffmpeg's getAvailableFormats() capability check,
   * which calls spawn() synchronously in a way that can propagate EBADARCH as an uncaughtException.
   */
  private async probeStream(streamUrl: string): Promise<{ needsTranscode: boolean; duration: number }> {
    const ffprobeBin = resolvedFfprobePath;
    if (!ffprobeBin) {
      return { needsTranscode: false, duration: 0 };
    }

    return new Promise((resolve) => {
      let settled = false;
      const done = (result: { needsTranscode: boolean; duration: number }) => {
        if (!settled) { settled = true; resolve(result); }
      };

      const fallback = () => {
        const ext = streamUrl.split('?')[0].split('.').pop()?.toLowerCase();
        done({ needsTranscode: ['mkv', 'avi', 'wmv', 'flv', 'mov'].includes(ext || ''), duration: 0 });
      };

      const timeoutId = setTimeout(() => {
        console.warn('FFprobe timed out, proceeding with fallback check');
        fallback();
      }, 10000);

      let proc: ReturnType<typeof spawnChild>;
      try {
        proc = spawnChild(ffprobeBin, [
          '-v', 'quiet',
          '-print_format', 'json',
          '-show_format',
          '-show_streams',
          streamUrl,
        ]);
      } catch (err: any) {
        clearTimeout(timeoutId);
        console.error('FFprobe spawn failed:', err.message);
        done({ needsTranscode: false, duration: 0 });
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
        if (settled) return;

        try {
          const data = JSON.parse(stdout);
          const duration = data.format?.duration ? Number(data.format.duration) : 0;
          this.extractAudioTracks(data);

          let needsTranscode = false;
          const audioStream = (data.streams || []).find((s: any) => s.codec_type === 'audio');
          if (audioStream) {
            const codec = (audioStream.codec_name || '').toLowerCase();
            if (UNSUPPORTED_AUDIO_CODECS.includes(codec)) {
              console.log(`Transcoding required for codec: ${codec}`);
              needsTranscode = true;
            }
          }
          done({ needsTranscode, duration });
        } catch (e) {
          console.error('FFprobe parse error:', e);
          done({ needsTranscode: false, duration: 0 });
        }
      });
    });
  }

  private async extractSubtitles(streamUrl: string): Promise<void> {
    this.subtitleTracks = [];

    const ffprobeBin = resolvedFfprobePath;
    if (!ffprobeBin) {
      this.sendSubtitles([]);
      return;
    }

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
        proc = spawnChild(ffprobeBin, [
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
        if (settled) return;

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
              url: `http://127.0.0.1:${this.serverPort}/subtitle/${stream.index}.vtt`,
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

  /**
   * Start HTTP streaming server
   */
  private startStreamingServer(torrent: any, file: any): void {
    if (this.server) {
      this.server.close();
    }
    const encodedName = encodeURIComponent(file.name);
    const pathname = `/${encodedName}`;
    const totalSize: number = typeof file.length === 'number' ? file.length : Number(file.length);
    let lastReprioritizedStart = 0;

    this.server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
        const isTranscode = reqUrl.searchParams.get('transcode') === 'true';
        const startTime = Number(reqUrl.searchParams.get('startTime') || '0');

        const subtitleMatch = reqUrl.pathname.match(/^\/subtitle\/(\d+)\.vtt$/);
        if (subtitleMatch) {
          const streamIndex = parseInt(subtitleMatch[1], 10);
          await this.serveSubtitle(streamIndex, res, file);
          return;
        }

        if (reqUrl.pathname !== pathname) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }

        if (isTranscode) {
          const rawFileUrl = `http://127.0.0.1:${this.serverPort}${pathname}`;
          const audioTrackParam = reqUrl.searchParams.get('audioTrack');

          res.writeHead(200, {
            'Content-Type': 'video/x-matroska',
            'Transfer-Encoding': 'chunked',
          });

          const command = ffmpeg(rawFileUrl);

          if (startTime > 0) {
            command.seekInput(startTime);
          }

          if (audioTrackParam) {
            const audioStreamIndex = parseInt(audioTrackParam, 10);
            command.outputOptions(['-map 0:v:0', `-map 0:${audioStreamIndex}`]);
            const track = this.audioTracks.find(t => t.index === audioStreamIndex);
            const codec = track?.codec?.toLowerCase() ?? '';
            if (codec && UNSUPPORTED_AUDIO_CODECS.includes(codec)) {
              command.audioCodec('aac').audioChannels(2);
            } else {
              command.audioCodec('copy');
            }
          } else {
            command.audioCodec('aac').audioChannels(2);
          }

          command
            .videoCodec('copy')
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
            });

          const out = new PassThrough();

          res.once('close', () => {
            try {
              command.kill('SIGKILL');
            } catch {
              // no-op
            }
          });

          command.pipe(out, { end: true });
          pipeline(out, res, () => {});
          return;
        }

        const rangeHeader = req.headers.range;
        const contentType = this.guessVideoContentType(file.name);

        if (!rangeHeader || typeof rangeHeader !== 'string') {
          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': String(totalSize),
            'Accept-Ranges': 'bytes',
          });
          const rs = file.createReadStream();
          pipeline(rs, res, () => {});
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
        const shouldReprioritize = isLargeJump && !isLikelyMetadataProbe;

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
        const rs = file.createReadStream({ start, end });

        pipeline(rs, res, () => {});
      } catch (e) {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end('Internal error');
        }
        console.error('Server error:', e);
      }
    });

    this.server.listen(0, async () => {
      const address = this.server.address();
      this.serverPort = address?.port ?? null;
      this.currentFilePathname = pathname;
      this.selectedAudioIndex = null;
      let streamUrl = `http://127.0.0.1:${this.serverPort}${pathname}`;

      console.log(`Streaming server started at ${streamUrl}`);
      this.prioritizeStreamingPieces(file, 0);
      const probeResult = await this.probeStream(streamUrl);
      this.currentStreamUrl = streamUrl;

      if (probeResult.duration > 0) {
        this.sendVideoMetadata(probeResult.duration);
      }

      this.extractSubtitles(streamUrl);

      if (probeResult.needsTranscode) {
        console.log('Transcoding enabled due to unsupported audio codec');
        streamUrl += '?transcode=true';
      }

      this.sendVideoUrl(streamUrl);
    });
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

  private async serveSubtitle(streamIndex: number, res: http.ServerResponse, file: any): Promise<void> {
    const rawFileUrl = `http://127.0.0.1:${this.serverPort}/${encodeURIComponent(file.name)}`;
    
    res.writeHead(200, {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Cache-Control': 'no-cache',
    });

    const command = ffmpeg(rawFileUrl)
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
   * Prioritize pieces for streaming from a byte offset.
   */
  private prioritizeStreamingPieces(file: any, startByte: number = 0): void {
    if (!this.currentTorrent) return;

    this.selectedFile = file;

    this.currentTorrent.files.forEach((f: any) => {
      f.deselect();
    });
    file.select();

    const pieceLength = this.currentTorrent.pieceLength;
    const absoluteStart = file.offset + startByte;
    const startPiece = Math.floor(absoluteStart / pieceLength);
    const endPiece = Math.floor((file.offset + file.length - 1) / pieceLength);
    const criticalPiecesCount = Math.min(10, endPiece - startPiece + 1);

    for (let i = 0; i < criticalPiecesCount; i++) {
      const pieceIndex = startPiece + i;
      if (pieceIndex <= endPiece) {
        this.currentTorrent.select(pieceIndex, pieceIndex, true);
      }
    }

    if (startPiece + criticalPiecesCount <= endPiece) {
      this.currentTorrent.select(startPiece + criticalPiecesCount, endPiece, false);
    }

    console.log(`Prioritized streaming for file: ${file.name}`);
    console.log(`File pieces: ${startPiece} to ${endPiece} (total: ${endPiece - startPiece + 1})`);
    console.log(`Critical pieces: ${criticalPiecesCount}, Sequential: ${endPiece - startPiece + 1 - criticalPiecesCount}`);
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
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.statusInterval) {
        clearInterval(this.statusInterval);
        this.statusInterval = null;
      }

      if (this.server) {
        this.server.close();
        this.server = null;
        this.serverPort = null;
      }

      if (this.currentTorrent && this.client) {
        const infoHash = this.currentTorrent.infoHash;
        this.client.remove(infoHash, undefined, (err: Error | string) => {
          if (err) console.error('Error removing torrent:', err);
          this.currentTorrent = null;
          this.selectedFile = null;
          console.log('Torrent stopped');
          resolve();
        });
      } else {
        this.currentTorrent = null;
        this.selectedFile = null;
        resolve();
      }
    });
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
    return new Promise((resolve) => {
      if (this.statusInterval) {
        clearInterval(this.statusInterval);
        this.statusInterval = null;
      }

      if (this.server) {
        this.server.close();
        this.server = null;
      }

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
  private sendVideoUrl(url: string): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send(IPC_CHANNELS.VIDEO_URL, url);
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
    const audioStreams = metadata.streams.filter((s: any) => s.codec_type === 'audio');

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

    const baseUrl = `http://127.0.0.1:${this.serverPort}${this.currentFilePathname}`;
    const url = new URL(baseUrl);
    url.searchParams.set('transcode', 'true');
    url.searchParams.set('audioTrack', String(streamIndex));

    this.sendVideoUrl(url.toString());
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

  /**
   * Select video file from file list (static utility)
   */
  static selectVideoFile(files: TorrentFile[]): TorrentFile | null {
    const videoFiles = files.filter(file => {
      const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
      return ext && VIDEO_EXTENSIONS.includes(ext);
    });

    if (videoFiles.length === 0) {
      return null;
    }

    videoFiles.sort((a, b) => b.size - a.size);
    return videoFiles[0];
  }
}
