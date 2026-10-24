import React, { useEffect } from 'react';

/** How long the hint stays up. */
export const RESUME_HINT_MS = 6000;

interface ResumeHintProps {
  /** Formatted position playback resumed from, e.g. "23:14". */
  from: string;
  onStartOver: () => void;
  onDismiss: () => void;
}

/** "Resumed from 23:14 · Start over", shown briefly when a file continues where it was left. */
const ResumeHint: React.FC<ResumeHintProps> = ({ from, onStartOver, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, RESUME_HINT_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="resume-hint" role="status">
      <span>Resumed from {from}</span>
      <button className="button button-secondary" onClick={onStartOver}>
        Start over
      </button>
    </div>
  );
};

export default ResumeHint;
