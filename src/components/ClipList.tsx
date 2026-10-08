import { useRef, type CSSProperties } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as stylex from "@stylexjs/stylex";
import type { Clip } from "../api";
import { clipLabel, clipLength, type Action } from "../project";
import { colors, shadows } from "../tokens.stylex";
import { Button, Switch, ui, withStyle } from "../ui";

/** Shortest a trimmed clip may get, in seconds. */
const MIN_LENGTH = 0.5;

const styles = stylex.create({
  list: {
    display: "grid",
    gap: 2,
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  empty: {
    padding: 8,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 1.6,
  },
  row: {
    display: "grid",
    gridTemplateColumns: "16px 30px 1fr auto",
    gap: 8,
    alignItems: "center",
    padding: "6px 8px",
    borderRadius: 8,
    backgroundColor: {
      default: "transparent",
      ":hover": colors.hover,
    },
  },
  selected: {
    backgroundColor: {
      default: colors.accentSoft,
      ":hover": colors.accentSoft,
    },
  },
  dragging: {
    position: "relative",
    zIndex: 2,
    backgroundColor: colors.surface,
    boxShadow: shadows.lifted,
  },
  grip: {
    color: colors.muted,
    cursor: "grab",
    fontSize: 11,
    textAlign: "center",
    touchAction: "none",
  },
  thumb: {
    width: 30,
    height: 40,
    borderRadius: 4,
    backgroundColor: colors.surface2,
    backgroundPosition: "center",
    backgroundSize: "cover",
  },
  label: {
    fontWeight: 500,
  },
  mutedLabel: {
    color: colors.muted,
  },
  sub: {
    fontSize: 11,
    color: colors.muted,
  },
  detail: {
    gridColumn: "1 / -1",
    display: "grid",
    gap: 8,
    marginTop: 6,
    padding: 8,
    borderRadius: 6,
    backgroundColor: colors.surface,
    fontSize: 12,
  },
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  trim: {
    position: "relative",
    height: 26,
    borderRadius: 4,
    backgroundColor: colors.surface2,
    backgroundPosition: "center",
    backgroundSize: "cover",
  },
  shade: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
  },
  handle: {
    position: "absolute",
    top: -2,
    bottom: -2,
    width: 8,
    marginLeft: -4,
    borderRadius: 3,
    backgroundColor: colors.trimHandle,
    cursor: "ew-resize",
    touchAction: "none",
  },
});

interface Props {
  clips: Clip[];
  selectedId: string | null;
  thumbs: Record<string, string>;
  onSelect: (id: string) => void;
  dispatch: (action: Action) => void;
}

export function ClipList({ clips, selectedId, thumbs, onSelect, dispatch }: Props) {
  // A small move threshold keeps plain clicks as clicks.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = clips.findIndex((c) => c.id === active.id);
    const to = clips.findIndex((c) => c.id === over.id);
    dispatch({ type: "moveClip", from, to });
  }

  if (clips.length === 0) {
    return <p {...stylex.props(styles.empty)}>还没有片段。点「添加照片」从 iPhone 挑选 Live Photo。</p>;
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={clips.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <ul {...stylex.props(styles.list)}>
          {clips.map((clip, index) => (
            <ClipRow
              key={clip.id}
              clip={clip}
              index={index}
              selected={clip.id === selectedId}
              thumb={clip.assetId ? thumbs[clip.assetId] : undefined}
              onSelect={() => onSelect(clip.id)}
              dispatch={dispatch}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

interface RowProps {
  clip: Clip;
  index: number;
  selected: boolean;
  thumb?: string;
  onSelect: () => void;
  dispatch: (action: Action) => void;
}

function ClipRow({ clip, index, selected, thumb, onSelect, dispatch }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: clip.id });
  const thumbImage = thumb ? { backgroundImage: `url("${thumb}")` } : undefined;

  return (
    <li
      ref={setNodeRef}
      onClick={onSelect}
      {...withStyle(stylex.props(styles.row, selected && styles.selected, isDragging && styles.dragging), {
        transform: CSS.Transform.toString(transform),
        transition,
      })}
    >
      <span {...attributes} {...listeners} aria-label="拖动排序" {...stylex.props(styles.grip)}>
        ⋮⋮
      </span>
      <span {...withStyle(stylex.props(styles.thumb), thumbImage)} />
      <span>
        <div {...stylex.props(styles.label, clip.muted && styles.mutedLabel)}>
          {index + 1}. {clipLabel(clip)}
        </div>
        <div {...stylex.props(styles.sub)}>
          {clipLength(clip).toFixed(1)} 秒{clip.kind === "video" ? " · 视频" : ""}
        </div>
      </span>
      <span {...stylex.props(styles.sub)}>{clip.muted ? "🔇" : ""}</span>
      {selected && (
        <div onClick={(e) => e.stopPropagation()} {...stylex.props(styles.detail)}>
          <div {...stylex.props(styles.detailRow)}>
            <span>截取</span>
            <span {...stylex.props(ui.note)}>
              {clip.trimStart.toFixed(1)}s – {clip.trimEnd.toFixed(1)}s
            </span>
          </div>
          <TrimBar clip={clip} thumbImage={thumbImage} dispatch={dispatch} />
          <div {...stylex.props(styles.detailRow)}>
            <span>静音这一段</span>
            <Switch
              on={clip.muted}
              label="静音这一段"
              onToggle={() => dispatch({ type: "updateClip", id: clip.id, patch: { muted: !clip.muted } })}
            />
          </div>
          <div {...stylex.props(styles.detailRow)}>
            <span {...stylex.props(ui.note)}>裁切位置：下一版支持在预览上拖动</span>
            <Button variant="danger" onClick={() => dispatch({ type: "removeClip", id: clip.id })}>
              移除
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function TrimBar({
  clip,
  thumbImage,
  dispatch,
}: {
  clip: Clip;
  thumbImage?: CSSProperties;
  dispatch: (action: Action) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const left = (clip.trimStart / clip.duration) * 100;
  const right = (clip.trimEnd / clip.duration) * 100;

  function drag(handle: "start" | "end") {
    return (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      const rect = bar.current!.getBoundingClientRect();
      target.onpointermove = (move) => {
        const t = Math.min(1, Math.max(0, (move.clientX - rect.left) / rect.width)) * clip.duration;
        const rounded = Math.round(t * 10) / 10;
        const patch =
          handle === "start"
            ? { trimStart: Math.max(0, Math.min(rounded, clip.trimEnd - MIN_LENGTH)) }
            : { trimEnd: Math.min(clip.duration, Math.max(rounded, clip.trimStart + MIN_LENGTH)) };
        dispatch({ type: "updateClip", id: clip.id, patch });
      };
      target.onpointerup = () => {
        target.onpointermove = null;
      };
    };
  }

  return (
    <div ref={bar} {...withStyle(stylex.props(styles.trim), thumbImage)}>
      <div {...withStyle(stylex.props(styles.shade), { left: 0, width: `${left}%` })} />
      <div {...withStyle(stylex.props(styles.shade), { left: `${right}%`, right: 0 })} />
      <div {...withStyle(stylex.props(styles.handle), { left: `${left}%` })} onPointerDown={drag("start")} />
      <div {...withStyle(stylex.props(styles.handle), { left: `${right}%` })} onPointerDown={drag("end")} />
    </div>
  );
}
