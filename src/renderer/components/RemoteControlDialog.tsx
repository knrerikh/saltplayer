import React, { useState, useEffect } from 'react';
import type { RemoteStatus } from '@/shared/remote';

const COPIED_MESSAGE_MS = 1500;

interface RemoteControlDialogProps {
  status: RemoteStatus;
  onSetEnabled: (enabled: boolean) => Promise<void>;
  onClose: () => void;
}

/** Playback → Remote Control…: turns the phone remote on or off and shows how to connect to it. */
const RemoteControlDialog: React.FC<RemoteControlDialogProps> = ({ status, onSetEnabled, onClose }) => {
  const [isSwitching, setIsSwitching] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Escape is marked as handled so the same press does not also leave fullscreen (see App).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (copiedUrl === null) return;
    const timer = setTimeout(() => setCopiedUrl(null), COPIED_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [copiedUrl]);

  const handleSwitch = async (enabled: boolean) => {
    setIsSwitching(true);
    try {
      await onSetEnabled(enabled);
    } finally {
      setIsSwitching(false);
    }
  };

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url).then(
      () => setCopiedUrl(url),
      (err) => console.error('Error copying the remote control link:', err),
    );
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-label="Remote Control"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <label className="remote-switch">
          <input
            type="checkbox"
            role="switch"
            checked={status.enabled}
            disabled={isSwitching}
            onChange={(e) => handleSwitch(e.target.checked)}
          />
          Control Salt Player from a phone
        </label>

        {!status.enabled && (
          <p className="remote-note">
            Turn this on, then scan the code with a phone on the same Wi-Fi network to play and pause from it.
          </p>
        )}

        {status.enabled && status.urls.length === 0 && (
          <p className="remote-note">
            No local network found. Connect to Wi-Fi or Ethernet, then turn this off and on again.
          </p>
        )}

        {status.enabled && status.urls.length > 0 && (
          <>
            {status.qrDataUrl && (
              <img className="remote-qr" src={status.qrDataUrl} alt="QR code of the remote control link" />
            )}
            {status.urls.map((url) => (
              <div className="remote-link" key={url}>
                <input
                  type="text"
                  className="input-field"
                  readOnly
                  value={url}
                  aria-label="Remote control link"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button type="button" className="button button-secondary" onClick={() => handleCopy(url)}>
                  {copiedUrl === url ? 'Copied' : 'Copy'}
                </button>
              </div>
            ))}
            <p className="remote-note">
              The phone must be on the same Wi-Fi network. The first time, your system may ask whether
              Salt Player may accept network connections: allow it. The link changes every time this is
              turned on, and anyone who has it can control playback until then.
            </p>
          </>
        )}

        <div className="dialog-buttons">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default RemoteControlDialog;
