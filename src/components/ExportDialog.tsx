import { useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import * as stylex from "@stylexjs/stylex";
import { cancelExport, EXPORT_CANCELLED, exportVideo, onExportProgress, type Project } from "../api";
import { colors, shadows } from "../tokens.stylex";
import { folderLabel, UNTITLED, type Action } from "../project";
import { Button, Field, ui, withStyle } from "../ui";

type Phase =
  | { step: "form"; cancelled: boolean }
  | {
      step: "running";
      progress: number;
      /** Seconds left, once enough is done to estimate it. */
      remaining: number | null;
      cancelling: boolean;
    }
  | { step: "done"; path: string }
  | { step: "error"; message: string };

/** The rate is too noisy to extrapolate before this much is done. */
const MIN_FOR_ESTIMATE = { share: 0.05, seconds: 2 };

function estimateRemaining(progress: number, startedAt: number): number | null {
  const elapsed = (Date.now() - startedAt) / 1000;
  if (progress < MIN_FOR_ESTIMATE.share || elapsed < MIN_FOR_ESTIMATE.seconds) return null;
  return (elapsed * (1 - progress)) / progress;
}

/** Friendlier wording for failures the user can fix themselves. */
function explain(message: string) {
  return message.startsWith("export folder not found")
    ? "导出位置不可用（文件夹被移走，或外接硬盘没有接上）。请在右侧「导出」里更改位置。"
    : message;
}

function formatRemaining(seconds: number) {
  const s = Math.max(1, Math.ceil(seconds));
  return s < 60 ? `约剩 ${s} 秒` : `约剩 ${Math.floor(s / 60)} 分 ${s % 60} 秒`;
}

const styles = stylex.create({
  scrim: {
    position: "absolute",
    inset: 0,
    zIndex: 20,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
  },
  dialog: {
    position: "absolute",
    zIndex: 21,
    left: "50%",
    top: "50%",
    width: 380,
    padding: 20,
    borderRadius: 12,
    backgroundColor: colors.window,
    boxShadow: shadows.window,
    transform: "translate(-50%, -50%)",
  },
  heading: {
    marginTop: "0",
    marginRight: "0",
    marginBottom: "12px",
    marginLeft: "0",
    fontSize: 15,
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 18,
  },
  track: {
    height: 6,
    marginTop: "6px",
    marginRight: "0",
    marginBottom: "10px",
    marginLeft: "0",
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
  nameRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  nameInput: {
    flex: "1",
    minWidth: 0,
  },
  status: {
    display: "flex",
    justifyContent: "space-between",
    fontVariantNumeric: "tabular-nums",
  },
  done: {
    display: "grid",
    placeItems: "center",
    width: 40,
    height: 40,
    marginBottom: 10,
    borderRadius: "50%",
    backgroundColor: colors.success,
    "::after": {
      content: '""',
      width: 16,
      height: 8,
      borderTopWidth: "0",
      borderRightWidth: "0",
      borderBottomWidth: "3px",
      borderLeftWidth: "3px",
      borderStyle: "solid",
      borderColor: "#fff",
      transform: "translateY(-2px) rotate(-45deg)",
    },
  },
});

interface Props {
  open: boolean;
  project: Project;
  dispatch: (action: Action) => void;
  onClose: () => void;
}

export function ExportDialog({ open, ...rest }: Props) {
  // Mounting the body only while open gives every opening a fresh form.
  return open ? <DialogBody {...rest} /> : null;
}

function DialogBody({ project, dispatch, onClose }: Omit<Props, "open">) {
  const [phase, setPhase] = useState<Phase>({ step: "form", cancelled: false });

  async function run() {
    const startedAt = Date.now();
    setPhase({ step: "running", progress: 0, remaining: null, cancelling: false });
    const unlisten = await onExportProgress((progress) =>
      setPhase((p) =>
        p.step === "running" ? { ...p, progress, remaining: estimateRemaining(progress, startedAt) } : p,
      ),
    );
    try {
      setPhase({ step: "done", path: await exportVideo(project) });
    } catch (e) {
      setPhase(
        String(e) === EXPORT_CANCELLED
          ? { step: "form", cancelled: true }
          : { step: "error", message: explain(String(e)) },
      );
    } finally {
      unlisten();
    }
  }

  function cancel() {
    setPhase((p) => (p.step === "running" ? { ...p, cancelling: true } : p));
    void cancelExport();
  }

  const running = phase.step === "running";
  return (
    <>
      <div onClick={running ? undefined : onClose} {...stylex.props(styles.scrim)} />
      <div role="dialog" aria-label="导出" {...stylex.props(styles.dialog)}>
        {(phase.step === "form" || phase.step === "error") && (
          <>
            <h2 {...stylex.props(styles.heading)}>导出视频</h2>
            <Field label="文件名">
              <div {...stylex.props(styles.nameRow)}>
                {/* Edits the project name, so the toolbar and the file agree. */}
                <input
                  autoFocus
                  value={project.name}
                  placeholder={UNTITLED}
                  aria-label="文件名"
                  onChange={(e) => dispatch({ type: "rename", name: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && run()}
                  {...stylex.props(ui.textInput, styles.nameInput)}
                />
                <span {...stylex.props(ui.note)}>.mp4</span>
              </div>
            </Field>
            <p {...stylex.props(ui.note)}>
              保存到「{folderLabel(project.output.folder)}」，重名会自动加编号。
              <br />
              1080 × 1920 竖屏 · MP4（H.264 + AAC），微信可以直接发送和播放。
            </p>
            {phase.step === "form" && phase.cancelled && <p {...stylex.props(ui.note)}>已取消，没有保存任何文件。</p>}
            {phase.step === "error" && <p {...stylex.props(ui.error)}>{phase.message}</p>}
            <div {...stylex.props(styles.actions)}>
              <Button onClick={onClose}>取消</Button>
              <Button variant="primary" onClick={run}>
                导出
              </Button>
            </div>
          </>
        )}
        {phase.step === "running" && (
          <>
            <h2 {...stylex.props(styles.heading)}>{phase.cancelling ? "正在取消…" : "正在导出…"}</h2>
            <div {...stylex.props(styles.track)}>
              <i {...withStyle(stylex.props(styles.fill), { width: `${phase.progress * 100}%` })} />
            </div>
            <div {...stylex.props(ui.note, styles.status)}>
              <span>{Math.floor(phase.progress * 100)}%</span>
              <span>{phase.remaining === null ? "全画质编码，请稍候" : formatRemaining(phase.remaining)}</span>
            </div>
            <div {...stylex.props(styles.actions)}>
              <Button disabled={phase.cancelling} onClick={cancel}>
                取消
              </Button>
            </div>
          </>
        )}
        {phase.step === "done" && (
          <>
            <div {...stylex.props(styles.done)} />
            <h2 {...stylex.props(styles.heading)}>导出完成</h2>
            <p {...stylex.props(ui.note)}>{phase.path.split("/").pop()}</p>
            <div {...stylex.props(styles.actions)}>
              <Button onClick={onClose}>完成</Button>
              <Button variant="primary" onClick={() => revealItemInDir(phase.path)}>
                在 Finder 中显示
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
