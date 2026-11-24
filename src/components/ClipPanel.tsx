import { useRef, type CSSProperties } from "react";
import * as stylex from "@stylexjs/stylex";
import type { Caption, Clip } from "../api";
import {
  CAPTION_FIRST_SECONDS,
  clipLabel,
  clipLength,
  formatTime,
  hasCaption,
  isMissing,
  NEW_CAPTION,
  trimPatch,
  type Action,
} from "../project";
import { colors } from "../tokens.stylex";
import { Button, Group, Seg, Switch, ui, withStyle } from "../ui";
import { WarningIcon } from "./WarningIcon";

const styles = stylex.create({
  head: {
    display: "grid",
    gridTemplateColumns: "36px minmax(0, 1fr)",
    gap: 10,
    alignItems: "center",
    paddingBlock: "14px",
    paddingInline: "16px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  thumb: {
    display: "grid",
    placeItems: "center",
    width: 36,
    height: 48,
    borderRadius: 4,
    backgroundColor: colors.surface2,
    backgroundPosition: "center",
    backgroundSize: "cover",
  },
  name: {
    overflow: "hidden",
    fontWeight: 600,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  meta: {
    color: colors.muted,
    fontSize: 11,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  dimmed: {
    color: colors.muted,
  },
  stack: {
    display: "grid",
    gap: 8,
  },
  empty: {
    paddingBlock: "40px",
    paddingInline: "16px",
    color: colors.muted,
    textAlign: "center",
  },
  remove: {
    display: "flex",
    justifyContent: "center",
    paddingBlock: "12px",
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
  /** The clip selected in the list, or null. */
  clip: Clip | null;
  /** Its place in the list, from 0. */
  index: number;
  thumb?: string;
  /** True when the music replaces every clip's own sound, so muting a
   * clip would change nothing. */
  noOriginalSound: boolean;
  /** Opens the large trim view for the clip. */
  onTrim: () => void;
  dispatch: (action: Action) => void;
}

/** The inspector's 片段 page: trim, text and sound of the selected clip. */
export function ClipPanel({ clip, index, thumb, noOriginalSound, onTrim, dispatch }: Props) {
  if (!clip) return <p {...stylex.props(styles.empty)}>在左边选一段来编辑</p>;
  const thumbImage = thumb ? { backgroundImage: `url("${thumb}")` } : undefined;
  const missing = isMissing(clip);
  const remove = (
    <div {...stylex.props(styles.remove)}>
      <Button variant="danger" onClick={() => dispatch({ type: "removeClip", id: clip.id })}>
        移除这一段
      </Button>
    </div>
  );

  return (
    <>
      <div {...stylex.props(styles.head)}>
        {missing ? (
          <span {...stylex.props(styles.thumb)}>
            <WarningIcon size={18} />
          </span>
        ) : (
          <span {...withStyle(stylex.props(styles.thumb), thumbImage)} />
        )}
        <div>
          <div {...stylex.props(styles.name)}>
            {index + 1}. {clipLabel(clip)}
          </div>
          <div {...stylex.props(styles.meta)}>
            {clip.kind === "video" ? "视频" : "Live Photo"} · {clipLength(clip).toFixed(1)} 秒
          </div>
        </div>
      </div>
      {missing ? (
        <>
          {/* The stage says what happened and offers to add it again. */}
          <Group>
            <p {...stylex.props(ui.note)}>这一段的原件找不到了，预览里先跳过。</p>
          </Group>
          {remove}
        </>
      ) : (
        <>
          <Group title="剪辑">
            <div {...stylex.props(styles.stack)}>
              <span {...stylex.props(ui.note)}>
                {formatTime(clip.trimStart)} – {formatTime(clip.trimEnd)}（共 {formatTime(clip.duration)}）
              </span>
              <TrimBar clip={clip} thumbImage={thumbImage} dispatch={dispatch} />
              <Button onClick={onTrim}>精确剪辑…</Button>
              <p {...stylex.props(ui.note)}>裁切位置：在预览上拖动画面</p>
            </div>
          </Group>
          <Group title="文字">
            <div {...stylex.props(styles.stack)}>
              <CaptionFields clip={clip} dispatch={dispatch} />
            </div>
          </Group>
          <Group title="声音">
            <div {...stylex.props(styles.row)}>
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
          </Group>
          {remove}
        </>
      )}
    </>
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
