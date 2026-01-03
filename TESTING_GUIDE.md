# Testing Guide for Torrent Optimization

## Manual Testing with Multi-Episode Torrent

To verify the torrent optimization feature works correctly with real torrents, follow these steps:

### Prerequisites

1. Build the application:
   ```bash
   npm run build
   npm run package
   ```

2. Find a legal multi-episode torrent for testing. Good sources:
   - Public domain TV shows
   - Creative Commons licensed content
   - Open-source video content

### Test Procedure

#### Test 1: Verify Selective File Download

1. **Launch Salt Player**
2. **Load a multi-episode torrent** (magnet link or .torrent file)
3. **Observe the episode selector** - it should show all available episodes
4. **Monitor download statistics** in the status bar
5. **Expected behavior**:
   - Only the first episode should start downloading
   - Download speed should be focused on one file
   - Other episodes should NOT be downloading

#### Test 2: Verify Fast Playback Start

1. **Load a torrent** with episodes
2. **Start playback** of the first episode
3. **Measure time to playback start**
4. **Expected behavior**:
   - Video should start playing within 5-10 seconds (depending on connection)
   - Initial buffering should be minimal
   - Critical pieces (first 10) download first

#### Test 3: Verify Sequential Download

1. **Start playing an episode**
2. **Observe the progress bar** in the status bar
3. **Try seeking** to different positions in the video
4. **Expected behavior**:
   - Video plays smoothly without buffering interruptions
   - Seeking works correctly
   - Download progresses sequentially from start to end

#### Test 4: Verify Episode Switching

1. **Load a multi-episode torrent**
2. **Start playing Episode 1**
3. **Switch to Episode 2** using the episode selector
4. **Observe download statistics**
5. **Expected behavior**:
   - Episode 1 download should stop
   - Episode 2 should start downloading
   - Playback should start quickly for Episode 2

#### Test 5: Verify Console Logs

1. **Open Developer Tools** (if available in packaged app, or run in dev mode)
2. **Load a torrent**
3. **Check console output**
4. **Expected logs**:
   ```
   Prioritized streaming for file: Episode 01.mp4
   File pieces: 0 to 31999 (total: 32000)
   Critical pieces: 10, Sequential: 31990
   ```

### Performance Metrics to Check

| Metric | Before Optimization | After Optimization |
|--------|-------------------|-------------------|
| Time to playback start | 15-30 seconds | 5-10 seconds |
| Buffering interruptions | Frequent | Rare/None |
| Bandwidth usage (10 episodes) | ~5 GB (all episodes) | ~500 MB (one episode) |
| Unnecessary downloads | 90% | 0% |

### Debugging

If optimization doesn't seem to work:

1. **Check console logs** for prioritization messages
2. **Verify WebTorrent version** is compatible
3. **Test with different torrent sizes** (small vs large files)
4. **Check network conditions** (slow connections may mask benefits)

### Known Limitations

- **Single-file torrents**: Optimization has no visible effect (already optimal)
- **Very small files**: All pieces may be "critical" (< 10 pieces total)
- **Slow connections**: Benefits may be less noticeable

### Automated Testing

Run the full test suite:

```bash
npm test
```

Run only optimization tests:

```bash
npm test -- torrent-optimization
```

All 97 tests should pass, including 12 new optimization tests.

### Reporting Issues

If you encounter issues during testing:

1. **Capture console logs** from Developer Tools
2. **Note torrent characteristics** (size, number of files, piece length)
3. **Describe expected vs actual behavior**
4. **Report on GitHub**: https://github.com/knrerikh/saltplayer/issues

### Success Criteria

✅ Only selected episode downloads  
✅ Playback starts within 10 seconds  
✅ No buffering interruptions during playback  
✅ Episode switching works correctly  
✅ All automated tests pass  

## Development Testing

For developers working on the optimization:

### Run in Development Mode

```bash
npm run dev
```

This allows:
- Real-time console access
- Hot reload for quick iteration
- Full DevTools access

### Mock Testing

The test suite includes comprehensive mocks:
- Mock WebTorrent client
- Mock torrent objects
- Mock file objects with select/deselect

See `tests/unit/torrent-optimization.test.ts` for examples.

### Performance Profiling

To profile the optimization:

1. Use Chrome DevTools Performance tab
2. Record during torrent load and playback start
3. Look for:
   - Time spent in `prioritizeStreamingPieces()`
   - Number of piece selection calls
   - Time to first video frame

### Code Coverage

Check test coverage:

```bash
npm test -- --coverage
```

Target coverage for `torrent.ts`: > 80%

## Continuous Integration

GitHub Actions automatically runs all tests on:
- Every push to feature branches
- Every pull request
- Merge to main branch

Check CI status: https://github.com/knrerikh/saltplayer/actions

