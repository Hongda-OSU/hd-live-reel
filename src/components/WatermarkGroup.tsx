import * as stylex from "@stylexjs/stylex";
import type { Watermark, WatermarkCorner } from "../api";
import type { Action } from "../project";
import { Field, Group, Seg, Slider, ui } from "../ui";

interface Props {
  watermark: Watermark;
  dispatch: (action: Action) => void;
}

/** A line of text in one corner of every frame. */
export function WatermarkGroup({ watermark, dispatch }: Props) {
  const set = (patch: Partial<Watermark>) => dispatch({ type: "updateWatermark", patch });
  return (
    <Group title="水印">
      <Field label="文字">
        <input
          value={watermark.text}
          aria-label="水印文字"
          onChange={(e) => set({ text: e.target.value })}
          {...stylex.props(ui.textInput)}
        />
      </Field>
      <Field label="位置">
        <Seg<WatermarkCorner>
          options={[
            ["topLeft", "左上"],
            ["topRight", "右上"],
            ["bottomLeft", "左下"],
            ["bottomRight", "右下"],
          ]}
          value={watermark.position}
          onChange={(position) => set({ position })}
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
      <p {...stylex.props(ui.note)}>文字留空就不加水印。从第一帧到最后一帧都显示。</p>
    </Group>
  );
}
