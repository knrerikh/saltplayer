import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { SubtitleData, SubtitleTrack, AudioData, AudioTrack } from '@/shared/types';

const LANGUAGE_NAMES: Record<string, string> = {
  eng: 'English', rus: 'Russian', spa: 'Spanish', fra: 'French', deu: 'German',
  ita: 'Italian', por: 'Portuguese', jpn: 'Japanese', kor: 'Korean', zho: 'Chinese',
  ara: 'Arabic', hin: 'Hindi', tur: 'Turkish', pol: 'Polish', ukr: 'Ukrainian',
  swe: 'Swedish', nld: 'Dutch', dan: 'Danish', nor: 'Norwegian', fin: 'Finnish',
  ell: 'Greek', heb: 'Hebrew', tha: 'Thai', vie: 'Vietnamese', ind: 'Indonesian',
  und: 'Unknown',
};

const TECHNICAL_TITLES = new Set(['sdh', 'forced', 'default', 'full', 'cc']);
const TECHNICAL_TITLE_PATTERN = /^[a-z]{2,3}-[a-z0-9]+$/i;

function normalizeLanguageForDisplay(raw: string): string {
  const s = (raw || '').trim().toLowerCase();
  const m = s.match(/^([a-z]{2,3})(?:[-_].*)?$/);
  return m ? m[1] : s;
}

function getSubtitleDisplayName(track: SubtitleTrack): string {
  const t = (track.title || '').trim();
  let lang = normalizeLanguageForDisplay(track.language);
  if (lang === 'und' && t && TECHNICAL_TITLE_PATTERN.test(t)) {
    const extracted = t.match(/^([a-z]{2,3})-/i);
    if (extracted) lang = extracted[1].toLowerCase();
  }
  const langName = LANGUAGE_NAMES[lang] || LANGUAGE_NAMES[track.language] || 'Unknown';
  const isGenericTitle = !t || /^Track\s+\d+$/i.test(t) || /^\d+$/.test(t);
  const isTechnicalCode = TECHNICAL_TITLE_PATTERN.test(t);
  const isTechnicalDescriptor = TECHNICAL_TITLES.has(t.toLowerCase());
  if (t && !isGenericTitle && !isTechnicalCode) {
    if (isTechnicalDescriptor) return `${langName} (${t})`;
    return track.title!;
  }
  return langName;
}

function getAudioDisplayName(track: AudioTrack): string {
  const lang = normalizeLanguageForDisplay(track.language);
  const langName = LANGUAGE_NAMES[lang] || LANGUAGE_NAMES[track.language] || 'Unknown';
  const codec = (track.codec || '').toUpperCase();
  const channelLabel = track.channels >= 6 ? '5.1' : track.channels === 1 ? 'Mono' : 'Stereo';
  return `${langName} (${codec} ${channelLabel})`;
}

interface VideoPlayerProps {
  videoUrl: string | null;
  serverDuration?: number | null;
  isLoading: boolean;
  isBuffering: boolean;
  onClose?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  title?: string;
  videoFiles?: { name: string }[];
  onSelectFile?: (fileName: string) => void;
  subtitleData?: SubtitleData | null;
  audioData?: AudioData | null;
  onSelectAudioTrack?: (streamIndex: number) => void;
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
  onSelectFile,
  subtitleData,
  audioData,
  onSelectAudioTrack,
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
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(false);
  const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState(0);
  const [subtitleMenuOpen, setSubtitleMenuOpen] = useState(false);
  const [audioMenuOpen, setAudioMenuOpen] = useState(false);
  const [selectedAudioTrackIndex, setSelectedAudioTrackIndex] = useState(0);
  const subtitleControlRef = useRef<HTMLDivElement>(null);
  const audioControlRef = useRef<HTMLDivElement>(null);
  const pendingAudioSwitchTime = useRef<number | null>(null);

  const isTranscode = useMemo(() => {
    return videoUrl?.includes('transcode=true') || false;
  }, [videoUrl]);

  // Reset time offset and subtitle index when video URL changes (but not for audio track switches)
  useEffect(() => {
    if (pendingAudioSwitchTime.current !== null) return;
    setTimeOffset(0);
    setSubtitlesEnabled(false);
    setCurrentSubtitleIndex(0);
  }, [videoUrl]);

  // Keep currentSubtitleIndex in bounds when tracks change
  useEffect(() => {
    const tracks = subtitleData?.tracks;
    if (tracks && tracks.length > 0 && currentSubtitleIndex >= tracks.length) {
      setCurrentSubtitleIndex(0);
    }
  }, [subtitleData?.tracks, currentSubtitleIndex]);

  // Close subtitle menu on outside click or Escape
  useEffect(() => {
    if (!subtitleMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (subtitleControlRef.current && !subtitleControlRef.current.contains(e.target as Node)) {
        setSubtitleMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSubtitleMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [subtitleMenuOpen]);

  useEffect(() => {
    if (!audioMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (audioControlRef.current && !audioControlRef.current.contains(e.target as Node)) {
        setAudioMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAudioMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [audioMenuOpen]);

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
      setIsBuffering(true);

      const resumeTime = pendingAudioSwitchTime.current;
      pendingAudioSwitchTime.current = null;

      if (resumeTime !== null) {
        const url = new URL(videoUrl);
        url.searchParams.set('startTime', Math.floor(resumeTime).toString());
        setTimeOffset(resumeTime);
        video.src = url.toString();
      } else {
        video.src = videoUrl;
      }

      video.muted = false;
      video.volume = 1;

      video.play().catch(err => {
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
          >
            {subtitleData?.tracks && subtitleData.tracks.length > 0 && subtitlesEnabled && (
              <track
                kind="subtitles"
                src={subtitleData.tracks[currentSubtitleIndex]?.url}
                srcLang={subtitleData.tracks[currentSubtitleIndex]?.language}
                default
              />
            )}
          </video>
          
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
              
              {audioData && audioData.tracks.length > 1 && onSelectAudioTrack ? (
                <div className="volume-group" ref={audioControlRef}>
                  <div className="volume-slider-pill">
                    <input
                      type="range"
                      className="volume-control"
                      min="0"
                      max="1"
                      step="0.05"
                      value={volume}
                      onChange={handleVolumeChange}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  <button
                    type="button"
                    className="volume-track-arrow"
                    onClick={(e) => { e.stopPropagation(); setAudioMenuOpen((open) => !open); }}
                    title="Audio track"
                    aria-expanded={audioMenuOpen}
                  >
                    ▼
                  </button>
                  {audioMenuOpen && (
                    <div className="audio-menu" role="menu">
                      {audioData.tracks.map((track, index) => (
                        <button
                          key={track.index}
                          type="button"
                          role="menuitem"
                          className={`audio-menu-item${index === selectedAudioTrackIndex ? ' active' : ''}`}
                          onClick={() => {
                            setSelectedAudioTrackIndex(index);
                            pendingAudioSwitchTime.current = currentTime;
                            onSelectAudioTrack(track.index);
                            setAudioMenuOpen(false);
                          }}
                        >
                          {getAudioDisplayName(track)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <input
                  type="range"
                  className="volume-control"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={handleVolumeChange}
                />
              )}

              {subtitleData?.hasEmbeddedSubtitles && (
                <div className="subtitle-control" ref={subtitleControlRef}>
                  <button
                    type="button"
                    className="subtitle-control-cc"
                    onClick={() => setSubtitlesEnabled(!subtitlesEnabled)}
                    title={subtitlesEnabled ? 'Disable subtitles' : 'Enable subtitles'}
                    style={{ opacity: subtitlesEnabled ? 1 : 0.5 }}
                  >
                    CC
                  </button>
                  <button
                    type="button"
                    className="subtitle-control-arrow"
                    onClick={(e) => { e.stopPropagation(); setSubtitleMenuOpen((open) => !open); }}
                    title="Subtitle language"
                    aria-expanded={subtitleMenuOpen}
                  >
                    ▼
                  </button>
                  {subtitleMenuOpen && subtitleData?.tracks && (
                    <div className="subtitle-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        className="subtitle-menu-item"
                        onClick={() => { setSubtitlesEnabled(false); setSubtitleMenuOpen(false); }}
                      >
                        Off
                      </button>
                      {subtitleData.tracks.map((track, index) => (
                        <button
                          key={track.index}
                          type="button"
                          role="menuitem"
                          className="subtitle-menu-item"
                          onClick={() => {
                            setCurrentSubtitleIndex(index);
                            setSubtitlesEnabled(true);
                            setSubtitleMenuOpen(false);
                          }}
                        >
                          {getSubtitleDisplayName(track)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
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
