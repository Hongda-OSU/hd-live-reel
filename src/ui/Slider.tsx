import type { CSSProperties } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors } from "../tokens.stylex";
import { ui, withStyle } from "./styles";

/** Thumb diameter; the input is this tall so the thumb isn't clipped.
 * The thumb's centre stops half of it short of each end, which marks
 * laid along the track need to allow for. */
export const SLIDER_THUMB = 15;
const THUMB = SLIDER_THUMB;

const styles = stylex.create({
  // As tall as the other controls, so slider rows keep the same rhythm.
  row: {
    minHeight: 26,
  },
  disabled: {
    opacity: 0.45,
  },
  // A thin track drawn as the input's background: grey, filled in the
  // accent colour between --lo and --hi (percent of the width, which
  // lines up with the thumb within its radius, so the fill's end hides
  // under it). minWidth 0 lets it shrink when the row shares its width.
  range: {
    appearance: "none",
    flex: "1",
    minWidth: 0,
    height: THUMB,
    margin: 0,
    backgroundColor: "transparent",
    backgroundImage: `linear-gradient(to right, ${colors.surface2} var(--lo), ${colors.accent} var(--lo), ${colors.accent} var(--hi), ${colors.surface2} var(--hi))`,
    backgroundPosition: "center",
    backgroundSize: "100% 3px",
    backgroundRepeat: "no-repeat",
    "::-webkit-slider-thumb": {
      appearance: "none",
      width: THUMB,
      height: THUMB,
      borderRadius: "50%",
      backgroundColor: "#e5e5ea",
      boxShadow: "0 0.5px 2px rgba(0, 0, 0, 0.45), 0 0 0 0.5px rgba(0, 0, 0, 0.12)",
    },
  },
  // A tick at --tick, for a fill that grows from a middle value.
  ticked: {
    backgroundImage: `linear-gradient(${colors.muted}, ${colors.muted}), linear-gradient(to right, ${colors.surface2} var(--lo), ${colors.accent} var(--lo), ${colors.accent} var(--hi), ${colors.surface2} var(--hi))`,
    backgroundPosition: "var(--tick) 50%, center",
    backgroundSize: "1px 11px, 100% 3px",
    backgroundRepeat: "no-repeat",
  },
});

/** A range input with its formatted value on the right, when `shown`
 * is given. The fill grows from `origin` (default `min`); a middle
 * origin, such as 0 on a −/+ scale, gets a tick so "no change" is easy
 * to find. */
export function Slider({
  min,
  max,
  step,
  value,
  shown,
  origin = min,
  disabled = false,
  label,
  onChange,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  shown?: string;
  origin?: number;
  /** Names it for screen readers when no Field label does. */
  label?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const pct = (n: number) => ((n - min) / (max - min)) * 100;
  return (
    <div {...stylex.props(ui.inline, styles.row, disabled && styles.disabled)}>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        {...withStyle(stylex.props(styles.range, origin > min && styles.ticked), {
          "--lo": `${Math.min(pct(origin), pct(value))}%`,
          "--hi": `${Math.max(pct(origin), pct(value))}%`,
          "--tick": `${pct(origin)}%`,
        } as CSSProperties)}
      />
      {shown !== undefined && <span {...stylex.props(ui.value)}>{shown}</span>}
    </div>
  );
}
