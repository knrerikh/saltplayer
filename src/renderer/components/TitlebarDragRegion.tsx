import React, { useCallback, useRef } from 'react';

// Pointer travel (in px) below which a press counts as a click, not a drag
const DRAG_THRESHOLD = 3;

interface TitlebarDragRegionProps {
  /** Called when the strip was pressed and released without dragging the window */
  onClick?: () => void;
}

/**
 * Invisible strip along the top of the window that acts as the title bar.
 *
 * The window is frameless (titleBarStyle: 'hiddenInset'), so it needs an explicit drag
 * handle. A CSS -webkit-app-region: drag strip is the usual answer, but the OS then takes
 * every mouse event in it — over the player that swallowed click-to-pause on the top of
 * the video and turned a double click into a window zoom. Instead the strip reports
 * pointer deltas to the main process, which moves the window; a press that never moves
 * stays an ordinary click and is forwarded to onClick.
 */
const TitlebarDragRegion: React.FC<TitlebarDragRegionProps> = ({ onClick }) => {
  const lastPointRef = useRef({ x: 0, y: 0 });
  const originRef = useRef({ x: 0, y: 0 });
  const movedRef = useRef(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();

      lastPointRef.current = { x: e.screenX, y: e.screenY };
      originRef.current = { x: e.screenX, y: e.screenY };
      movedRef.current = false;
      window.electronAPI.startWindowDrag();

      const handleMouseMove = (ev: MouseEvent) => {
        const dx = ev.screenX - lastPointRef.current.x;
        const dy = ev.screenY - lastPointRef.current.y;
        lastPointRef.current = { x: ev.screenX, y: ev.screenY };

        if (
          Math.abs(ev.screenX - originRef.current.x) > DRAG_THRESHOLD ||
          Math.abs(ev.screenY - originRef.current.y) > DRAG_THRESHOLD
        ) {
          movedRef.current = true;
        }
        if (movedRef.current && (dx !== 0 || dy !== 0)) {
          window.electronAPI.moveWindowBy(dx, dy);
        }
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        window.electronAPI.endWindowDrag();
        if (!movedRef.current) {
          onClick?.();
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [onClick]
  );

  return <div className="titlebar-drag-region" onMouseDown={handleMouseDown} />;
};

export default TitlebarDragRegion;
