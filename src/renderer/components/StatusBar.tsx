import React from 'react';
import { TorrentStatus, TorrentMetadata, TorrentFile } from '@/shared/types';

interface StatusBarProps {
  status: TorrentStatus | null;
  metadata: TorrentMetadata | null;
  currentVideoFile?: TorrentFile | null;
  videoDuration?: number | null;
}

const StatusBar: React.FC<StatusBarProps> = ({ status, metadata, currentVideoFile, videoDuration }) => {
  const formatSpeed = (bytes: number): string => {
    if (bytes === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

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

  const getSpeedColor = (downloadSpeed: number): string => {
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
          <span className="status-label">Progress:</span>
          <span className="status-value">{status.progress.toFixed(1)}%</span>
        </div>
        
        <div className="status-item">
          <span 
            className="status-label" 
            style={{ color: getSpeedColor(status.downloadSpeed) }}
          >
            ↓
          </span>
          <span className="status-value">{formatSpeed(status.downloadSpeed)}</span>
        </div>
        
        <div className="status-item">
          <span className="status-label">↑</span>
          <span className="status-value">{formatSpeed(status.uploadSpeed)}</span>
        </div>
        
        <div className="status-item">
          <span className="status-label">Peers:</span>
          <span className="status-value">{status.numPeers}</span>
        </div>
        
        <div className="status-item">
          <span className="status-label">Downloaded:</span>
          <span className="status-value">{formatSize(status.downloaded)}</span>
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

