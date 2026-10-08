import { useEffect, useRef, useState, type PointerEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, shadows } from "../tokens.stylex";
import { Button, Icon, withStyle } from "../ui";
import { CropLayer, fillFactor } from "./CropLayer";

const styles = stylex.create({
  area: {
    display: "grid",
    gridTemplateRows: "1fr auto",
    minHeight: 0,
    minWidth: 0,
    paddingTop: "18px",
    paddingRight: "18px",
    paddingBottom: "10px",
    paddingLeft: "18px",
    backgroundColor: colors.stage,
  },
  // Clips the uncropped still where it spills past the frame.
  wrap: {
    display: "grid",
    placeItems: "center",
    minHeight: 0,
    overflow: "hidden",
  },
  // Height-bound: a 9:16 frame on a landscape window fills the height.
  frame: {
    position: "relative",
    height: "100%",
    maxWidth: "100%",
    aspectRatio: "9 / 16",
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#000",
    boxShadow: shadows.stage,
    touchAction: "none",
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
  empty: {
    position: "absolute",
    inset: 0,
    display: "grid",
    placeContent: "center",
    justifyItems: "center",
    gap: 4,
    color: "#a1a1a6",
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
    gridTemplateColumns: "auto auto 1fr auto",
    gap: 12,
    alignItems: "center",
    justifySelf: "center",
    width: "100%",
    maxWidth: 760,
    paddingTop: 10,
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
  time: {
    color: colors.muted,
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
  },
  scrub: {
    position: "relative",
    height: 20,
  },
  range: {
    width: "100%",
    margin: 0,
    accentColor: colors.accent,
  },
  ticks: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    pointerEvents: "none",
  },
  tick: {
    position: "absolute",
    top: 0,
    width: 1,
    height: 4,
    backgroundColor: colors.muted,
    opacity: 0.6,
  },
  quality: {
    color: colors.muted,
    fontSize: 11,
  },
});

interface Props {
  /** Playable URL of the latest preview, or null before the first one. */
  src: string | null;
  /** Clip lengths in order, for the boundary ticks under the scrubber. */
  lengths: number[];
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
  onAdd: () => void;
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

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

export function Stage(props: Props) {
  const { src, lengths, seekTo, busy, error, empty, crop, onAdd } = props;
  const video = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [still, setStill] = useState<{ src: string; width: number; height: number } | null>(null);
  const stillSize = crop && still?.src === crop.frame ? still : null;
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
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      p.dragging = true;
      video.current?.pause();
      props.onCropStart(video.current?.currentTime ?? 0);
      return;
    }
    if (!crop || !stillSize || !frame.current) return;
    // Dragging the picture right shows more of its left side.
    const rect = frame.current.getBoundingClientRect();
    const factor = fillFactor(stillSize.width, stillSize.height);
    if (factor.x > 1) props.onCropChange(clamp01(crop.start - dx / (rect.width * (factor.x - 1))));
    else if (factor.y > 1) props.onCropChange(clamp01(crop.start - dy / (rect.height * (factor.y - 1))));
  }

  function onPointerUp() {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (p.dragging) props.onCropEnd();
    else togglePlay();
  }

  // Keep the playhead where it was when a new preview replaces the old one.
  const resumeAt = useRef(0);
  useEffect(() => {
    resumeAt.current = video.current?.currentTime ?? 0;
  }, [src]);

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
  const ticks = lengths.slice(0, -1).map((_, i) => lengths.slice(0, i + 1).reduce((a, b) => a + b, 0) / total);

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
          {...stylex.props(styles.frame, src !== null && styles.grab, crop !== null && styles.cropping)}
        >
          {src && (
            <video
              ref={video}
              key={src}
              src={src}
              playsInline
              onLoadedMetadata={(e) => {
                setDuration(e.currentTarget.duration);
                e.currentTarget.currentTime = Math.min(resumeAt.current, e.currentTarget.duration);
              }}
              onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              {...stylex.props(styles.video)}
            />
          )}
          {empty && (
            <div {...stylex.props(styles.empty)}>
              <p>预览会显示在这里</p>
              <Button variant="primary" onClick={onAdd}>
                添加照片
              </Button>
            </div>
          )}
          {crop?.frame && (
            <CropLayer
              src={crop.frame}
              size={stillSize}
              offset={crop.offset}
              onSize={(size) => setStill({ src: crop.frame!, ...size })}
            />
          )}
          {src && hovered && !playing && !crop && !busy && (
            <div {...stylex.props(styles.pill, styles.hint)}>拖动画面可调整裁切位置</div>
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
        <span {...stylex.props(styles.time)}>
          {fmt(time)} / {fmt(duration || total)}
        </span>
        <div {...stylex.props(styles.scrub)}>
          <div {...stylex.props(styles.ticks)}>
            {ticks.map((t, i) => (
              <i key={i} {...withStyle(stylex.props(styles.tick), { left: `${t * 100}%` })} />
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.01}
            value={time}
            disabled={!src}
            onChange={(e) => {
              if (video.current) video.current.currentTime = Number(e.target.value);
            }}
            {...stylex.props(styles.range)}
          />
        </div>
        <span {...stylex.props(styles.quality)}>低清预览 · 与导出同一处理链</span>
      </div>
    </section>
  );
}
