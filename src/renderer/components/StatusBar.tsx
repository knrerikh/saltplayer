import React from 'react';
import { TorrentStatus, TorrentMetadata } from '@/shared/types';

interface StatusBarProps {
  status: TorrentStatus | null;
  metadata: TorrentMetadata | null;
}

const StatusBar: React.FC<StatusBarProps> = ({ status, metadata }) => {
  const formatSpeed = (bytes: number): string => {
    if (bytes === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
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
          <span className="status-label">↓</span>
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

