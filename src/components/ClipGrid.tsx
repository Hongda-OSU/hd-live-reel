import { useEffect, useRef } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as stylex from "@stylexjs/stylex";
import type { Clip } from "../api";
import { clipLabel, hasCaption, isMissing } from "../project";
import { colors, shadows } from "../tokens.stylex";
import { Icon, withStyle } from "../ui";
import { WarningIcon } from "./WarningIcon";

const styles = stylex.create({
  head: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: {
    margin: 0,
    paddingTop: "10px",
    // Room for the selected card's ring, which sits outside its picture.
    paddingBottom: "14px",
    paddingInline: "6px",
    color: colors.muted,
    fontSize: 11,
    fontWeight: 600,
  },
  hide: {
    display: "grid",
    placeItems: "center",
    width: 22,
    height: 20,
    marginTop: -4,
    padding: 0,
    borderWidth: 0,
    borderRadius: 5,
    backgroundColor: {
      default: "transparent",
      ":hover": colors.hover,
    },
    color: colors.muted,
    cursor: "pointer",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 9,
    margin: 0,
    paddingTop: 0,
    paddingBottom: "4px",
    paddingInline: "6px",
    listStyle: "none",
  },
  // The whole card drags, and takes keyboard focus for reordering.
  card: {
    borderRadius: 6,
    outline: {
      default: "none",
      ":focus-visible": `2px solid ${colors.accent}`,
    },
    outlineOffset: 2,
    touchAction: "none",
    cursor: "pointer",
  },
  picture: {
    position: "relative",
    display: "grid",
    placeItems: "center",
    aspectRatio: "3 / 4",
    borderRadius: 5,
    backgroundColor: colors.surface2,
    backgroundPosition: "center",
    backgroundSize: "cover",
  },
  // A ring a little off the picture, as in Photos.
  selected: {
    outlineWidth: 2,
    outlineStyle: "solid",
    outlineColor: colors.accent,
    outlineOffset: 2,
  },
  dragging: {
    position: "relative",
    zIndex: 2,
    opacity: 0.9,
    cursor: "grabbing",
  },
  draggingPicture: {
    boxShadow: shadows.lifted,
  },
  // Marks bottom right, only when there is something to notice.
  tag: {
    position: "absolute",
    display: "flex",
    alignItems: "center",
    gap: 3,
    minWidth: 14,
    paddingInline: "4px",
    borderRadius: 4,
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    color: "#fff",
    fontSize: 10,
    lineHeight: "15px",
    fontVariantNumeric: "tabular-nums",
  },
  // A faint shade across the top keeps the number legible on bright sky
  // without a badge's edge.
  shade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 26,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
    backgroundImage: "linear-gradient(rgba(0, 0, 0, 0.5), transparent)",
  },
  number: {
    position: "absolute",
    top: 4,
    left: 6,
    color: "#fff",
    fontSize: 11,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
  },
  marks: {
    right: 4,
    bottom: 4,
    paddingBlock: "3px",
  },
  icon: {
    flexShrink: 0,
    width: 9,
    height: 9,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
});

interface Props {
  clips: Clip[];
  selectedId: string | null;
  thumbs: Record<string, string>;
  onSelect: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onHide: () => void;
}

/** The clips as pictures, for finding one by eye; the timeline below shows
 * their timing. Cards drag to reorder, which suits long moves. */
export function ClipGrid({ clips, selectedId, thumbs, onSelect, onMove, onHide }: Props) {
  // A small move threshold keeps plain clicks as clicks.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Space picks a focused card up, the arrows move it, space drops it.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    onMove(
      clips.findIndex((c) => c.id === active.id),
      clips.findIndex((c) => c.id === over.id),
    );
  }

  return (
    <>
      <div {...stylex.props(styles.head)}>
        <h2 {...stylex.props(styles.heading)}>片段</h2>
        <button aria-label="隐藏片段栏" title="隐藏片段栏 ⌃⌘S" onClick={onHide} {...stylex.props(styles.hide)}>
          <Icon>
            <path d="M10 4 6 8l4 4" />
          </Icon>
        </button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={clips.map((c) => c.id)} strategy={rectSortingStrategy}>
          <ul {...stylex.props(styles.grid)}>
            {clips.map((clip, index) => (
              <Card
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
    </>
  );
}

function Card({
  clip,
  index,
  selected,
  thumb,
  onSelect,
}: {
  clip: Clip;
  index: number;
  selected: boolean;
  thumb?: string;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: clip.id });
  const node = useRef<HTMLLIElement | null>(null);
  const lost = isMissing(clip);

  // Picked on the timeline: bring it into view here too.
  useEffect(() => {
    if (selected) node.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <li
      ref={(el) => {
        node.current = el;
        setNodeRef(el);
      }}
      onClick={onSelect}
      {...attributes}
      {...listeners}
      aria-roledescription="可拖动排序的片段"
      aria-pressed={selected}
      title={lost ? `${clipLabel(clip)}（原件丢失）` : clipLabel(clip)}
      {...withStyle(stylex.props(styles.card, isDragging && styles.dragging), {
        transform: CSS.Transform.toString(transform),
        transition,
      })}
    >
      <span
        {...withStyle(
          stylex.props(styles.picture, selected && styles.selected, isDragging && styles.draggingPicture),
          thumb && !lost ? { backgroundImage: `url("${thumb}")` } : undefined,
        )}
      >
        {lost && <WarningIcon size={14} />}
        <span {...stylex.props(styles.shade)} />
        <span {...stylex.props(styles.number)}>{index + 1}</span>
        {/* Length shows on the timeline; here only what is worth noticing. */}
        {(hasCaption(clip) || clip.muted || clip.kind === "video" || lost) && (
          <span {...stylex.props(styles.tag, styles.marks)}>
            {hasCaption(clip) && (
              <svg viewBox="0 0 16 16" aria-label="有文字" {...stylex.props(styles.icon)}>
                <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
              </svg>
            )}
            {clip.muted && (
              <svg viewBox="0 0 16 16" aria-label="已静音" {...stylex.props(styles.icon)}>
                <path d="M2.5 6h2.5l3-2.5v9L5 10H2.5zM11 6l3 4M14 6l-3 4" />
              </svg>
            )}
            {clip.kind === "video" && (
              <svg viewBox="0 0 16 16" aria-label="视频" {...stylex.props(styles.icon)}>
                <rect x="1.5" y="4" width="9" height="8" rx="1.5" />
                <path d="M10.5 7l4-2v6l-4-2" />
              </svg>
            )}
            {lost && "丢失"}
          </span>
        )}
      </span>
    </li>
  );
}
