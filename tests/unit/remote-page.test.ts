import { describe, it, expect, beforeEach, vi } from 'vitest';
import { remotePage } from '@/main/remote-control/remote-page';

/** A stand-in for the browser's EventSource: the test decides when the stream fails. */
class FakeEventSource {
  static readonly CLOSED = 2;
  readyState = 1;
  private readonly listeners = new Map<string, () => void>();
  constructor(readonly url: string) {}
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, listener);
  }
  fail(readyState: number) {
    this.readyState = readyState;
    this.listeners.get('error')?.();
  }
}

describe('remote page connection messages (#74)', () => {
  let source: FakeEventSource;
  let probe: ReturnType<typeof vi.fn>;
  const connection = () => document.getElementById('connection')!;

  /** Runs the page's script against the fakes, as the phone's browser would. */
  beforeEach(() => {
    const html = remotePage('nonce');
    document.documentElement.innerHTML = html.replace(/<script[\s\S]*<\/script>/, '');
    const script = /<script nonce="nonce">([\s\S]*)<\/script>/.exec(html)![1];
    probe = vi.fn();
    class Source extends FakeEventSource {
      constructor(url: string) {
        super(url);
        source = this;
      }
    }
    new Function('EventSource', 'fetch', 'location', 'confirm', script)(Source, probe, { search: '?t=abc' }, vi.fn());
  });

  it('opens the event stream with the token', () => {
    expect(source.url).toBe('/api/events?t=abc');
  });

  it('says it is reconnecting while the browser retries by itself', () => {
    source.fail(0);

    expect(connection().textContent).toBe('Reconnecting…');
    expect(probe).not.toHaveBeenCalled();
  });

  it('says the link expired or was reset when the server answers 401 to the closed stream', async () => {
    probe.mockResolvedValue({ status: 401 });

    source.fail(FakeEventSource.CLOSED);
    await vi.waitFor(() => expect(connection().dataset.state).toBe('off'));

    expect(probe).toHaveBeenCalledWith('/?t=abc', { cache: 'no-store' });
    expect(connection().textContent).toBe('This link has expired or was reset — scan the new code');
  });

  it('says the remote is off when the server does not answer', async () => {
    probe.mockRejectedValue(new TypeError('Failed to fetch'));

    source.fail(FakeEventSource.CLOSED);
    await vi.waitFor(() => expect(connection().dataset.state).toBe('off'));

    expect(connection().textContent).toBe('Remote control is off');
  });

  it('says the remote is off when the server answers with anything but 401', async () => {
    probe.mockResolvedValue({ status: 503 });

    source.fail(FakeEventSource.CLOSED);
    await vi.waitFor(() => expect(connection().dataset.state).toBe('off'));

    expect(connection().textContent).toBe('Remote control is off');
  });
});

describe('remote page icons', () => {
  const state = (patch: object) => ({
    hasVideo: true, title: 'Film', duration: 100, currentTime: 0, isPlaying: false, muted: false,
    volume: 1, isFullscreen: false, episodes: [], episodeIndex: 0, hasPrevious: false, hasNext: false, ...patch,
  });
  let listeners: Map<string, (event: { data: string }) => void>;

  beforeEach(() => {
    const html = remotePage('nonce');
    document.documentElement.innerHTML = html.replace(/<script[\s\S]*<\/script>/, '');
    const script = /<script nonce="nonce">([\s\S]*)<\/script>/.exec(html)![1];
    listeners = new Map();
    class Source {
      static readonly CLOSED = 2;
      readyState = 1;
      addEventListener(type: string, listener: (event: { data: string }) => void) {
        listeners.set(type, listener);
      }
    }
    new Function('EventSource', 'fetch', 'location', 'confirm', script)(Source, vi.fn(), { search: '' }, vi.fn());
  });

  const push = (patch: object) => listeners.get('state')!({ data: JSON.stringify(state(patch)) });
  const visible = (id: string) =>
    [...document.querySelectorAll(`#${id} .icon`)]
      .filter((icon) => !icon.hasAttribute('hidden'))
      .map((icon) => (icon as unknown as HTMLElement).dataset.icon);
  const label = (id: string) => document.getElementById(id)!.getAttribute('aria-label');

  it('shows play while paused and pause while playing, with a matching label', () => {
    expect(visible('toggle')).toEqual(['play']);

    push({ isPlaying: true });
    expect(visible('toggle')).toEqual(['pause']);
    expect(label('toggle')).toBe('Pause');

    push({ isPlaying: false });
    expect(visible('toggle')).toEqual(['play']);
    expect(label('toggle')).toBe('Play');
  });

  it('shows the speaker while audible and the crossed one while muted, with a matching label', () => {
    expect(visible('mute')).toEqual(['audible']);

    push({ muted: true });
    expect(visible('mute')).toEqual(['muted']);
    expect(label('mute')).toBe('Unmute');

    push({ muted: false });
    expect(visible('mute')).toEqual(['audible']);
    expect(label('mute')).toBe('Mute');
  });

  it('labels the fullscreen button with its state in text', () => {
    push({ isFullscreen: true });

    expect(document.getElementById('fullscreen')!.textContent).toBe('Exit fullscreen');
  });

  it('draws the episode buttons as SVG', () => {
    for (const id of ['previous', 'next']) expect(document.querySelectorAll(`#${id} svg`)).toHaveLength(1);
  });

  it('has no emoji or symbol characters', () => {
    expect(remotePage('nonce')).not.toMatch(/\p{Extended_Pictographic}|[⏭⏮⏸▶]/u);
  });
});
