# hd-live-reel

A macOS desktop app that stitches iPhone Live Photos into one short video, keeping the original sound and adding an opening title.

## Features

- Pick Live Photos and videos straight from a USB-connected iPhone, with thumbnails grouped by day
- Keep each clip's original sound, loudness-matched, with click-free joins
- Reorder, trim and mute clips, and lay an opening title over the first second
- Preview from the same FFmpeg pipeline as the export, refreshed after every edit
- Export a 1080×1920 H.264/AAC MP4 that WeChat can send and play directly

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

Connect the iPhone with a cable, unlock it, then start the app:

```bash
pnpm tauri dev
```

Exports are saved to `~/Movies/HD Live Reel/`.

Before committing:

```bash
pnpm format   # format TypeScript, Rust and Swift
pnpm check    # types, lint and formatting checks
```
