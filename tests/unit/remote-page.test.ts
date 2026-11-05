import { describe, it, expect, beforeEach, vi } from 'vitest';
import { remotePage } from '@/main/remote-control/remote-page';
import { rootBlock, fontStack } from '@/shared/theme';
import { icons, iconViewBox } from '@/shared/icons';

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

/** Loads the page without its script, so the markup and the CSS can be inspected. */
const loadMarkup = () => {
  const html = remotePage('nonce');
  document.documentElement.innerHTML = html.replace(/<script[\s\S]*<\/script>/, '');
  return { html, css: /<style nonce="nonce">([\s\S]*?)<\/style>/.exec(html)![1] };
};

describe('remote page look', () => {
  it("takes the player's palette and font from the shared theme", () => {
    const { css } = loadMarkup();

    expect(css).toContain(rootBlock());
    expect(css).toContain(fontStack);
  });

  it('colours the player background and text from the tokens, not literals', () => {
    const { css } = loadMarkup();

    const rules = css.replace(rootBlock(), '');
    expect(rules).toMatch(/background: var\(--bg-primary\)/);
    expect(rules).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });

  it('gives buttons the translucent fill and never a solid accent or red one at rest', () => {
    const { css } = loadMarkup();
    const rule = (selector: string) => new RegExp(`(?:^|\\n)\\s*${selector.replace(/[.#[\]'=()]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

    expect(rule('button')).toContain('var(--control-fill)');
    expect(rule('button')).not.toContain('var(--accent)');
    expect(rule('#close')).not.toMatch(/--error|#c0392b/);
    expect(rule('#close:active')).toContain('var(--error)');
  });

  it('uses the accent only for the active toggle, the seek fill and focus', () => {
    const { css } = loadMarkup();
    const accentRules = [...css.matchAll(/([^{}]+)\{([^}]*var\(--accent\)[^}]*)\}/g)].map((m) => m[1].trim());

    expect(accentRules.length).toBeGreaterThan(0);
    for (const selector of accentRules) expect(selector).toMatch(/pressed|range|focus|timeline|volume|:root/);
  });

  it('still asks before closing the video', () => {
    const html = remotePage('nonce');
    document.documentElement.innerHTML = html.replace(/<script[\s\S]*<\/script>/, '');
    const script = /<script nonce="nonce">([\s\S]*)<\/script>/.exec(html)![1];
    const fetcher = vi.fn().mockResolvedValue({});
    const confirmer = vi.fn().mockReturnValue(false);
    class Source { static readonly CLOSED = 2; readyState = 1; addEventListener() {} }
    new Function('EventSource', 'fetch', 'location', 'confirm', script)(Source, fetcher, { search: '?t=abc' }, confirmer);
    const close = document.getElementById('close') as HTMLButtonElement;
    close.disabled = false;

    close.click();
    expect(confirmer).toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();

    confirmer.mockReturnValue(true);
    close.click();
    expect(fetcher).toHaveBeenCalledWith('/api/command', expect.objectContaining({ body: JSON.stringify({ type: 'close-video' }) }));
  });
});

describe('remote page icons are the player\'s', () => {
  const drawn = (selector: string) =>
    [...document.querySelectorAll(`${selector} path`)].map((p) => p.getAttribute('d'));

  it('draws every icon from the shared paths', () => {
    loadMarkup();

    expect(drawn('#mute [data-icon="audible"]')).toEqual([...icons.speakerAudible]);
    expect(drawn('#mute [data-icon="muted"]')).toEqual([...icons.speakerMuted]);
    expect(drawn('#toggle [data-icon="play"]')).toEqual([...icons.play]);
    expect(drawn('#toggle [data-icon="pause"]')).toEqual([...icons.pause]);
    expect(drawn('#previous')).toEqual([...icons.previous]);
    expect(drawn('#next')).toEqual([...icons.next]);
    expect(document.querySelector('#mute svg')!.getAttribute('viewBox')).toBe(iconViewBox);
  });
});

describe('remote page layout', () => {
  const landscape = (css: string) => /@media \(orientation: landscape\)\s*\{([\s\S]*)\}\s*$/.exec(css.trim())?.[1] ?? '';

  it('is one column in portrait and two in landscape, by media query alone', () => {
    const { css } = loadMarkup();

    expect(/body\s*\{[^}]*\}/.exec(css)![0]).not.toMatch(/overflow/);
    expect(landscape(css)).toMatch(/grid-template-columns/);
    expect(document.querySelector('#layout > #transport #timeline')).toBeTruthy();
    expect(document.querySelector('#layout > #panel #volume')).toBeTruthy();
    expect(document.querySelector('#panel #episodes')).toBeTruthy();
    expect(document.querySelector('#panel #fullscreen')).toBeTruthy();
    expect(document.querySelector('#panel #close')).toBeTruthy();
  });

  it('keeps transport (title, time, seek, play, skips) apart from the rest', () => {
    loadMarkup();

    for (const id of ['title', 'time', 'timeline', 'toggle']) expect(document.querySelector(`#transport #${id}`)).toBeTruthy();
    expect(document.querySelectorAll('#transport .skip')).toHaveLength(4);
  });

  it('draws the volume vertically in landscape; the horizontal input is the fallback', () => {
    const { css } = loadMarkup();

    expect(landscape(css)).toMatch(/writing-mode:\s*vertical-lr/);
    expect(landscape(css)).toMatch(/direction:\s*rtl/);
    expect(css.replace(landscape(css), '')).not.toMatch(/writing-mode/);
  });

  it('keeps every control at least 44 px', () => {
    const { css } = loadMarkup();
    const rule = (selector: string) => new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(css)![1];

    expect(css).toMatch(/--skip:\s*clamp\(44px/);
    expect(css).toMatch(/--play:\s*clamp\(72px/);
    expect(rule("input\\[type='range'\\]")).toContain('height: 44px');
    expect(rule('#episode-list')).toContain('height: 44px');
    expect(rule('#mute')).toContain('width: 44px');
    expect(rule('\\.option')).toContain('min-height: 44px');
  });

  it('clamps long titles to two lines with an ellipsis', () => {
    const { css } = loadMarkup();
    const h1 = /h1\s*\{([^}]*)\}/.exec(css)![1];

    expect(h1).toMatch(/-webkit-line-clamp:\s*2/);
    expect(h1).toMatch(/text-overflow:\s*ellipsis/);
  });
});
