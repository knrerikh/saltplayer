# video-transcoding Specification

## Purpose
When the player converts a video or its audio on the fly instead of playing the file as is, and what a converted stream must keep: correct colours, seeking, audio tracks, subtitles and feedback while it starts.

## Requirements

### Requirement: Correct colours for Dolby Vision profile 5
The player SHALL detect a video stream in Dolby Vision profile 5 without a compatible base layer and SHALL play it converted to SDR with the Dolby Vision reshaping applied, so its colours match the intended picture rather than showing a purple and green cast.

#### Scenario: Netflix 2160p WEB-DL episode
- **WHEN** the user plays a file whose video is Dolby Vision profile 5 with compatibility id 0
- **THEN** the picture has natural colours (no purple or green cast, not washed out)

#### Scenario: Other Dolby Vision profiles
- **WHEN** the video is Dolby Vision with an HDR10 or SDR compatible base layer (for example profile 8.1)
- **THEN** its video is not converted, as today; its audio is still converted when Chromium cannot play the codec

### Requirement: Converted resolution
A converted Dolby Vision video SHALL be delivered at no more than 1920 × 1080, keeping its aspect ratio, and SHALL NOT be upscaled.

#### Scenario: 4K source
- **WHEN** a 3840 × 2160 Dolby Vision profile 5 video plays
- **THEN** the player receives it at 1920 × 1080

#### Scenario: Source already smaller
- **WHEN** a 1280 × 720 Dolby Vision profile 5 video plays
- **THEN** it is delivered at 1280 × 720

### Requirement: Untouched playback for everything else
Videos that are not Dolby Vision profile 5 SHALL keep today's behaviour: the video stream is not re-encoded, and audio is converted only when Chromium cannot play its codec.

#### Scenario: Ordinary H.264 MP4
- **WHEN** the user plays an H.264 MP4 with AAC audio
- **THEN** the file is played as is, with no conversion

#### Scenario: Unsupported audio only
- **WHEN** the user plays an HEVC SDR MKV with AC3 audio
- **THEN** only the audio is converted and the video is copied untouched

### Requirement: Playback features on a converted video
On a converted Dolby Vision video the user SHALL be able to seek, choose another audio track, show subtitles in sync, and resume from a saved position, and the video SHALL keep its correct colours after each of these.

#### Scenario: Seeking
- **WHEN** the user seeks to 20:00 in a converted video
- **THEN** playback continues from 20:00 with correct colours and the shown time is 20:00

#### Scenario: Another audio track
- **WHEN** the user picks another audio track in a converted video
- **THEN** that track plays and the picture keeps its correct colours

#### Scenario: Subtitles after a seek
- **WHEN** subtitles are on and the user seeks in a converted video
- **THEN** the subtitles stay in sync with the picture

#### Scenario: Resume
- **WHEN** a converted video is reopened with a saved position
- **THEN** it starts from that position with correct colours

### Requirement: Feedback while a conversion starts
While a converted stream starts or restarts after a seek, the player SHALL show its loading indicator until the first frame is shown.

#### Scenario: Seek in a converted video
- **WHEN** the user seeks and the conversion needs a few seconds to restart
- **THEN** the loading indicator is shown until playback resumes

### Requirement: Failure to convert
If the video conversion fails to start (for example the tone-mapping filter or the encoder is unavailable), the player SHALL play the video without video conversion, keeping the audio conversion when the audio codec needs it, and SHALL tell the user once that its colours may be wrong.

#### Scenario: Converter fails
- **WHEN** the conversion of a Dolby Vision profile 5 video fails to start
- **THEN** the video plays without video conversion, its audio is still converted if Chromium cannot play it, and a message says the colours may be wrong because the video is Dolby Vision
