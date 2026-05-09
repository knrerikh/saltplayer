import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VideoPlayer from '@/renderer/components/VideoPlayer';
import { SubtitleData, AudioData } from '@/shared/types';

describe('VideoPlayer Component', () => {
  beforeEach(() => {
    // Mock requestFullscreen/exitFullscreen
    HTMLElement.prototype.requestFullscreen = vi.fn();
    document.exitFullscreen = vi.fn();
    
    // Mock document.fullscreenElement
    Object.defineProperty(document, 'fullscreenElement', {
      writable: true,
      value: null
    });

    // Mock HTMLMediaElement methods
    HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLVideoElement.prototype.pause = vi.fn();
    HTMLVideoElement.prototype.load = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Click to Play/Pause', () => {
    it('should toggle play when clicking on video area', async () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={vi.fn()}
        />
      );

      const video = container.querySelector('video') as HTMLVideoElement;
      expect(video).toBeTruthy();

      // Mock video as paused
      Object.defineProperty(video, 'paused', { value: true, writable: true });

      // Click on video to play
      fireEvent.click(video);
      expect(video.play).toHaveBeenCalled();
    });

    it('should show play overlay icon when video starts playing', async () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={vi.fn()}
        />
      );

      const video = container.querySelector('video') as HTMLVideoElement;
      Object.defineProperty(video, 'paused', { value: true, writable: true });

      // Click to play
      fireEvent.click(video);

      // Check for play icon overlay
      const overlay = container.querySelector('.icon-overlay');
      expect(overlay).toBeTruthy();
      expect(overlay?.textContent).toBe('▶');
    });

    it('should show pause overlay icon when video pauses', async () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={vi.fn()}
        />
      );

      const video = container.querySelector('video') as HTMLVideoElement;
      Object.defineProperty(video, 'paused', { value: false, writable: true });

      // Click to pause
      fireEvent.click(video);

      // Check for pause icon overlay
      const overlay = container.querySelector('.icon-overlay');
      expect(overlay).toBeTruthy();
      expect(overlay?.textContent).toBe('⏸');
    });

    it('should hide overlay icon after animation', async () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={vi.fn()}
        />
      );

      const video = container.querySelector('video') as HTMLVideoElement;
      Object.defineProperty(video, 'paused', { value: true, writable: true });

      // Click to play
      fireEvent.click(video);

      // Overlay should be visible immediately
      let overlay = container.querySelector('.icon-overlay');
      expect(overlay).toBeTruthy();

      // Wait for overlay to disappear (800ms + small buffer)
      await waitFor(() => {
        overlay = container.querySelector('.icon-overlay');
        expect(overlay).toBeFalsy();
      }, { timeout: 1000 });
    });
  });

  describe('Spacebar Control', () => {
    it('should toggle play/pause when spacebar is pressed', async () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={vi.fn()}
        />
      );

      const video = container.querySelector('video') as HTMLVideoElement;
      Object.defineProperty(video, 'paused', { value: true, writable: true });

      // Press spacebar
      fireEvent.keyDown(window, { code: 'Space' });
      expect(video.play).toHaveBeenCalled();
    });

    it('should not trigger play/pause when target is input/textarea', async () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={vi.fn()}
        />
      );

      const video = container.querySelector('video') as HTMLVideoElement;
      const playSpy = vi.spyOn(video, 'play');

      // Create a mock event with INPUT as target
      const mockInput = document.createElement('input');
      const event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true });
      Object.defineProperty(event, 'target', { 
        value: mockInput, 
        enumerable: true, 
        writable: false 
      });
      
      window.dispatchEvent(event);

      // Video should not be affected because target is INPUT
      expect(playSpy).not.toHaveBeenCalled();
    });

    it('should prevent default spacebar scroll behavior', async () => {
      render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={vi.fn()}
        />
      );

      const event = new KeyboardEvent('keydown', { code: 'Space' });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      
      window.dispatchEvent(event);
      
      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('Episode Selection', () => {
    const mockVideoFiles = [
      { name: 'Episode 1.mp4' },
      { name: 'Episode 2.mp4' },
      { name: 'Episode 3.mp4' }
    ];

    it('should show episode dropdown when multiple video files are provided', () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Episode 1.mp4"
          onClose={vi.fn()}
          videoFiles={mockVideoFiles}
          onSelectFile={vi.fn()}
        />
      );

      const select = container.querySelector('.episode-selector') as HTMLSelectElement;
      expect(select).toBeTruthy();
      expect(select.options).toHaveLength(3);
      expect(select.options[0].value).toBe('Episode 1.mp4');
    });

    it('should not show dropdown when only one video file', () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Single Video.mp4"
          onClose={vi.fn()}
          videoFiles={[{ name: 'Single Video.mp4' }]}
          onSelectFile={vi.fn()}
        />
      );

      const select = container.querySelector('.episode-selector');
      expect(select).toBeFalsy();
    });

    it('should call onSelectFile when episode is selected', async () => {
      const onSelectFile = vi.fn();
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Episode 1.mp4"
          onClose={vi.fn()}
          videoFiles={mockVideoFiles}
          onSelectFile={onSelectFile}
        />
      );

      const select = container.querySelector('.episode-selector') as HTMLSelectElement;
      
      // Change to Episode 2
      fireEvent.change(select, { target: { value: 'Episode 2.mp4' } });
      
      expect(onSelectFile).toHaveBeenCalledWith('Episode 2.mp4');
    });

    it('should show title as text when no video files provided', () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Single Video.mp4"
          onClose={vi.fn()}
        />
      );

      const videoTitle = container.querySelector('.video-title');
      expect(videoTitle?.textContent).toBe('Single Video.mp4');
      
      const select = container.querySelector('.episode-selector');
      expect(select).toBeFalsy();
    });
  });

  describe('Video Controls', () => {
    it('should render control buttons', () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={vi.fn()}
        />
      );

      const controlButtons = container.querySelectorAll('.control-button');
      expect(controlButtons.length).toBeGreaterThan(0);
    });

    it('should render close button', () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={vi.fn()}
        />
      );

      const closeButton = container.querySelector('.close-button');
      expect(closeButton).toBeTruthy();
    });

    it('should call onClose when close button is clicked', async () => {
      const onClose = vi.fn();
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={onClose}
        />
      );

      const closeButton = container.querySelector('.close-button') as HTMLButtonElement;
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('Video Loading', () => {
    it('should update video source when videoUrl changes', () => {
      const { container, rerender } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video1.mp4"
          title="Video 1"
          onClose={vi.fn()}
        />
      );

      const video = container.querySelector('video') as HTMLVideoElement;
      expect(video.src).toContain('video1.mp4');

      // Change video URL
      rerender(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video2.mp4"
          title="Video 2"
          onClose={vi.fn()}
        />
      );

      expect(video.src).toContain('video2.mp4');
    });
  });

  describe('Subtitles', () => {
    const mockSubtitleData: SubtitleData = {
      tracks: [
        { index: 0, language: 'eng', title: 'English', url: 'http://localhost:8080/subtitle/0.vtt' },
        { index: 1, language: 'rus', title: 'Russian', url: 'http://localhost:8080/subtitle/1.vtt' }
      ],
      hasEmbeddedSubtitles: true
    };

    it('should show CC button when subtitles are available', () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={vi.fn()}
          subtitleData={mockSubtitleData}
        />
      );

      const ccButton = container.querySelector('.subtitle-control-cc');
      expect(ccButton).toBeTruthy();
      expect(ccButton?.textContent).toBe('CC');
    });

    it('should show arrow button when subtitles are available', () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={vi.fn()}
          subtitleData={mockSubtitleData}
        />
      );

      const arrowButton = container.querySelector('.subtitle-control-arrow');
      expect(arrowButton).toBeTruthy();
      expect(arrowButton?.textContent).toBe('▼');
    });

    it('should not show CC button when no subtitles available', () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={vi.fn()}
          subtitleData={{ tracks: [], hasEmbeddedSubtitles: false }}
        />
      );

      const subtitleControl = container.querySelector('.subtitle-control');
      expect(subtitleControl).toBeFalsy();
    });

    it('should not show CC button when subtitleData is null', () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={vi.fn()}
          subtitleData={null}
        />
      );

      const subtitleControl = container.querySelector('.subtitle-control');
      expect(subtitleControl).toBeFalsy();
    });

    it('should have subtitles disabled by default', () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={vi.fn()}
          subtitleData={mockSubtitleData}
        />
      );

      const ccButton = container.querySelector('.subtitle-control-cc') as HTMLButtonElement;
      expect(ccButton.style.opacity).toBe('0.5');
    });

    it('should toggle subtitles when CC button is clicked', () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={vi.fn()}
          subtitleData={mockSubtitleData}
        />
      );

      const ccButton = container.querySelector('.subtitle-control-cc') as HTMLButtonElement;

      expect(ccButton.style.opacity).toBe('0.5');

      fireEvent.click(ccButton);

      expect(ccButton.style.opacity).toBe('1');

      fireEvent.click(ccButton);

      expect(ccButton.style.opacity).toBe('0.5');
    });

    it('should render track element when subtitles are enabled', () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={vi.fn()}
          subtitleData={mockSubtitleData}
        />
      );

      const ccButton = container.querySelector('.subtitle-control-cc') as HTMLButtonElement;

      fireEvent.click(ccButton);

      const track = container.querySelector('track');
      expect(track).toBeTruthy();
      expect(track?.getAttribute('src')).toBe('http://localhost:8080/subtitle/0.vtt');
      expect(track?.getAttribute('kind')).toBe('subtitles');
    });

    it('should not render track element when subtitles are disabled', () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={vi.fn()}
          subtitleData={mockSubtitleData}
        />
      );

      const track = container.querySelector('track');
      expect(track).toBeFalsy();
    });

    it('should open language menu when arrow is clicked', () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={vi.fn()}
          subtitleData={mockSubtitleData}
        />
      );

      const arrowButton = container.querySelector('.subtitle-control-arrow') as HTMLButtonElement;
      expect(container.querySelector('.subtitle-menu')).toBeFalsy();

      fireEvent.click(arrowButton);

      const menu = container.querySelector('.subtitle-menu');
      expect(menu).toBeTruthy();
      const items = menu?.querySelectorAll('.subtitle-menu-item');
      expect(items).toHaveLength(3); // Off + English + Russian
      expect(items?.[0].textContent).toBe('Off');
      expect(items?.[1].textContent).toBe('English');
      expect(items?.[2].textContent).toBe('Russian');
    });

    it('should enable subtitles and set track when selecting language from menu', () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={vi.fn()}
          subtitleData={mockSubtitleData}
        />
      );

      const arrowButton = container.querySelector('.subtitle-control-arrow') as HTMLButtonElement;
      fireEvent.click(arrowButton);

      const menu = container.querySelector('.subtitle-menu');
      const russianItem = Array.from(menu?.querySelectorAll('.subtitle-menu-item') ?? []).find(
        el => el.textContent === 'Russian'
      ) as HTMLButtonElement;
      fireEvent.click(russianItem);

      const track = container.querySelector('track');
      expect(track).toBeTruthy();
      expect(track?.getAttribute('src')).toBe('http://localhost:8080/subtitle/1.vtt');

      const ccButton = container.querySelector('.subtitle-control-cc') as HTMLButtonElement;
      expect(ccButton.style.opacity).toBe('1');
    });

    it('should disable subtitles and close menu when selecting Off', () => {
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={vi.fn()}
          subtitleData={mockSubtitleData}
        />
      );

      const ccButton = container.querySelector('.subtitle-control-cc') as HTMLButtonElement;
      fireEvent.click(ccButton);
      expect(ccButton.style.opacity).toBe('1');

      const arrowButton = container.querySelector('.subtitle-control-arrow') as HTMLButtonElement;
      fireEvent.click(arrowButton);

      const menu = container.querySelector('.subtitle-menu');
      const offItem = menu?.querySelector('.subtitle-menu-item') as HTMLButtonElement;
      fireEvent.click(offItem);

      expect(container.querySelector('.subtitle-menu')).toBeFalsy();
      expect(ccButton.style.opacity).toBe('0.5');
      expect(container.querySelector('track')).toBeFalsy();
    });

    it('should display human-readable language for technical codes (rus-sub, SDH)', () => {
      const technicalSubtitleData: SubtitleData = {
        tracks: [
          { index: 0, language: 'rus-sub', title: 'rus-sub', url: 'http://localhost:8080/subtitle/0.vtt' },
          { index: 1, language: 'eng', title: 'SDH', url: 'http://localhost:8080/subtitle/1.vtt' },
          { index: 2, language: 'und', title: 'rus-sub', url: 'http://localhost:8080/subtitle/2.vtt' }
        ],
        hasEmbeddedSubtitles: true
      };
      const { container } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video.mp4"
          title="Test Video"
          onClose={vi.fn()}
          subtitleData={technicalSubtitleData}
        />
      );

      const arrowButton = container.querySelector('.subtitle-control-arrow') as HTMLButtonElement;
      fireEvent.click(arrowButton);

      const menu = container.querySelector('.subtitle-menu');
      const items = menu?.querySelectorAll('.subtitle-menu-item');
      expect(items?.[1].textContent).toBe('Russian');
      expect(items?.[2].textContent).toBe('English (SDH)');
      expect(items?.[3].textContent).toBe('Russian');
    });

    it('should reset subtitles when video URL changes', () => {
      const { container, rerender } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video1.mp4"
          title="Video 1"
          onClose={vi.fn()}
          subtitleData={mockSubtitleData}
        />
      );

      const ccButton = container.querySelector('.subtitle-control-cc') as HTMLButtonElement;

      fireEvent.click(ccButton);
      expect(ccButton.style.opacity).toBe('1');

      rerender(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video2.mp4"
          title="Video 2"
          onClose={vi.fn()}
          subtitleData={mockSubtitleData}
        />
      );

      const ccButtonAfter = container.querySelector('.subtitle-control-cc') as HTMLButtonElement;

      expect(ccButtonAfter.style.opacity).toBe('0.5');
    });
  });

  describe('Audio Track Selection', () => {
    const mockAudioData: AudioData = {
      tracks: [
        { index: 1, language: 'eng', title: 'English', codec: 'aac', channels: 2 },
        { index: 2, language: 'rus', title: 'Russian', codec: 'ac3', channels: 6 },
        { index: 3, language: 'deu', title: 'German', codec: 'aac', channels: 2 },
      ],
      currentTrackIndex: 0,
    };

    const singleAudioData: AudioData = {
      tracks: [
        { index: 1, language: 'eng', title: 'English', codec: 'aac', channels: 2 },
      ],
      currentTrackIndex: 0,
    };

    it('should always show a volume slider', () => {
      const { container } = render(
        <VideoPlayer
          videoUrl="http://localhost:8080/video.mkv"
          title="Test"
          onClose={vi.fn()}
        />
      );

      const slider = container.querySelector('.volume-control') as HTMLInputElement;
      expect(slider).toBeTruthy();
      expect(slider.type).toBe('range');
    });

    it('should show ▼ button and grouped pill when multiple tracks available', () => {
      const { container } = render(
        <VideoPlayer
          videoUrl="http://localhost:8080/video.mkv"
          title="Test"
          onClose={vi.fn()}
          audioData={mockAudioData}
          onSelectAudioTrack={vi.fn()}
        />
      );

      expect(container.querySelector('.volume-track-arrow')).toBeTruthy();
      expect(container.querySelector('.volume-slider-pill')).toBeTruthy();
    });

    it('should not show ▼ button when audioData is null', () => {
      const { container } = render(
        <VideoPlayer
          videoUrl="http://localhost:8080/video.mkv"
          title="Test"
          onClose={vi.fn()}
          audioData={null}
          onSelectAudioTrack={vi.fn()}
        />
      );

      expect(container.querySelector('.volume-track-arrow')).toBeFalsy();
    });

    it('should not show ▼ button when only one audio track', () => {
      const { container } = render(
        <VideoPlayer
          videoUrl="http://localhost:8080/video.mkv"
          title="Test"
          onClose={vi.fn()}
          audioData={singleAudioData}
          onSelectAudioTrack={vi.fn()}
        />
      );

      expect(container.querySelector('.volume-track-arrow')).toBeFalsy();
    });

    it('should not show ▼ button when onSelectAudioTrack is not provided', () => {
      const { container } = render(
        <VideoPlayer
          videoUrl="http://localhost:8080/video.mkv"
          title="Test"
          onClose={vi.fn()}
          audioData={mockAudioData}
        />
      );

      expect(container.querySelector('.volume-track-arrow')).toBeFalsy();
    });

    it('should open track menu when ▼ is clicked', () => {
      const { container } = render(
        <VideoPlayer
          videoUrl="http://localhost:8080/video.mkv"
          title="Test"
          onClose={vi.fn()}
          audioData={mockAudioData}
          onSelectAudioTrack={vi.fn()}
        />
      );

      expect(container.querySelector('.audio-menu')).toBeFalsy();
      fireEvent.click(container.querySelector('.volume-track-arrow') as HTMLButtonElement);
      expect(container.querySelector('.audio-menu')).toBeTruthy();
    });

    it('should show all audio tracks in panel with display names', () => {
      const { container } = render(
        <VideoPlayer
          videoUrl="http://localhost:8080/video.mkv"
          title="Test"
          onClose={vi.fn()}
          audioData={mockAudioData}
          onSelectAudioTrack={vi.fn()}
        />
      );

      fireEvent.click(container.querySelector('.volume-track-arrow') as HTMLButtonElement);

      const items = container.querySelectorAll('.audio-menu-item');
      expect(items).toHaveLength(3);
      expect(items[0].textContent).toBe('English (AAC Stereo)');
      expect(items[1].textContent).toBe('Russian (AC3 5.1)');
      expect(items[2].textContent).toBe('German (AAC Stereo)');
    });

    it('should call onSelectAudioTrack with correct stream index when track is selected', () => {
      const onSelectAudioTrack = vi.fn();
      const { container } = render(
        <VideoPlayer
          videoUrl="http://localhost:8080/video.mkv"
          title="Test"
          onClose={vi.fn()}
          audioData={mockAudioData}
          onSelectAudioTrack={onSelectAudioTrack}
        />
      );

      fireEvent.click(container.querySelector('.volume-track-arrow') as HTMLButtonElement);
      const items = container.querySelectorAll('.audio-menu-item');
      fireEvent.click(items[1]); // Russian track, stream index 2

      expect(onSelectAudioTrack).toHaveBeenCalledWith(2);
    });

    it('should close panel after selecting a track', () => {
      const { container } = render(
        <VideoPlayer
          videoUrl="http://localhost:8080/video.mkv"
          title="Test"
          onClose={vi.fn()}
          audioData={mockAudioData}
          onSelectAudioTrack={vi.fn()}
        />
      );

      fireEvent.click(container.querySelector('.volume-track-arrow') as HTMLButtonElement);
      expect(container.querySelector('.audio-menu')).toBeTruthy();

      fireEvent.click(container.querySelectorAll('.audio-menu-item')[0]);
      expect(container.querySelector('.audio-menu')).toBeFalsy();
    });

    it('should mark selected track as active', () => {
      const { container } = render(
        <VideoPlayer
          videoUrl="http://localhost:8080/video.mkv"
          title="Test"
          onClose={vi.fn()}
          audioData={mockAudioData}
          onSelectAudioTrack={vi.fn()}
        />
      );

      fireEvent.click(container.querySelector('.volume-track-arrow') as HTMLButtonElement);
      fireEvent.click(container.querySelectorAll('.audio-menu-item')[1]); // select Russian

      fireEvent.click(container.querySelector('.volume-track-arrow') as HTMLButtonElement);
      const items = container.querySelectorAll('.audio-menu-item');
      expect(items[1].classList.contains('active')).toBe(true);
      expect(items[0].classList.contains('active')).toBe(false);
    });

    it('should resume playback from current position when audio track changes', () => {
      const { container, rerender } = render(
        <VideoPlayer
          videoUrl="http://localhost:8080/video.mkv?transcode=true"
          title="Test"
          onClose={vi.fn()}
          audioData={mockAudioData}
          onSelectAudioTrack={vi.fn()}
        />
      );

      const video = container.querySelector('video') as HTMLVideoElement;

      // Simulate video playing at 120 seconds
      Object.defineProperty(video, 'currentTime', { value: 120, writable: true, configurable: true });
      fireEvent(video, new Event('timeupdate'));

      // Select audio track
      fireEvent.click(container.querySelector('.volume-track-arrow') as HTMLButtonElement);
      fireEvent.click(container.querySelectorAll('.audio-menu-item')[1]);

      // Simulate new URL arriving from main process (after IPC call)
      rerender(
        <VideoPlayer
          videoUrl="http://localhost:8080/video.mkv?transcode=true&audioTrack=2"
          title="Test"
          onClose={vi.fn()}
          audioData={mockAudioData}
          onSelectAudioTrack={vi.fn()}
        />
      );

      expect(video.src).toContain('startTime=120');
    });

    it('should not add startTime when URL changes for non-audio reasons', () => {
      const { container, rerender } = render(
        <VideoPlayer
          videoUrl="http://localhost:8080/episode1.mkv"
          title="Episode 1"
          onClose={vi.fn()}
          audioData={mockAudioData}
          onSelectAudioTrack={vi.fn()}
        />
      );

      const video = container.querySelector('video') as HTMLVideoElement;
      Object.defineProperty(video, 'currentTime', { value: 60, writable: true, configurable: true });
      fireEvent(video, new Event('timeupdate'));

      // URL changes due to episode switch (no audio track selection)
      rerender(
        <VideoPlayer
          videoUrl="http://localhost:8080/episode2.mkv"
          title="Episode 2"
          onClose={vi.fn()}
          audioData={mockAudioData}
          onSelectAudioTrack={vi.fn()}
        />
      );

      expect(video.src).not.toContain('startTime');
    });

    it('should not reset subtitles when audio track changes', () => {
      const mockSubtitleData: SubtitleData = {
        tracks: [
          { index: 0, language: 'eng', title: 'English', url: 'http://localhost:8080/subtitle/0.vtt' },
        ],
        hasEmbeddedSubtitles: true,
      };

      const { container, rerender } = render(
        <VideoPlayer
          videoUrl="http://localhost:8080/video.mkv?transcode=true"
          title="Test"
          onClose={vi.fn()}
          audioData={mockAudioData}
          onSelectAudioTrack={vi.fn()}
          subtitleData={mockSubtitleData}
        />
      );

      // Enable subtitles
      fireEvent.click(container.querySelector('.subtitle-control-cc') as HTMLButtonElement);
      expect((container.querySelector('.subtitle-control-cc') as HTMLButtonElement).style.opacity).toBe('1');

      // Select audio track
      fireEvent.click(container.querySelector('.volume-track-arrow') as HTMLButtonElement);
      fireEvent.click(container.querySelectorAll('.audio-menu-item')[1]);

      // New URL arrives
      rerender(
        <VideoPlayer
          videoUrl="http://localhost:8080/video.mkv?transcode=true&audioTrack=2"
          title="Test"
          onClose={vi.fn()}
          audioData={mockAudioData}
          onSelectAudioTrack={vi.fn()}
          subtitleData={mockSubtitleData}
        />
      );

      // Subtitles should still be enabled
      expect((container.querySelector('.subtitle-control-cc') as HTMLButtonElement).style.opacity).toBe('1');
    });
  });
});

