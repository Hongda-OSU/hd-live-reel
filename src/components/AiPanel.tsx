import { useEffect } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, shadows } from "../tokens.stylex";
import { Button, Field, Seg, Switch, ui } from "../ui";

/** Where AI picks from: the chosen days and scenes, or the ticked photos. */
export type AiSource = "range" | "chosen";

/** Default and range of the AI target, in seconds; Live Photos run ~2 s. */
export const TARGET = { initial: 40, min: 30, max: 45 };
const SECONDS_PER_PICK = 2;

const styles = stylex.create({
  panel: {
    position: "absolute",
    top: "calc(100% + 6px)",
    right: 0,
    zIndex: 13,
    display: "grid",
    gap: 12,
    width: 320,
    padding: 16,
    borderRadius: 10,
    backgroundColor: colors.window,
    boxShadow: shadows.window,
  },
  heading: {
    margin: 0,
    fontSize: 14,
  },
  range: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.5,
  },
  slider: {
    width: "100%",
    margin: 0,
    accentColor: colors.accent,
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 8,
  },
});

interface Props {
  /** "今天 10:14–11:19 · 36 张" per scene in the range. */
  range: string[];
  source: AiSource;
  /** Photos ticked in the grid. */
  chosenCount: number;
  onSource: (source: AiSource) => void;
  target: number;
  people: boolean;
  busy: boolean;
  onTarget: (seconds: number) => void;
  onPeople: (people: boolean) => void;
  onRun: () => void;
  onClose: () => void;
}

/** Settings for AI selection, popped up under its button. It stays open
 * while the range is set in the grid, by clicking day and scene titles;
 * Esc, 取消 or the button close it. */
export function AiPanel({
  range,
  source,
  chosenCount,
  onSource,
  target,
  people,
  busy,
  onTarget,
  onPeople,
  onRun,
  onClose,
}: Props) {
  const ready = source === "chosen" ? chosenCount > 0 : range.length > 0;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-label="AI 选片" {...stylex.props(styles.panel)}>
      <h3 {...stylex.props(styles.heading)}>AI 选片</h3>
      {/* One block, so the fields' own spacing applies evenly. */}
      <div>
        <Field label="范围">
          <Seg<AiSource>
            options={[
              ["range", "日期 / 时段"],
              ["chosen", `已勾选的 ${chosenCount} 张`],
            ]}
            value={source}
            onChange={onSource}
          />
          {source === "chosen" ? (
            <p {...stylex.props(ui.note)}>
              {chosenCount
                ? "只在这些照片里挑；没被选中的会取消勾选。"
                : "还没有勾选照片：先在下面勾选或拖动连选一批。"}
            </p>
          ) : range.length ? (
            <p {...stylex.props(styles.range)}>
              {range.map((line) => (
                <span key={line}>
                  {line}
                  <br />
                </span>
              ))}
            </p>
          ) : (
            <p {...stylex.props(ui.note)}>还没有选范围：点照片上方的日期或时段标题来选，可以选好几段。</p>
          )}
        </Field>
        <Field label="目标时长">
          <div {...stylex.props(styles.row)}>
            <input
              type="range"
              aria-label="目标时长"
              min={TARGET.min}
              max={TARGET.max}
              value={target}
              onChange={(e) => onTarget(Number(e.target.value))}
              {...stylex.props(styles.slider)}
            />
            <span {...stylex.props(ui.value)}>
              {target} 秒 ≈ {Math.round(target / SECONDS_PER_PICK)} 张
            </span>
          </div>
        </Field>
        <Field label="包含人像">
          <div {...stylex.props(styles.row)}>
            <span {...stylex.props(ui.note)}>关闭时跳过自拍和人像，仍可手动勾选</span>
            <Switch on={people} label="包含人像" onToggle={() => onPeople(!people)} />
          </div>
        </Field>
      </div>
      <div {...stylex.props(styles.actions)}>
        <Button onClick={onClose} disabled={busy}>
          取消
        </Button>
        <Button variant="primary" onClick={onRun} disabled={busy || !ready}>
          {busy ? "挑选中…" : "开始挑选"}
        </Button>
      </div>
    </div>
  );
}
