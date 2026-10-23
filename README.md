<img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="HD Live Reel app icon: a lake at sunset with the Live Photo mark">

# HD Live Reel

A macOS desktop app that stitches iPhone Live Photos into one short video, keeping the original sound and adding an opening title.

## Demo

https://github.com/user-attachments/assets/660dd1d7-65fa-4575-9734-6c60967294b3

## Features

- Pick Live Photos and videos from a USB-connected iPhone, or drag them in from Finder
- Tick photos, a whole day or scene at a time, and let on-device AI narrow them to a reel's worth, with a reason and a score for each shot
- Keep each clip's original sound, loudness-matched, or lay a music track under or over it
- Trim, reorder, crop and mute clips; add a styled opening title, captions on single clips, a corner watermark, colour filters and cross-dissolves
- Preview from the same FFmpeg pipeline as the export, with a filmstrip of the clips; export a 9:16, 3:4, 1:1 or 16:9 MP4 that WeChat plays directly

## Tech Stack

- App shell: Tauri 2
- Frontend: React, TypeScript, StyleX
- Core: Rust (project files, FFmpeg command building, AI selection)
- Photo access: Swift command-line helper (ImageCaptureCore, Vision)
- Video: FFmpeg with libzimg, bundled as a sidecar

## Getting Started

### Prerequisites

- macOS 15 or later on Apple silicon
- Xcode (for the Swift helper)
- Node.js 22+ with pnpm (`corepack enable pnpm`)
- Rust (stable, via [rustup](https://rustup.rs))

### Installation

```bash
git clone https://github.com/Hongda-OSU/hd-live-reel.git
cd hd-live-reel
pnpm install
./scripts/fetch-ffmpeg.sh
```

## Usage

Build the app and copy it to Applications:

```bash
pnpm tauri build
ditto "src-tauri/target/release/bundle/macos/HD Live Reel.app" "/Applications/HD Live Reel.app"
```

The bundle is ad-hoc signed, so it opens on the Mac that built it. To make a reel:

1. Connect the iPhone with a cable and unlock it, or skip this and drag videos and Live Photos in from Finder.
2. Add photos: tick a day or scene, optionally let AI pick from the ticked ones, then add them.
3. Edit in the clip list and the settings panel: title, captions, filter, frame and music. Drag the preview to move the crop.
4. Export from the toolbar. Reels are saved to `~/Movies/HD Live Reel/` unless another folder is chosen on the settings panel's Export page.

In the iPhone's Photos settings, set Transfer to Mac or PC to Keep Originals, or photos arrive as JPG. With Optimize iPhone Storage on, open older photos on the phone first so their originals download.

For development, run it from source instead:

```bash
pnpm tauri dev
```

The development and installed apps share one project and cache, so quit one before opening the other.
