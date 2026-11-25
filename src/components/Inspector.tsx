import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import type { Audio, Filter, Title, TitlePosition, TitleTextStyle, TitleWeight, Transition, Watermark } from "../api";
import type { Action } from "../project";
import { colors } from "../tokens.stylex";
import { Button, Field, Group, Icon, NumberField, Select, Seg, Slider, Swatches, ui } from "../ui";
import { SoundGroup } from "./SoundGroup";
import { WatermarkGroup } from "./WatermarkGroup";

/** Fade used by the "淡出" choice, in seconds. */
const FADE = 0.3;
/** Cross-dissolve length when "淡入淡出" is first picked, in seconds. */
const DISSOLVE = 0.3;

/** Common gaps between title and subtitle, in pixels at 1080 wide. */
const LINE_GAPS: [number, string][] = [
  [8, "紧 · 8"],
  [18, "适中 · 18（默认）"],
  [32, "松 · 32"],
];

/** Common title sizes, in pixels at 1080 wide; captions are 3/4 of it. */
const FONT_SIZES: [number, string][] = [
  [56, "56"],
  [72, "72（默认）"],
  [96, "96"],
  [120, "120"],
];

/** Common times the title stays, in seconds. */
const SHOW_FOR: [number, string][] = [
  [0.5, "0.5 秒"],
  [1, "1 秒（默认）"],
  [1.5, "1.5 秒"],
  [2, "2 秒"],
  [3, "3 秒"],
];

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
  // A column, so the 这一段 page's footer can sit at the bottom.
  panel: {
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    padding: 0,
    borderLeftWidth: 1,
    borderLeftStyle: "solid",
    borderLeftColor: colors.border,
    backgroundColor: colors.window,
  },
  // The page switcher stays at the top while a long page scrolls. Each
  // page has an icon over its name, like Xcode's inspector, so the one
  // open shows at a glance.
  tabs: {
    position: "sticky",
    top: 0,
    zIndex: 1,
    display: "flex",
    justifyContent: "space-around",
    paddingTop: "10px",
    paddingBottom: "8px",
    paddingInline: "8px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
    backgroundColor: colors.window,
  },
  tab: {
    display: "grid",
    justifyItems: "center",
    gap: 3,
    width: 46,
    paddingTop: "5px",
    paddingBottom: "4px",
    borderWidth: 0,
    borderRadius: 7,
    backgroundColor: {
      default: "transparent",
      ":hover": colors.hover,
    },
    color: colors.muted,
    fontSize: 10,
    cursor: "pointer",
  },
  tabOn: {
    backgroundColor: {
      default: colors.accentSoft,
      ":hover": colors.accentSoft,
    },
    color: colors.accent,
    fontWeight: 600,
  },
});

/** One page of settings at a time, so none needs much scrolling: the
 * selected clip, the text (the opening title and the look it shares with
 * every caption), the picture (frame, filter, transition, watermark), the
 * sound, the export. */
export type InspectorPage = "clip" | "title" | "picture" | "sound" | "export";

const PAGES: [InspectorPage, string, ReactNode][] = [
  [
    "clip",
    "这一段",
    <path
      key="clip"
      d="M3.5 3h9A1.5 1.5 0 0 1 14 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7A1.5 1.5 0 0 1 3.5 3zM5 3v10M11 3v10M2 6h3M2 10h3M11 6h3M11 10h3"
    />,
  ],
  ["title", "文字", <path key="title" d="M3 3.5h10M8 3.5v9.5M6 13h4" />],
  [
    "picture",
    "画面",
    <path
      key="picture"
      d="M3.5 2.5h9A1.5 1.5 0 0 1 14 4v8a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12V4a1.5 1.5 0 0 1 1.5-1.5zM2 11l3.5-3.5 3 3 2-2L14 12M10.5 4.4a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z"
    />,
  ],
  [
    "sound",
    "声音",
    <path key="sound" d="M2.5 6h2.5l3-2.5v9L5 10H2.5zM10.5 5.5a3.5 3.5 0 0 1 0 5M12.3 3.8a6 6 0 0 1 0 8.4" />,
  ],
  ["export", "导出", <path key="export" d="M8 10V2.5M5 5.5 8 2.5l3 3M3.5 8.5v4a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-4" />],
];

/** The looks in the 滤镜 menu after 原片: ones for the places I shoot,
 * then styled ones. More go in either group. */
const FILTER_GROUPS: [string, [Filter["preset"], string][]][] = [
  [
    "自然",
    [
      ["forest", "林间"],
      ["river", "水色"],
      ["golden", "暖阳"],
      ["sky", "晴空"],
    ],
  ],
  [
    "风格",
    [
      ["court", "球场"],
      ["city", "城市"],
      ["vapor", "蒸汽波"],
      ["mono", "黑白"],
    ],
  ],
];

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
  audio: Audio;
  filter: Filter;
  transition: Transition;
  watermark: Watermark;
  /** The page shown; the app turns to 这一段 when a clip is picked. */
  page: InspectorPage;
  onPage: (page: InspectorPage) => void;
  /** The 这一段 page, which edits the selected clip. */
  clip: ReactNode;
  /** The 导出 page, which names, places and makes the video. */
  exportPage: ReactNode;
  dispatch: (action: Action) => void;
}

export function Inspector({
  title,
  audio,
  filter,
  transition,
  watermark,
  page,
  onPage,
  clip,
  exportPage,
  dispatch,
}: Props) {
  const set = (patch: Partial<Title>) => dispatch({ type: "updateTitle", patch });
  const setFilter = (patch: Partial<Filter>) => dispatch({ type: "updateFilter", patch });
  const setTransition = (patch: Partial<Transition>) => dispatch({ type: "updateTransition", patch });
  const adjusted =
    filter.brightness !== NEUTRAL.brightness ||
    filter.contrast !== NEUTRAL.contrast ||
    filter.saturation !== NEUTRAL.saturation;

  return (
    <aside {...stylex.props(styles.panel)}>
      <div role="tablist" {...stylex.props(styles.tabs)}>
        {PAGES.map(([id, label, path]) => (
          <button
            key={id}
            role="tab"
            aria-selected={id === page}
            onClick={() => onPage(id)}
            {...stylex.props(styles.tab, id === page && styles.tabOn)}
          >
            <Icon>{path}</Icon>
            {label}
          </button>
        ))}
      </div>
      {page === "clip" && clip}
      {page === "title" && (
        <>
          <Group title="片头">
            <Field label="主标题">
              <input
                value={title.text}
                aria-label="主标题"
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
            <Field label="行距">
              <NumberField
                label="行距"
                min={0}
                max={80}
                step={2}
                value={title.lineGap}
                presets={LINE_GAPS}
                onChange={(lineGap) => set({ lineGap })}
              />
            </Field>
            <Field label="显示">
              <NumberField
                label="显示时长"
                min={0.5}
                max={3}
                step={0.1}
                decimals={1}
                unit="秒"
                value={title.showFor}
                presets={SHOW_FOR}
                onChange={(showFor) => set({ showFor, fadeOut: Math.min(title.fadeOut, showFor) })}
              />
            </Field>
            <Field label="结尾">
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
          {/* Captions are drawn in this look too, a size smaller. */}
          <Group title="文字样式">
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
              <NumberField
                label="字号"
                min={40}
                max={140}
                step={2}
                value={title.fontSize}
                presets={FONT_SIZES}
                onChange={(fontSize) => set({ fontSize })}
              />
            </Field>
            <Field label="效果">
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
            <Field label="颜色">
              <Swatches
                options={COLOURS}
                value={title.color}
                onChange={(color) => set({ color })}
                customLabel="自定义颜色"
              />
            </Field>
          </Group>
        </>
      )}
      {page === "picture" && (
        <>
          <Group title="滤镜">
            <Field label="预设">
              <Select<Filter["preset"]>
                label="滤镜"
                options={[["none", "原片"]]}
                groups={FILTER_GROUPS}
                value={filter.preset}
                onChange={(preset) => setFilter({ preset })}
              />
            </Field>
          </Group>
          <Group
            title="调整"
            action={
              <Button variant="link" disabled={!adjusted} onClick={() => setFilter(NEUTRAL)}>
                还原
              </Button>
            }
          >
            <Field label="亮度">
              <Slider
                min={-0.2}
                max={0.2}
                step={0.01}
                origin={0}
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
                origin={1}
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
                origin={1}
                value={filter.saturation}
                shown={signed(filter.saturation - 1)}
                disabled={filter.preset === "mono"}
                onChange={(saturation) => setFilter({ saturation })}
              />
            </Field>
          </Group>
          <Group title="转场">
            <Field>
              <Seg<Transition["type"]>
                options={[
                  ["none", "硬切"],
                  ["fade", "淡入淡出"],
                ]}
                value={transition.type}
                onChange={(type) =>
                  setTransition(type === "fade" && transition.duration <= 0 ? { type, duration: DISSOLVE } : { type })
                }
              />
            </Field>
            {transition.type === "fade" && (
              <Field label="时长">
                <Slider
                  min={0.2}
                  max={0.8}
                  step={0.1}
                  value={transition.duration}
                  shown={`${transition.duration.toFixed(1)} 秒`}
                  onChange={(duration) => setTransition({ duration })}
                />
              </Field>
            )}
            <p {...stylex.props(ui.note)}>
              {transition.type === "fade" ? "相邻两段画面和声音交叠过渡，总长会相应变短。" : "片段之间直接切换。"}
            </p>
          </Group>
          <WatermarkGroup watermark={watermark} dispatch={dispatch} />
        </>
      )}
      {page === "sound" && <SoundGroup audio={audio} dispatch={dispatch} />}
      {page === "export" && exportPage}
    </aside>
  );
}
