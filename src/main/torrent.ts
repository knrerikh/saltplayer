import { TorrentFile, TorrentMetadata, TorrentStatus, IPC_CHANNELS } from '@/shared/types';
import { StorageManager } from './storage';
import { BrowserWindow } from 'electron';
import * as http from 'http';
import { pipeline } from 'stream';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from 'ffprobe-static';

// Configure ffmpeg and ffprobe paths
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath.replace('app.asar', 'app.asar.unpacked'));
}
if (ffprobePath && ffprobePath.path) {
  ffmpeg.setFfprobePath(ffprobePath.path.replace('app.asar', 'app.asar.unpacked'));
}

// WebTorrent will be loaded dynamically since it's an ESM module
let WebTorrentClass: any = null;

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.flv', '.wmv'];

export class TorrentEngine {
  private client: any | null = null;
  private currentTorrent: any | null = null;
  private storageManager: StorageManager;
  private server: any = null;
  private serverPort: number | null = null;
  private statusInterval: NodeJS.Timeout | null = null;

  constructor(storageManager: StorageManager) {
    this.storageManager = storageManager;
  }

  /**
   * Initialize WebTorrent client (async because it's an ESM module)
   */
  private async initializeClient(): Promise<void> {
    // Load WebTorrent dynamically (it's an ESM module with top-level await)
    if (!WebTorrentClass) {
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
   * Probe stream for codecs and duration
   */
  private async probeStream(streamUrl: string): Promise<{ needsTranscode: boolean; duration: number }> {
    return new Promise((resolve) => {
      const command = ffmpeg(streamUrl);
      let isResolved = false;
      
      // Add timeout to prevent hanging forever
      const timeoutId = setTimeout(() => {
        console.warn('FFprobe timed out, proceeding with fallback check');
        isResolved = true;
        
        // Fallback: If timeout, assume transcode needed for containers likely to have unsupported audio (MKV, AVI)
        const ext = streamUrl.split('?')[0].split('.').pop()?.toLowerCase();
        const unsafeExtensions = ['mkv', 'avi', 'wmv', 'flv', 'mov'];
        const fallbackTranscode = unsafeExtensions.includes(ext || '');
        
        resolve({ needsTranscode: fallbackTranscode, duration: 0 });
        
        // Don't kill immediately, let it try to finish to get duration later
        setTimeout(() => {
            try {
                command.kill('SIGKILL');
            } catch (e) {}
        }, 60000); // Hard kill after 60s
      }, 10000); // 10 seconds timeout for server start

      command.ffprobe((err, metadata) => {
        clearTimeout(timeoutId);
        
        if (err) {
          console.error('FFprobe error:', err.message);
          if (!isResolved) {
            resolve({ needsTranscode: false, duration: 0 });
          }
          return;
        }
        
        const duration = metadata.format?.duration ? Number(metadata.format.duration) : 0;
        
        // If we resolved early (timeout), we still want to send the duration now that we have it
        if (isResolved && duration > 0) {
            this.sendVideoMetadata(duration);
        }

        if (!isResolved) {
            let needsTranscode = false;
            const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
            if (audioStream) {
              const codec = audioStream.codec_name?.toLowerCase();
              const unsupportedCodecs = ['ac3', 'ac-3', 'eac3', 'ec-3', 'dts', 'truehd', 'mlp', 'vorbis']; 
              if (codec && unsupportedCodecs.includes(codec)) {
                console.log(`Transcoding required for codec: ${codec}`);
                needsTranscode = true;
              }
            }
            resolve({ needsTranscode, duration });
        }
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

    this.server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
        const isTranscode = reqUrl.searchParams.get('transcode') === 'true';
        const startTime = Number(reqUrl.searchParams.get('startTime') || '0');

        if (reqUrl.pathname !== pathname) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }

          if (isTranscode) {
            // TRANSCODING MODE (FFmpeg)
            res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Transfer-Encoding': 'chunked',
          });

          // Create ffmpeg command
          const command = ffmpeg(file.createReadStream());

          if (startTime > 0) {
            command.seekInput(startTime);
          }

          command
            .videoCodec('copy') // Copy video stream (fast)
            .audioCodec('aac')  // Transcode audio to AAC (supported)
            .audioChannels(2)   // Downmix to stereo (safe)
            .format('matroska') // Use MKV container for stream
            .on('codecData', (data) => {
              // Extract duration from ffmpeg transcoding process (backup for probeStream timeout)
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
              if (!err.message.includes('Output stream closed')) {
                console.error('FFmpeg error:', err);
              }
            });

          // Pipe ffmpeg output to response
          command.pipe(res, { end: true });
          return;
        }

        // STANDARD MODE (Raw file)
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

        let startStr = m[1];
        let endStr = m[2];
        let start: number;
        let end: number;

        if (startStr === '' && endStr !== '') {
          // suffix range: last N bytes
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
      let streamUrl = `http://127.0.0.1:${this.serverPort}${pathname}`; // Force IPv4

      console.log(`Streaming server started at ${streamUrl}`);

      // Probe stream for codecs and duration
      const probeResult = await this.probeStream(streamUrl);
      
      // Send duration to renderer (critical for seeking in transcoded streams)
      if (probeResult.duration > 0) {
        this.sendVideoMetadata(probeResult.duration);
      }

      if (probeResult.needsTranscode) {
        console.log('⚠️ Transcoding enabled due to unsupported audio codec');
        streamUrl += '?transcode=true';
      }

      this.sendVideoUrl(streamUrl);
      this.prioritizeStreamingPieces(file);
    });
  }

  private guessVideoContentType(filename: string): string {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.mp4') || lower.endsWith('.m4v')) return 'video/mp4';
    if (lower.endsWith('.webm')) return 'video/webm';
    // Use video/x-matroska for MKV to let Chromium properly detect codecs
    if (lower.endsWith('.mkv')) return 'video/x-matroska';
    if (lower.endsWith('.avi')) return 'video/x-msvideo';
    if (lower.endsWith('.mov')) return 'video/quicktime';
    return 'application/octet-stream';
  }

  /**
   * Prioritize pieces for streaming
   */
  private prioritizeStreamingPieces(file: any): void {
    if (!this.currentTorrent) return;

    // Select the file for streaming
    file.select();

    // Prioritize first pieces for quick playback start
    // Note: WebTorrent handles piece prioritization internally
    // We rely on file.select() to prioritize this file's pieces
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

    return {
      progress: this.currentTorrent.progress * 100,
      downloadSpeed: this.currentTorrent.downloadSpeed,
      uploadSpeed: this.currentTorrent.uploadSpeed,
      numPeers: this.currentTorrent.numPeers,
      downloaded: this.currentTorrent.downloaded,
      uploaded: this.currentTorrent.uploaded,
      timeRemaining: this.currentTorrent.timeRemaining,
      isReady: this.currentTorrent.ready,
      isBuffering: this.currentTorrent.progress < 0.05, // Less than 5% downloaded
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
          console.log('Torrent stopped');
          resolve();
        });
      } else {
        this.currentTorrent = null;
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
    
    if (!this.currentTorrent) {
      return;
    }

    // In WebTorrent, seeking is handled automatically by HTTP range requests
    // We could prioritize specific pieces here based on seek position
    // For MVP, the default behavior is sufficient
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
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send(IPC_CHANNELS.VIDEO_METADATA, { duration });
    });
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
