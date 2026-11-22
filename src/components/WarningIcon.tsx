import * as stylex from "@stylexjs/stylex";
import { colors } from "../tokens.stylex";

const styles = stylex.create({
  icon: (size: number) => ({
    flexShrink: 0,
    width: size,
    height: size,
    fill: "none",
    stroke: colors.warning,
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  }),
});

/** An orange warning triangle, marking a clip whose original is lost. */
export function WarningIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden {...stylex.props(styles.icon(size))}>
      <path d="M8 2.2 14.3 13.3H1.7z" />
      <path d="M8 6.5v3M8 11.4v.1" />
    </svg>
  );
}
