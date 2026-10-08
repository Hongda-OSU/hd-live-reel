import * as stylex from "@stylexjs/stylex";
import type { Title, TitlePosition } from "../api";
import type { Action } from "../project";
import { colors } from "../tokens.stylex";
import { Field, Group, Seg, Slider, ui } from "../ui";

/** Fade used by the "淡出" choice, in seconds. */
const FADE = 0.3;

const styles = stylex.create({
  panel: {
    overflowY: "auto",
    paddingTop: "6px",
    paddingRight: "0",
    paddingBottom: "20px",
    paddingLeft: "0",
    borderLeftWidth: 1,
    borderLeftStyle: "solid",
    borderLeftColor: colors.border,
    backgroundColor: colors.window,
  },
});

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

      <Group title="声音" badge="即将支持" dimmed>
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

      <Group title="滤镜" badge="即将支持" dimmed>
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

      <Group title="画幅" badge="即将支持" dimmed>
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
