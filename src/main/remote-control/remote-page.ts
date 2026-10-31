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
  #toggle {
    width: 160px; height: 160px; border: 0; border-radius: 50%;
    background: #4a9eff; color: #fff; font-size: 64px; line-height: 1;
  }
  #toggle:active { background: #3a8eef; }
  #toggle:disabled { background: #3a3a3a; color: #b0b0b0; }
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

  const render = (state) => {
    title.textContent = state.hasVideo ? (state.title || 'Playing') : 'Nothing is playing';
    time.textContent = clock(state.currentTime) + ' / ' + clock(state.duration);
    toggle.textContent = state.isPlaying ? '\\u23F8' : '\\u25B6';
    toggle.setAttribute('aria-label', state.isPlaying ? 'Pause' : 'Play');
    toggle.disabled = !state.hasVideo;
  };

  toggle.addEventListener('click', () => {
    fetch('/api/command', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'toggle-play' }),
    }).catch(() => showConnection('reconnecting', 'Reconnecting\\u2026'));
  });

  const events = new EventSource('/api/events?t=' + encodeURIComponent(token));
  events.addEventListener('open', () => showConnection('connected', 'Connected'));
  events.addEventListener('state', (event) => render(JSON.parse(event.data)));
  events.addEventListener('error', () => {
    // The browser retries by itself while the stream is only interrupted; a closed one
    // means the server refused it or was turned off.
    if (events.readyState === EventSource.CLOSED) showConnection('off', 'Remote control is off');
    else showConnection('reconnecting', 'Reconnecting\\u2026');
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
<button id="toggle" type="button" aria-label="Play" disabled>▶</button>
<div id="connection" data-state="reconnecting">Reconnecting…</div>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>
`;
}
