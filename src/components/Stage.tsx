import { useEffect, useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, shadows } from "../tokens.stylex";
import { Button, Icon, withStyle } from "../ui";

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
  wrap: {
    display: "grid",
    placeItems: "center",
    minHeight: 0,
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
  onAdd: () => void;
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

export function Stage({ src, lengths, seekTo, busy, error, empty, onAdd }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);

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
        <div {...stylex.props(styles.frame)}>
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
              onClick={(e) => (e.currentTarget.paused ? e.currentTarget.play() : e.currentTarget.pause())}
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
          {busy && <div {...stylex.props(styles.pill)}>正在更新预览…</div>}
          {error && !busy && <div {...stylex.props(styles.pill, styles.errorPill)}>{error}</div>}
        </div>
      </div>
      <div {...stylex.props(styles.transport)}>
        <button
          aria-label={playing ? "暂停" : "播放"}
          disabled={!src}
          onClick={() => (video.current?.paused ? video.current.play() : video.current?.pause())}
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
