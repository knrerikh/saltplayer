const STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; min-height: 100dvh; padding: 24px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px;
    background: #1a1a1a; color: #fff;
    font: 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    -webkit-tap-highlight-color: transparent; touch-action: manipulation;
  }
  h1 { margin: 0; max-width: 100%; font-size: 20px; font-weight: 500; text-align: center; overflow-wrap: anywhere; }
  #time { font-size: 28px; font-variant-numeric: tabular-nums; color: #b0b0b0; }
  #timeline { width: 100%; max-width: 480px; height: 44px; margin: 0; accent-color: #4a9eff; }
  #timeline:disabled { opacity: 0.4; }
  #controls { display: flex; align-items: center; justify-content: center; gap: 12px; }
  button { border: 0; background: #4a9eff; color: #fff; line-height: 1; }
  button:active { background: #3a8eef; }
  button:disabled { background: #3a3a3a; color: #b0b0b0; }
  .skip, .step { width: 56px; height: 56px; border-radius: 50%; font-size: 16px; font-variant-numeric: tabular-nums; }
  #toggle { width: 120px; height: 120px; border-radius: 50%; font-size: 48px; }
  #episodes { display: flex; align-items: center; gap: 12px; width: 100%; max-width: 480px; }
  #episodes[hidden] { display: none; }
  #episode-list {
    flex: 1; min-width: 0; height: 56px; padding: 0 12px; border: 0; border-radius: 28px;
    background: #3a3a3a; color: #fff; font-size: 16px; text-overflow: ellipsis;
  }
  #episode-list:disabled { opacity: 0.4; }
  #volume-row { display: flex; align-items: center; gap: 12px; width: 100%; max-width: 480px; }
  #volume { flex: 1; min-width: 0; height: 44px; margin: 0; accent-color: #4a9eff; }
  #options { display: flex; align-items: center; justify-content: center; gap: 12px; }
  .option { min-width: 56px; height: 56px; padding: 0 20px; border-radius: 28px; font-size: 16px; }
  .option[aria-pressed='true'] { background: #3a3a3a; }
  #close { background: #c0392b; }
  #close:active { background: #a93226; }
  #close:disabled { background: #3a3a3a; }
  #connection { font-size: 14px; color: #b0b0b0; }
  #connection[data-state='connected'] { color: #4aff4a; }
  #connection[data-state='off'] { color: #ff4a4a; }
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
    toggle.textContent = state.isPlaying ? '\\u23F8' : '\\u25B6';
    toggle.setAttribute('aria-label', state.isPlaying ? 'Pause' : 'Play');
    toggle.disabled = !state.hasVideo;
    muted = state.muted;
    if (!volumeDragging) volume.value = String(Math.round(state.volume * 100));
    mute.textContent = muted ? '\\u{1F507}' : '\\u{1F50A}';
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
  });
  timeline.addEventListener('change', () => {
    dragging = false;
    send({ type: 'seek-to', time: Number(timeline.value) });
  });

  volume.addEventListener('input', () => { volumeDragging = true; });
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
<h1 id="title">Nothing is playing</h1>
<div id="time">0:00 / 0:00</div>
<input id="timeline" type="range" min="0" max="0" step="1" value="0" aria-label="Position" disabled>
<div id="controls">
  <button class="skip" type="button" data-seconds="-30" aria-label="Back 30 seconds" disabled>−30</button>
  <button class="skip" type="button" data-seconds="-10" aria-label="Back 10 seconds" disabled>−10</button>
  <button id="toggle" type="button" aria-label="Play" disabled>▶</button>
  <button class="skip" type="button" data-seconds="10" aria-label="Forward 10 seconds" disabled>+10</button>
  <button class="skip" type="button" data-seconds="30" aria-label="Forward 30 seconds" disabled>+30</button>
</div>
<div id="episodes" hidden>
  <button id="previous" class="step" type="button" aria-label="Previous episode" disabled>⏮</button>
  <select id="episode-list" aria-label="Episode" disabled></select>
  <button id="next" class="step" type="button" aria-label="Next episode" disabled>⏭</button>
</div>
<div id="volume-row">
  <button id="mute" class="option" type="button" aria-label="Mute">🔊</button>
  <input id="volume" type="range" min="0" max="100" step="1" value="100" aria-label="Volume">
</div>
<div id="options">
  <button id="fullscreen" class="option" type="button" aria-pressed="false" disabled>Fullscreen</button>
  <button id="close" class="option" type="button" disabled>Close video</button>
</div>
<div id="connection" data-state="reconnecting">Reconnecting…</div>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>
`;
}
