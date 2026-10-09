import { useEffect, useRef, useState, type PointerEvent } from "react";
import * as stylex from "@stylexjs/stylex";
import { cropFrame, fileUrl, type Clip } from "../api";
import { clipLabel, clipLength, formatTime, MIN_CLIP_LENGTH, parseTime, trimPatch, type Action } from "../project";
import { colors } from "../tokens.stylex";
import { Button, Icon, ui, withStyle } from "../ui";

/** Pictures along the timeline. */
const STRIP = 10;

const styles = stylex.create({
  area: {
    display: "grid",
    gridTemplateRows: "auto 1fr auto auto",
    gap: 10,
    minHeight: 0,
    minWidth: 0,
    paddingTop: "14px",
    paddingRight: "18px",
    paddingBottom: "12px",
    paddingLeft: "18px",
    backgroundColor: colors.stage,
  },
  header: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
  },
  heading: {
    margin: 0,
    fontSize: 13,
    fontWeight: 600,
  },
  // A size container, so the picture fits whatever space is left.
  wrap: {
    display: "grid",
    placeItems: "center",
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    containerType: "size",
  },
  video: {
    display: "block",
    maxWidth: "100cqw",
    maxHeight: "100cqh",
    borderRadius: 8,
    backgroundColor: "#000",
    cursor: "pointer",
  },
  track: {
    position: "relative",
    display: "flex",
    height: 52,
    borderRadius: 6,
    overflow: "hidden",
    backgroundColor: colors.surface2,
    cursor: "pointer",
    touchAction: "none",
  },
  cell: {
    flex: "1",
    backgroundPosition: "center",
    backgroundSize: "cover",
  },
  shade: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    pointerEvents: "none",
  },
  selection: {
    position: "absolute",
    top: 0,
    bottom: 0,
    borderTopWidth: 3,
    borderBottomWidth: 3,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderStyle: "solid",
    borderColor: colors.trimHandle,
    pointerEvents: "none",
  },
  handle: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 12,
    marginLeft: -6,
    borderRadius: 3,
    backgroundColor: colors.trimHandle,
    cursor: "ew-resize",
  },
  playhead: {
    position: "absolute",
    top: -2,
    bottom: -2,
    width: 2,
    marginLeft: -1,
    backgroundColor: "#fff",
    boxShadow: "0 0 2px rgba(0, 0, 0, 0.8)",
    pointerEvents: "none",
  },
  controls: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
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
    cursor: "pointer",
  },
  time: {
    minWidth: 96,
    color: colors.muted,
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
  },
  edge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
  },
  timeInput: {
    width: 64,
    textAlign: "center",
    fontVariantNumeric: "tabular-nums",
  },
});

interface Props {
  clip: Clip;
  dispatch: (action: Action) => void;
  onDone: () => void;
}

/** A large view of one clip's whole video for setting where it starts
 * and ends. Edits apply as they are made, like everywhere else. */
export function TrimEditor({ clip, dispatch, onDone }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(clip.trimStart);
  const [playing, setPlaying] = useState(false);
  const [strip, setStrip] = useState<string[]>([]);
  const latest = useRef(clip);
  latest.current = clip;
  const src = clip.normalizedPath ? fileUrl(clip.normalizedPath) : null;

  useEffect(() => {
    let cancelled = false;
    const times = Array.from({ length: STRIP }, (_, i) => ((i + 0.5) / STRIP) * clip.duration);
    Promise.all(times.map((at) => cropFrame(clip, at)))
      .then((paths) => !cancelled && setStrip(paths.map(fileUrl)))
      .catch(() => {}); // The timeline still works without pictures.
    return () => {
      cancelled = true;
    };
    // Only a different video needs new pictures, not a new trim.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.id, clip.normalizedPath]);

  function seek(t: number) {
    const v = video.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(t, 0), clip.duration);
    setTime(v.currentTime);
  }

  /** Plays the kept part, from the playhead if it is inside it. */
  function togglePlay() {
    const v = video.current;
    if (!v) return;
    if (!v.paused) return v.pause();
    const { trimStart, trimEnd } = latest.current;
    if (v.currentTime < trimStart || v.currentTime >= trimEnd - 0.05) v.currentTime = trimStart;
    void v.play();
  }

  // Stop at the end of the kept part; timeupdate alone overshoots it.
  useEffect(() => {
    if (!playing) return;
    let frame = requestAnimationFrame(function check() {
      const v = video.current;
      if (v) {
        setTime(v.currentTime);
        if (v.currentTime >= latest.current.trimEnd) {
          v.pause();
          v.currentTime = latest.current.trimEnd;
        }
      }
      frame = requestAnimationFrame(check);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((document.activeElement as HTMLElement)?.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "Escape") onDone();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const timeAt = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * clip.duration;
  };

  /** Drags the playhead, or an end of the kept part, along the timeline. */
  function drag(target: "playhead" | "start" | "end") {
    return (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      video.current?.pause();
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const move = (clientX: number) => {
        const t = timeAt(clientX);
        if (target === "playhead") return seek(t);
        const patch = trimPatch(latest.current, target, t);
        dispatch({ type: "updateClip", id: clip.id, patch });
        seek(target === "start" ? patch.trimStart! : patch.trimEnd!);
      };
      move(e.clientX);
      el.onpointermove = (m) => move(m.clientX);
      el.onpointerup = () => {
        el.onpointermove = null;
      };
    };
  }

  const setEdge = (edge: "start" | "end", t: number) =>
    dispatch({ type: "updateClip", id: clip.id, patch: trimPatch(clip, edge, t) });
  const canStartHere = time <= clip.trimEnd - MIN_CLIP_LENGTH;
  const canEndHere = time >= clip.trimStart + MIN_CLIP_LENGTH;
  const at = (t: number) => `${(t / clip.duration) * 100}%`;

  return (
    <section {...stylex.props(styles.area)}>
      <div {...stylex.props(styles.header)}>
        <h2 {...stylex.props(styles.heading)}>精确剪辑 · {clipLabel(clip)}</h2>
        <span {...stylex.props(ui.note)}>拖动黄色把手，或停在某一帧后点「设为开头 / 结尾」</span>
        <span {...stylex.props(ui.spacer)} />
        <Button variant="primary" onClick={onDone}>
          完成
        </Button>
      </div>

      <div {...stylex.props(styles.wrap)}>
        {src && (
          <video
            ref={video}
            src={src}
            playsInline
            preload="auto"
            onLoadedMetadata={(e) => {
              e.currentTarget.currentTime = latest.current.trimStart;
            }}
            onClick={togglePlay}
            onSeeked={(e) => setTime(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            {...stylex.props(styles.video)}
          />
        )}
      </div>

      <div ref={track} onPointerDown={drag("playhead")} {...stylex.props(styles.track)}>
        {Array.from({ length: STRIP }, (_, i) => (
          <div
            key={i}
            {...withStyle(stylex.props(styles.cell), strip[i] ? { backgroundImage: `url("${strip[i]}")` } : undefined)}
          />
        ))}
        <div {...withStyle(stylex.props(styles.shade), { left: 0, width: at(clip.trimStart) })} />
        <div {...withStyle(stylex.props(styles.shade), { left: at(clip.trimEnd), right: 0 })} />
        <div
          {...withStyle(stylex.props(styles.selection), {
            left: at(clip.trimStart),
            width: at(clipLength(clip)),
          })}
        />
        <div {...withStyle(stylex.props(styles.playhead), { left: at(time) })} />
        <div
          aria-label="开头"
          onPointerDown={drag("start")}
          {...withStyle(stylex.props(styles.handle), { left: at(clip.trimStart) })}
        />
        <div
          aria-label="结尾"
          onPointerDown={drag("end")}
          {...withStyle(stylex.props(styles.handle), { left: at(clip.trimEnd) })}
        />
      </div>

      <div {...stylex.props(styles.controls)}>
        <button aria-label={playing ? "暂停" : "播放选段"} onClick={togglePlay} {...stylex.props(styles.play)}>
          <Icon>
            {playing ? (
              <path d="M5 3.5v9M11 3.5v9" strokeWidth="2.2" />
            ) : (
              <path d="M5 3.5v9l7-4.5z" fill="currentColor" stroke="none" />
            )}
          </Icon>
        </button>
        <span {...stylex.props(styles.time)}>
          {formatTime(time)} / {formatTime(clip.duration)}
        </span>
        <span {...stylex.props(styles.edge)}>
          开头
          <TimeInput label="开头" value={clip.trimStart} onCommit={(t) => setEdge("start", t)} />
          <Button disabled={!canStartHere} onClick={() => setEdge("start", time)}>
            设为开头
          </Button>
        </span>
        <span {...stylex.props(styles.edge)}>
          结尾
          <TimeInput label="结尾" value={clip.trimEnd} onCommit={(t) => setEdge("end", t)} />
          <Button disabled={!canEndHere} onClick={() => setEdge("end", time)}>
            设为结尾
          </Button>
        </span>
        <span {...stylex.props(ui.note)}>保留 {clipLength(clip).toFixed(1)} 秒</span>
      </div>
    </section>
  );
}

/** A time typed as "1:02.5" or "62.5"; anything else goes back to `value`. */
function TimeInput({ label, value, onCommit }: { label: string; value: number; onCommit: (t: number) => void }) {
  /** What is being typed; null shows `value`. */
  const [draft, setDraft] = useState<string | null>(null);
  const discard = useRef(false);

  function commit() {
    const t = draft === null ? null : parseTime(draft);
    if (t !== null && !discard.current) onCommit(t);
    discard.current = false;
    setDraft(null);
  }

  return (
    <input
      aria-label={label}
      value={draft ?? formatTime(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          // Undo the typing only, not close the whole view.
          e.stopPropagation();
          discard.current = true;
          e.currentTarget.blur();
        }
      }}
      {...stylex.props(ui.textInput, styles.timeInput)}
    />
  );
}
