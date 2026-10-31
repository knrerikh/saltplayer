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
