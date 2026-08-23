import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import TitlebarDragRegion from '@/renderer/components/TitlebarDragRegion';

const api = () => (window as any).electronAPI;

describe('TitlebarDragRegion', () => {
  beforeEach(() => {
    api().startWindowDrag.mockClear();
    api().moveWindowBy.mockClear();
    api().endWindowDrag.mockClear();
  });

  const strip = (onClick?: () => void) =>
    render(<TitlebarDragRegion onClick={onClick} />).container
      .querySelector('.titlebar-drag-region') as HTMLElement;

  it('should move the window by the pointer delta while dragging', () => {
    const el = strip();

    fireEvent.mouseDown(el, { button: 0, screenX: 100, screenY: 100 });
    expect(api().startWindowDrag).toHaveBeenCalled();

    fireEvent.mouseMove(document, { screenX: 130, screenY: 120 });
    expect(api().moveWindowBy).toHaveBeenCalledWith(30, 20);

    fireEvent.mouseMove(document, { screenX: 135, screenY: 115 });
    expect(api().moveWindowBy).toHaveBeenLastCalledWith(5, -5);

    fireEvent.mouseUp(document);
    expect(api().endWindowDrag).toHaveBeenCalled();
  });

  it('should treat a press without movement as a click', () => {
    const onClick = vi.fn();
    const el = strip(onClick);

    fireEvent.mouseDown(el, { button: 0, screenX: 50, screenY: 20 });
    fireEvent.mouseMove(document, { screenX: 51, screenY: 21 });
    fireEvent.mouseUp(document);

    expect(api().moveWindowBy).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('should not fire the click after a real drag', () => {
    const onClick = vi.fn();
    const el = strip(onClick);

    fireEvent.mouseDown(el, { button: 0, screenX: 50, screenY: 20 });
    fireEvent.mouseMove(document, { screenX: 90, screenY: 20 });
    fireEvent.mouseUp(document);

    expect(api().moveWindowBy).toHaveBeenCalledWith(40, 0);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('should ignore non-primary buttons', () => {
    const el = strip();
    fireEvent.mouseDown(el, { button: 2, screenX: 10, screenY: 10 });
    expect(api().startWindowDrag).not.toHaveBeenCalled();
  });

  it('should stop moving the window after the drag ends', () => {
    const el = strip();

    fireEvent.mouseDown(el, { button: 0, screenX: 0, screenY: 0 });
    fireEvent.mouseMove(document, { screenX: 20, screenY: 0 });
    fireEvent.mouseUp(document);
    api().moveWindowBy.mockClear();

    fireEvent.mouseMove(document, { screenX: 200, screenY: 200 });
    expect(api().moveWindowBy).not.toHaveBeenCalled();
  });
});
