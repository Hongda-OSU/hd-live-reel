import * as stylex from "@stylexjs/stylex";
import type { MarkStyle, Watermark } from "../api";
import type { Action } from "../project";
import { MARK_LOOKS, MARK_NAME, markText } from "../title";
import { Field, Group, PopupSelect, Slider, Switch } from "../ui";

const styles = stylex.create({
  // A style's name written in that style, as the menu shows it.
  look: (fontFamily: string, fontWeight: number, fontStyle: string, letterSpacing: string, fontSize: number) => ({
    fontFamily: `"${fontFamily}", "PingFang SC", sans-serif`,
    fontWeight,
    fontStyle,
    letterSpacing,
    fontSize,
    lineHeight: 1,
  }),
});

/** The menu's order: the recommended look first, the plain one last. */
const ORDER: MarkStyle[] = ["script", "spaced", "italic", "credits", "plain"];

function Lettering({ style }: { style: MarkStyle }) {
  const look = MARK_LOOKS[style];
  // About 13 px for plain text, so every look reads at a similar size.
  const size = Math.min(18, 13 * look.scale);
  return (
    <span
      title={look.label}
      {...stylex.props(
        styles.look(look.family, look.weight, look.italic ? "italic" : "normal", `${look.spacing}em`, size),
      )}
    >
      {markText(MARK_NAME, style)}
    </span>
  );
}

interface Props {
  watermark: Watermark;
  dispatch: (action: Action) => void;
}

/** The app's name in the corner of every frame (bottom right by default),
 * on or off, in one of a few letterings. On and off are stored as the
 * text, empty when off. */
export function WatermarkGroup({ watermark, dispatch }: Props) {
  const set = (patch: Partial<Watermark>) => dispatch({ type: "updateWatermark", patch });
  const on = watermark.text.trim() !== "";
  return (
    <Group
      title="水印"
      action={<Switch on={on} label="显示水印" onToggle={() => set({ text: on ? "" : MARK_NAME })} />}
    >
      {on && (
        <>
          <Field label="样式">
            <PopupSelect<MarkStyle>
              label="水印样式"
              options={ORDER.map((style) => [style, <Lettering key={style} style={style} />])}
              value={watermark.style}
              onChange={(style) => set({ style })}
            />
          </Field>
          <Field label="大小">
            <Slider
              min={24}
              max={72}
              step={2}
              value={watermark.size}
              shown={String(watermark.size)}
              onChange={(size) => set({ size })}
            />
          </Field>
          <Field label="透明度">
            {/* Shown as transparency, stored as opacity like FFmpeg's alpha. */}
            <Slider
              min={0}
              max={0.8}
              step={0.05}
              value={1 - watermark.opacity}
              shown={`${Math.round((1 - watermark.opacity) * 100)}%`}
              onChange={(transparency) => set({ opacity: Math.round((1 - transparency) * 100) / 100 })}
            />
          </Field>
        </>
      )}
    </Group>
  );
}
