# hd-live-reel

Personal macOS desktop app that stitches iPhone Live Photos into one MP4 with original sound, an opening title and light filters. It must never modify originals on the iPhone or in the Photos library.

## Stack

- Shell: Tauri 2, TypeScript frontend (`src/`)
- Core: Rust (`src-tauri/`) — project JSON, FFmpeg command building, job queue
- Photo access: Swift CLI (`photos-helper/`) — ImageCaptureCore (iPhone over USB), PhotoKit; prints JSON, called by Rust
- Video: FFmpeg + ffprobe as Tauri sidecars (`binaries/`, fetched by `scripts/fetch-ffmpeg.sh`), built with libzimg
- macOS only, all processing local; no cloud, login or database

## Commands

| Purpose | Command |
|---|---|
| Install JS deps | `pnpm install` |
| Fetch FFmpeg sidecar | `./scripts/fetch-ffmpeg.sh` |
| Run the app | `pnpm tauri dev` |
| Frontend types + build | `pnpm build` |
| Rust tests | `cargo test --manifest-path src-tauri/Cargo.toml` |
| Baseline vs compose.py (personal media) | `HD_LIVE_REEL_SAMPLES=<dir> cargo test --manifest-path src-tauri/Cargo.toml --test baseline -- --ignored` |
| Rust format + lint | `cargo fmt --manifest-path src-tauri/Cargo.toml && cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets` |
| Build Swift helper into `binaries/` | `pnpm helper` (also run by `pnpm tauri dev`) |
| Run Swift helper | `./binaries/photos-helper-aarch64-apple-darwin list` |

- Package manager: **pnpm** (not npm, not yarn). Frontend is React + TypeScript (Vite), styled with StyleX.
- `photos-helper` needs a USB-connected, unlocked iPhone for `list` / `download`.

## Rules

- Preview and export use the same FFmpeg filter graph built from `project.json`; only resolution and encoder speed differ. Never emulate filters in CSS/WebGL.
- Treat originals as read-only. Write intermediates only to `~/Library/Caches/<App>/`.
- Normalize every clip on import to 1080×1920, 30 fps, BT.709 SDR, stereo 48 kHz; later stages assume this.
- Lay out title text in a frontend Canvas and overlay it as a transparent PNG. Do not use FFmpeg `drawtext`.
- Style components with StyleX; colours and sizes come from `src/tokens.stylex.ts`. Only document-level resets go in `src/global.css`.
- `src/ui/` holds generic controls that know nothing about Live Photos or projects; app-specific components go in `src/components/`.
- Never commit photos or videos; they carry GPS data. Test media stays outside the repo.
- Ask before adding a dependency.
- Ask before changing the `project.json` schema.
- After any code change, run the tests for the affected area before saying it's done.
- Commits: Conventional Commits, atomic, subject and body lines ≤ 72 chars, body explains only why.
- When commands or config change, update `README.md` in the same commit.

## Gotchas

- Homebrew's default `ffmpeg` has no `zscale`; P3 → BT.709 and HDR → SDR need it.
- Live Photo MOVs are ~2 s, 1920×1440, variable frame rate, mono and very quiet (−40 to −59 LUFS). Normalize to −30 LUFS with at most +18 dB gain.
- Live Photos are SDR (P3, 8-bit). Only regular iPhone videos are HDR (HLG) and need tone mapping.
- iPhone "Transfer to Mac or PC" must be "Keep Originals", or files arrive as JPG. "Optimize iPhone Storage" can leave only thumbnails on the phone.
- The working CLI prototype is `~/Desktop/test pic/compose.py`; port its pipeline rather than reinventing it.

## Read these only when relevant

Fetch via the Notion MCP only when the task needs them.

- Product spec (features, data model, risks): https://app.notion.com/p/3f060d3cf9f3812482e2d629faa4b62e
- Implementation plan and progress: https://app.notion.com/p/3f260d3cf9f381d6a391d52452e1b402

## When unsure

If a change touches more than three files, or the `project.json` schema, propose the approach before writing code.
