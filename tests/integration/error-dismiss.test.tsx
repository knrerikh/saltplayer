import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import App from '@/renderer/App';
import { ErrorInfo } from '@/shared/types';

/**
 * Tests for SPEC-error-dismiss.md, section 3 (D.1-t .. D.6-t):
 * the error banner rendered near the end of App.tsx must gain a manual
 * close button, hover-pause behaviour, and a ref-based auto-dismiss timer
 * that resets per-error and is cancelled on manual close / unmount.
 *
 * The error is delivered by intercepting the callback App.tsx registers
 * via window.electronAPI.onError on mount, then invoking it directly -
 * mirroring the approach used in tests/integration/components.test.tsx.
 *
 * These tests are written against the CURRENT (unfixed) App.tsx and are
 * expected to fail until the close button / hover-pause / per-error timer
 * reset described in the spec is implemented.
 */

const sampleError: ErrorInfo = { code: 'LOAD_ERROR', message: 'Something went wrong' };
const sampleError2: ErrorInfo = { code: 'STREAM_ERROR', message: 'Second failure' };

function setupElectronAPIMock() {
  let errorCallback: ((err: ErrorInfo) => void) | undefined;

  (global.window as any).electronAPI = {
    loadTorrent: vi.fn(),
    stopTorrent: vi.fn(),
    selectFile: vi.fn(),
    playbackControl: vi.fn(),
    playbackSeek: vi.fn(),
    selectAudioTrack: vi.fn(),
    quit: vi.fn(),
    openExternal: vi.fn(),
    startWindowDrag: vi.fn(),
    moveWindowBy: vi.fn(),
    endWindowDrag: vi.fn(),
    onTorrentStatus: vi.fn(),
    onVideoUrl: vi.fn(),
    onVideoMetadata: vi.fn(),
    onSubtitles: vi.fn(),
    onAudioTracks: vi.fn(),
    onError: vi.fn((cb: (err: ErrorInfo) => void) => {
      errorCallback = cb;
    }),
    removeAllListeners: vi.fn(),
  };

  return {
    deliverError: (err: ErrorInfo) => {
      if (!errorCallback) {
        throw new Error('onError callback was not registered by App on mount');
      }
      act(() => {
        errorCallback!(err);
      });
    },
  };
}

describe('Error banner dismiss behaviour (SPEC-error-dismiss.md D.1-D.6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('D.1-t: a button with accessible name "Close" appears inside .error-message after an error is delivered', () => {
    const { deliverError } = setupElectronAPIMock();
    render(<App />);

    deliverError(sampleError);

    const errorMessage = document.querySelector('.error-message');
    expect(errorMessage).not.toBeNull();

    const closeButton = screen.getByRole('button', { name: 'Close' });
    expect(errorMessage).toContainElement(closeButton);
  });

  it('D.2-t: the close button is present in the DOM right after the error appears (not conditionally rendered) and carries the error-close class', () => {
    const { deliverError } = setupElectronAPIMock();
    render(<App />);

    deliverError(sampleError);

    // No hover has happened yet - the button must still be in the DOM
    // (visibility is expected to be handled by CSS, not conditional rendering).
    const closeButton = screen.getByRole('button', { name: 'Close' });
    expect(closeButton).toBeInTheDocument();
    expect(closeButton).toHaveClass('error-close');
  });

  it('D.3-t: clicking the close button immediately removes .error-message from the document', () => {
    const { deliverError } = setupElectronAPIMock();
    render(<App />);

    deliverError(sampleError);

    const closeButton = screen.getByRole('button', { name: 'Close' });
    act(() => {
      fireEvent.click(closeButton);
    });

    expect(document.querySelector('.error-message')).toBeNull();
  });

  it('D.4-t: mouseEnter on the banner pauses auto-dismiss past 5000ms; a following mouseLeave restarts the full 5s countdown', () => {
    const { deliverError } = setupElectronAPIMock();
    render(<App />);

    deliverError(sampleError);

    const errorMessage = document.querySelector('.error-message');
    expect(errorMessage).not.toBeNull();

    act(() => {
      fireEvent.mouseEnter(errorMessage!);
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(document.querySelector('.error-message')).not.toBeNull();

    act(() => {
      fireEvent.mouseLeave(document.querySelector('.error-message')!);
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(document.querySelector('.error-message')).toBeNull();
  });

  it('D.5-t: a second error delivered 3s after the first resets the timer, so the second error survives to 6s-since-first but is gone 5s after itself', () => {
    const { deliverError } = setupElectronAPIMock();
    render(<App />);

    deliverError(sampleError);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    deliverError(sampleError2);

    // 3000ms since the second error (6000ms since the first): still visible.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    const errorMessage = document.querySelector('.error-message');
    expect(errorMessage).not.toBeNull();
    expect(errorMessage!.textContent).toContain(sampleError2.message);

    // 2000ms more -> 5000ms since the second error: now gone.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(document.querySelector('.error-message')).toBeNull();
  });

  it('D.6-t: an untouched error auto-dismisses at exactly ERROR_AUTO_DISMISS_MS (5000ms) and not a moment before', () => {
    const { deliverError } = setupElectronAPIMock();
    render(<App />);

    deliverError(sampleError);

    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(document.querySelector('.error-message')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(document.querySelector('.error-message')).toBeNull();
  });
});
