import React, { useRef } from 'react';
import { TorrentStatus, TorrentMetadata, TorrentFile } from '@/shared/types';

/**
 * Speeds below this are shown as 0. WebTorrent counts every byte received from peers,
 * including protocol messages (`have`, keep-alives, peer exchange), which run at a few
 * hundred bytes a second even when no video data is downloading.
 */
const IDLE_SPEED_BYTES = 2 * 1024;

const shownSpeed = (bytesPerSecond: number) => (bytesPerSecond < IDLE_SPEED_BYTES ? 0 : bytesPerSecond);

/** Always KB/s or MB/s with one decimal, so the value keeps its width as it changes. */
const formatSpeed = (bytesPerSecond: number): string => {
  const kilobytes = shownSpeed(bytesPerSecond) / 1024;
  // MB/s from 1000 KB/s: "1023.9 KB/s" would be a character wider than any other value.
  return kilobytes < 1000 ? `${kilobytes.toFixed(1)} KB/s` : `${(kilobytes / 1024).toFixed(1)} MB/s`;
};

/**
 * A value that changes every second: as narrow as it needs at first, it widens for a
 * longer value but never narrows back, so the items after it do not jitter.
 */
const SteadyValue: React.FC<{ children: string }> = ({ children: text }) => {
  const widestRef = useRef(0);
  widestRef.current = Math.max(widestRef.current, text.length);
  return (
    <span className="status-value status-value--steady" style={{ minWidth: `${widestRef.current}ch` }}>
      {text}
    </span>
  );
};

interface StatusBarProps {
  status: TorrentStatus | null;
  metadata: TorrentMetadata | null;
  currentVideoFile?: TorrentFile | null;
  videoDuration?: number | null;
}

const StatusBar: React.FC<StatusBarProps> = ({ status, metadata, currentVideoFile, videoDuration }) => {
  // Calculate minimum speed required for smooth playback (bytes/sec)
  const getMinimumRequiredSpeed = (): number => {
    if (!currentVideoFile || !videoDuration || videoDuration <= 0) {
      // Fallback: estimate based on file size (assume 90 min average duration)
      if (currentVideoFile && currentVideoFile.size > 0) {
        const assumedDuration = 90 * 60; // 90 minutes in seconds
        return (currentVideoFile.size * 1.2) / assumedDuration; // 20% buffer
      }
      return 0;
    }
    // Required speed = file size / duration * safety margin (1.3x for 30% buffer)
    return (currentVideoFile.size / videoDuration) * 1.3;
  };

  const getSpeedColor = (bytesPerSecond: number): string => {
    const downloadSpeed = shownSpeed(bytesPerSecond);
    if (downloadSpeed === 0) return 'var(--text-secondary)';
    
    const minSpeed = getMinimumRequiredSpeed();
    if (minSpeed === 0) {
      // No video info available, use default thresholds
      if (downloadSpeed < 500 * 1024) return '#ff4a4a'; // Red: < 500 KB/s
      if (downloadSpeed < 2 * 1024 * 1024) return '#ffaa00'; // Yellow: 500 KB/s - 2 MB/s
      return '#4aff4a'; // Green: > 2 MB/s
    }
    
    const ratio = downloadSpeed / minSpeed;
    if (ratio < 0.8) return '#ff4a4a'; // Red: < 80% of required speed (buffering likely)
    if (ratio < 1.0) return '#ffaa00'; // Yellow: 80-100% of required speed (risk of freezes)
    return '#4aff4a'; // Green: >= 100% of required speed (smooth playback)
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  // The file playing, not the whole torrent: a season is far larger than what is watched.
  const size = currentVideoFile?.size ?? metadata?.totalSize ?? 0;

  // A local file has no torrent status: there is nothing to download.
  if (metadata && !status) {
    return (
      <div className="status-bar">
        <div className="status-left">
          <div className="status-item">
            <span className="status-label">Name:</span>
            <span className="status-value">{metadata.name}</span>
          </div>

          <div className="status-item">
            <span className="status-label">Size:</span>
            <span className="status-value">{formatSize(size)}</span>
          </div>
        </div>
      </div>
    );
  }

  if (!status || !metadata) {
    return (
      <div className="status-bar">
        <div className="status-left">
          <span className="status-item">
            <span className="status-label">Ready</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="status-bar">
      <div className="status-left">
        <div className="status-item">
          <span className="status-label">Name:</span>
          <span className="status-value">{metadata.name}</span>
        </div>

        <div className="status-item">
          <span className="status-label">Size:</span>
          <span className="status-value">{formatSize(size)}</span>
        </div>
        
        <div className="status-item">
          <span className="status-label">Progress:</span>
          <SteadyValue>{`${status.progress.toFixed(1)}%`}</SteadyValue>
        </div>
        
        <div className="status-item status-item--speed">
          <span 
            className="status-label" 
            style={{ color: getSpeedColor(status.downloadSpeed) }}
          >
            ↓
          </span>
          <SteadyValue>{formatSpeed(status.downloadSpeed)}</SteadyValue>
        </div>
        
        <div className="status-item status-item--speed">
          <span className="status-label">↑</span>
          <SteadyValue>{formatSpeed(status.uploadSpeed)}</SteadyValue>
        </div>
        
        <div className="status-item">
          <span className="status-label">Peers:</span>
          <SteadyValue>{String(status.numPeers)}</SteadyValue>
        </div>
        
        <div className="status-item">
          <span className="status-label">Downloaded:</span>
          <SteadyValue>{formatSize(status.downloaded)}</SteadyValue>
        </div>
      </div>

      <div className="progress-bar">
        <div 
          className="progress-fill" 
          style={{ width: `${status.progress}%` }}
        />
      </div>
    </div>
  );
};

export default StatusBar;

