import React, { useState, useEffect } from 'react';

interface OpenUrlDialogProps {
  /** The trimmed magnet link or torrent URL. */
  onOpen: (source: string) => void;
  onCancel: () => void;
}

/** File → Open URL…: asks for a magnet link or torrent URL over whatever is on screen. */
const OpenUrlDialog: React.FC<OpenUrlDialogProps> = ({ onOpen, onCancel }) => {
  const [value, setValue] = useState('');
  const source = value.trim();

  // Escape is marked as handled so the same press does not also leave fullscreen (see App).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (source) onOpen(source);
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <form
        className="dialog"
        role="dialog"
        aria-label="Open URL"
        onSubmit={handleSubmit}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          type="text"
          className="input-field"
          placeholder="Magnet link or .torrent URL"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        <div className="dialog-buttons">
          <button type="button" className="button button-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="button" disabled={!source}>
            Open
          </button>
        </div>
      </form>
    </div>
  );
};

export default OpenUrlDialog;
