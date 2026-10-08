import * as stylex from "@stylexjs/stylex";
import type { Filter, Title, TitlePosition, TitleTextStyle, TitleWeight } from "../api";
import type { Action } from "../project";
import { colors } from "../tokens.stylex";
import { Button, Field, Group, Select, Seg, Slider, Swatches, ui } from "../ui";

/** Fade used by the "淡出" choice, in seconds. */
const FADE = 0.3;

/** Title fonts that ship with macOS. */
const FONTS: [string, string][] = [
  ["PingFang SC", "苹方"],
  ["Songti SC", "宋体"],
  ["Avenir Next", "Avenir Next"],
  ["Futura", "Futura"],
  ["Didot", "Didot"],
  ["Snell Roundhand", "Snell Roundhand（英文手写）"],
];

const COLOURS: [string, string][] = [
  ["#ffffff", "白"],
  ["#f3e9d2", "米白"],
  ["#ffd166", "暖黄"],
  ["#cfe6ff", "浅蓝"],
  ["#1d1d1f", "黑"],
];

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

const NEUTRAL: Pick<Filter, "brightness" | "contrast" | "saturation"> = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
};

/** "+0.05" / "−0.10" / "0": slider offsets from neutral. */
const signed = (value: number) =>
  Math.abs(value) < 1e-9 ? "0" : `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`;

interface Props {
  title: Title;
  filter: Filter;
  dispatch: (action: Action) => void;
}

export function Inspector({ title, filter, dispatch }: Props) {
  const set = (patch: Partial<Title>) => dispatch({ type: "updateTitle", patch });
  const setFilter = (patch: Partial<Filter>) => dispatch({ type: "updateFilter", patch });
  const adjusted =
    filter.brightness !== NEUTRAL.brightness ||
    filter.contrast !== NEUTRAL.contrast ||
    filter.saturation !== NEUTRAL.saturation;

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
        <Field label="字体">
          <Select label="字体" options={FONTS} value={title.font} onChange={(font) => set({ font })} />
        </Field>
        <Field label="粗细">
          <Seg<TitleWeight>
            options={[
              ["light", "细"],
              ["regular", "常规"],
              ["bold", "粗"],
            ]}
            value={title.weight}
            onChange={(weight) => set({ weight })}
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
        <Field label="行距">
          <Slider
            min={0}
            max={80}
            step={2}
            value={title.lineGap}
            shown={String(title.lineGap)}
            onChange={(lineGap) => set({ lineGap })}
          />
        </Field>
        <Field label="颜色">
          <Swatches options={COLOURS} value={title.color} onChange={(color) => set({ color })} />
        </Field>
        <Field label="文字效果">
          <Seg<TitleTextStyle>
            options={[
              ["outline", "描边"],
              ["shadow", "阴影"],
              ["none", "无"],
            ]}
            value={title.textStyle}
            onChange={(textStyle) => set({ textStyle })}
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

      <Group title="滤镜">
        <Field>
          <Seg<Filter["preset"]>
            options={[
              ["none", "原片"],
              ["forest", "林间"],
              ["river", "水色"],
              ["golden", "暖阳"],
            ]}
            value={filter.preset}
            onChange={(preset) => setFilter({ preset })}
          />
        </Field>
        <Field label="亮度">
          <Slider
            min={-0.2}
            max={0.2}
            step={0.01}
            value={filter.brightness}
            shown={signed(filter.brightness)}
            onChange={(brightness) => setFilter({ brightness })}
          />
        </Field>
        <Field label="对比度">
          <Slider
            min={0.7}
            max={1.3}
            step={0.01}
            value={filter.contrast}
            shown={signed(filter.contrast - 1)}
            onChange={(contrast) => setFilter({ contrast })}
          />
        </Field>
        <Field label="饱和度">
          <Slider
            min={0.5}
            max={1.5}
            step={0.01}
            value={filter.saturation}
            shown={signed(filter.saturation - 1)}
            onChange={(saturation) => setFilter({ saturation })}
          />
        </Field>
        {adjusted && (
          <Button variant="ghost" onClick={() => setFilter(NEUTRAL)}>
            重置滑块
          </Button>
        )}
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
