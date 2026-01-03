import React, { useState, useRef } from 'react';

interface TorrentInputProps {
  onLoad: (source: string) => void;
  isLoading: boolean;
}

const TorrentInput: React.FC<TorrentInputProps> = ({ onLoad, isLoading }) => {
  const [inputValue, setInputValue] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (inputValue.trim() && !isLoading) {
      onLoad(inputValue.trim());
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const torrentFile = files.find(f => f.name.endsWith('.torrent'));

    if (torrentFile) {
      const path = (torrentFile as any).path;
      if (path) {
        onLoad(path);
      }
    }
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const path = (file as any).path;
      if (path) {
        onLoad(path);
      }
    }
  };

  return (
    <div className="input-section">
      <div className="input-container">
        <input
          type="text"
          className="input-field"
          placeholder="Enter magnet link or paste torrent URL..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={isLoading}
        />
        <button 
          className="button" 
          onClick={handleSubmit}
          disabled={!inputValue.trim() || isLoading}
        >
          {isLoading ? 'Loading...' : 'Load'}
        </button>
        <button 
          className="button" 
          onClick={handleFileSelect}
          disabled={isLoading}
        >
          Open File
        </button>
      </div>

      <div
        className={`drop-zone ${isDragging ? 'active' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleFileSelect}
      >
        Drag & drop .torrent file here or click to browse
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".torrent"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
};

export default TorrentInput;

