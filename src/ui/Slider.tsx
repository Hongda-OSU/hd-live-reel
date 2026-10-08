import * as stylex from "@stylexjs/stylex";
import { colors } from "../tokens.stylex";
import { ui } from "./styles";

const styles = stylex.create({
  range: {
    flex: 1,
    accentColor: colors.accent,
  },
});

/** A range input with its formatted value on the right. */
export function Slider({
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
        {...stylex.props(styles.range)}
      />
      <span {...stylex.props(ui.value)}>{shown}</span>
    </div>
  );
}
