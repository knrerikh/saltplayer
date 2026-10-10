import { describe, it, expect } from 'vitest';
import { isSafeExternalUrl } from '@/main/external-url';

describe('isSafeExternalUrl (#19)', () => {
  it.each([
    'https://github.com/knrerikh/saltplayer/releases',
    'http://127.0.0.1:52345/Movie.mkv',
    'HTTPS://EXAMPLE.COM/',
  ])('allows %s', (url) => {
    expect(isSafeExternalUrl(url)).toBe(true);
  });

  it.each([
    ['a local file', 'file:///etc/passwd'],
    ['a script', 'javascript:alert(1)'],
    ['an SMB share', 'smb://attacker.example/share'],
    ['a custom protocol handler', 'vscode://file/etc/passwd'],
    ['a data URL', 'data:text/html,<script>alert(1)</script>'],
    ['a relative path', '/Applications/Calculator.app'],
    ['garbage', 'not a url'],
    ['an empty string', ''],
  ])('rejects %s', (_, url) => {
    expect(isSafeExternalUrl(url)).toBe(false);
  });

  it.each([undefined, null, 42, { href: 'https://example.com' }])('rejects non-string %p', (value) => {
    expect(isSafeExternalUrl(value)).toBe(false);
  });
});
