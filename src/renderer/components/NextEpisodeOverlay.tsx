import React, { useEffect } from 'react';

interface NextEpisodeOverlayProps {
  secondsLeft: number;
  onCancel: () => void;
  onPlayNow: () => void;
}

/** "Next episode in 5 s" over the last seconds of an episode. */
const NextEpisodeOverlay: React.FC<NextEpisodeOverlayProps> = ({ secondsLeft, onCancel, onPlayNow }) => {
  // Escape is marked as handled so the same press does not also leave fullscreen (see App).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  return (
    <div className="next-episode-overlay" role="status">
      <span>Next episode in {secondsLeft} s</span>
      <button className="button button-secondary" onClick={onCancel}>
        Cancel
      </button>
      <button className="button" onClick={onPlayNow}>
        Play now
      </button>
    </div>
  );
};

export default NextEpisodeOverlay;
