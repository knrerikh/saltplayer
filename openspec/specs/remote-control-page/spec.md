# remote-control-page Specification

## Purpose
The phone remote page: how it looks and lays out its controls on a phone, in portrait and landscape, and how it stays visually consistent with the desktop player it controls.

## Requirements

### Requirement: Visual consistency with the player
The remote page SHALL use the same palette, font stack and control shapes as the player's control bar: a dark background, translucent round buttons and capsules, light text, and the accent colour only for progress, the active state and keyboard focus. Destructive actions SHALL NOT be coloured red at rest; red SHALL appear only while a destructive control is pressed.

#### Scenario: Controls at rest
- **WHEN** the remote page shows a video with every control enabled
- **THEN** buttons and capsules use the player's translucent control fill on the player's background, and the accent colour appears only on the played part of the seek bar and the volume slider, on active toggles and on the keyboard focus ring

#### Scenario: Close video at rest
- **WHEN** the Close video control is shown and not touched
- **THEN** it looks like the other controls

#### Scenario: Close video pressed
- **WHEN** the Close video control is pressed
- **THEN** it turns red while pressed, and closing still asks for confirmation first

#### Scenario: One source for colours
- **WHEN** a colour or the control fill of the player changes
- **THEN** the remote page shows the same value without a separate edit

### Requirement: Icons shared with the player
The icons the remote page and the player both show (play, pause, previous, next, speaker audible, speaker muted) SHALL be the same monochrome drawings, in the current text colour, with no emoji or symbol characters.

#### Scenario: Same speaker icon
- **WHEN** the player and the remote page both show the speaker icon for a muted video
- **THEN** both draw the same shape

#### Scenario: No emoji
- **WHEN** the remote page is rendered on a phone
- **THEN** its controls and their labels contain no emoji or pictographic symbol characters; titles and episode names from the video are shown as they are

### Requirement: Portrait layout
In portrait orientation the remote page SHALL show all its controls in one column that fits the screen without scrolling, from a 320 × 568 CSS-pixel viewport upwards.

#### Scenario: Small phone in portrait
- **WHEN** the page is shown at 320 × 568 with a video that has several episodes
- **THEN** every control is visible without scrolling

#### Scenario: Large phone in portrait
- **WHEN** the page is shown at 430 × 932
- **THEN** the controls are centred and do not stretch beyond a comfortable width

### Requirement: Landscape layout
In landscape orientation the remote page SHALL show two columns that fit the screen without scrolling, from a 568 × 320 CSS-pixel viewport upwards: the title, time, seek bar, play/pause and skip buttons in one column, and the volume as a vertical slider with mute, the episode controls, fullscreen and close in the other.

#### Scenario: Phone turned sideways
- **WHEN** the page is shown at 568 × 320 with a video that has several episodes
- **THEN** both columns are visible without scrolling and the volume slider is vertical

#### Scenario: Browser without vertical sliders
- **WHEN** the browser cannot draw a vertical range input
- **THEN** the volume slider is shown horizontally in the same column and still works

#### Scenario: Rotation while playing
- **WHEN** the phone is rotated while a video plays
- **THEN** the layout changes without reloading the page, and the shown state and the connection are kept

### Requirement: Touch targets
Every interactive control on the remote page SHALL have a touch target of at least 44 × 44 CSS pixels in both orientations.

#### Scenario: Smallest landscape viewport
- **WHEN** the page is shown at 568 × 320
- **THEN** every button, slider and list is at least 44 CSS pixels in each direction that the finger uses
