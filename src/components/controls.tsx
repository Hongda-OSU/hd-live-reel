// Small macOS-style controls shared across the window.
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, shadows } from "../tokens.stylex";

/** Merges StyleX output with inline styles that change per frame
 * (positions while dragging, background images). */
export function withStyle(props: ReturnType<typeof stylex.props>, style?: CSSProperties) {
  return { ...props, style: { ...props.style, ...style } };
}

export const ui = stylex.create({
  note: {
    margin: 0,
    color: colors.muted,
    fontSize: 11,
    lineHeight: 1.5,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
  },
  field: {
    display: "grid",
    gap: 4,
    marginBottom: {
      default: 10,
      ":last-child": 0,
    },
  },
  fieldLabel: {
    fontSize: 11,
    color: colors.muted,
  },
  inline: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  range: {
    flex: 1,
    accentColor: colors.accent,
  },
  value: {
    minWidth: 34,
    textAlign: "right",
    color: colors.muted,
    fontSize: 11,
    fontVariantNumeric: "tabular-nums",
  },
  textInput: {
    height: 26,
    paddingInline: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: colors.border,
      ":focus": colors.accent,
    },
    borderRadius: 6,
    backgroundColor: colors.surface,
    outline: {
      default: "none",
      ":focus": `3px solid ${colors.accentSoft}`,
    },
  },
  spacer: {
    flex: 1,
  },
});

const button = stylex.create({
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
        button.base,
        variant === "default" && !disabled && button.hoverable,
        variant === "primary" && button.primary,
        (variant === "ghost" || variant === "danger") && button.ghost,
        variant === "danger" && button.danger,
        disabled && button.disabled,
      )}
    >
      {children}
    </button>
  );
}

const seg = stylex.create({
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
    <div {...stylex.props(seg.group, xstyle)}>
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          disabled={disabled}
          onClick={() => onChange?.(v)}
          {...stylex.props(seg.option, v === value && seg.on)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const toggle = stylex.create({
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
      {...stylex.props(toggle.track, on && toggle.on)}
    />
  );
}

/** A labelled form row. A div, not a label: a label wrapping buttons
 * would click the first one whenever its text is clicked. */
export function Field({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div {...stylex.props(ui.field)}>
      {label && <span {...stylex.props(ui.fieldLabel)}>{label}</span>}
      {children}
    </div>
  );
}

const icon = stylex.create({
  base: {
    width: 15,
    height: 15,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
});

export function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" {...stylex.props(icon.base)}>
      {children}
    </svg>
  );
}
