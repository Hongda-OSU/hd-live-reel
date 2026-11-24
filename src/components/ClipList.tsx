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

const styles = stylex.create({
  list: {
    display: "grid",
    gap: 2,
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  // The whole row drags (rows hold nothing else to press), and takes
  // keyboard focus for reordering with the arrow keys.
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
    outline: {
      default: "none",
      ":focus-visible": `2px solid ${colors.accent}`,
    },
    touchAction: "none",
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
    cursor: "grabbing",
  },
  // Only a hint now that the whole row drags.
  grip: {
    color: colors.muted,
    cursor: "grab",
    fontSize: 11,
    textAlign: "center",
  },
  thumb: {
    width: 30,
    height: 40,
    borderRadius: 4,
    backgroundColor: colors.surface2,
    backgroundPosition: "center",
    backgroundSize: "cover",
  },
  thumbMissing: {
    display: "grid",
    placeItems: "center",
  },
  lost: {
    color: colors.warning,
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
  sub: {
    overflow: "hidden",
    fontSize: 11,
    color: colors.muted,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

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
  const thumbImage = thumb ? { backgroundImage: `url("${thumb}")` } : undefined;
  const missing = isMissing(clip);

  return (
    <li
      ref={setNodeRef}
      onClick={onSelect}
      {...attributes}
      {...listeners}
      aria-roledescription="可拖动排序的片段"
      {...withStyle(stylex.props(styles.row, selected && styles.selected, isDragging && styles.dragging), {
        // Up and down only: the list is one column.
        transform: CSS.Transform.toString(transform && { ...transform, x: 0 }),
        transition,
      })}
    >
      <span aria-hidden {...stylex.props(styles.grip)}>
        ⋮⋮
      </span>
      {missing ? (
        <span {...stylex.props(styles.thumb, styles.thumbMissing)}>
          <WarningIcon size={16} />
        </span>
      ) : (
        <span {...withStyle(stylex.props(styles.thumb), thumbImage)} />
      )}
      <span {...stylex.props(styles.info)}>
        <div {...stylex.props(styles.label, clip.muted && styles.mutedLabel)}>
          {index + 1}. {clipLabel(clip)}
        </div>
        <div {...stylex.props(styles.sub)}>
          {clipLength(clip).toFixed(1)} 秒{clip.kind === "video" ? " · 视频" : ""}
          {hasCaption(clip) && ` · ${clip.caption!.text.trim()}`}
          {missing && (
            <>
              {" · "}
              <span {...stylex.props(styles.lost)}>原件丢失</span>
            </>
          )}
        </div>
      </span>
    </li>
  );
}
