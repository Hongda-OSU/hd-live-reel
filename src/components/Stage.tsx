import type { CSSProperties } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, shadows } from "../tokens.stylex";
import { Button, withStyle } from "../ui";
import type { Output } from "../api";
import type { Playback } from "../hooks/usePlayback";
import { FRAME } from "../project";
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
    cursor: "default",
  },
  // As large as fits: the full width, unless that would be too tall.
  // `--ratio` is the frame's width over its height.
  shaped: {
    width: "min(100cqw, 100cqh * var(--ratio))",
    aspectRatio: "var(--ratio)",
  },
  video: {
    display: "block",
    width: "100%",
    height: "100%",
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
  /** Play state; the timeline holds the controls. */
  playback: Playback;
  /** A new preview is being made: the timeline bar says so, and notes
   * about the old one are held back meanwhile. */
  busy: boolean;
  error: string | null;
  /** Which clips the preview leaves out because their originals are
   * lost, e.g. "第 3 段"; null when none are. */
  skipped: string | null;
  /** Set while a lost clip is selected: why, and what to do about it. */
  missing: MissingView | null;
}

/** The preview, as large as fits; a click plays or pauses it. */
export function Stage(props: Props) {
  const { src, aspect, playback, busy, error, skipped, missing } = props;
  const { video, playing } = playback;
  const [frameWidth, frameHeight] = FRAME[aspect];

  return (
    <section {...stylex.props(styles.area)}>
      <div {...stylex.props(styles.wrap)}>
        <div
          onClick={() => src && playback.toggle()}
          {...withStyle(stylex.props(styles.frame, styles.shaped), {
            "--ratio": `${frameWidth} / ${frameHeight}`,
          } as CSSProperties)}
        >
          {src && (
            <video ref={video} key={src} src={src} playsInline {...playback.events} {...stylex.props(styles.video)} />
          )}
          {error && !busy && <div {...stylex.props(styles.pill, styles.errorPill)}>{error}</div>}
          {skipped && !missing && !error && !busy && !playing && (
            <div {...stylex.props(styles.pill, styles.notice)}>
              <WarningIcon size={12} />
              {skipped}原件丢失，预览里先跳过
            </div>
          )}
          {missing && (
            // Its buttons must not also play the preview below.
            <div onClick={(e) => e.stopPropagation()} {...stylex.props(styles.missing)}>
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
