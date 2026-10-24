# Salt Player User Guide

## Opening a video

- **Magnet link:** paste it into the input field and press <kbd>Enter</kbd> or click **Load**. **File → Open URL…** (<kbd>⌘U</kbd> / <kbd>Ctrl+U</kbd>) jumps to that field, or, while a video plays, asks for the link in a small dialog.
- **Torrent file:** drop a `.torrent` file onto the window, click **Open File**, or choose **File → Open File…** (<kbd>⌘O</kbd> / <kbd>Ctrl+O</kbd>).
- **Video file from disk:** drop it onto the window, click **Open File**, or choose **File → Open File…**. It plays at once, with the same audio transcoding, track menus and subtitles as a torrent; the status bar shows its name and size. If you drop several files, the first video or `.torrent` among them is opened.

For a torrent, Salt Player fetches its metadata, picks the main video file and starts playing as soon as enough data is buffered. If no peers can be reached within 60 seconds, loading stops with a timeout error; try a magnet with more seeders. Public fallback trackers are added to every torrent automatically.

- **Again:** **File → Open Recent** lists the last 10 torrents and files you opened, newest first. On macOS, files from disk also appear in the Dock icon's menu, and dropping a file on the Dock icon opens it.

Opening something new from the menu replaces the video that is playing. **File → Close Video** (<kbd>⌘W</kbd> / <kbd>Ctrl+W</kbd>) returns to the start screen.

Recognised video files: MP4, MKV, WebM, MOV, M4V, AVI, FLV, WMV. Video is played as-is, so files whose video codec Chromium cannot decode (common in AVI, FLV and WMV) will not play.

## Playback

| Action | How |
| --- | --- |
| Play / pause | <kbd>Space</kbd> (ignored while typing in a field), click the video, or the play button |
| Seek | Click the progress bar |
| Volume | Volume slider |
| Fullscreen | Fullscreen button, **View → Toggle Full Screen**, or the green window button on macOS; <kbd>Esc</kbd> leaves either |
| Close the video | ✕ in the top corner |

While a video plays, the controls and cursor hide after 2.5 seconds without mouse movement. Move the mouse to bring them back. They stay visible while the video is paused, while a menu is open, or while the pointer rests on the controls.

### Audio tracks

If the file has several audio tracks, pick one from the audio menu in the control bar. Audio in AC3, E-AC3, DTS, TrueHD or Vorbis is transcoded to AAC on the fly. Switching tracks or seeking in a transcoded file restarts the stream from the current position, which takes a moment.

### Subtitles

Subtitle tracks embedded in the file are listed in the subtitle menu. The selected track is extracted when you choose it. <kbd>Esc</kbd> or a click outside closes either menu.

### Resuming

A file you open again continues where you stopped, 10 seconds earlier to pick up the scene, and *Resumed from 23:14* appears for a moment; **Start over** plays it from the beginning. A season opens at the episode you watched last, or at the next one if you finished it. Files you watched to the end, or stopped within the first 30 seconds, start from the beginning.

Turn this off with **Playback → Resume Playback**: everything then starts from the beginning and nothing is recorded.

### Series

For a torrent with several video files, choose the episode from the list in the title bar, or use the previous / next buttons beside play. Only the episode you are watching is downloaded, about five minutes ahead of where you are, plus the first few megabytes of the next one during the last two minutes, so it starts without a long wait. Pausing stops the download once those minutes are in. Switching to another episode frees the disk space of the one you left.

When an episode is about to end, *Next episode in 5 s* appears in the corner and the next episode starts when the video ends. **Play now** switches at once; **Cancel** or <kbd>Esc</kbd> lets this episode end normally (in fullscreen, <kbd>Esc</kbd> cancels first and leaves fullscreen on the next press). The countdown follows the video, so pausing holds it. After the last episode, playback stops. Fullscreen stays on across the switch.

Turn this off with **Playback → Autoplay Next Episode**. The choice is remembered.

## Keyboard shortcuts

| Action | macOS | Windows / Linux |
| --- | --- | --- |
| Play / pause | <kbd>Space</kbd> | <kbd>Space</kbd> |
| Open File… | <kbd>⌘O</kbd> | <kbd>Ctrl+O</kbd> |
| Open URL… | <kbd>⌘U</kbd> | <kbd>Ctrl+U</kbd> |
| Close Video | <kbd>⌘W</kbd> | <kbd>Ctrl+W</kbd> |
| Toggle fullscreen | <kbd>⌃⌘F</kbd> | <kbd>F11</kbd> |
| Close a menu or dialog, cancel the next-episode countdown, leave fullscreen | <kbd>Esc</kbd> | <kbd>Esc</kbd> |
| Quit | <kbd>⌘Q</kbd> | <kbd>Ctrl+Q</kbd> (Linux), <kbd>Alt+F4</kbd> (Windows) |

The **Help** menu links to this guide, the issue tracker and the latest release notes.

## Status bar

The status bar at the bottom of the window shows the torrent name, the size of the file playing (the episode, for a season), its progress, download and upload speed, connected peers and the amount downloaded. The download speed is green when it keeps up with the video's bitrate, yellow when it is slightly below, and red when buffering is likely. Speeds under 2 KB/s show as 0: that is peers exchanging protocol messages, not video downloading, as when the video is paused and the next few minutes are already in. It is hidden in fullscreen.

## Privacy and storage

- No accounts, no telemetry.
- Torrent pieces are stored in a temporary folder for the current session and deleted when you quit; an episode you switch away from is deleted from it at once. Folders left behind by a crash are removed on the next launch. Finder may show the files there at their full size: they are sparse, and only the downloaded parts take up space.
- One torrent plays at a time; no video data is kept.
- Three small files are kept between launches, in the app's data folder (`~/Library/Application Support/saltplayer` on macOS, `%APPDATA%\saltplayer` on Windows, `~/.config/saltplayer` on Linux):
  - `recent-sources.json`, the **Open Recent** list: the names and sources (magnet links, torrent URLs, file paths) of the last 10 things you opened. **File → Open Recent → Clear Menu** empties it, along with the system's recent documents for the app.
  - `watch-history.json`, where you stopped each file (the last 200): the torrent's info hash or the file's path, the file name and the position. It is a watch history: **Clear Menu** forgets it together with the recent list, and **Playback → Resume Playback** off stops recording it.
  - `settings.json`, your preferences, such as **Autoplay Next Episode**. It holds nothing about what you watched.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| *Torrent load timed out* | No reachable peers within 60 s. Try another magnet with more seeders. |
| Constant buffering | Few seeders or a slow connection; watch the speed colour in the status bar. |
| *No video file found in torrent* | The torrent contains no recognised video file. |
| macOS says the app can't be opened | The build is not notarised. Right-click the app and choose **Open**, or run `xattr -dr com.apple.quarantine "/Applications/Salt Player.app"`. |

## Legal notice

Salt Player is a neutral tool. You are responsible for having the right to access the content you play. Respect copyright law in your jurisdiction.
