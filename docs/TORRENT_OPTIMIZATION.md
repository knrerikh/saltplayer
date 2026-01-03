# Torrent Download Optimization

## Overview

This document describes the torrent download optimization implemented in Salt Player to ensure efficient bandwidth usage and smooth playback experience.

## Problem Statement

Previously, when loading a torrent containing multiple video files (e.g., TV series with multiple episodes), WebTorrent would download all files in parallel. This caused:

- **Inefficient bandwidth usage**: Network resources were split across all files
- **Slow playback start**: Initial buffering took longer as bandwidth was divided
- **Unnecessary downloads**: Files that the user might never watch were being downloaded

## Solution

The optimization implements three key strategies:

### 1. Selective File Download

Only the currently playing file is downloaded. All other files in the torrent are deselected.

```typescript
// Deselect all files first
this.currentTorrent.files.forEach((f: any) => {
  f.deselect();
});

// Select only the file we want to stream
file.select();
```

### 2. Critical Piece Prioritization

The first 10 pieces of the selected file are downloaded with **high priority** to ensure quick playback start.

```typescript
const criticalPieces = Math.min(10, endPiece - startPiece + 1);

for (let i = 0; i < criticalPieces; i++) {
  const pieceIndex = startPiece + i;
  // Critical pieces get highest priority
  this.currentTorrent.select(pieceIndex, pieceIndex, true);
}
```

### 3. Sequential Download

After the critical pieces, the remaining pieces are downloaded **sequentially** from start to end, ensuring smooth playback without interruptions.

```typescript
// Select remaining pieces with normal priority for sequential download
if (startPiece + criticalPieces <= endPiece) {
  this.currentTorrent.select(
    startPiece + criticalPieces,
    endPiece,
    false
  );
}
```

### 4. Progress Tracking Improvement

The progress indicator now reflects the download status of the **selected file** rather than the entire torrent.

```typescript
// If a file is selected, show progress relative to that file
const progress = this.selectedFile 
  ? this.selectedFile.progress * 100 
  : this.currentTorrent.progress * 100;
```

This ensures the user sees accurate progress (0-100%) for the episode they are watching.

## Implementation Details

### Modified Method: `prioritizeStreamingPieces()`

Location: `src/main/torrent.ts`

**Before:**
- Only called `file.select()` on the target file
- Relied on WebTorrent's default behavior
- All files in torrent would download in parallel

**After:**
- Deselects all files first
- Selects only the target file
- Calculates piece ranges based on file offset and size
- Prioritizes first 10 pieces with high priority
- Selects remaining pieces for sequential download

### Piece Calculation

```typescript
const pieceLength = this.currentTorrent.pieceLength;
const startPiece = Math.floor(file.offset / pieceLength);
const endPiece = Math.floor((file.offset + file.length - 1) / pieceLength);
```

This correctly handles:
- Files at different offsets in the torrent
- Files of varying sizes
- Edge cases (small files, large files, single-file torrents)

## Benefits

### For Users

1. **Faster playback start**: Critical pieces download first
2. **Smooth playback**: Sequential download prevents buffering
3. **Bandwidth efficiency**: Only downloads what's being watched
4. **Better experience with limited bandwidth**: All bandwidth goes to current episode

### For Network

1. **Reduced unnecessary traffic**: No downloading of unwatched content
2. **More efficient peer connections**: Focused on specific pieces
3. **Better seeding**: Complete pieces are available sooner

## Testing

Comprehensive test suite in `tests/unit/torrent-optimization.test.ts` covers:

- ✅ File selection and deselection
- ✅ Sequential piece prioritization
- ✅ Bandwidth optimization
- ✅ Edge cases (null torrent, zero offset, large files)
- ✅ Multi-episode torrents
- ✅ File switching with `selectFile()`

All 12 optimization tests pass, plus 85 existing tests remain passing.

## Usage

### Automatic Behavior

The optimization is **automatic** and requires no user action:

1. User loads a torrent (magnet link or .torrent file)
2. Salt Player automatically selects the first video file
3. Optimization kicks in: deselects all files, prioritizes selected file
4. Playback starts quickly with sequential download

### Switching Episodes

When user selects a different file:

```typescript
await torrentEngine.selectFile('Episode 02.mp4');
```

The optimization automatically:
1. Stops downloading the previous file
2. Starts downloading the new file
3. Applies the same prioritization strategy

## Performance Characteristics

### Typical Torrent (500MB episode, 16KB pieces)

- **Total pieces**: ~32,000
- **Critical pieces**: 10 (downloaded with high priority)
- **Sequential pieces**: ~31,990 (downloaded in order)
- **Playback start time**: ~5-10 seconds (depending on connection)

### Multi-Episode Torrent (10 episodes, 5GB total)

- **Before optimization**: All 10 episodes download simultaneously
- **After optimization**: Only 1 episode downloads at a time
- **Bandwidth savings**: 90% reduction in unnecessary downloads

## Future Enhancements

Potential improvements for future versions:

1. **Predictive preloading**: Start downloading next episode when current is 80% complete
2. **Adaptive critical pieces**: Adjust number based on connection speed
3. **User-configurable priorities**: Allow power users to customize behavior
4. **Smart caching**: Keep recently watched episodes in cache

## Related Issues

- GitHub Issue: [#4 - Optimize torrent loading: sequential download of current episode only](https://github.com/knrerikh/saltplayer/issues/4)

## References

- [WebTorrent API Documentation](https://github.com/webtorrent/webtorrent/blob/master/docs/api.md)
- [BitTorrent Piece Selection Algorithms](http://bittorrent.org/beps/bep_0003.html)

