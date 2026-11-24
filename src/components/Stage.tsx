import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import { getVersion } from "@tauri-apps/api/app";
import { colors, shadows } from "../tokens.stylex";
import { Button, withStyle } from "../ui";
import type { Output } from "../api";
import type { Playback } from "../hooks/usePlayback";
import { FRAME } from "../project";
import { CropLayer, fillFactor } from "./CropLayer";
import { WarningIcon } from "./WarningIcon";

const styles = stylex.create({
  area: {
    display: "grid",
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
  // Nothing to play yet: no black video that looks like it failed to
  // load, and no frame either, just the welcome text on the stage.
  frameEmpty: {
    backgroundColor: "transparent",
    boxShadow: "none",
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
  // A welcome page: the app's name, what it does, and its three steps.
  // Only an empty project shows it.
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
    marginTop: 24,
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
  welcomeAdd: {
    marginTop: 20,
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
  notice: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  // Covers the picture while a lost clip is selected.
  missing: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 24,
    backgroundColor: colors.surface,
    textAlign: "center",
  },
  missingTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
  },
  missingText: {
    margin: 0,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 1.5,
  },
  missingActions: {
    display: "flex",
    gap: 8,
    marginTop: 6,
  },
  errorPill: {
    maxWidth: "90%",
    whiteSpace: "normal",
    borderRadius: 8,
    backgroundColor: "rgba(160, 20, 20, 0.85)",
  },
});

export interface MissingView {
  title: string;
  reason: string;
  onRemove: () => void;
  onReadd: () => void;
}

interface Props {
  /** Playable URL of the latest preview, or null before the first one. */
  src: string | null;
  aspect: Output["aspect"];
  /** False when clips are fitted whole (black bars, blur), so there is
   * nothing to drag. */
  croppable: boolean;
  /** Play state; the timeline holds the controls. */
  playback: Playback;
  /** Opens the picker, from the welcome page. */
  onAdd: () => void;
  busy: boolean;
  error: string | null;
  empty: boolean;
  /** Which clips the preview leaves out because their originals are
   * lost, e.g. "第 3 段"; null when none are. */
  skipped: string | null;
  /** Set while a lost clip is selected: why, and what to do about it. */
  missing: MissingView | null;
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
const STEPS = ["从 iPhone 选照片，或把文件拖进窗口", "在右边加标题、配乐和滤镜", "点右上角「导出」，直接发微信"];

export function Stage(props: Props) {
  const { src, aspect, croppable, playback, busy, error, empty, crop, skipped, missing } = props;
  const { video, playing } = playback;
  const [frameWidth, frameHeight] = FRAME[aspect];
  const frameAspect = frameWidth / frameHeight;
  const frame = useRef<HTMLDivElement>(null);
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
    else playback.toggle();
  }

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
            <video ref={video} key={src} src={src} playsInline {...playback.events} {...stylex.props(styles.video)} />
          )}
          {empty && (
            <div {...stylex.props(styles.empty)}>
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
              <span {...stylex.props(styles.welcomeAdd)}>
                <Button variant="primary" onClick={props.onAdd}>
                  添加照片…
                </Button>
              </span>
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
          {skipped && !missing && !error && !busy && !crop && !playing && (
            <div {...stylex.props(styles.pill, styles.notice)}>
              <WarningIcon size={12} />
              {skipped}原件丢失，预览里先跳过
            </div>
          )}
          {missing && (
            // Its buttons must not start a crop drag on the frame below.
            <div onPointerDown={(e) => e.stopPropagation()} {...stylex.props(styles.missing)}>
              <WarningIcon size={28} />
              <h3 {...stylex.props(styles.missingTitle)}>{missing.title}</h3>
              <p {...stylex.props(styles.missingText)}>{missing.reason}</p>
              <div {...stylex.props(styles.missingActions)}>
                <Button onClick={missing.onRemove}>移除这一段</Button>
                <Button variant="primary" onClick={missing.onReadd}>
                  重新添加…
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
