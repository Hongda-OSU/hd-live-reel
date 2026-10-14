import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import { getVersion } from "@tauri-apps/api/app";
import appIcon from "../../src-tauri/icons/icon.svg";
import { colors, shadows } from "../tokens.stylex";
import { Icon, withStyle } from "../ui";
import type { Output } from "../api";
import { formatTime, FRAME } from "../project";
import { CropLayer, fillFactor } from "./CropLayer";

const styles = stylex.create({
  area: {
    display: "grid",
    gridTemplateRows: "1fr auto",
    minHeight: 0,
    minWidth: 0,
    paddingTop: "18px",
    paddingRight: "18px",
    paddingBottom: "18px",
    paddingLeft: "18px",
    backgroundColor: colors.stage,
  },
  // Clips the uncropped still where it spills past the frame.
  // A size container, so the frame can be sized from the space it has
  // rather than from its contents.
  wrap: {
    display: "grid",
    placeItems: "center",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    containerType: "size",
  },
  frame: {
    position: "relative",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#000",
    boxShadow: shadows.stage,
    touchAction: "none",
  },
  // As large as fits: the full width, unless that would be too tall.
  // `--ratio` is the frame's width over its height.
  shaped: {
    width: "min(100cqw, 100cqh * var(--ratio))",
    aspectRatio: "var(--ratio)",
  },
  grab: {
    cursor: "grab",
  },
  cropping: {
    overflow: "visible",
    cursor: "grabbing",
  },
  video: {
    display: "block",
    width: "100%",
    height: "100%",
  },
  // Nothing to play yet: an outline of the reel's shape, not a black
  // video that looks like it failed to load.
  frameEmpty: {
    backgroundColor: "transparent",
    boxShadow: "none",
    outlineWidth: 1.5,
    outlineStyle: "dashed",
    outlineColor: `color-mix(in srgb, ${colors.muted} 45%, transparent)`,
    outlineOffset: -1.5,
  },
  empty: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeContent: "center",
    justifyItems: "center",
    gap: 8,
    padding: 24,
    color: colors.muted,
    textAlign: "center",
  },
  // A welcome page: the app's icon and name, what it does, and its three
  // steps. Only an empty project shows it.
  emptyIcon: {
    width: 88,
    height: 88,
  },
  emptyTitle: {
    margin: 0,
    color: colors.text,
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: "-0.01em",
  },
  emptyText: {
    margin: 0,
    fontSize: 12,
  },
  steps: {
    display: "grid",
    gap: 6,
    marginTop: 14,
    marginBottom: 0,
    padding: 0,
    fontSize: 12,
    listStyle: "none",
    textAlign: "left",
  },
  step: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
  },
  stepNumber: {
    display: "inline-grid",
    placeItems: "center",
    flexShrink: 0,
    width: 18,
    height: 18,
    borderRadius: "50%",
    backgroundColor: colors.surface2,
    color: colors.text,
    fontSize: 10,
    fontWeight: 600,
  },
  version: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 14,
    fontSize: 10,
  },
  pill: {
    position: "absolute",
    left: "50%",
    top: 14,
    transform: "translateX(-50%)",
    paddingBlock: "4px",
    paddingInline: "12px",
    borderRadius: 99,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    color: "#fff",
    fontSize: 11,
    whiteSpace: "nowrap",
    pointerEvents: "none",
  },
  hint: {
    top: "auto",
    bottom: 14,
  },
  errorPill: {
    maxWidth: "90%",
    whiteSpace: "normal",
    borderRadius: 8,
    backgroundColor: "rgba(160, 20, 20, 0.85)",
  },
  transport: {
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    gap: 16,
    alignItems: "center",
    justifySelf: "center",
    width: "100%",
    maxWidth: 760,
    paddingTop: 16,
  },
  play: {
    display: "grid",
    placeItems: "center",
    width: 30,
    height: 30,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: "50%",
    backgroundColor: colors.surface,
    cursor: {
      default: "pointer",
      ":disabled": "default",
    },
    opacity: {
      default: 1,
      ":disabled": 0.45,
    },
  },
  // The clips as a filmstrip, each as wide as its share of the reel, like
  // the timeline in Photos' video editor.
  strip: {
    position: "relative",
    display: "flex",
    gap: 2,
    height: 40,
    borderRadius: 7,
    overflow: "hidden",
    backgroundColor: colors.surface2,
  },
  tile: {
    flexBasis: 0,
    minWidth: 0,
    backgroundColor: colors.surface2,
    backgroundPosition: "center",
    backgroundSize: "cover",
  },
  // The part not yet played is darkened.
  unplayed: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    pointerEvents: "none",
  },
  playhead: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    marginLeft: -1,
    borderRadius: 1,
    backgroundColor: "#fff",
    boxShadow: "0 0 0 0.5px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.4)",
    pointerEvents: "none",
  },
  // An invisible range input over the strip does the seeking, so mouse
  // and keyboard work as on any slider. A thumb as thin as the playhead
  // keeps clicks landing where they point.
  seek: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    margin: 0,
    opacity: 0,
    appearance: "none",
    cursor: {
      default: "pointer",
      ":disabled": "default",
    },
    "::-webkit-slider-thumb": {
      appearance: "none",
      width: 2,
      height: 40,
    },
  },
  readout: {
    display: "grid",
    justifyItems: "end",
    gap: 2,
  },
  time: {
    color: colors.muted,
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
  },
  quality: {
    color: colors.muted,
    fontSize: 11,
  },
});

interface Props {
  /** Playable URL of the latest preview, or null before the first one. */
  src: string | null;
  aspect: Output["aspect"];
  /** False when clips are fitted whole (black bars, blur), so there is
   * nothing to drag. */
  croppable: boolean;
  /** Clip lengths in order, for the widths in the filmstrip. */
  lengths: number[];
  /** Each clip's thumbnail, in the same order, if loaded. */
  thumbs: (string | undefined)[];
  /** Seconds to jump to; changes when a clip is picked in the list. */
  seekTo: { time: number; nonce: number } | null;
  busy: boolean;
  error: string | null;
  empty: boolean;
  /** The crop being dragged or applied, if any. */
  crop: CropView | null;
  /** A drag began on the picture at this preview time. */
  onCropStart: (time: number) => void;
  onCropChange: (offset: number) => void;
  onCropEnd: () => void;
}

export interface CropView {
  /** Uncropped still, or null while it loads. */
  frame: string | null;
  /** Offset when the drag began. */
  start: number;
  offset: number;
  /** Released and being re-normalized / re-rendered. */
  applying: boolean;
}

/** Pointer travel before a press counts as a drag, not a click. */
const DRAG_THRESHOLD = 4;
/** Overflow below 1% of the frame is rounding, not something to crop. */
const CROP_SLACK = 0.01;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** The welcome page's walk-through. */
const STEPS = [
  "点左上角「添加照片」从 iPhone 选，或把文件拖进来",
  "在右边加标题、配乐和滤镜",
  "点右上角「导出」，直接发微信",
];

export function Stage(props: Props) {
  const { src, aspect, croppable, lengths, thumbs, seekTo, busy, error, empty, crop } = props;
  const [frameWidth, frameHeight] = FRAME[aspect];
  const frameAspect = frameWidth / frameHeight;
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    getVersion().then(setVersion, () => {});
  }, []);
  const [hovered, setHovered] = useState(false);
  const [still, setStill] = useState<{ src: string; width: number; height: number } | null>(null);
  const stillSize = crop && still?.src === crop.frame ? still : null;
  const overflow = stillSize && fillFactor(stillSize.width, stillSize.height, frameAspect);
  const nothingToCrop = overflow !== null && overflow.x < 1 + CROP_SLACK && overflow.y < 1 + CROP_SLACK;
  const press = useRef<{ x: number; y: number; dragging: boolean } | null>(null);

  const togglePlay = () => (video.current?.paused ? video.current.play() : video.current?.pause());

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!src || e.button !== 0 || crop?.applying) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    press.current = { x: e.clientX, y: e.clientY, dragging: false };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const p = press.current;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.dragging) {
      if (!croppable || Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      p.dragging = true;
      video.current?.pause();
      props.onCropStart(video.current?.currentTime ?? 0);
      return;
    }
    if (!crop || !overflow || nothingToCrop || !frame.current) return;
    // Dragging the picture right shows more of its left side.
    const rect = frame.current.getBoundingClientRect();
    if (overflow.x >= 1 + CROP_SLACK) props.onCropChange(clamp01(crop.start - dx / (rect.width * (overflow.x - 1))));
    else props.onCropChange(clamp01(crop.start - dy / (rect.height * (overflow.y - 1))));
  }

  function onPointerUp() {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (p.dragging) props.onCropEnd();
    else togglePlay();
  }

  useEffect(() => {
    if (seekTo && video.current) video.current.currentTime = seekTo.time;
  }, [seekTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ["INPUT", "TEXTAREA"].includes((document.activeElement as HTMLElement)?.tagName);
      if (e.code === "Space" && !typing && video.current) {
        e.preventDefault();
        if (video.current.paused) video.current.play();
        else video.current.pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const total = lengths.reduce((a, b) => a + b, 0);
  // Where each clip ends, as a share of the whole; the last end is the edge.
  const played = src && duration ? Math.min(1, time / duration) : 0;

  return (
    <section {...stylex.props(styles.area)}>
      <div {...stylex.props(styles.wrap)}>
        <div
          ref={frame}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          {...withStyle(
            stylex.props(
              styles.frame,
              styles.shaped,
              empty && styles.frameEmpty,
              src !== null && croppable && styles.grab,
              crop !== null && styles.cropping,
            ),
            { "--ratio": `${frameWidth} / ${frameHeight}` } as CSSProperties,
          )}
        >
          {src && (
            <video
              ref={video}
              key={src}
              src={src}
              playsInline
              onLoadedMetadata={(e) => {
                // A new preview waits, paused at the start (or where a seek
                // made while it loaded put it). The replaced <video> fired
                // no pause event, so reset the button here.
                setDuration(e.currentTarget.duration);
                setTime(e.currentTarget.currentTime);
                setPlaying(false);
              }}
              onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              {...stylex.props(styles.video)}
            />
          )}
          {empty && (
            <div {...stylex.props(styles.empty)}>
              <img src={appIcon} alt="" {...stylex.props(styles.emptyIcon)} />
              <h3 {...stylex.props(styles.emptyTitle)}>HD Live Reel</h3>
              <p {...stylex.props(styles.emptyText)}>把 Live Photo 拼成一段视频</p>
              <ol {...stylex.props(styles.steps)}>
                {STEPS.map((step, i) => (
                  <li key={i} {...stylex.props(styles.step)}>
                    <span {...stylex.props(styles.stepNumber)}>{i + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
              {version && <span {...stylex.props(styles.version)}>版本 {version}</span>}
            </div>
          )}
          {crop?.frame && (
            <CropLayer
              src={crop.frame}
              size={stillSize}
              frameAspect={frameAspect}
              offset={crop.offset}
              onSize={(size) => setStill({ src: crop.frame!, ...size })}
            />
          )}
          {src && croppable && hovered && !playing && !crop && !busy && (
            <div {...stylex.props(styles.pill, styles.hint)}>拖动画面可调整裁切位置</div>
          )}
          {crop && nothingToCrop && !crop.applying && (
            <div {...stylex.props(styles.pill)}>这段画面和画幅比例一致，不需要裁切</div>
          )}
          {crop?.applying ? (
            <div {...stylex.props(styles.pill)}>正在应用裁切…</div>
          ) : (
            busy && <div {...stylex.props(styles.pill)}>正在更新预览…</div>
          )}
          {error && !busy && <div {...stylex.props(styles.pill, styles.errorPill)}>{error}</div>}
        </div>
      </div>
      <div {...stylex.props(styles.transport)}>
        <button
          aria-label={playing ? "暂停" : "播放"}
          disabled={!src}
          onClick={togglePlay}
          {...stylex.props(styles.play)}
        >
          <Icon>
            {playing ? (
              <path d="M5 3.5v9M11 3.5v9" strokeWidth="2.2" />
            ) : (
              <path d="M5 3.5v9l7-4.5z" fill="currentColor" stroke="none" />
            )}
          </Icon>
        </button>
        <div {...stylex.props(styles.strip)}>
          {lengths.map((length, i) => (
            <span
              key={i}
              {...withStyle(stylex.props(styles.tile), {
                flexGrow: length,
                backgroundImage: thumbs[i] ? `url("${thumbs[i]}")` : undefined,
              })}
            />
          ))}
          {src && (
            <>
              <span {...withStyle(stylex.props(styles.unplayed), { left: `${played * 100}%` })} />
              <span {...withStyle(stylex.props(styles.playhead), { left: `${played * 100}%` })} />
            </>
          )}
          <input
            type="range"
            aria-label="播放位置"
            min={0}
            max={(src && duration) || 1}
            step={0.01}
            value={src ? time : 0}
            disabled={!src}
            onChange={(e) => {
              if (video.current) video.current.currentTime = Number(e.target.value);
            }}
            {...stylex.props(styles.seek)}
          />
        </div>
        <div {...stylex.props(styles.readout)}>
          {/* Without a preview, the last one's time and length are stale. */}
          <span {...stylex.props(styles.time)}>
            {src ? `${formatTime(time)} / ${formatTime(duration || total)}` : `${formatTime(0)} / ${formatTime(total)}`}
          </span>
          <span title="导出为 1080p 高清" {...stylex.props(styles.quality)}>
            低清预览
          </span>
        </div>
      </div>
    </section>
  );
}
