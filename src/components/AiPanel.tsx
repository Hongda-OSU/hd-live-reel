import { useEffect } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, shadows } from "../tokens.stylex";
import { Button, Field, Switch, ui } from "../ui";

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
  pool: {
    margin: 0,
    fontSize: 12,
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
  /** Photos AI picks from: the ticked ones. */
  poolSize: number;
  /** Nothing was touched since the last run, so it reruns on that pool. */
  again: boolean;
  target: number;
  people: boolean;
  busy: boolean;
  onTarget: (seconds: number) => void;
  onPeople: (people: boolean) => void;
  onRun: () => void;
  onClose: () => void;
}

/** Settings for AI selection, popped up under its button. It stays open
 * while photos are ticked in the grid; Esc, 取消 or the button close it. */
export function AiPanel({ poolSize, again, target, people, busy, onTarget, onPeople, onRun, onClose }: Props) {
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
        <Field label="候选">
          {poolSize ? (
            <p {...stylex.props(styles.pool)}>
              {again ? `重新从刚才的 ${poolSize} 张里挑` : `从已勾选的 ${poolSize} 张里挑`}
            </p>
          ) : (
            <p {...stylex.props(ui.note)}>还没有勾选照片：点日期或时段标题旁的圆圈整段勾选，或拖动连选。</p>
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
        <Button variant="primary" onClick={onRun} disabled={busy || poolSize === 0}>
          {busy ? "挑选中…" : "开始挑选"}
        </Button>
      </div>
    </div>
  );
}
