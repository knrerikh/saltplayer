import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { VIDEO_EXTENSIONS } from '@/shared/video-files';

const { build } = JSON.parse(readFileSync('package.json', 'utf-8'));

describe('build.fileAssociations (#46)', () => {
  it('covers .torrent and every video extension, and nothing else', () => {
    const extensions = build.fileAssociations.map((a: { ext: string }) => `.${a.ext}`).sort();
    expect(extensions).toEqual([...VIDEO_EXTENSIONS, '.torrent'].sort());
  });

  it('declares Salt Player a viewer, not the owner of the files', () => {
    for (const association of build.fileAssociations) {
      expect(association.role).toBe('Viewer');
      expect(association.name).toBeTruthy();
    }
  });

  // electron-builder writes Linux .desktop and MIME entries only from mimeType.
  it('gives every association a MIME type for Linux', () => {
    for (const association of build.fileAssociations) {
      expect(association.mimeType).toMatch(/^[a-z]+\/[\w.+-]+$/);
    }
  });
});

describe('build.protocols (#90)', () => {
  it('registers the magnet scheme as a viewer, for macOS and Linux', () => {
    expect(build.protocols).toEqual([{ name: 'Magnet link', schemes: ['magnet'], role: 'Viewer' }]);
  });
});
