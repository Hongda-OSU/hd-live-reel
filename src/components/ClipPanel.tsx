import { useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
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
import { Button, Field, Group, Seg, ui, withStyle } from "../ui";
import { WarningIcon } from "./WarningIcon";

const styles = stylex.create({
  // What the clip is, in plain lines flush with the headings: when it
  // was taken, then what kind and where from. No label column, which
  // would add an edge that lines up with nothing else on the page.
  info: {
    display: "grid",
    rowGap: 4,
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
  },
  infoLine: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  faint: {
    color: colors.muted,
  },
  empty: {
    paddingBlock: "40px",
    paddingInline: "16px",
    color: colors.muted,
    textAlign: "center",
  },
  // A filmstrip of the clip's picture with the kept part framed in yellow,
  // like Final Cut's trim.
  trim: {
    position: "relative",
    height: 34,
    borderRadius: 5,
    backgroundColor: colors.surface2,
    backgroundPosition: "left center",
    backgroundRepeat: "repeat-x",
    backgroundSize: "auto 100%",
  },
  shade: {
    position: "absolute",
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  shadeStart: {
    borderTopLeftRadius: 5,
    borderBottomLeftRadius: 5,
  },
  shadeEnd: {
    borderTopRightRadius: 5,
    borderBottomRightRadius: 5,
  },
  range: {
    position: "absolute",
    top: -2,
    bottom: -2,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderInlineWidth: 0,
    borderStyle: "solid",
    borderColor: colors.trimHandle,
    pointerEvents: "none",
  },
  handle: {
    position: "absolute",
    top: -2,
    bottom: -2,
    display: "grid",
    placeItems: "center",
    width: 9,
    backgroundColor: colors.trimHandle,
    cursor: "ew-resize",
    touchAction: "none",
  },
  handleStart: {
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  handleEnd: {
    marginLeft: -9,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  grip: {
    width: 2,
    height: 10,
    borderRadius: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  readouts: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 8,
    marginTop: 10,
  },
  readout: {
    display: "grid",
    gap: 2,
  },
  readoutLabel: {
    color: colors.muted,
    fontSize: 10,
  },
  readoutValue: {
    fontSize: 13,
    fontVariantNumeric: "tabular-nums",
  },
  readoutOf: {
    color: colors.muted,
    fontSize: 11,
  },
});

interface Props {
  /** The clip selected in the list, or null. */
  clip: Clip | null;
  /** Its place in the list, from 0. */
  index: number;
  thumb?: string;
  /** Opens the large trim view for the clip. */
  onTrim: () => void;
  /** Swaps the clip for one picked from the phone or the Mac. */
  onReplace: (from: "iphone" | "mac") => void;
  dispatch: (action: Action) => void;
}

/** Asks where the new picture comes from, in a menu under the button. */
async function askReplace(event: MouseEvent<HTMLButtonElement>, onReplace: Props["onReplace"]) {
  const box = event.currentTarget.getBoundingClientRect();
  const menu = await Menu.new({
    items: await Promise.all([
      MenuItem.new({ text: "从 iPhone 选择…", action: () => onReplace("iphone") }),
      MenuItem.new({ text: "从 Mac 选择…", action: () => onReplace("mac") }),
    ]),
  });
  await menu.popup(new LogicalPosition(box.left, box.bottom + 4));
}

/** "11月22日 周日 15:20" when the clip says when it was taken. */
function takenLabel(takenAt?: string | null): string | null {
  const date = takenAt ? new Date(takenAt) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleDateString("zh-CN", { weekday: "short" });
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date.getMonth() + 1}月${date.getDate()}日 ${day} ${time}`;
}

/** Where the original came from, after its file name. */
const SOURCE: Record<Clip["source"], string> = {
  iphone: "iPhone",
  file: "Mac",
  library: "照片图库",
};

/** The inspector's 这一段 page: what the selected clip is, its trim and
 * caption, with removing it in the panel's footer. */
export function ClipPanel({ clip, index, thumb, onTrim, onReplace, dispatch }: Props) {
  if (!clip) return <p {...stylex.props(styles.empty)}>在下面的时间线上选一段来编辑</p>;
  const thumbImage = thumb ? { backgroundImage: `url("${thumb}")` } : undefined;
  const missing = isMissing(clip);
  const taken = takenLabel(clip.takenAt);

  return (
    <>
      <Group
        title={`第 ${index + 1} 段`}
        action={
          <Button variant="link" onClick={(e) => void askReplace(e, onReplace)}>
            替换…
          </Button>
        }
      >
        <div {...stylex.props(styles.info)}>
          {taken && <p {...stylex.props(styles.infoLine)}>{taken}</p>}
          <p {...stylex.props(styles.infoLine, styles.faint)}>
            {missing && <WarningIcon size={13} />}
            {[clip.kind === "video" ? "视频" : "Live Photo", clipLabel(clip), SOURCE[clip.source]].join(" · ")}
          </p>
        </div>
      </Group>
      {missing ? (
        // The stage says what happened and offers to add it again.
        <Group>
          <p {...stylex.props(ui.note)}>这一段的原件找不到了，预览里先跳过。</p>
        </Group>
      ) : (
        <>
          <Group
            title="剪辑"
            action={
              <Button variant="link" onClick={onTrim}>
                精确剪辑…
              </Button>
            }
          >
            <TrimBar clip={clip} thumbImage={thumbImage} dispatch={dispatch} />
            <div {...stylex.props(styles.readouts)}>
              <Readout label="开始">{formatTime(clip.trimStart)}</Readout>
              <Readout label="结束">{formatTime(clip.trimEnd)}</Readout>
              <Readout label="时长">
                {clipLength(clip).toFixed(1)}
                <span {...stylex.props(styles.readoutOf)}> / {clip.duration.toFixed(1)} 秒</span>
              </Readout>
            </div>
          </Group>
          <CaptionGroup clip={clip} dispatch={dispatch} />
        </>
      )}
      <div {...stylex.props(ui.panelFooter)}>
        <Button variant="danger" onClick={() => dispatch({ type: "removeClip", id: clip.id })}>
          移除这一段
        </Button>
      </div>
    </>
  );
}

function Readout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div {...stylex.props(styles.readout)}>
      <span {...stylex.props(styles.readoutLabel)}>{label}</span>
      <span {...stylex.props(styles.readoutValue)}>{children}</span>
    </div>
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
      // Where in the handle it was grabbed, so the edge does not jump to
      // the pointer.
      const edge = rect.left + ((handle === "start" ? clip.trimStart : clip.trimEnd) / clip.duration) * rect.width;
      const grab = event.clientX - edge;
      target.onpointermove = (move) => {
        const t = Math.min(1, Math.max(0, (move.clientX - grab - rect.left) / rect.width)) * clip.duration;
        dispatch({ type: "updateClip", id: clip.id, patch: trimPatch(clip, handle, t) });
      };
      target.onpointerup = () => {
        target.onpointermove = null;
      };
    };
  }

  return (
    <div ref={bar} {...withStyle(stylex.props(styles.trim), thumbImage)}>
      <div {...withStyle(stylex.props(styles.shade, styles.shadeStart), { left: 0, width: `${left}%` })} />
      <div {...withStyle(stylex.props(styles.shade, styles.shadeEnd), { left: `${right}%`, right: 0 })} />
      <div {...withStyle(stylex.props(styles.range), { left: `${left}%`, right: `${100 - right}%` })} />
      <div
        aria-label="开头"
        {...withStyle(stylex.props(styles.handle, styles.handleStart), { left: `${left}%` })}
        onPointerDown={drag("start")}
      >
        <span {...stylex.props(styles.grip)} />
      </div>
      <div
        aria-label="结尾"
        {...withStyle(stylex.props(styles.handle, styles.handleEnd), { left: `${right}%` })}
        onPointerDown={drag("end")}
      >
        <span {...stylex.props(styles.grip)} />
      </div>
    </div>
  );
}

/** Text over this clip. Only the heading with 添加 shows until there is
 * some; after 添加 the text, where it sits and how long it shows appear
 * together. Drawn in the 文字 page's look, a size smaller. */
function CaptionGroup({ clip, dispatch }: { clip: Clip; dispatch: (action: Action) => void }) {
  // The clip whose field is open without text yet: just added, or
  // emptied while typing, which should not fold the field away.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const caption = clip.caption ?? NEW_CAPTION;
  const set = (patch: Partial<Caption>) =>
    dispatch({ type: "updateClip", id: clip.id, patch: { caption: { ...caption, ...patch } } });
  const remove = () => {
    setOpenFor(null);
    dispatch({ type: "updateClip", id: clip.id, patch: { caption: null } });
  };

  if (!hasCaption(clip) && openFor !== clip.id) {
    return (
      <Group
        title="字幕"
        action={
          <Button variant="link" onClick={() => setOpenFor(clip.id)}>
            添加
          </Button>
        }
      />
    );
  }
  return (
    <Group
      title="字幕"
      action={
        <Button variant="mutedLink" onClick={remove}>
          移除
        </Button>
      }
    >
      <Field>
        <input
          value={caption.text}
          aria-label="这一段的字幕"
          // Only right after 添加; selecting a clip that has a caption
          // leaves the keyboard with the grid and timeline.
          autoFocus={!hasCaption(clip)}
          onChange={(e) => {
            setOpenFor(clip.id);
            set({ text: e.target.value });
          }}
          {...stylex.props(ui.textInput)}
        />
      </Field>
      <Field label="位置">
        <Seg<Caption["position"]>
          options={[
            ["top", "上"],
            ["center", "中"],
            ["bottom", "下"],
          ]}
          value={caption.position}
          onChange={(position) => set({ position })}
        />
      </Field>
      <Field label="显示">
        <Seg<"whole" | "first">
          options={[
            ["whole", "整段"],
            ["first", `前 ${CAPTION_FIRST_SECONDS} 秒`],
          ]}
          value={caption.showFor === null ? "whole" : "first"}
          onChange={(shown) => set({ showFor: shown === "whole" ? null : CAPTION_FIRST_SECONDS })}
        />
      </Field>
    </Group>
  );
}
