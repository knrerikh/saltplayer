import React, { useState, useRef, type RefObject } from 'react';
import { VIDEO_EXTENSIONS, isVideoFile } from '@/shared/video-files';

const ACCEPTED_FILES = ['.torrent', ...VIDEO_EXTENSIONS].join(',');

const isPlayable = (name: string) => name.toLowerCase().endsWith('.torrent') || isVideoFile(name);

/** Electron adds the absolute path on disk to every File it hands the page. */
const pathOf = (file: File): string | undefined => (file as File & { path?: string }).path;

interface TorrentInputProps {
  /** A magnet link or torrent URL typed into the field. */
  onLoad: (source: string) => void;
  /** A .torrent or video file dropped or picked, by its path on disk. */
  onOpenFile: (filePath: string) => void;
  isLoading: boolean;
  /** The magnet/URL field, for File → Open URL… to focus. */
  urlFieldRef?: RefObject<HTMLInputElement>;
}

const TorrentInput: React.FC<TorrentInputProps> = ({ onLoad, onOpenFile, isLoading, urlFieldRef }) => {
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

  const openFile = (file: File | undefined) => {
    const filePath = file && pathOf(file);
    if (filePath) onOpenFile(filePath);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    openFile(Array.from(e.dataTransfer.files).find((file) => isPlayable(file.name)));
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    openFile(e.target.files?.[0]);
  };

  return (
    <div className="input-section">
      <div className="input-container">
        <input
          ref={urlFieldRef}
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
        Drag & drop a video or .torrent file here or click to browse
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_FILES}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
};

export default TorrentInput;

