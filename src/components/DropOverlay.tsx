import * as stylex from "@stylexjs/stylex";
import type { ClipsProgress } from "../api";
import { colors, shadows } from "../tokens.stylex";
import { Button, ui, withStyle } from "../ui";

/** What the window shows while files are dragged in and prepared. */
export type Drop =
  { step: "hover" } | { step: "adding"; progress: ClipsProgress | null } | { step: "message"; text: string };

const styles = stylex.create({
  scrim: {
    position: "absolute",
    inset: 0,
    zIndex: 30,
    display: "grid",
    placeItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.25)",
  },
  target: {
    position: "absolute",
    inset: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.accent,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    pointerEvents: "none",
  },
  card: {
    position: "relative",
    width: 340,
    padding: 20,
    borderRadius: 12,
    backgroundColor: colors.window,
    boxShadow: shadows.window,
    textAlign: "center",
  },
  heading: {
    margin: 0,
    fontSize: 15,
  },
  track: {
    height: 6,
    marginTop: "14px",
    borderRadius: 99,
    backgroundColor: colors.surface2,
    overflow: "hidden",
  },
  fill: {
    display: "block",
    height: "100%",
    borderRadius: 99,
    backgroundColor: colors.accent,
    transition: "width 0.2s linear",
  },
  actions: {
    display: "flex",
    justifyContent: "center",
    marginTop: 16,
  },
});

interface Props {
  drop: Drop | null;
  onDismiss: () => void;
}

export function DropOverlay({ drop, onDismiss }: Props) {
  if (!drop) return null;
  return (
    <div {...stylex.props(styles.scrim)}>
      {drop.step === "hover" && <div {...stylex.props(styles.target)} />}
      <div {...stylex.props(styles.card)}>
        {drop.step === "hover" && (
          <>
            <h2 {...stylex.props(styles.heading)}>松开以添加</h2>
            <p {...stylex.props(ui.note)}>视频、Live Photo（同名的照片和 MOV）或整个文件夹</p>
          </>
        )}
        {drop.step === "adding" && <Adding progress={drop.progress} />}
        {drop.step === "message" && (
          <>
            <p>{drop.text}</p>
            <div {...stylex.props(styles.actions)}>
              <Button variant="primary" onClick={onDismiss}>
                好
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Adding({ progress }: { progress: ClipsProgress | null }) {
  const share = progress && progress.total ? progress.done / progress.total : 0;
  return (
    <>
      <h2 {...stylex.props(styles.heading)}>
        {progress ? `正在处理第 ${progress.done + 1} / ${progress.total} 段…` : "正在查找视频…"}
      </h2>
      <div {...stylex.props(styles.track)}>
        <span {...withStyle(stylex.props(styles.fill), { width: `${share * 100}%` })} />
      </div>
    </>
  );
}
