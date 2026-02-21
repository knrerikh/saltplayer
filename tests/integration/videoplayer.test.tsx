import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VideoPlayer from '@/renderer/components/VideoPlayer';
import { SubtitleData } from '@/shared/types';

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

      const ccButton = Array.from(container.querySelectorAll('.control-button')).find(
        btn => btn.textContent === 'CC'
      );
      expect(ccButton).toBeTruthy();
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

      const ccButton = Array.from(container.querySelectorAll('.control-button')).find(
        btn => btn.textContent === 'CC'
      );
      expect(ccButton).toBeFalsy();
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

      const ccButton = Array.from(container.querySelectorAll('.control-button')).find(
        btn => btn.textContent === 'CC'
      );
      expect(ccButton).toBeFalsy();
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

      const ccButton = Array.from(container.querySelectorAll('.control-button')).find(
        btn => btn.textContent === 'CC'
      ) as HTMLButtonElement;

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

      const ccButton = Array.from(container.querySelectorAll('.control-button')).find(
        btn => btn.textContent === 'CC'
      ) as HTMLButtonElement;

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

      const ccButton = Array.from(container.querySelectorAll('.control-button')).find(
        btn => btn.textContent === 'CC'
      ) as HTMLButtonElement;

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

    it('should reset subtitles when video URL changes', () => {
      const { container, rerender } = render(
        <VideoPlayer 
          videoUrl="http://localhost:8080/video1.mp4"
          title="Video 1"
          onClose={vi.fn()}
          subtitleData={mockSubtitleData}
        />
      );

      const ccButton = Array.from(container.querySelectorAll('.control-button')).find(
        btn => btn.textContent === 'CC'
      ) as HTMLButtonElement;

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

      const ccButtonAfter = Array.from(container.querySelectorAll('.control-button')).find(
        btn => btn.textContent === 'CC'
      ) as HTMLButtonElement;

      expect(ccButtonAfter.style.opacity).toBe('0.5');
    });
  });
});

