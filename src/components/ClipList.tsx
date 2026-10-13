import { useRef, type CSSProperties } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as stylex from "@stylexjs/stylex";
import type { Caption, Clip } from "../api";
import {
  CAPTION_FIRST_SECONDS,
  clipLabel,
  clipLength,
  formatTime,
  hasCaption,
  NEW_CAPTION,
  trimPatch,
  type Action,
} from "../project";
import { colors, shadows } from "../tokens.stylex";
import { Button, Seg, Switch, ui, withStyle } from "../ui";

const styles = stylex.create({
  list: {
    display: "grid",
    gap: 2,
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "16px 30px 1fr",
    gap: 8,
    alignItems: "center",
    paddingBlock: "6px",
    paddingInline: "8px",
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
  // Lets the caption excerpt shrink instead of widening the row.
  info: {
    minWidth: 0,
  },
  label: {
    fontWeight: 500,
  },
  mutedLabel: {
    color: colors.muted,
  },
  dimmed: {
    color: colors.muted,
  },
  sub: {
    overflow: "hidden",
    fontSize: 11,
    color: colors.muted,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  detail: {
    gridColumnEnd: "-1",
    gridColumnStart: "1",
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
  // The panel is split into 剪辑, 文字 and 声音, like the inspector's groups.
  head: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: 600,
  },
  centred: {
    display: "flex",
    justifyContent: "center",
  },
  rule: {
    height: 1,
    margin: 0,
    borderWidth: 0,
    backgroundColor: colors.border,
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
  /** True when the music replaces every clip's own sound, so muting a
   * clip would change nothing. */
  noOriginalSound: boolean;
  onSelect: (id: string) => void;
  /** Opens the large trim view for a clip. */
  onTrim: (id: string) => void;
  dispatch: (action: Action) => void;
}

export function ClipList({ clips, selectedId, thumbs, noOriginalSound, onSelect, onTrim, dispatch }: Props) {
  // A small move threshold keeps plain clicks as clicks.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = clips.findIndex((c) => c.id === active.id);
    const to = clips.findIndex((c) => c.id === over.id);
    dispatch({ type: "moveClip", from, to });
  }

  // The stage says how to add clips; an empty list needs no words.
  if (clips.length === 0) return null;
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
              noOriginalSound={noOriginalSound}
              onSelect={() => onSelect(clip.id)}
              onTrim={() => onTrim(clip.id)}
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
  noOriginalSound: boolean;
  onSelect: () => void;
  onTrim: () => void;
  dispatch: (action: Action) => void;
}

function ClipRow({ clip, index, selected, thumb, noOriginalSound, onSelect, onTrim, dispatch }: RowProps) {
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
      <span {...stylex.props(styles.info)}>
        <div {...stylex.props(styles.label, clip.muted && styles.mutedLabel)}>
          {index + 1}. {clipLabel(clip)}
        </div>
        <div {...stylex.props(styles.sub)}>
          {clipLength(clip).toFixed(1)} 秒{clip.kind === "video" ? " · 视频" : ""}
          {hasCaption(clip) && ` · ${clip.caption!.text.trim()}`}
        </div>
      </span>
      {selected && (
        <div onClick={(e) => e.stopPropagation()} {...stylex.props(styles.detail)}>
          <div {...stylex.props(styles.detailRow)}>
            <span {...stylex.props(styles.head)}>剪辑</span>
            <span {...stylex.props(ui.note)}>
              {formatTime(clip.trimStart)} – {formatTime(clip.trimEnd)}（共 {formatTime(clip.duration)}）
            </span>
          </div>
          <TrimBar clip={clip} thumbImage={thumbImage} dispatch={dispatch} />
          <Button onClick={onTrim}>精确剪辑…</Button>
          <p {...stylex.props(ui.note)}>裁切位置：在预览上拖动画面</p>
          <hr {...stylex.props(styles.rule)} />
          <span {...stylex.props(styles.head)}>文字</span>
          <CaptionFields clip={clip} dispatch={dispatch} />
          <hr {...stylex.props(styles.rule)} />
          <span {...stylex.props(styles.head)}>声音</span>
          <div {...stylex.props(styles.detailRow)}>
            <span {...stylex.props(noOriginalSound && styles.dimmed)}>静音这一段</span>
            <Switch
              on={clip.muted}
              label="静音这一段"
              disabled={noOriginalSound}
              onToggle={() => dispatch({ type: "updateClip", id: clip.id, patch: { muted: !clip.muted } })}
            />
          </div>
          {noOriginalSound && (
            <p {...stylex.props(ui.note)}>配乐模式下没有原声；切回「原声」或「配乐 + 原声」后生效。</p>
          )}
          <hr {...stylex.props(styles.rule)} />
          <div {...stylex.props(styles.centred)}>
            <Button variant="danger" onClick={() => dispatch({ type: "removeClip", id: clip.id })}>
              移除这一段
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
        dispatch({ type: "updateClip", id: clip.id, patch: trimPatch(clip, handle, t) });
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

/** Text over this clip; where it sits and how long it shows appear once
 * there is some. Fragments, so they space like the rest of the panel. */
function CaptionFields({ clip, dispatch }: { clip: Clip; dispatch: (action: Action) => void }) {
  const caption = clip.caption ?? NEW_CAPTION;
  const set = (patch: Partial<Caption>) =>
    dispatch({ type: "updateClip", id: clip.id, patch: { caption: { ...caption, ...patch } } });
  return (
    <>
      <input
        value={caption.text}
        placeholder="叠在这一段上，可不填"
        aria-label="这一段的文字"
        onChange={(e) => set({ text: e.target.value })}
        {...stylex.props(ui.textInput)}
      />
      {hasCaption(clip) && (
        <>
          <Seg<Caption["position"]>
            options={[
              ["top", "上"],
              ["center", "中"],
              ["bottom", "下"],
            ]}
            value={caption.position}
            onChange={(position) => set({ position })}
          />
          <Seg<"whole" | "first">
            options={[
              ["whole", "整段"],
              ["first", `前 ${CAPTION_FIRST_SECONDS} 秒`],
            ]}
            value={caption.showFor === null ? "whole" : "first"}
            onChange={(shown) => set({ showFor: shown === "whole" ? null : CAPTION_FIRST_SECONDS })}
          />
        </>
      )}
    </>
  );
}
