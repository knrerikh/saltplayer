import { fontStack, rootBlock } from '@/shared/theme';
import { icons, iconViewBox, type IconName } from '@/shared/icons';

const THUMB = '24px';

/** The player's look at touch size. Colours come from shared/theme.ts, the layout from media queries alone. */
const STYLE = `
  ${rootBlock()}
  :root { color-scheme: dark; --skip: clamp(44px, 13vw, 56px); --play: clamp(72px, 24vw, 96px); --gap: clamp(8px, 2.4dvh, 20px); }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; min-height: 100dvh;
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    display: flex; align-items: center; justify-content: center;
    background: var(--bg-primary); color: var(--text-primary);
    font: 16px ${fontStack};
    -webkit-font-smoothing: antialiased; -webkit-tap-highlight-color: transparent; touch-action: manipulation;
  }
  #layout { display: flex; flex-direction: column; gap: var(--gap); width: 100%; max-width: 440px; }
  #transport, #panel, #side { display: flex; flex-direction: column; align-items: center; gap: var(--gap); min-width: 0; }
  #panel, #side { width: 100%; }
  h1 {
    margin: 0; max-width: 100%; font-size: 20px; font-weight: 500; line-height: 1.25; text-align: center; overflow-wrap: anywhere;
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; text-overflow: ellipsis;
  }
  #time { font-size: 24px; font-variant-numeric: tabular-nums; color: var(--text-secondary); }
  button { display: flex; align-items: center; justify-content: center; border: 0; background: var(--control-fill); color: var(--text-primary); line-height: 1; font: inherit; }
  button:active { background: var(--control-fill-active); }
  button:disabled, select:disabled, input:disabled { opacity: 0.4; }
  button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  input[type='range'] {
    -webkit-appearance: none; appearance: none; width: 100%; height: 44px; margin: 0; background: transparent;
    --fill: 0%; --fill-direction: to right;
  }
  input[type='range']::-webkit-slider-runnable-track {
    height: 6px; border-radius: 3px;
    background: linear-gradient(var(--fill-direction), var(--accent) var(--fill), var(--control-fill-active) var(--fill));
  }
  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none; width: ${THUMB}; height: ${THUMB}; margin-top: -9px; border-radius: 50%; border: 0; background: var(--text-primary);
  }
  input[type='range']::-moz-range-track { height: 6px; border-radius: 3px; background: var(--control-fill-active); }
  input[type='range']::-moz-range-progress { height: 6px; border-radius: 3px; background: var(--accent); }
  input[type='range']::-moz-range-thumb { width: ${THUMB}; height: ${THUMB}; border: 0; border-radius: 50%; background: var(--text-primary); }
  #controls { display: flex; align-items: center; justify-content: center; gap: clamp(4px, 1.6vw, 10px); }
  .skip, .step { width: var(--skip); height: var(--skip); border-radius: 50%; font-size: 14px; font-variant-numeric: tabular-nums; }
  #toggle { width: var(--play); height: var(--play); border-radius: 50%; }
  .icon { width: 24px; height: 24px; fill: currentColor; }
  .icon[hidden] { display: none; }
  #toggle .icon { width: 40px; height: 40px; }
  #episodes { display: flex; align-items: center; gap: 10px; width: 100%; }
  #episodes[hidden] { display: none; }
  #episode-list {
    flex: 1; min-width: 0; height: 44px; padding: 0 16px; border: 0; border-radius: 22px;
    background: var(--control-fill); color: var(--text-primary); font-size: 16px; text-overflow: ellipsis;
  }
  #episode-list option { background: var(--bg-secondary); }
  #volume-row { display: flex; align-items: center; gap: 4px; width: 100%; height: 52px; padding: 0 16px 0 4px; border-radius: 26px; background: var(--control-fill); }
  #mute { flex: none; width: 44px; height: 44px; border-radius: 50%; background: transparent; }
  #mute:active { background: var(--control-fill-active); }
  #volume { flex: 1; min-width: 0; }
  #options { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; }
  .option { flex: 1; min-height: 44px; padding: 0 16px; border-radius: 22px; font-size: 16px; }
  .option[aria-pressed='true'] { background: var(--accent); }
  #close:active { background: var(--error); }
  #connection { text-align: center; font-size: 14px; color: var(--text-secondary); }
  #connection[data-state='connected'] { color: var(--success); }
  #connection[data-state='off'] { color: var(--error); }

  @media (orientation: landscape) {
    :root { --play: 72px; --gap: clamp(8px, 2.4dvh, 16px); }
    #layout { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); column-gap: 16px; align-items: center; max-width: 720px; }
    h1 { font-size: 18px; }
    #time { font-size: 20px; }
    #connection { grid-column: 1 / -1; }
    #panel { flex-direction: row; align-items: stretch; }
    #side { flex: 1; justify-content: center; }
    #episodes { display: grid; grid-template-columns: 1fr 1fr; }
    #episodes[hidden] { display: none; }
    #episode-list { grid-column: 1 / -1; grid-row: 1; }
    #options { flex-direction: column; }
    .option { width: 100%; }
    #volume-row { flex: none; flex-direction: column; width: 52px; height: auto; min-height: clamp(140px, 65dvh, 240px); padding: 4px 0 12px; }
    #volume { writing-mode: vertical-lr; direction: rtl; flex: 1; width: 44px; min-height: 0; --fill-direction: to top; }
    #volume::-webkit-slider-runnable-track { width: 6px; }
    #volume::-webkit-slider-thumb { margin-top: 0; margin-left: -9px; }
  }
`;

/** Titles come from torrents, so the script only ever sets textContent. */
const SCRIPT = `
  const token = new URLSearchParams(location.search).get('t') || '';
  const title = document.getElementById('title');
  const time = document.getElementById('time');
  const toggle = document.getElementById('toggle');
  const timeline = document.getElementById('timeline');
  const volume = document.getElementById('volume');
  const mute = document.getElementById('mute');
  const fullscreen = document.getElementById('fullscreen');
  const close = document.getElementById('close');
  const episodes = document.getElementById('episodes');
  const episodeList = document.getElementById('episode-list');
  const previous = document.getElementById('previous');
  const next = document.getElementById('next');
  const skips = document.querySelectorAll('.skip');
  let duration = 0;
  let dragging = false;
  let volumeDragging = false;
  let muted = false;
  const connection = document.getElementById('connection');

  const clock = (seconds) => {
    const whole = Math.max(0, Math.floor(seconds || 0));
    const h = Math.floor(whole / 3600);
    const mm = String(Math.floor((whole % 3600) / 60)).padStart(h > 0 ? 2 : 1, '0');
    const ss = String(whole % 60).padStart(2, '0');
    return (h > 0 ? h + ':' : '') + mm + ':' + ss;
  };

  // Each icon button holds all its states as inline SVGs; only the one named here is visible.
  const showIcon = (button, name) => {
    button.querySelectorAll('.icon').forEach((icon) => icon.toggleAttribute('hidden', icon.dataset.icon !== name));
  };

  // WebKit cannot colour the played part of a range natively, so the CSS draws it from --fill.
  const showFill = (input) => {
    const span = Number(input.max) - Number(input.min);
    input.style.setProperty('--fill', (span > 0 ? ((Number(input.value) - Number(input.min)) / span) * 100 : 0) + '%');
  };
  showFill(volume);

  const showConnection = (state, text) => {
    connection.dataset.state = state;
    connection.textContent = text;
  };

  const showTime = (seconds) => {
    time.textContent = clock(seconds) + ' / ' + clock(duration);
  };

  const send = (command) => {
    fetch('/api/command', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    }).catch(() => showConnection('reconnecting', 'Reconnecting\\u2026'));
  };

  const showEpisodes = (state) => {
    episodes.hidden = state.episodes.length === 0;
    if (episodeList.length !== state.episodes.length || state.episodes.some((name, i) => episodeList.options[i].textContent !== name)) {
      episodeList.replaceChildren(...state.episodes.map((name) => {
        const option = document.createElement('option');
        option.textContent = name;
        return option;
      }));
    }
    episodeList.selectedIndex = state.episodeIndex;
    episodeList.disabled = !state.hasVideo;
    previous.disabled = !state.hasVideo || !state.hasPrevious;
    next.disabled = !state.hasVideo || !state.hasNext;
  };

  const render = (state) => {
    title.textContent = state.hasVideo ? (state.title || 'Playing') : 'Nothing is playing';
    duration = state.duration;
    const canSeek = state.hasVideo && duration > 0;
    timeline.disabled = !canSeek;
    skips.forEach((button) => { button.disabled = !canSeek; });
    timeline.max = String(duration);
    // The thumb stays under the finger; the next state after the release moves it.
    if (!dragging) {
      timeline.value = String(state.currentTime);
      showTime(state.currentTime);
    }
    showFill(timeline);
    showIcon(toggle, state.isPlaying ? 'pause' : 'play');
    toggle.setAttribute('aria-label', state.isPlaying ? 'Pause' : 'Play');
    toggle.disabled = !state.hasVideo;
    muted = state.muted;
    if (!volumeDragging) volume.value = String(Math.round(state.volume * 100));
    showFill(volume);
    showIcon(mute, muted ? 'muted' : 'audible');
    mute.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    fullscreen.setAttribute('aria-pressed', String(state.isFullscreen));
    fullscreen.textContent = state.isFullscreen ? 'Exit fullscreen' : 'Fullscreen';
    fullscreen.disabled = !state.hasVideo;
    close.disabled = !state.hasVideo;
    showEpisodes(state);
  };

  toggle.addEventListener('click', () => send({ type: 'toggle-play' }));
  skips.forEach((button) => {
    button.addEventListener('click', () => send({ type: 'seek-by', seconds: Number(button.dataset.seconds) }));
  });
  timeline.addEventListener('input', () => {
    dragging = true;
    showTime(Number(timeline.value));
    showFill(timeline);
  });
  timeline.addEventListener('change', () => {
    dragging = false;
    send({ type: 'seek-to', time: Number(timeline.value) });
  });

  volume.addEventListener('input', () => {
    volumeDragging = true;
    showFill(volume);
  });
  volume.addEventListener('change', () => {
    volumeDragging = false;
    send({ type: 'set-volume', volume: Number(volume.value) / 100 });
  });
  previous.addEventListener('click', () => send({ type: 'previous-episode' }));
  next.addEventListener('click', () => send({ type: 'next-episode' }));
  episodeList.addEventListener('change', () => {
    send({ type: 'select-episode', name: episodeList.options[episodeList.selectedIndex].textContent });
  });
  mute.addEventListener('click', () => send({ type: 'set-muted', muted: !muted }));
  fullscreen.addEventListener('click', () => send({ type: 'toggle-fullscreen' }));
  close.addEventListener('click', () => {
    if (confirm('Close the video?')) send({ type: 'close-video' });
  });

  const events = new EventSource('/api/events?t=' + encodeURIComponent(token));
  events.addEventListener('open', () => showConnection('connected', 'Connected'));
  events.addEventListener('state', (event) => render(JSON.parse(event.data)));
  events.addEventListener('error', () => {
    // The browser retries by itself while the stream is only interrupted; a closed one
    // means the server refused it. Only the server can tell why: it answers 401 when the
    // link expired or was reset, and does not answer when the remote is off.
    if (events.readyState !== EventSource.CLOSED) return showConnection('reconnecting', 'Reconnecting\\u2026');
    fetch('/?t=' + encodeURIComponent(token), { cache: 'no-store' }).then(
      (response) => showConnection('off', response.status === 401
        ? 'This link has expired or was reset \\u2014 scan the new code'
        : 'Remote control is off'),
      () => showConnection('off', 'Remote control is off'),
    );
  });
`;

/** An inline SVG drawn from the paths the player uses; `state` names it for the script's showIcon(). */
function icon(name: IconName, state?: string, hidden = false): string {
  const paths = icons[name].map((d) => `<path d="${d}"/>`).join('');
  return `<svg class="icon"${state ? ` data-icon="${state}"` : ''} viewBox="${iconViewBox}" aria-hidden="true"${hidden ? ' hidden' : ''}>${paths}</svg>`;
}

/** The remote as one self-contained page: no external requests, and every inline block carries the CSP nonce. */
export function remotePage(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Salt Player Remote</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<main id="layout">
  <section id="transport">
    <h1 id="title">Nothing is playing</h1>
    <div id="time">0:00 / 0:00</div>
    <input id="timeline" type="range" min="0" max="0" step="1" value="0" aria-label="Position" disabled>
    <div id="controls">
      <button class="skip" type="button" data-seconds="-30" aria-label="Back 30 seconds" disabled>−30</button>
      <button class="skip" type="button" data-seconds="-10" aria-label="Back 10 seconds" disabled>−10</button>
      <button id="toggle" type="button" aria-label="Play" disabled>
        ${icon('play', 'play')}
        ${icon('pause', 'pause', true)}
      </button>
      <button class="skip" type="button" data-seconds="10" aria-label="Forward 10 seconds" disabled>+10</button>
      <button class="skip" type="button" data-seconds="30" aria-label="Forward 30 seconds" disabled>+30</button>
    </div>
  </section>
  <section id="panel">
    <div id="volume-row">
      <button id="mute" type="button" aria-label="Mute">
        ${icon('speakerAudible', 'audible')}
        ${icon('speakerMuted', 'muted', true)}
      </button>
      <input id="volume" type="range" min="0" max="100" step="1" value="100" aria-label="Volume">
    </div>
    <div id="side">
      <div id="episodes" hidden>
        <button id="previous" class="step" type="button" aria-label="Previous episode" disabled>${icon('previous')}</button>
        <select id="episode-list" aria-label="Episode" disabled></select>
        <button id="next" class="step" type="button" aria-label="Next episode" disabled>${icon('next')}</button>
      </div>
      <div id="options">
        <button id="fullscreen" class="option" type="button" aria-pressed="false" disabled>Fullscreen</button>
        <button id="close" class="option" type="button" disabled>Close video</button>
      </div>
    </div>
  </section>
  <div id="connection" data-state="reconnecting">Reconnecting…</div>
</main>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>
`;
}
