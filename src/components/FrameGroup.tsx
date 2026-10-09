import * as stylex from "@stylexjs/stylex";
import type { Output } from "../api";
import type { Action } from "../project";
import { Field, Group, Seg, ui } from "../ui";

const FILL_NOTES: Record<Output["fill"], string> = {
  crop: "放大铺满，多出来的部分裁掉；在预览上拖动可调整保留哪一块。",
  black: "完整保留画面，空出的地方补黑边。",
  blur: "完整保留画面，空出的地方用同一画面的模糊放大版填充。",
};

interface Props {
  output: Output;
  dispatch: (action: Action) => void;
}

/** Output shape and how clips of another shape fill it. */
export function FrameGroup({ output, dispatch }: Props) {
  const set = (patch: Partial<Output>) => dispatch({ type: "updateOutput", patch });
  return (
    <Group title="画幅">
      <Field>
        <Seg<Output["aspect"]>
          options={[
            ["9:16", "9:16 竖屏"],
            ["16:9", "16:9 横屏"],
          ]}
          value={output.aspect}
          onChange={(aspect) => set({ aspect })}
        />
      </Field>
      <Field label="画面比例不同时">
        <Seg<Output["fill"]>
          options={[
            ["crop", "铺满裁切"],
            ["black", "黑边"],
            ["blur", "模糊背景"],
          ]}
          value={output.fill}
          onChange={(fill) => set({ fill })}
        />
      </Field>
      <p {...stylex.props(ui.note)}>{FILL_NOTES[output.fill]}</p>
    </Group>
  );
}
