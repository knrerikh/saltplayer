/**
 * Moves CHANGELOG.md's [Unreleased] section into a new version section and prints
 * the new version. Used by .github/workflows/prepare-release.yml.
 *
 * Usage: node scripts/release/prepare.mjs <patch|minor|major>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { bumpVersion, cutRelease } from './changelog.mjs';

const REPO_URL = 'https://github.com/knrerikh/saltplayer';

const previous = JSON.parse(readFileSync('package.json', 'utf8')).version;
const version = bumpVersion(previous, process.argv[2]);
const date = new Date().toISOString().slice(0, 10);

const changelog = readFileSync('CHANGELOG.md', 'utf8');
writeFileSync('CHANGELOG.md', cutRelease(changelog, { version, previous, date, repoUrl: REPO_URL }));

process.stdout.write(version);
