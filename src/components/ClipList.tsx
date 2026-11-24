import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as stylex from "@stylexjs/stylex";
import type { Clip } from "../api";
import { clipLabel, clipLength, hasCaption, isMissing, type Action } from "../project";
import { colors, shadows } from "../tokens.stylex";
import { withStyle } from "../ui";
import { WarningIcon } from "./WarningIcon";

/** Number, picture, what and when, length: shared by the header and rows. */
const COLUMNS = "18px 22px minmax(0, 1fr) 30px";

const styles = stylex.create({
  // A table across the whole sidebar, past its padding, like Finder's
  // list view.
  table: {
    marginInline: "-10px",
  },
  header: {
    display: "grid",
    gridTemplateColumns: COLUMNS,
    gap: 8,
    paddingBlock: "4px",
    paddingInline: "14px",
    borderBlockWidth: 1,
    borderBlockStyle: "solid",
    borderBlockColor: colors.border,
    color: colors.muted,
    fontSize: 10,
    fontWeight: 600,
  },
  end: {
    textAlign: "right",
  },
  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  // The whole row drags, and takes keyboard focus for reordering with the
  // arrow keys.
  row: {
    display: "grid",
    gridTemplateColumns: COLUMNS,
    gap: 8,
    alignItems: "center",
    height: 34,
    paddingInline: "14px",
    backgroundColor: {
      default: "transparent",
      ":nth-child(even)": colors.stripe,
      ":hover": colors.hover,
    },
    outline: {
      default: "none",
      ":focus-visible": `2px solid ${colors.accent}`,
    },
    outlineOffset: -2,
    touchAction: "none",
  },
  selected: {
    backgroundColor: {
      default: colors.accent,
      ":nth-child(even)": colors.accent,
      ":hover": colors.accent,
    },
    color: colors.onAccent,
  },
  dragging: {
    position: "relative",
    zIndex: 2,
    backgroundColor: {
      default: colors.surface,
      ":nth-child(even)": colors.surface,
    },
    boxShadow: shadows.lifted,
    cursor: "grabbing",
  },
  // Flush left, under the header's "#" and the table's edge.
  number: {
    color: colors.muted,
    fontSize: 11,
    fontVariantNumeric: "tabular-nums",
  },
  thumb: {
    display: "grid",
    placeItems: "center",
    width: 22,
    height: 29,
    borderRadius: 3,
    backgroundColor: colors.surface2,
    backgroundPosition: "center",
    backgroundSize: "cover",
  },
  what: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  when: {
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  },
  caption: {
    overflow: "hidden",
    color: colors.muted,
    textOverflow: "ellipsis",
  },
  lost: {
    flexShrink: 0,
    color: colors.warning,
  },
  icon: {
    flexShrink: 0,
    width: 11,
    height: 11,
    fill: "none",
    stroke: colors.muted,
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
  length: {
    color: colors.muted,
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
    textAlign: "right",
  },
  // Secondary text and icons on the blue of a selected row.
  onAccent: {
    color: "rgba(255, 255, 255, 0.8)",
    stroke: "rgba(255, 255, 255, 0.8)",
  },
});

const clock = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

/** When the clip was taken, or its file name when that is unknown. */
const when = (clip: Clip) => (clip.takenAt ? clock.format(new Date(clip.takenAt)) : clipLabel(clip));

interface Props {
  clips: Clip[];
  selectedId: string | null;
  thumbs: Record<string, string>;
  onSelect: (id: string) => void;
  /** Only reorders here; the inspector's 片段 page edits a clip. */
  dispatch: (action: Action) => void;
}

export function ClipList({ clips, selectedId, thumbs, onSelect, dispatch }: Props) {
  // A small move threshold keeps plain clicks as clicks.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Space picks a focused row up, the arrows move it, space drops it.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = clips.findIndex((c) => c.id === active.id);
    const to = clips.findIndex((c) => c.id === over.id);
    dispatch({ type: "moveClip", from, to });
  }

  // The stage says how to add clips; an empty list needs no words.
  if (clips.length === 0) return null;
  return (
    <div {...stylex.props(styles.table)}>
      <div aria-hidden {...stylex.props(styles.header)}>
        <span>#</span>
        <span />
        <span>拍摄 · 文字</span>
        <span {...stylex.props(styles.end)}>秒</span>
      </div>
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
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

interface RowProps {
  clip: Clip;
  index: number;
  selected: boolean;
  thumb?: string;
  onSelect: () => void;
}

function ClipRow({ clip, index, selected, thumb, onSelect }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: clip.id });
  const missing = isMissing(clip);
  const on = selected && styles.onAccent;

  return (
    <li
      ref={setNodeRef}
      onClick={onSelect}
      {...attributes}
      {...listeners}
      aria-roledescription="可拖动排序的片段"
      title={clipLabel(clip)}
      {...withStyle(stylex.props(styles.row, selected && styles.selected, isDragging && styles.dragging), {
        // Up and down only: the list is one column.
        transform: CSS.Transform.toString(transform && { ...transform, x: 0 }),
        transition,
      })}
    >
      <span {...stylex.props(styles.number, on)}>{index + 1}</span>
      {missing ? (
        <span {...stylex.props(styles.thumb)}>
          <WarningIcon size={12} />
        </span>
      ) : (
        <span {...withStyle(stylex.props(styles.thumb), thumb ? { backgroundImage: `url("${thumb}")` } : undefined)} />
      )}
      <span {...stylex.props(styles.what)}>
        <span {...stylex.props(styles.when)}>{when(clip)}</span>
        {hasCaption(clip) && <span {...stylex.props(styles.caption, on)}>{clip.caption!.text.trim()}</span>}
        {missing && <span {...stylex.props(styles.lost)}>原件丢失</span>}
        {clip.muted && (
          <svg viewBox="0 0 16 16" aria-label="已静音" {...stylex.props(styles.icon, on)}>
            <path d="M2.5 6h2.5l3-2.5v9L5 10H2.5zM11 6l3 4M14 6l-3 4" />
          </svg>
        )}
        {clip.kind === "video" && (
          <svg viewBox="0 0 16 16" aria-label="视频" {...stylex.props(styles.icon, on)}>
            <rect x="1.5" y="4" width="9" height="8" rx="1.5" />
            <path d="M10.5 7l4-2v6l-4-2" />
          </svg>
        )}
      </span>
      <span {...stylex.props(styles.length, on)}>{clipLength(clip).toFixed(1)}</span>
    </li>
  );
}
