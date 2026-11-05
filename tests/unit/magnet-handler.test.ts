import { describe, it, expect, vi } from 'vitest';
import { createMagnetLinkHandler, magnetConfirmation } from '@/main/magnet-handler';

const HASH = '0123456789abcdef0123456789abcdef01234567';
const OTHER = 'f'.repeat(40);
const link = (name?: string) => `magnet:?xt=urn:btih:${HASH.toUpperCase()}${name ? `&dn=${name}` : ''}`;

function setup({ isOpen = false, currentInfoHash = null as string | null, confirmed = true } = {}) {
  const deps = {
    isOpen: vi.fn(() => isOpen),
    currentInfoHash: vi.fn(() => currentInfoHash),
    confirm: vi.fn().mockResolvedValue(confirmed),
    open: vi.fn(),
    reveal: vi.fn(),
    warn: vi.fn(),
  };
  return { deps, handle: createMagnetLinkHandler(deps) };
}

describe('magnet link handler (#90)', () => {
  it('opens at once when nothing is open', async () => {
    const { deps, handle } = setup();

    await handle(link('Movie'));

    expect(deps.open).toHaveBeenCalledWith(link('Movie'));
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(deps.reveal).toHaveBeenCalled();
  });

  it('only brings the window forward when the same torrent is open', async () => {
    const { deps, handle } = setup({ isOpen: true, currentInfoHash: HASH });

    await handle(link());

    expect(deps.reveal).toHaveBeenCalled();
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(deps.open).not.toHaveBeenCalled();
  });

  it('asks before replacing another video, and opens it on Open', async () => {
    const { deps, handle } = setup({ isOpen: true, currentInfoHash: OTHER });

    await handle(link('Movie'));

    expect(deps.confirm).toHaveBeenCalledWith('Movie');
    expect(deps.open).toHaveBeenCalledWith(link('Movie'));
  });

  it('asks when a local file is open, which has no info hash', async () => {
    const { deps, handle } = setup({ isOpen: true });

    await handle(link());

    expect(deps.confirm).toHaveBeenCalledWith(null);
    expect(deps.open).toHaveBeenCalled();
  });

  it('keeps playing on Cancel', async () => {
    const { deps, handle } = setup({ isOpen: true, currentInfoHash: OTHER, confirmed: false });

    await handle(link('Movie'));

    expect(deps.open).not.toHaveBeenCalled();
  });

  it('logs and ignores an invalid link without touching the window', async () => {
    const { deps, handle } = setup();

    await handle('magnet:?dn=no-hash');
    await handle(42);

    expect(deps.warn).toHaveBeenCalledTimes(2);
    expect(deps.open).not.toHaveBeenCalled();
    expect(deps.reveal).not.toHaveBeenCalled();
  });

  it('does not log the rejected text, which comes from a website', async () => {
    const { deps, handle } = setup();

    await handle(`magnet:?dn=${'x'.repeat(100)}`);

    expect(deps.warn.mock.calls.join('')).not.toContain('xxxx');
  });

  it('drops a second link while the first is still being asked about', async () => {
    const { deps, handle } = setup({ isOpen: true, currentInfoHash: OTHER });
    let answer: (ok: boolean) => void = () => {};
    deps.confirm.mockReturnValue(new Promise<boolean>((resolve) => (answer = resolve)));

    const first = handle(link('One'));
    await handle(link('Two'));
    answer(true);
    await first;

    expect(deps.confirm).toHaveBeenCalledTimes(1);
    expect(deps.open).toHaveBeenCalledTimes(1);
    expect(deps.open).toHaveBeenCalledWith(link('One'));
  });
});

describe('magnetConfirmation', () => {
  it('names the video and warns that the current one closes, with Cancel as the default', () => {
    expect(magnetConfirmation('Big Buck Bunny')).toMatchObject({
      message: 'Open "Big Buck Bunny"?',
      detail: 'The current video will close.',
      buttons: ['Open', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
  });

  it('falls back to a generic name', () => {
    expect(magnetConfirmation(null).message).toBe('Open "this magnet link"?');
  });
});
