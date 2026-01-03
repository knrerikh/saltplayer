import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';

interface VideoPlayerProps {
  videoUrl: string | null;
  serverDuration?: number | null;
  isLoading: boolean;
  isBuffering: boolean; // We'll ignore this prop mostly, relying on native events
  onClose?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  title?: string;
  videoFiles?: { name: string }[];
  onSelectFile?: (fileName: string) => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ 
  videoUrl, 
  serverDuration,
  isLoading: parentLoading, 
  onClose,
  onPrev,
  onNext,
  title,
  videoFiles,
  onSelectFile
  }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [timeOffset, setTimeOffset] = useState(0);
  const [overlayIcon, setOverlayIcon] = useState<'play' | 'pause' | null>(null);

  const isTranscode = useMemo(() => {
    return videoUrl?.includes('transcode=true') || false;
  }, [videoUrl]);

  // Reset time offset when video URL changes (new file)
  useEffect(() => {
    setTimeOffset(0);
  }, [videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      // console.log('Time update:', video.currentTime);
      setCurrentTime(video.currentTime + timeOffset);
    };
    const handleDurationChange = () => {
      const d = video.duration;
      // Prefer browser duration if valid, otherwise fallback to server duration
      if (Number.isFinite(d)) {
        setDuration(d);
      } else if (serverDuration && Number.isFinite(serverDuration)) {
        setDuration(serverDuration);
      }
    };
    
    const handlePlay = () => {
      setIsPlaying(true);
      setIsBuffering(false);
    };
    
    const handlePlaying = () => {
      setIsPlaying(true);
      setIsBuffering(false);
    };
    
    const handlePause = () => {
      setIsPlaying(false);
      setIsBuffering(false);
    };
    
    const handleWaiting = () => {
      setIsBuffering(true);
    };
    
    const handleCanPlay = () => {
      setIsBuffering(false);
    };
    
    const handleLoadStart = () => {
      setIsBuffering(true);
    };

    const handleLoadedMetadata = () => {
      // Check codec support
      const videoElement = video as HTMLVideoElement & { audioTracks?: any[], videoTracks?: any[] };
      
      if (videoElement.videoTracks && videoElement.videoTracks.length === 0) {
        setPlaybackError('Video codec unsupported');
        return;
      }
      
      setDuration(Number.isFinite(video.duration) ? video.duration : (serverDuration || 0));
      setIsBuffering(false);
    };

    const handleError = () => {
      const err = video.error;
      const msg = err ? `MediaError code=${err.code}` : 'Unknown media error';
      setPlaybackError(msg);
      setIsBuffering(false);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('pause', handlePause);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('error', handleError);
    };
  }, [videoUrl, timeOffset, serverDuration]); // Re-attach listeners when URL or offset changes

  useEffect(() => {
    if (serverDuration && Number.isFinite(serverDuration) && serverDuration > 0) {
      setDuration(serverDuration);
    }
  }, [serverDuration]);

  useEffect(() => {
    if (videoUrl && videoRef.current) {
      const video = videoRef.current;
      setPlaybackError(null);
      setIsBuffering(true); // Start buffering when URL changes
      video.src = videoUrl;

      // Ensure playback isn't muted
      video.muted = false;
      video.volume = 1;
      
      video.play().catch(err => {
        // Auto-play might fail
        console.warn('Auto-play failed:', err);
        setIsPlaying(false);
        setIsBuffering(false);
      });
    }
  }, [videoUrl]);

  // Pause playback immediately when loading starts (e.g. switching episodes)
  useEffect(() => {
    if (parentLoading && videoRef.current) {
      videoRef.current.pause();
    }
  }, [parentLoading]);

  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (!videoRef.current.paused) {
        videoRef.current.pause();
        setOverlayIcon('pause');
      } else {
        videoRef.current.play();
        setOverlayIcon('play');
      }
      setTimeout(() => setOverlayIcon(null), 800);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        const target = e.target as HTMLElement;
        // Don't toggle if typing in an input
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
          return;
        }
        e.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration || !Number.isFinite(duration)) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const time = pos * duration;
    
    if (!Number.isFinite(time)) return;

    if (isTranscode && videoUrl) {
      const url = new URL(videoUrl);
      url.searchParams.set('startTime', Math.floor(time).toString());
      
      setIsBuffering(true);
      setTimeOffset(time);
      
      // Update src manually to trigger reload with new start time
      videoRef.current.src = url.toString();
      videoRef.current.play().catch(console.error);
    } else {
      videoRef.current.currentTime = time;
    }

    window.electronAPI.playbackSeek(time);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (videoRef.current) {
      videoRef.current.volume = vol;
    }
  };

  const toggleFullscreen = () => {
    const container = videoRef.current?.parentElement;
    if (!container) return;

    if (!isFullscreen) {
      if (container.requestFullscreen) {
        container.requestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Show spinner if parent is loading (initial metadata) OR if video is buffering locally
  const showSpinner = parentLoading || (videoUrl && isBuffering);

  return (
    <div className={`video-container ${isFullscreen ? 'fullscreen' : ''}`}>
      {videoUrl ? (
        <>
          <video
            ref={videoRef}
            className="video-player"
            autoPlay
            controls={false}
            onClick={togglePlay}
          />
          
          {onClose && (
            <button className="close-button" onClick={onClose} title="Close">
              ✕
            </button>
          )}
          
          {showSpinner && (
            <div className="loading-overlay">
              <div className="loading-spinner" />
              {parentLoading && <span>Loading torrent...</span>}
            </div>
          )}
          
          {overlayIcon && (
            <div className="icon-overlay">
              {overlayIcon === 'play' ? '▶' : '⏸'}
            </div>
          )}

          {playbackError && (
            <div className="error-message">
              <strong>Playback error:</strong> {playbackError}
              {videoUrl && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    className="button"
                    onClick={() => navigator.clipboard?.writeText(videoUrl).catch(() => {})}
                  >
                    Copy stream URL
                  </button>
                  <button
                    className="button"
                    onClick={() => window.electronAPI.openExternal(videoUrl).catch(() => {})}
                  >
                    Open externally
                  </button>
                </div>
              )}
            </div>
          )}
          
          <div className="video-controls">
            {title && (
              <div className="video-title">
                {videoFiles && videoFiles.length > 1 && onSelectFile ? (
                  <select 
                    className="episode-selector"
                    value={title} 
                    onChange={(e) => {
                      // Prevent spacebar from toggling play/pause when interacting with select
                      e.target.blur(); 
                      onSelectFile(e.target.value);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {videoFiles.map((file) => (
                      <option key={file.name} value={file.name}>
                        {file.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  title
                )}
              </div>
            )}
            
            <div className="controls-row">
              <button 
                className="control-button" 
                onClick={onPrev} 
                disabled={!onPrev}
                style={{ opacity: !onPrev ? 0.3 : 1, cursor: !onPrev ? 'default' : 'pointer' }}
                title="Previous Episode"
              >
                ⏮
              </button>

              <button className="control-button" onClick={togglePlay}>
                {isPlaying ? '⏸' : '▶'}
              </button>

              <button 
                className="control-button" 
                onClick={onNext} 
                disabled={!onNext}
                style={{ opacity: !onNext ? 0.3 : 1, cursor: !onNext ? 'default' : 'pointer' }}
                title="Next Episode"
              >
                ⏭
              </button>
              
              <div className="seek-bar" onClick={handleSeek}>
                <div 
                  className="seek-bar-fill" 
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
              </div>
              
              <div className="time-display">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
              
              <input
                type="range"
                className="volume-control"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={handleVolumeChange}
              />
              
              <button className="control-button" onClick={toggleFullscreen}>
                {isFullscreen ? '⊗' : '⛶'}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="placeholder">
          {parentLoading ? (
            <div className="loading-container">
              <div className="loading-spinner" />
              <span>Loading torrent...</span>
            </div>
          ) : (
            'Load a torrent or magnet link to start'
          )}
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
