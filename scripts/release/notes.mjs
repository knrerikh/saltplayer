/**
 * Prints a version's CHANGELOG.md section, for GitHub release notes.
 *
 * Usage: node scripts/release/notes.mjs <x.y.z>
 */
import { readFileSync } from 'node:fs';
import { releaseNotes } from './changelog.mjs';

process.stdout.write(`${releaseNotes(readFileSync('CHANGELOG.md', 'utf8'), process.argv[2])}\n`);
