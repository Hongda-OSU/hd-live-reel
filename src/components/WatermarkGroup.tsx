import * as stylex from "@stylexjs/stylex";
import type { Watermark } from "../api";
import type { Action } from "../project";
import { Field, Group, Slider, Switch, ui } from "../ui";

/** The only mark offered; matches the Rust default. */
const MARK = "hd-live-reel";

interface Props {
  watermark: Watermark;
  dispatch: (action: Action) => void;
}

/** The app's name in the corner of every frame (bottom right by default),
 * on or off. Stored as the text, empty when off, so the project format is
 * unchanged. */
export function WatermarkGroup({ watermark, dispatch }: Props) {
  const set = (patch: Partial<Watermark>) => dispatch({ type: "updateWatermark", patch });
  const on = watermark.text.trim() !== "";
  return (
    <Group title="水印">
      <Field>
        <div {...stylex.props(ui.inline)}>
          <span {...stylex.props(ui.spacer)}>{MARK}</span>
          <Switch on={on} label="显示水印" onToggle={() => set({ text: on ? "" : MARK })} />
        </div>
      </Field>
      {on && (
        <>
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
          <p {...stylex.props(ui.note)}>从第一帧到最后一帧都显示。</p>
        </>
      )}
    </Group>
  );
}
