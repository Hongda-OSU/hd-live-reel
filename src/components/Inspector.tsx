import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import type { Title, TitlePosition } from "../api";
import type { Action } from "../project";
import { colors } from "../tokens.stylex";
import { Field, Seg, ui } from "./controls";

/** Fade used by the "淡出" choice, in seconds. */
const FADE = 0.3;

const styles = stylex.create({
  panel: {
    overflowY: "auto",
    padding: "6px 0 20px",
    borderLeftWidth: 1,
    borderLeftStyle: "solid",
    borderLeftColor: colors.border,
    backgroundColor: colors.window,
  },
  group: {
    padding: "12px 16px 14px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  heading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    margin: "0 0 10px",
    fontSize: 12,
    fontWeight: 600,
  },
  soon: {
    padding: "1px 6px",
    borderRadius: 99,
    backgroundColor: colors.surface2,
    color: colors.muted,
    fontSize: 10,
    fontWeight: 500,
  },
  dimmed: {
    opacity: 0.45,
  },
});

function Group({ title, soon, children }: { title: string; soon?: boolean; children: ReactNode }) {
  return (
    <div {...stylex.props(styles.group)}>
      <h3 {...stylex.props(styles.heading)}>
        {title}
        {soon && <span {...stylex.props(styles.soon)}>即将支持</span>}
      </h3>
      <div {...stylex.props(soon && styles.dimmed)}>{children}</div>
    </div>
  );
}

function Slider({
  min,
  max,
  step,
  value,
  shown,
  onChange,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  shown: string;
  onChange: (value: number) => void;
}) {
  return (
    <div {...stylex.props(ui.inline)}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        {...stylex.props(ui.range)}
      />
      <span {...stylex.props(ui.value)}>{shown}</span>
    </div>
  );
}

interface Props {
  title: Title;
  dispatch: (action: Action) => void;
}

export function Inspector({ title, dispatch }: Props) {
  const set = (patch: Partial<Title>) => dispatch({ type: "updateTitle", patch });

  return (
    <aside {...stylex.props(styles.panel)}>
      <Group title="标题">
        <Field label="主标题">
          <input
            value={title.text}
            aria-label="主标题"
            placeholder="留空则不显示标题"
            onChange={(e) => set({ text: e.target.value })}
            {...stylex.props(ui.textInput)}
          />
        </Field>
        <Field label="副标题">
          <input
            value={title.subtitle}
            aria-label="副标题"
            onChange={(e) => set({ subtitle: e.target.value })}
            {...stylex.props(ui.textInput)}
          />
        </Field>
        <Field label="显示时长">
          <Slider
            min={0.5}
            max={3}
            step={0.1}
            value={title.showFor}
            shown={`${title.showFor.toFixed(1)} 秒`}
            onChange={(showFor) => set({ showFor, fadeOut: Math.min(title.fadeOut, showFor) })}
          />
        </Field>
        <Field label="消失方式">
          <Seg
            options={[
              [0, "直接消失"],
              [FADE, "淡出"],
            ]}
            value={title.fadeOut > 0 ? FADE : 0}
            onChange={(fadeOut) => set({ fadeOut: Math.min(fadeOut, title.showFor) })}
          />
        </Field>
        <Field label="位置">
          <Seg<TitlePosition>
            options={[
              ["top", "上"],
              ["center", "中"],
              ["bottom", "下"],
            ]}
            value={title.position}
            onChange={(position) => set({ position })}
          />
        </Field>
        <Field label="字号">
          <Slider
            min={40}
            max={140}
            step={2}
            value={title.fontSize}
            shown={String(title.fontSize)}
            onChange={(fontSize) => set({ fontSize })}
          />
        </Field>
      </Group>

      <Group title="声音" soon>
        <Field>
          <Seg
            options={[
              ["original", "原声"],
              ["music", "配乐"],
              ["mix", "配乐 + 原声"],
            ]}
            value="original"
            disabled
          />
        </Field>
        <p {...stylex.props(ui.note)}>每段已自动拉齐响度，接缝处不爆音。</p>
      </Group>

      <Group title="滤镜" soon>
        <Seg
          options={[
            ["none", "原片"],
            ["forest", "林间"],
            ["river", "水色"],
            ["golden", "暖阳"],
          ]}
          value="none"
          disabled
        />
      </Group>

      <Group title="画幅" soon>
        <Field>
          <Seg
            options={[
              ["9:16", "9:16 竖屏"],
              ["16:9", "16:9 横屏"],
            ]}
            value="9:16"
            disabled
          />
        </Field>
        <Field label="转场">
          <Seg
            options={[
              ["none", "硬切"],
              ["fade", "淡入淡出"],
            ]}
            value="none"
            disabled
          />
        </Field>
      </Group>
    </aside>
  );
}
