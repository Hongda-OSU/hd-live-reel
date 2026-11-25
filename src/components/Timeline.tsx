import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import * as stylex from "@stylexjs/stylex";
import type { Clip } from "../api";
import type { Playback } from "../hooks/usePlayback";
import { clipLabel, formatTime, hasCaption, isMissing } from "../project";
import { colors, shadows } from "../tokens.stylex";
import { Icon, withStyle } from "../ui";
import { WarningIcon } from "./WarningIcon";

/** Space before the first clip and after the last, in px. */
const PAD = 16;
/** Narrowest a clip gets, so a short one can still be grabbed. */
const MIN_WIDTH = 24;
/** A lost clip takes no time in the preview; it shows this wide. */
const MISSING_WIDTH = 28;
/** Most the zoom slider magnifies the fitted timeline. */
const MAX_ZOOM = 16;
/** Ruler steps in seconds; the smallest at least this far apart is used. */
const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120];
const TICK_SPACING = 64;

const styles = stylex.create({
  timeline: {
    gridColumnStart: 1,
    gridColumnEnd: -1,
    display: "grid",
    gridTemplateRows: "auto minmax(0, 1fr)",
    minWidth: 0,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.border,
    backgroundColor: colors.window,
  },
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    height: 36,
    paddingInline: "16px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  play: {
    display: "grid",
    placeItems: "center",
    width: 28,
    height: 28,
    padding: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: "50%",
    backgroundColor: colors.surface,
    color: colors.text,
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
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
  },
  muted: {
    color: colors.muted,
  },
  quality: {
    color: colors.muted,
    fontSize: 11,
  },
  spacer: {
    flex: "1",
  },
  // Adding and clearing the clips sit together, closer than the rest.
  hint: {
    color: colors.muted,
    fontSize: 11,
  },
  zoom: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: colors.muted,
  },
  zoomRange: {
    width: 90,
    margin: 0,
    accentColor: colors.accent,
  },
  // Scrolls sideways once zoomed past the window's width.
  scroller: {
    position: "relative",
    overflowX: "auto",
    overflowY: "hidden",
  },
  track: {
    position: "relative",
    height: "100%",
  },
  // Slim, but kept: it is where the playhead is scrubbed.
  ruler: {
    position: "relative",
    height: 14,
    cursor: "pointer",
  },
  tick: {
    position: "absolute",
    top: 0,
    height: "100%",
    borderLeftWidth: 1,
    borderLeftStyle: "solid",
    borderLeftColor: colors.border,
    paddingLeft: "4px",
    color: colors.muted,
    fontSize: 9,
    lineHeight: "12px",
    fontVariantNumeric: "tabular-nums",
    pointerEvents: "none",
  },
  clips: {
    display: "flex",
    height: 58,
    paddingInline: `${PAD}px`,
  },
  // The whole block drags and takes keyboard focus for reordering.
  block: {
    position: "relative",
    flexShrink: 0,
    height: "100%",
    borderRadius: 5,
    outline: {
      default: "none",
      ":focus-visible": `2px solid ${colors.accent}`,
    },
    outlineOffset: -1,
    touchAction: "none",
    cursor: "pointer",
  },
  // Inset by a pixel each side, so blocks sit exactly where their time
  // is and still show a gap.
  picture: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 1,
    right: 1,
    overflow: "hidden",
    borderRadius: 4,
    backgroundColor: colors.surface2,
    // Tiled like a filmstrip, centred so a narrow block shows the
    // middle of its picture.
    backgroundPosition: "center",
    backgroundRepeat: "repeat-x",
    backgroundSize: "auto 100%",
  },
  missing: {
    display: "grid",
    placeItems: "center",
  },
  selected: {
    boxShadow: `inset 0 0 0 2px ${colors.accent}, inset 0 0 0 3px rgba(0, 0, 0, 0.35)`,
  },
  lifted: {
    opacity: 0.35,
  },
  badges: {
    position: "absolute",
    top: 3,
    left: 3,
    display: "flex",
    gap: 2,
  },
  badge: {
    display: "grid",
    placeItems: "center",
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    color: "#fff",
  },
  badgeIcon: {
    width: 10,
    height: 10,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
  // A clip with a caption gets a yellow line along its foot; the text
  // itself is on the 这一段 page and in the block's tooltip.
  caption: {
    position: "absolute",
    left: 3,
    right: 3,
    bottom: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#ffd60a",
  },
  playhead: {
    position: "absolute",
    top: 0,
    bottom: 4,
    width: 2,
    marginLeft: -1,
    borderRadius: 1,
    backgroundColor: colors.text,
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.4)",
    pointerEvents: "none",
  },
  playheadKnob: {
    position: "absolute",
    top: 0,
    left: -4,
    width: 10,
    height: 8,
    backgroundColor: colors.text,
    clipPath: "polygon(0 0, 100% 0, 50% 100%)",
  },
  // Where a dragged clip will land.
  drop: {
    position: "absolute",
    top: 14,
    height: 58,
    width: 3,
    marginLeft: -1.5,
    borderRadius: 2,
    backgroundColor: colors.accent,
    pointerEvents: "none",
  },
  ghost: {
    width: 44,
    height: 58,
    borderRadius: 5,
    backgroundColor: colors.surface2,
    backgroundPosition: "center",
    backgroundSize: "cover",
    boxShadow: shadows.lifted,
    cursor: "grabbing",
  },
});

interface Block {
  clip: Clip;
  /** Seconds it holds in the preview; null for a lost clip. */
  span: number | null;
  /** Where it starts in the preview, in seconds. */
  start: number;
  left: number;
  width: number;
}

/** Lays the clips out left to right: each as wide as its time, but no
 * narrower than a grabbable minimum. */
function layOut(clips: Clip[], spans: Record<string, number>, pxPerSecond: number): Block[] {
  let start = 0;
  let left = PAD;
  return clips.map((clip) => {
    const span = isMissing(clip) ? null : (spans[clip.id] ?? 0);
    const width = span === null ? MISSING_WIDTH : Math.max(MIN_WIDTH, span * pxPerSecond);
    const block = { clip, span, start, left, width };
    start += span ?? 0;
    left += width;
    return block;
  });
}

/** Where `time` sits on the track. */
function timeToX(blocks: Block[], time: number): number {
  for (const b of blocks) {
    if (b.span === null) continue;
    if (time <= b.start + b.span) return b.left + (b.span ? ((time - b.start) / b.span) * b.width : 0);
  }
  return trackEnd(blocks);
}

/** Right edge of the last block. */
const trackEnd = (blocks: Block[]) =>
  blocks.length ? blocks[blocks.length - 1].left + blocks[blocks.length - 1].width : PAD;

/** The preview time under `x` on the track. */
function xToTime(blocks: Block[], x: number): number {
  for (const b of blocks) {
    if (x > b.left + b.width) continue;
    if (b.span === null) return b.start;
    return b.start + (Math.max(0, x - b.left) / b.width) * b.span;
  }
  const playable = blocks.filter((b) => b.span !== null);
  const last = playable[playable.length - 1];
  return last ? last.start + last.span! : 0;
}

/** "0:05", "1:30". */
const tickLabel = (t: number) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}`;

interface Props {
  /** Every clip, in order, lost ones too. */
  clips: Clip[];
  /** Seconds each playable clip holds in the preview, by id. */
  spans: Record<string, number>;
  selectedId: string | null;
  thumbs: Record<string, string>;
  playback: Playback;
  /** False while there is no preview to play. */
  ready: boolean;
  onSelect: (id: string) => void;
  onMove: (from: number, to: number) => void;
}

/** The clips in play order, each as wide as its time: picks, reorders and
 * plays the reel. */
export function Timeline({ clips, spans, selectedId, thumbs, playback, ready, onSelect, onMove }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const total = Object.values(spans).reduce((a, b) => a + b, 0);
  const missing = clips.filter(isMissing).length;
  // Zoom 0 fits the whole reel in the window.
  const fit = total > 0 ? Math.max(1, (width - 2 * PAD - missing * MISSING_WIDTH) / total) : 1;
  const pxPerSecond = fit * Math.pow(MAX_ZOOM, zoom);
  const blocks = layOut(clips, spans, pxPerSecond);
  const trackWidth = trackEnd(blocks) + PAD;
  const { time, duration, playing } = playback;
  const headX = timeToX(blocks, ready ? time : 0);

  // Picked in the grid: bring it into view here too.
  const selected = blocks.find((b) => b.clip.id === selectedId);
  const selectedLeft = selected?.left ?? null;
  const selectedRight = selected ? selected.left + selected.width : null;
  useEffect(() => {
    const el = scroller.current;
    if (!el || selectedLeft === null || selectedRight === null) return;
    if (selectedLeft < el.scrollLeft) el.scrollLeft = selectedLeft - PAD;
    else if (selectedRight > el.scrollLeft + el.clientWidth) el.scrollLeft = selectedRight - el.clientWidth + PAD;
  }, [selectedId, selectedLeft, selectedRight]);

  // While playing, keep the playhead in view.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !playing) return;
    if (headX < el.scrollLeft + 40 || headX > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = headX - 80;
  }, [headX, playing]);

  const step = TICK_STEPS.find((s) => s * pxPerSecond >= TICK_SPACING) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const ticks = [];
  for (let t = 0; t <= total; t += step) ticks.push(t);

  function scrub(e: PointerEvent<HTMLDivElement>) {
    if (!ready) return;
    const rect = e.currentTarget.getBoundingClientRect();
    playback.seek(Math.min(xToTime(blocks, e.clientX - rect.left), duration || total));
  }

  // A small move threshold keeps plain clicks as clicks.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Space picks a focused block up, the arrows move it, space drops it.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const from = clips.findIndex((c) => c.id === dragging);
  const to = clips.findIndex((c) => c.id === over);
  // The line goes after the block hovered when moving right, before it when
  // moving left: where the clip ends up.
  const dropX = from >= 0 && to >= 0 && from !== to ? blocks[to].left + (to > from ? blocks[to].width : 0) : null;
  const draggedThumb = from >= 0 ? thumbOf(clips[from], thumbs) : undefined;

  function onDragStart({ active }: DragStartEvent) {
    setDragging(String(active.id));
  }
  function onDragOver({ over }: DragOverEvent) {
    setOver(over ? String(over.id) : null);
  }
  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(null);
    setOver(null);
    if (!over || active.id === over.id) return;
    onMove(
      clips.findIndex((c) => c.id === active.id),
      clips.findIndex((c) => c.id === over.id),
    );
  }

  return (
    <section aria-label="时间线" {...stylex.props(styles.timeline)}>
      <div {...stylex.props(styles.bar)}>
        <button
          aria-label={playing ? "暂停" : "播放"}
          disabled={!ready}
          onClick={playback.toggle}
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
          {/* Without a preview, the last one's time and length are stale. */}
          {formatTime(ready ? time : 0)}{" "}
          <span {...stylex.props(styles.muted)}>/ {formatTime(ready ? duration || total : total)}</span>
        </span>
        <span title="导出为 1080p 高清" {...stylex.props(styles.quality)}>
          低清预览
        </span>
        <span {...stylex.props(styles.spacer)} />
        <span {...stylex.props(styles.hint)}>{clips.length} 段 · 拖动或 ⌥← ⌥→ 换位置</span>
        <label {...stylex.props(styles.zoom)}>
          <svg viewBox="0 0 16 16" aria-hidden {...stylex.props(styles.badgeIcon)}>
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5 14 14M5 7h4" />
          </svg>
          <input
            type="range"
            aria-label="缩放时间线"
            min={0}
            max={1}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            {...stylex.props(styles.zoomRange)}
          />
          <svg viewBox="0 0 16 16" aria-hidden {...stylex.props(styles.badgeIcon)}>
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5 14 14M5 7h4M7 5v4" />
          </svg>
        </label>
      </div>
      <div ref={scroller} {...stylex.props(styles.scroller)}>
        <div {...withStyle(stylex.props(styles.track), { width: trackWidth })}>
          {/* Pressing or dragging along the ruler moves the playhead. */}
          <div
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              scrub(e);
            }}
            onPointerMove={(e) => e.buttons === 1 && scrub(e)}
            {...stylex.props(styles.ruler)}
          >
            {ticks.map((t) => (
              <span key={t} {...withStyle(stylex.props(styles.tick), { left: timeToX(blocks, t) })}>
                {tickLabel(t)}
              </span>
            ))}
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
              setDragging(null);
              setOver(null);
            }}
          >
            {/* Blocks stay put while dragging; a line shows where it lands. */}
            <SortableContext items={clips.map((c) => c.id)} strategy={() => null}>
              <div {...stylex.props(styles.clips)}>
                {blocks.map((b) => (
                  <ClipBlock
                    key={b.clip.id}
                    block={b}
                    selected={b.clip.id === selectedId}
                    thumb={thumbOf(b.clip, thumbs)}
                    onSelect={() => onSelect(b.clip.id)}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {dragging && (
                <div
                  {...withStyle(
                    stylex.props(styles.ghost),
                    draggedThumb ? { backgroundImage: `url("${draggedThumb}")` } : undefined,
                  )}
                />
              )}
            </DragOverlay>
          </DndContext>
          {dropX !== null && <span {...withStyle(stylex.props(styles.drop), { left: dropX })} />}
          {ready && (
            <span {...withStyle(stylex.props(styles.playhead), { left: headX })}>
              <span {...stylex.props(styles.playheadKnob)} />
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

const thumbOf = (clip: Clip, thumbs: Record<string, string>) => (clip.assetId ? thumbs[clip.assetId] : undefined);

function ClipBlock({
  block,
  selected,
  thumb,
  onSelect,
}: {
  block: Block;
  selected: boolean;
  thumb?: string;
  onSelect: () => void;
}) {
  const { clip, width } = block;
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({ id: clip.id });
  const lost = isMissing(clip);
  const badges = width >= 30 && !lost && clip.kind === "video";
  const picture: CSSProperties | undefined = thumb && !lost ? { backgroundImage: `url("${thumb}")` } : undefined;
  return (
    <div
      ref={setNodeRef}
      onClick={onSelect}
      {...attributes}
      {...listeners}
      aria-roledescription="可拖动排序的片段"
      aria-pressed={selected}
      title={
        lost
          ? `${clipLabel(clip)}（原件丢失）`
          : hasCaption(clip)
            ? `${clipLabel(clip)}：${clip.caption!.text.trim()}`
            : clipLabel(clip)
      }
      {...withStyle(stylex.props(styles.block, isDragging && styles.lifted), { width })}
    >
      <span {...withStyle(stylex.props(styles.picture, lost && styles.missing, selected && styles.selected), picture)}>
        {lost && <WarningIcon size={12} />}
        {hasCaption(clip) && !lost && <span {...stylex.props(styles.caption)} />}
        {badges && (
          <span {...stylex.props(styles.badges)}>
            {clip.kind === "video" && (
              <span aria-label="视频" {...stylex.props(styles.badge)}>
                <svg viewBox="0 0 16 16" {...stylex.props(styles.badgeIcon)}>
                  <rect x="1.5" y="4" width="9" height="8" rx="1.5" />
                  <path d="M10.5 7l4-2v6l-4-2" />
                </svg>
              </span>
            )}
          </span>
        )}
      </span>
    </div>
  );
}
