# Salt Player User Guide

## Opening a torrent

- **Magnet link:** paste it into the input field and press <kbd>Enter</kbd> or click **Load**.
- **Torrent file:** drop a `.torrent` file onto the window, or click **Open File**.

Salt Player fetches the torrent's metadata, picks the main video file and starts playing as soon as enough data is buffered. If no peers can be reached within 60 seconds, loading stops with a timeout error; try a magnet with more seeders. Public fallback trackers are added to every torrent automatically.

Recognised video files: MP4, MKV, WebM, MOV, M4V, AVI, FLV, WMV. Video is played as-is, so files whose video codec Chromium cannot decode (common in AVI, FLV and WMV) will not play.

## Playback

| Action | How |
| --- | --- |
| Play / pause | <kbd>Space</kbd> (ignored while typing in a field), click the video, or the play button |
| Seek | Click the progress bar |
| Volume | Volume slider |
| Fullscreen | Fullscreen button, or the green window button on macOS; <kbd>Esc</kbd> leaves either |
| Close the video | ✕ in the top corner |

While a video plays, the controls and cursor hide after 2.5 seconds without mouse movement. Move the mouse to bring them back. They stay visible while the video is paused, while a menu is open, or while the pointer rests on the controls.

### Audio tracks

If the file has several audio tracks, pick one from the audio menu in the control bar. Audio in AC3, E-AC3, DTS, TrueHD or Vorbis is transcoded to AAC on the fly. Switching tracks or seeking in a transcoded file restarts the stream from the current position, which takes a moment.

### Subtitles

Subtitle tracks embedded in the file are listed in the subtitle menu. The selected track is extracted when you choose it. <kbd>Esc</kbd> or a click outside closes either menu.

### Series

For a torrent with several video files, choose the episode from the list in the title bar, or use the previous / next buttons beside play. Only the episode you are watching is downloaded.

## Status bar

The status bar at the bottom of the window shows the torrent name, progress, download and upload speed, connected peers and downloaded size. The download speed is green when it keeps up with the video's bitrate, yellow when it is slightly below, and red when buffering is likely. It is hidden in fullscreen.

## Privacy and storage

- No accounts, no history, no telemetry.
- Torrent pieces are stored in a temporary folder for the current session and deleted when you quit. Folders left behind by a crash are removed on the next launch.
- One torrent plays at a time; nothing is kept permanently.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| *Torrent load timed out* | No reachable peers within 60 s. Try another magnet with more seeders. |
| Constant buffering | Few seeders or a slow connection; watch the speed colour in the status bar. |
| *No video file found in torrent* | The torrent contains no recognised video file. |
| macOS says the app can't be opened | The build is not notarised. Right-click the app and choose **Open**, or run `xattr -dr com.apple.quarantine "/Applications/Salt Player.app"`. |

## Legal notice

Salt Player is a neutral tool. You are responsible for having the right to access the content you play. Respect copyright law in your jurisdiction.
