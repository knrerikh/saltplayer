/**
 * Pure helpers for the release workflows: version bumps and CHANGELOG.md in
 * Keep a Changelog format with an [Unreleased] section and comparison links.
 */

const BUMPS = ['patch', 'minor', 'major'];

export function bumpVersion(version, kind) {
  if (!BUMPS.includes(kind)) {
    throw new Error(`Bump must be patch, minor or major, got "${kind}"`);
  }
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Not a x.y.z version: "${version}"`);

  const [major, minor, patch] = match.slice(1).map(Number);
  if (kind === 'major') return `${major + 1}.0.0`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The section's text between its heading and the next `## [` heading or the link block. */
function sectionBody(changelog, label) {
  const heading = new RegExp(`^## \\[${escape(label)}\\][^\\n]*\\n`, 'm').exec(changelog);
  if (!heading) return null;
  const start = heading.index + heading[0].length;
  const rest = changelog.slice(start);
  const end = rest.search(/^## \[|^\[[^\]]+\]: /m);
  return { start: heading.index, bodyStart: start, end: start + (end === -1 ? rest.length : end) };
}

/**
 * Moves everything under [Unreleased] into a new `## [version] - date` section,
 * leaves an empty [Unreleased] above it and updates the comparison links.
 */
export function cutRelease(changelog, { version, previous, date, repoUrl }) {
  const unreleased = sectionBody(changelog, 'Unreleased');
  if (!unreleased) throw new Error('CHANGELOG.md has no [Unreleased] section');

  const body = changelog.slice(unreleased.bodyStart, unreleased.end).trim();
  if (!body) throw new Error('[Unreleased] is empty: there is nothing to release');

  const released =
    changelog.slice(0, unreleased.start) +
    `## [Unreleased]\n\n## [${version}] - ${date}\n\n${body}\n\n` +
    changelog.slice(unreleased.end);

  return released.replace(
    /^\[Unreleased\]: .*$/m,
    `[Unreleased]: ${repoUrl}/compare/v${version}...HEAD\n[${version}]: ${repoUrl}/compare/v${previous}...v${version}`,
  );
}

/** The body of a released version's section, used as GitHub release notes. */
export function releaseNotes(changelog, version) {
  const section = sectionBody(changelog, version);
  if (!section) throw new Error(`CHANGELOG.md has no section for ${version}`);
  return changelog.slice(section.bodyStart, section.end).trim();
}
