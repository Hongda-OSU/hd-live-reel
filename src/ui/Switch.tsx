import * as stylex from "@stylexjs/stylex";
import { colors } from "../tokens.stylex";

const styles = stylex.create({
  track: {
    position: "relative",
    flexShrink: 0,
    width: 30,
    height: 18,
    padding: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: 99,
    backgroundColor: colors.surface2,
    cursor: "pointer",
    "::after": {
      content: '""',
      position: "absolute",
      top: 1,
      left: 1,
      width: 14,
      height: 14,
      borderRadius: "50%",
      backgroundColor: "#fff",
      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.3)",
      transition: "left 0.15s",
    },
  },
  on: {
    borderColor: "transparent",
    backgroundColor: colors.accent,
    "::after": {
      left: 13,
    },
  },
});

export function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      {...stylex.props(styles.track, on && styles.on)}
    />
  );
}
