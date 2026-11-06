import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventEmitter, once } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Server } from 'net';
import { TorrentEngine } from '@/main/torrent';
import { StorageManager } from '@/main/storage';

/** A child process that, like a killed one on Windows, exits some time after kill(). */
class FakeProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;
  exited = false;
  ignoresKill = false;
  kill() {
    this.killed = true;
    if (this.ignoresKill) return true;
    setTimeout(() => {
      this.exited = true;
      this.emit('close', null);
    }, 50);
    return true;
  }
}

const processes: FakeProcess[] = [];

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  const spawn = vi.fn(() => {
    const proc = new FakeProcess();
    processes.push(proc);
    return proc;
  });
  return { ...actual, spawn, default: { ...actual, spawn } };
});

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));

describe('Shutting the engine down', () => {
  let engine: TorrentEngine;
  let dir: string;

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    processes.length = 0;
  });

  async function playLocalMovie(): Promise<void> {
    // Not `saltplayer-*`: StorageManager deletes those as stale sessions, even mid-test.
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-shutdown-test-'));
    const moviePath = path.join(dir, 'Movie.mp4');
    fs.writeFileSync(moviePath, 'bytes');
    engine = new TorrentEngine(new StorageManager());
    await engine.openLocalFile(moviePath);
    const server: Server = (engine as any).server;
    if (!server.listening) await once(server, 'listening');
    await vi.waitFor(() => expect(processes).toHaveLength(1));
  }

  it('destroy() resolves only after the ffprobe it killed has exited', async () => {
    await playLocalMovie();

    await engine.destroy();

    expect(processes[0].killed).toBe(true);
    expect(processes[0].exited).toBe(true);
  });

  it('stop() resolves only after the ffprobe it killed has exited', async () => {
    await playLocalMovie();

    await engine.stop();

    expect(processes[0].exited).toBe(true);
  });

  it('starts no probe once the engine is stopped', async () => {
    await playLocalMovie();
    await engine.stop();

    expect(() => (engine as any).spawnProbe('ffprobe', [])).toThrow();
    expect(processes).toHaveLength(1);
  });

  it('gives up waiting for a probe that ignores the kill, so quitting cannot hang', async () => {
    await playLocalMovie();
    (engine as any).closeTimeoutMs = 100;
    processes[0].ignoresKill = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await engine.destroy();

    expect(processes[0].exited).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ffprobe'));
    warn.mockRestore();
  });
});
