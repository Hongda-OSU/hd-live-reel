# hd-live-reel

A macOS desktop app that stitches iPhone Live Photos into one short video, keeping the original sound and adding an opening title.

## Features

- Pick Live Photos and videos straight from a USB-connected iPhone, with thumbnails grouped by day
- Or drag videos, Live Photo pairs (photo + MOV of the same name) and folders in from Finder
- Keep each clip's original sound, loudness-matched, with click-free joins, or lay a music track under or over it
- Reorder, trim, mute and re-crop clips; add a styled opening title and colour filters
- Preview from the same FFmpeg pipeline as the export, refreshed after every edit
- Export a 9:16 or 16:9 H.264/AAC MP4, cropped, letterboxed or over a blurred backdrop, that WeChat can play directly

## Tech Stack

- App shell: Tauri 2
- Frontend: React, TypeScript, StyleX
- Core: Rust (project files, FFmpeg command building)
- Photo access: Swift command-line helper (ImageCaptureCore)
- Video: FFmpeg with libzimg, bundled as a sidecar

## Getting Started

### Prerequisites

- macOS on Apple silicon
- Xcode (for the Swift helper)
- Node.js 22+ with pnpm (`corepack enable pnpm`)
- Rust (stable, via [rustup](https://rustup.rs))

### Installation

```bash
git clone https://github.com/Hongda-OSU/hd-live-reel.git
cd hd-live-reel
pnpm install
./scripts/fetch-ffmpeg.sh
pnpm helper
```

## Usage

Connect the iPhone with a cable and unlock it (or skip this and drag files in), then start the app:

```bash
pnpm tauri dev
```

Exports are saved to `~/Movies/HD Live Reel/` unless another folder is chosen in the 导出 (Export) section.

Before committing:

```bash
pnpm format   # format TypeScript, Rust and Swift
pnpm check    # types, lint and formatting checks
```
