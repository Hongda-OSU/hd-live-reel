import * as stylex from "@stylexjs/stylex";
import { colors, shadows } from "../tokens.stylex";

const styles = stylex.create({
  group: {
    display: "grid",
    gridAutoFlow: "column",
    gridAutoColumns: "1fr",
    padding: 2,
    borderRadius: 7,
    backgroundColor: colors.surface2,
  },
  option: {
    height: 22,
    borderWidth: 0,
    borderRadius: 5,
    backgroundColor: "transparent",
    fontSize: 12,
    cursor: {
      default: "pointer",
      ":disabled": "default",
    },
  },
  on: {
    backgroundColor: colors.surface,
    boxShadow: shadows.raised,
    fontWeight: 500,
  },
});

/** A segmented control: one of a few labelled values. */
export function Seg<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  xstyle,
}: {
  options: [T, string][];
  value: T;
  onChange?: (value: T) => void;
  disabled?: boolean;
  xstyle?: stylex.StyleXStyles;
}) {
  return (
    <div {...stylex.props(styles.group, xstyle)}>
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          disabled={disabled}
          onClick={() => onChange?.(v)}
          {...stylex.props(styles.option, v === value && styles.on)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
