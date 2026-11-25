import type { ButtonHTMLAttributes } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, shadows } from "../tokens.stylex";

const styles = stylex.create({
  base: {
    display: "inline-flex",
    alignItems: "center",
    // Centred when stretched, say across a panel.
    justifyContent: "center",
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
  // A text action in a heading or a line of text.
  link: {
    height: "auto",
    paddingInline: 0,
    color: {
      default: colors.accent,
      ":hover": colors.text,
    },
    fontSize: 12,
    fontWeight: 400,
  },
  // A link that takes something away, quieter than the blue one that
  // added it.
  muted: {
    color: {
      default: colors.muted,
      ":hover": colors.text,
    },
  },
  disabled: {
    opacity: 0.45,
    cursor: "default",
    filter: null,
  },
});

type Variant = "default" | "primary" | "ghost" | "danger" | "link" | "mutedLink";

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
        (variant === "ghost" || variant === "danger" || variant === "link" || variant === "mutedLink") && styles.ghost,
        variant === "danger" && styles.danger,
        (variant === "link" || variant === "mutedLink") && styles.link,
        variant === "mutedLink" && styles.muted,
        disabled && styles.disabled,
      )}
    >
      {children}
    </button>
  );
}
