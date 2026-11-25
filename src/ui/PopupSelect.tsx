import { useEffect, useRef, useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors, shadows } from "../tokens.stylex";
import { ui } from "./styles";

const styles = stylex.create({
  root: {
    position: "relative",
  },
  // Like `Select`, but each choice can be drawn, say in its own font.
  button: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    width: "100%",
    height: 30,
    paddingInline: 8,
    color: colors.text,
    textAlign: "left",
    cursor: "default",
    borderColor: {
      default: colors.border,
      ":focus-visible": colors.accent,
    },
    outline: {
      default: "none",
      ":focus-visible": `3px solid ${colors.accentSoft}`,
    },
  },
  current: {
    flex: "1",
    minWidth: 0,
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  arrows: {
    width: 9,
    height: 12,
    flex: "none",
    fill: "none",
    stroke: colors.muted,
    strokeWidth: 1.4,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
  // Opens upward: it sits at the foot of a settings panel.
  list: {
    position: "absolute",
    right: 0,
    bottom: "calc(100% + 4px)",
    zIndex: 20,
    display: "grid",
    minWidth: "100%",
    padding: 5,
    borderRadius: 8,
    backgroundColor: colors.surface,
    boxShadow: `${shadows.lifted}, 0 0 0 0.5px ${colors.border}`,
  },
  option: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: 32,
    paddingInline: 10,
    borderWidth: 0,
    borderRadius: 5,
    whiteSpace: "nowrap",
    textAlign: "left",
    cursor: "default",
    color: {
      default: colors.text,
      ":hover": colors.onAccent,
    },
    backgroundColor: {
      default: "transparent",
      ":hover": colors.accent,
    },
  },
  check: {
    width: 10,
    fontSize: 12,
  },
});

/** A pop-up button whose choices are drawn by the caller, for menus a
 * native one can't show, such as each font in itself. Opens on a click,
 * closes on a pick, a click elsewhere or Esc. */
export function PopupSelect<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [T, ReactNode][];
  value: T;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={root} {...stylex.props(styles.root)}>
      <button
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        {...stylex.props(ui.textInput, styles.button)}
      >
        <span {...stylex.props(styles.current)}>{options.find(([v]) => v === value)?.[1]}</span>
        <svg viewBox="0 0 9 12" {...stylex.props(styles.arrows)}>
          <path d="M2 4.5 4.5 2 7 4.5M2 7.5 4.5 10 7 7.5" />
        </svg>
      </button>
      {open && (
        <div role="listbox" aria-label={label} {...stylex.props(styles.list)}>
          {options.map(([v, node]) => (
            <button
              key={v}
              role="option"
              aria-selected={v === value}
              onClick={() => {
                onChange(v);
                setOpen(false);
              }}
              {...stylex.props(styles.option)}
            >
              <span {...stylex.props(styles.check)}>{v === value ? "✓" : ""}</span>
              {node}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
