import { describe, it, expect, vi } from 'vitest';
import { revealWindow } from '@/main/window-reveal';

function fakeWindow(state: { minimized?: boolean; destroyed?: boolean } = {}) {
  return {
    isDestroyed: vi.fn(() => state.destroyed ?? false),
    isMinimized: vi.fn(() => state.minimized ?? false),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
  };
}

describe('revealWindow (#44)', () => {
  it('shows and focuses a window', () => {
    const window = fakeWindow();
    revealWindow(window);
    expect(window.show).toHaveBeenCalled();
    expect(window.focus).toHaveBeenCalled();
    expect(window.restore).not.toHaveBeenCalled();
  });

  it('restores a minimized window first', () => {
    const calls: string[] = [];
    const window = fakeWindow({ minimized: true });
    window.restore.mockImplementation(() => calls.push('restore'));
    window.show.mockImplementation(() => calls.push('show'));
    window.focus.mockImplementation(() => calls.push('focus'));
    revealWindow(window);
    expect(calls).toEqual(['restore', 'show', 'focus']);
  });

  it('ignores a destroyed window', () => {
    const window = fakeWindow({ destroyed: true });
    revealWindow(window);
    expect(window.show).not.toHaveBeenCalled();
    expect(window.focus).not.toHaveBeenCalled();
  });

  it('ignores no window', () => {
    expect(() => revealWindow(null)).not.toThrow();
  });
});
