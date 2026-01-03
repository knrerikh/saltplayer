import React, { useState, useEffect, useMemo } from 'react';
import TorrentInput from './components/TorrentInput';
import VideoPlayer from './components/VideoPlayer';
import StatusBar from './components/StatusBar';
import { TorrentStatus, TorrentMetadata, ErrorInfo } from '@/shared/types';

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.flv', '.wmv'];

// Extend Window interface for electronAPI
declare global {
  interface Window {
    electronAPI: {
      loadTorrent: (source: string) => Promise<TorrentMetadata>;
      stopTorrent: () => Promise<void>;
      selectFile: (fileName: string) => Promise<void>;
      playbackControl: (action: 'play' | 'pause' | 'stop') => Promise<void>;
      playbackSeek: (time: number) => Promise<void>;
      quit: () => Promise<void>;
      openExternal: (url: string) => Promise<boolean>;
      onTorrentStatus: (callback: (status: TorrentStatus) => void) => void;
      onVideoUrl: (callback: (url: string) => void) => void;
      onVideoMetadata: (callback: (metadata: { duration: number }) => void) => void;
      onError: (callback: (error: ErrorInfo) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}

const App: React.FC = () => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [serverDuration, setServerDuration] = useState<number | null>(null);
  const [torrentStatus, setTorrentStatus] = useState<TorrentStatus | null>(null);
  const [metadata, setMetadata] = useState<TorrentMetadata | null>(null);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Set application title
    document.title = 'Salt Player';

    // Listen for video URL from main process
    window.electronAPI.onVideoUrl((url) => {
      setVideoUrl(url);
      // Don't reset serverDuration here, as metadata might have arrived just before
      setIsLoading(false);
    });

    // Listen for video metadata
    window.electronAPI.onVideoMetadata((meta) => {
      console.log('Received video metadata:', meta);
      setServerDuration(meta.duration);
    });
    
    // Listen for torrent status updates
    window.electronAPI.onTorrentStatus((status) => {
      setTorrentStatus(status);
    });

    // Listen for errors
    window.electronAPI.onError((err) => {
      setError(err);
      setIsLoading(false);
      setTimeout(() => setError(null), 5000);
    });

    return () => {
      // Cleanup listeners
      window.electronAPI.removeAllListeners('video:url');
      window.electronAPI.removeAllListeners('video:metadata');
      window.electronAPI.removeAllListeners('torrent:status');
      window.electronAPI.removeAllListeners('error');
    };
  }, []);

  const handleLoadTorrent = async (source: string) => {
    try {
      setIsLoading(true);
      setError(null);
      setServerDuration(null);
      const meta = await window.electronAPI.loadTorrent(source);
      setMetadata(meta);
    } catch (err: any) {
      setError({
        code: 'LOAD_ERROR',
        message: err.message || 'Failed to load torrent',
      });
      setIsLoading(false);
    }
  };

  const handleClose = async () => {
    try {
      await window.electronAPI.stopTorrent();
      setVideoUrl(null);
      setServerDuration(null);
      setTorrentStatus(null);
      setMetadata(null);
      setIsLoading(false);
    } catch (err) {
      console.error('Error stopping torrent:', err);
    }
  };

  // Determine playlist and current index
  const { videoFiles, currentIndex } = useMemo(() => {
    if (!metadata || !metadata.files) return { videoFiles: [], currentIndex: -1 };

    // Filter and sort video files (same logic as backend roughly)
    const files = metadata.files
      .filter(f => {
        const ext = f.name.toLowerCase().match(/\.[^.]+$/)?.[0];
        return ext && VIDEO_EXTENSIONS.includes(ext);
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    // Find current file name from URL
    let currentName = '';
    if (videoUrl) {
      try {
        const urlObj = new URL(videoUrl);
        // decodeURIComponent to handle spaces and special chars
        const pathname = decodeURIComponent(urlObj.pathname);
        // Remove leading slash
        currentName = pathname.startsWith('/') ? pathname.slice(1) : pathname;
      } catch (e) {
        console.error('Error parsing video URL:', e);
      }
    }

    const index = files.findIndex(f => f.name === currentName);
    return { videoFiles: files, currentIndex: index };
  }, [metadata, videoUrl]);

  const handlePrev = async () => {
    if (currentIndex > 0) {
      const prevFile = videoFiles[currentIndex - 1];
      setIsLoading(true); // Show loading while switching
      setServerDuration(null);
      try {
        await window.electronAPI.selectFile(prevFile.name);
      } catch (err) {
        console.error('Error switching file:', err);
        setIsLoading(false);
      }
    }
  };

  const handleNext = async () => {
    if (currentIndex < videoFiles.length - 1) {
      const nextFile = videoFiles[currentIndex + 1];
      setIsLoading(true);
      setServerDuration(null);
      try {
        await window.electronAPI.selectFile(nextFile.name);
      } catch (err) {
        console.error('Error switching file:', err);
        setIsLoading(false);
      }
    }
  };

  const handleSelectFile = async (fileName: string) => {
    setIsLoading(true);
    setServerDuration(null);
    try {
      await window.electronAPI.selectFile(fileName);
    } catch (err) {
      console.error('Error switching file:', err);
      setIsLoading(false);
    }
  };

  return (
    <div className="app">
      {!videoUrl && (
        <TorrentInput onLoad={handleLoadTorrent} isLoading={isLoading} />
      )}
      
      <VideoPlayer 
        videoUrl={videoUrl} 
        serverDuration={serverDuration}
        isLoading={isLoading}
        isBuffering={torrentStatus?.isBuffering || false}
        onClose={handleClose}
        onPrev={currentIndex > 0 ? handlePrev : undefined}
        onNext={currentIndex !== -1 && currentIndex < videoFiles.length - 1 ? handleNext : undefined}
        title={currentIndex !== -1 ? videoFiles[currentIndex].name : undefined}
        videoFiles={videoFiles}
        onSelectFile={handleSelectFile}
      />
      
      <StatusBar  
        status={torrentStatus} 
        metadata={metadata}
      />
      
      {error && (
        <div className="error-message">
          <strong>{error.code}:</strong> {error.message}
        </div>
      )}
    </div>
  );
};

export default App;
