import { describe, it, expect } from 'vitest';
import { bumpVersion, cutRelease, releaseNotes } from '../../scripts/release/changelog.mjs';

const REPO = 'https://github.com/knrerikh/saltplayer';

const changelog = `# Changelog

Intro.

## [Unreleased]

### Fixed
- Esc closes menus first.

## [1.6.1] - 2026-10-10

### Changed
- Docs.

[Unreleased]: ${REPO}/compare/v1.6.1...HEAD
[1.6.1]: ${REPO}/releases/tag/v1.6.1
`;

describe('bumpVersion (#25)', () => {
  it.each([
    ['1.6.1', 'patch', '1.6.2'],
    ['1.6.1', 'minor', '1.7.0'],
    ['1.6.1', 'major', '2.0.0'],
    ['0.9.9', 'minor', '0.10.0'],
  ])('%s + %s = %s', (version, kind, expected) => {
    expect(bumpVersion(version, kind)).toBe(expected);
  });

  it('rejects an unknown bump or a non-semver version', () => {
    expect(() => bumpVersion('1.6.1', 'huge')).toThrow(/patch, minor or major/);
    expect(() => bumpVersion('1.6', 'patch')).toThrow(/1\.6/);
  });
});

describe('cutRelease (#25)', () => {
  const released = cutRelease(changelog, { version: '1.6.2', previous: '1.6.1', date: '2026-10-11', repoUrl: REPO });

  it('turns [Unreleased] into the dated version section', () => {
    expect(released).toContain('## [1.6.2] - 2026-10-11\n\n### Fixed\n- Esc closes menus first.');
  });

  it('starts a new, empty [Unreleased] section above it', () => {
    expect(released).toContain('## [Unreleased]\n\n## [1.6.2] - 2026-10-11');
  });

  it('keeps older releases untouched', () => {
    expect(released).toContain('## [1.6.1] - 2026-10-10\n\n### Changed\n- Docs.');
  });

  it('updates the comparison links', () => {
    expect(released).toContain(`[Unreleased]: ${REPO}/compare/v1.6.2...HEAD\n[1.6.2]: ${REPO}/compare/v1.6.1...v1.6.2\n[1.6.1]:`);
  });

  it('refuses to release when nothing is unreleased', () => {
    expect(() => cutRelease(released, { version: '1.6.3', previous: '1.6.2', date: '2026-10-12', repoUrl: REPO })).toThrow(
      /\[Unreleased\] is empty/,
    );
  });

  it('refuses a changelog without an [Unreleased] section', () => {
    expect(() => cutRelease('# Changelog\n', { version: '1.0.1', previous: '1.0.0', date: '2026-01-01', repoUrl: REPO })).toThrow(
      /no \[Unreleased\] section/,
    );
  });
});

describe('releaseNotes (#25)', () => {
  it('returns the body of a version section without its heading', () => {
    expect(releaseNotes(changelog, '1.6.1')).toBe('### Changed\n- Docs.');
  });

  it('fails for a version that is not in the changelog', () => {
    expect(() => releaseNotes(changelog, '9.9.9')).toThrow(/9\.9\.9/);
  });
});
