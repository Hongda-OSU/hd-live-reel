# hd-live-reel

A macOS desktop app that stitches iPhone Live Photos into one short video, keeping the original sound and adding an opening title.

## Features

- Pick Live Photos and videos from a USB-connected iPhone, or drag them in from Finder
- Let on-device AI pick a reel's worth from a day or part of one, with a reason and a score for each shot
- Keep each clip's original sound, loudness-matched, or lay a music track under or over it
- Trim, reorder, crop and mute clips; add a styled opening title, colour filters and cross-dissolves
- Preview from the same FFmpeg pipeline as the export; export a 9:16 or 16:9 MP4 that WeChat plays directly

## Tech Stack

- App shell: Tauri 2
- Frontend: React, TypeScript, StyleX
- Core: Rust (project files, FFmpeg command building)
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
pnpm helper
```

## Usage

Connect the iPhone with a cable and unlock it (or skip this and drag files in), then start the app:

```bash
pnpm tauri dev
```

Exports are saved to `~/Movies/HD Live Reel/` unless another folder is chosen in the 导出 (Export) section.
