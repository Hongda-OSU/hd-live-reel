import { useRef } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Clip } from "../api";
import { clipLabel, clipLength, type Action } from "../project";

/** Shortest a trimmed clip may get, in seconds. */
const MIN_LENGTH = 0.5;

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
    return <p className="empty-list">还没有片段。点「添加照片」从 iPhone 挑选 Live Photo。</p>;
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={clips.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <ul className="clips">
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
  const style = { transform: CSS.Transform.toString(transform), transition };
  const thumbStyle = thumb ? { backgroundImage: `url("${thumb}")` } : undefined;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={["clip", selected && "selected", clip.muted && "is-muted", isDragging && "dragging"]
        .filter(Boolean)
        .join(" ")}
      onClick={onSelect}
    >
      <span className="grip" {...attributes} {...listeners} aria-label="拖动排序">
        ⋮⋮
      </span>
      <span className="thumb" style={thumbStyle} />
      <span>
        <div className="label">
          {index + 1}. {clipLabel(clip)}
        </div>
        <div className="sub">
          {clipLength(clip).toFixed(1)} 秒{clip.kind === "video" ? " · 视频" : ""}
        </div>
      </span>
      <span className="muted-flag">{clip.muted ? "🔇" : ""}</span>
      {selected && (
        <div className="clip-detail" onClick={(e) => e.stopPropagation()}>
          <div className="row">
            <span>截取</span>
            <span className="note">
              {clip.trimStart.toFixed(1)}s – {clip.trimEnd.toFixed(1)}s
            </span>
          </div>
          <TrimBar clip={clip} thumbStyle={thumbStyle} dispatch={dispatch} />
          <div className="row">
            <span>静音这一段</span>
            <button
              className={clip.muted ? "switch on" : "switch"}
              role="switch"
              aria-checked={clip.muted}
              onClick={() => dispatch({ type: "updateClip", id: clip.id, patch: { muted: !clip.muted } })}
            />
          </div>
          <div className="row">
            <span className="note">裁切位置：下一版支持在预览上拖动</span>
            <button className="btn ghost danger" onClick={() => dispatch({ type: "removeClip", id: clip.id })}>
              移除
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function TrimBar({
  clip,
  thumbStyle,
  dispatch,
}: {
  clip: Clip;
  thumbStyle?: React.CSSProperties;
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
            ? { trimStart: Math.min(rounded, clip.trimEnd - MIN_LENGTH) }
            : { trimEnd: Math.max(rounded, clip.trimStart + MIN_LENGTH) };
        // Keep within the clip even after rounding.
        if (patch.trimStart !== undefined) patch.trimStart = Math.max(0, patch.trimStart);
        if (patch.trimEnd !== undefined) patch.trimEnd = Math.min(clip.duration, patch.trimEnd);
        dispatch({ type: "updateClip", id: clip.id, patch });
      };
      target.onpointerup = () => {
        target.onpointermove = null;
      };
    };
  }

  return (
    <div className="trim" ref={bar} style={thumbStyle}>
      <div className="shade" style={{ left: 0, width: `${left}%` }} />
      <div className="shade" style={{ left: `${right}%`, right: 0 }} />
      <div className="handle" style={{ left: `${left}%` }} onPointerDown={drag("start")} />
      <div className="handle" style={{ left: `${right}%` }} onPointerDown={drag("end")} />
    </div>
  );
}
