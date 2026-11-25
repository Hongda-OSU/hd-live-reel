import type { Watermark } from "../api";
import type { Action } from "../project";
import { MARK_NAME } from "../title";
import { Field, Group, Slider, Switch } from "../ui";

interface Props {
  watermark: Watermark;
  dispatch: (action: Action) => void;
}

/** 鴻鵠誌達 down the bottom-right corner of every frame, on or off, with
 * its size and transparency; the preview shows how it looks. On and off
 * are stored as the text, empty when off. */
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
