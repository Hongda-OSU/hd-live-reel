import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import * as stylex from "@stylexjs/stylex";
import type { Project } from "../api";
import type { Exporter } from "../hooks/useExport";
import { folderLabel, FPS, FRAME, isMissing, missingLabel, totalLength, UNTITLED, type Action } from "../project";
import { colors } from "../tokens.stylex";
import { Button, Field, Group, Icon, ui, withStyle } from "../ui";
import { WarningIcon } from "./WarningIcon";

const styles = stylex.create({
  nameRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  nameInput: {
    flex: "1",
    minWidth: 0,
  },
  // Plain values start where the text inside the name box does: past its
  // 8 px padding and 1 px border, so the page reads down one edge.
  inset: {
    paddingLeft: 9,
  },
  folderRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  folder: {
    flexGrow: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 12,
  },
  // A spec sheet: names on the left, values to the right edge, hairlines
  // between the rows.
  specs: {
    margin: 0,
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
  },
  spec: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    height: 28,
  },
  specLine: {
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.border,
  },
  specName: {
    color: colors.muted,
  },
  specValue: {
    margin: 0,
  },
  stack: {
    display: "grid",
    gap: 10,
  },
  // The page's one big action, as wide as the panel.
  go: {
    display: "grid",
  },
  lost: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.surface2,
    fontSize: 12,
    lineHeight: 1.5,
  },
  status: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
  },
  percent: {
    color: colors.muted,
  },
  track: {
    height: 6,
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
  // The file's name, and under it the link to it.
  result: {
    display: "grid",
    justifyItems: "start",
    gap: 6,
  },
  fileName: {
    maxWidth: "100%",
    overflow: "hidden",
    fontSize: 13,
    fontWeight: 600,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

/** "1 分 4 秒", "48 秒". */
function formatLength(seconds: number) {
  const s = Math.round(seconds);
  return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
}

/** "1:06", "0:48". */
function formatClock(seconds: number) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function formatRemaining(seconds: number) {
  const s = Math.max(1, Math.ceil(seconds));
  return `约剩 ${formatLength(s)}`;
}

interface Props {
  project: Project;
  exporter: Exporter;
  dispatch: (action: Action) => void;
}

/** The 导出 page: the file's name and folder, what it will be, and the
 * export itself with its progress. */
export function ExportPanel({ project, exporter, dispatch }: Props) {
  const { phase } = exporter;
  const { output } = project;
  const running = phase.step === "running";
  // A reel never goes out a clip short: lost clips are dealt with first.
  const lost = missingLabel(project.clips);
  const empty = project.clips.length === 0;
  const setFolder = (folder: string | null) => dispatch({ type: "updateOutput", patch: { folder } });

  async function chooseFolder() {
    const picked = await open({ directory: true, defaultPath: output.folder ?? undefined });
    if (picked) setFolder(picked);
  }

  const start = () => {
    if (!lost && !empty && !running) void exporter.start(project);
  };

  return (
    <>
      <Group>
        <Field label="文件名">
          <div {...stylex.props(styles.nameRow)}>
            {/* Edits the project name, so the toolbar and the file agree. */}
            <input
              value={project.name}
              placeholder={UNTITLED}
              aria-label="文件名"
              disabled={running}
              onChange={(e) => dispatch({ type: "rename", name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && start()}
              {...stylex.props(ui.textInput, styles.nameInput)}
            />
            <span {...stylex.props(ui.note)}>.mp4</span>
          </div>
        </Field>
        <Field label="保存到">
          <div {...stylex.props(styles.folderRow, styles.inset)}>
            <span title={output.folder ?? undefined} {...stylex.props(styles.folder)}>
              {folderLabel(output.folder)}
            </span>
            {output.folder && (
              <Button variant="mutedLink" disabled={running} onClick={() => setFolder(null)}>
                还原
              </Button>
            )}
            <Button variant="link" disabled={running} onClick={chooseFolder}>
              更改…
            </Button>
          </div>
        </Field>
      </Group>
      <Group title="规格">
        <dl {...stylex.props(styles.specs)}>
          {[
            ["分辨率", FRAME[output.aspect].join(" × ")],
            ["帧率", `${FPS} fps`],
            ["时长", formatClock(totalLength(project))],
            ["视频", "H.264"],
            ["音频", "AAC 立体声"],
          ].map(([name, value], i) => (
            <div key={name} {...stylex.props(styles.spec, i > 0 && styles.specLine)}>
              <dt {...stylex.props(styles.specName)}>{name}</dt>
              <dd {...stylex.props(styles.specValue)}>{value}</dd>
            </div>
          ))}
        </dl>
      </Group>
      <Group>
        <div {...stylex.props(styles.stack)}>
          {(phase.step === "idle" || phase.step === "error") && (
            <>
              {lost && (
                <p {...stylex.props(styles.lost)}>
                  <WarningIcon />
                  <span>{lost}的原件找不到了。先重新添加，或者移除后再导出。</span>
                </p>
              )}
              {lost && (
                <Button
                  onClick={() => {
                    for (const clip of project.clips.filter(isMissing)) dispatch({ type: "removeClip", id: clip.id });
                  }}
                >
                  移除丢失的片段
                </Button>
              )}
              <div {...stylex.props(styles.go)}>
                <Button variant="primary" disabled={!!lost || empty} onClick={start}>
                  <Icon>
                    <path d="M8 10.5V2.5M4.5 6 8 2.5 11.5 6M3 9.5v3a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" />
                  </Icon>
                  导出视频
                </Button>
              </div>
              {phase.step === "error" && <p {...stylex.props(ui.error)}>{phase.message}</p>}
            </>
          )}
          {phase.step === "running" && (
            <>
              {/* Cancel is a quiet link on the status line, like 移除 and
                  还原, not a dialog button under the bar. */}
              <div {...stylex.props(styles.status)}>
                <span>
                  {phase.cancelling ? "正在取消…" : "正在导出…"}{" "}
                  <span {...stylex.props(styles.percent)}>{Math.floor(phase.progress * 100)}%</span>
                </span>
                <Button variant="mutedLink" disabled={phase.cancelling} onClick={exporter.cancel}>
                  取消
                </Button>
              </div>
              <div {...stylex.props(styles.track)}>
                <i {...withStyle(stylex.props(styles.fill), { width: `${phase.progress * 100}%` })} />
              </div>
              {phase.remaining !== null && <p {...stylex.props(ui.note)}>{formatRemaining(phase.remaining)}</p>}
            </>
          )}
          {phase.step === "done" && (
            <>
              {/* The same status line as while exporting, so the page
                  settles instead of swapping in a pair of dialog buttons. */}
              <div {...stylex.props(styles.status)}>
                <span>已导出</span>
                <Button variant="mutedLink" onClick={exporter.reset}>
                  完成
                </Button>
              </div>
              <div {...stylex.props(styles.result)}>
                <span title={phase.path} {...stylex.props(styles.fileName)}>
                  {phase.path.split("/").pop()}
                </span>
                <Button variant="link" onClick={() => revealItemInDir(phase.path)}>
                  在 Finder 中显示
                </Button>
              </div>
            </>
          )}
        </div>
      </Group>
    </>
  );
}
