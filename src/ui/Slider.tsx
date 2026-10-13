import * as stylex from "@stylexjs/stylex";
import { colors } from "../tokens.stylex";
import { ui } from "./styles";

const styles = stylex.create({
  // As tall as the other controls, so slider rows keep the same rhythm.
  row: {
    minHeight: 26,
  },
  // WebKit gives range inputs a 2px margin; without it the track lines
  // up with the fields above and below.
  range: {
    flex: "1",
    margin: 0,
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
    <div {...stylex.props(ui.inline, styles.row)}>
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
