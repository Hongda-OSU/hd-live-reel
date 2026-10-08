import type { ButtonHTMLAttributes } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, shadows } from "../tokens.stylex";

const styles = stylex.create({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    height: 28,
    paddingInline: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: 7,
    backgroundColor: colors.surface,
    boxShadow: shadows.control,
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  hoverable: {
    backgroundColor: {
      default: colors.surface,
      ":hover": colors.surface2,
    },
  },
  primary: {
    borderColor: "transparent",
    backgroundColor: colors.accent,
    color: colors.onAccent,
    filter: {
      default: null,
      ":hover": "brightness(1.08)",
    },
  },
  ghost: {
    height: 22,
    paddingInline: 6,
    borderColor: "transparent",
    backgroundColor: "transparent",
    boxShadow: "none",
  },
  danger: {
    color: colors.danger,
  },
  disabled: {
    opacity: 0.45,
    cursor: "default",
    filter: null,
  },
});

type Variant = "default" | "primary" | "ghost" | "danger";

export function Button({
  variant = "default",
  disabled,
  children,
  ...rest
}: { variant?: Variant } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style">) {
  return (
    <button
      {...rest}
      disabled={disabled}
      {...stylex.props(
        styles.base,
        variant === "default" && !disabled && styles.hoverable,
        variant === "primary" && styles.primary,
        (variant === "ghost" || variant === "danger") && styles.ghost,
        variant === "danger" && styles.danger,
        disabled && styles.disabled,
      )}
    >
      {children}
    </button>
  );
}
