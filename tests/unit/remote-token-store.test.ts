import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RemoteTokenStore, TOKEN_LIFETIME_MS } from '@/main/remote-control/token-store';

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{22}$/;
const DAY = 24 * 60 * 60 * 1000;
const START = 1_000_000_000_000;

describe('RemoteTokenStore (#74)', () => {
  let dir: string;
  let filePath: string;
  let clock: number;
  const create = () => new RemoteTokenStore(filePath, () => clock);

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-token-test-'));
    filePath = path.join(dir, 'remote-control.json');
    clock = START;
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const writeRecord = (record: unknown) =>
    fs.writeFileSync(filePath, typeof record === 'string' ? record : JSON.stringify(record));

  it('lasts 30 days', () => {
    expect(TOKEN_LIFETIME_MS).toBe(30 * DAY);
  });

  it('issues a token when there is no file, and saves it', async () => {
    const issued = await create().current();

    expect(issued.token).toMatch(TOKEN_FORMAT);
    expect(issued.createdAt).toBe(clock);
    expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).toEqual(issued);
  });

  it('reuses a fresh token, in the same store and in a new one', async () => {
    const store = create();
    const first = await store.current();
    clock += 29 * DAY;

    expect(await store.current()).toEqual(first);
    expect(await create().current()).toEqual(first);
  });

  it('issues a new token at 30 days', async () => {
    const first = await create().current();
    clock += TOKEN_LIFETIME_MS;

    const second = await create().current();

    expect(second.token).not.toBe(first.token);
    expect(second.createdAt).toBe(clock);
    expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).toEqual(second);
  });

  it.each([
    ['corrupt JSON', '{not json'],
    ['something that is not an object', '"token"'],
    ['no token', { createdAt: START }],
    ['a token of the wrong shape', { token: 'short', createdAt: START }],
    ['a token with unsafe characters', { token: 'a&b=c/d e<f>g!h@i#', createdAt: START }],
    ['no creation time', { token: 'AAAAAAAAAAAAAAAAAAAAAA' }],
    ['a creation time that is not a number', { token: 'AAAAAAAAAAAAAAAAAAAAAA', createdAt: '1' }],
    ['a creation time in the future', { token: 'AAAAAAAAAAAAAAAAAAAAAA', createdAt: START + DAY }],
  ])('issues a new token for %s', async (_, record) => {
    writeRecord(record);

    const issued = await create().current();

    expect(issued.token).toMatch(TOKEN_FORMAT);
    expect(issued.token).not.toBe('AAAAAAAAAAAAAAAAAAAAAA');
    expect(issued.createdAt).toBe(clock);
  });

  it('reset() issues and saves a different token at once', async () => {
    const store = create();
    const first = await store.current();
    clock += DAY;

    const second = await store.reset();

    expect(second.token).not.toBe(first.token);
    expect(second.createdAt).toBe(clock);
    expect(await create().current()).toEqual(second);
  });

  it.skipIf(process.platform === 'win32')('saves the file owner-only, also over an existing one', async () => {
    const store = create();
    await store.reset();
    expect(fs.statSync(filePath).mode & 0o777).toBe(0o600);

    fs.chmodSync(filePath, 0o644);
    fs.writeFileSync(`${filePath}.tmp`, 'stale');
    fs.chmodSync(`${filePath}.tmp`, 0o644);
    await store.reset();

    expect(fs.statSync(filePath).mode & 0o777).toBe(0o600);
  });

  it('knows when a token expires', () => {
    expect(RemoteTokenStore.expiresAt({ token: 'x', createdAt: 5 })).toBe(5 + TOKEN_LIFETIME_MS);
  });
});
