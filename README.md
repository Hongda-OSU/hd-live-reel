# hd-live-reel

A macOS desktop app that stitches iPhone Live Photos into one short video, keeping the original sound and adding an opening title.

## Getting Started

### Prerequisites

- macOS on Apple silicon
- Xcode (for the Swift helper)
- Node.js 22+ with pnpm (`corepack enable pnpm`)
- Rust (stable, via [rustup](https://rustup.rs))

### Installation

~~~bash
git clone https://github.com/Hongda-OSU/hd-live-reel.git
cd hd-live-reel
pnpm install
./scripts/fetch-ffmpeg.sh
pnpm helper
~~~

## Usage

~~~bash
pnpm tauri dev
~~~
