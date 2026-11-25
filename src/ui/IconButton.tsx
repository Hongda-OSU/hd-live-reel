import type { ButtonHTMLAttributes, ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors } from "../tokens.stylex";
import { Icon } from "./Icon";

const styles = stylex.create({
  // Borderless, with a faint backing on hover, like a sidebar's buttons.
  button: {
    display: "grid",
    placeItems: "center",
    width: 22,
    height: 20,
    padding: 0,
    borderWidth: 0,
    borderRadius: 5,
    backgroundColor: {
      default: "transparent",
      ":hover": colors.hover,
    },
    color: colors.muted,
    cursor: "pointer",
  },
  disabled: {
    opacity: 0.4,
    cursor: "default",
    backgroundColor: "transparent",
  },
});

/** A small icon-only button; `label` names it for screen readers and,
 * with an optional shortcut, in its tooltip. */
export function IconButton({
  label,
  shortcut,
  disabled,
  children,
  ...rest
}: {
  label: string;
  shortcut?: string;
  /** The icon's paths, drawn on a 16 × 16 grid. */
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style" | "title" | "children">) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={shortcut ? `${label} ${shortcut}` : label}
      disabled={disabled}
      {...stylex.props(styles.button, disabled && styles.disabled)}
    >
      <Icon>{children}</Icon>
    </button>
  );
}
