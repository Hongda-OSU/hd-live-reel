import { useRef, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { CheckMenuItem, Menu } from "@tauri-apps/api/menu";
import { colors } from "../tokens.stylex";

const styles = stylex.create({
  // One box, like the text fields, with the arrows inside its right edge.
  box: {
    display: "flex",
    alignItems: "stretch",
    height: 26,
    overflow: "hidden",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: colors.border,
      ":focus-within": colors.accent,
    },
    borderRadius: 6,
    backgroundColor: colors.surface,
    outline: {
      default: "none",
      ":focus-within": `3px solid ${colors.accentSoft}`,
    },
  },
  input: {
    flex: "1",
    minWidth: 0,
    paddingInline: 8,
    borderWidth: 0,
    backgroundColor: "transparent",
    outline: "none",
    fontVariantNumeric: "tabular-nums",
  },
  unit: {
    alignSelf: "center",
    paddingRight: 8,
    color: colors.muted,
    fontSize: 12,
  },
  arrows: {
    display: "grid",
    gridTemplateRows: "1fr 1fr",
    width: 18,
    borderLeftWidth: 1,
    borderLeftStyle: "solid",
    borderLeftColor: colors.border,
  },
  arrow: {
    display: "grid",
    placeItems: "center",
    padding: 0,
    borderWidth: 0,
    backgroundColor: {
      default: "transparent",
      ":hover": colors.hover,
    },
    color: colors.muted,
    cursor: "default",
  },
  up: {
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  // One button for the list of common values, in place of the arrows.
  open: {
    width: 20,
    borderLeftWidth: 1,
    borderLeftStyle: "solid",
    borderLeftColor: colors.border,
  },
});

/** A number typed in, or stepped with the arrows or ↑ / ↓, kept within
 * `min`–`max` on the `step` grid. With `presets`, a ▾ in place of the
 * arrows lists common values, like a Mac combo box. */
export function NumberField({
  label,
  min,
  max,
  step,
  value,
  unit,
  decimals = 0,
  presets,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
  decimals?: number;
  /** Common values and their names in the menu. */
  presets?: [number, string][];
  onChange: (value: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  /** What is being typed; null shows `value`. */
  const [draft, setDraft] = useState<string | null>(null);
  const fit = (n: number) => {
    const snapped = Math.round((n - min) / step) * step + min;
    return Number(Math.min(max, Math.max(min, snapped)).toFixed(decimals));
  };
  const commit = () => {
    const typed = draft === null ? NaN : Number(draft);
    if (!Number.isNaN(typed)) onChange(fit(typed));
    setDraft(null);
  };
  const nudge = (by: number) => onChange(fit(value + by * step));

  async function openPresets() {
    if (!presets || !box.current) return;
    const rect = box.current.getBoundingClientRect();
    const menu = await Menu.new({
      items: await Promise.all(
        presets.map(([preset, text]) =>
          CheckMenuItem.new({ text, checked: Math.abs(preset - value) < 1e-9, action: () => onChange(preset) }),
        ),
      ),
    });
    await menu.popup(new LogicalPosition(rect.left, rect.bottom + 4));
  }

  return (
    <div ref={box} {...stylex.props(styles.box)}>
      <input
        aria-label={label}
        inputMode="decimal"
        value={draft ?? value.toFixed(decimals)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(null);
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            setDraft(null);
            nudge(e.key === "ArrowUp" ? 1 : -1);
          }
        }}
        {...stylex.props(styles.input)}
      />
      {unit && <span {...stylex.props(styles.unit)}>{unit}</span>}
      {presets ? (
        <button aria-label="常用值" onClick={() => void openPresets()} {...stylex.props(styles.arrow, styles.open)}>
          <svg width="8" height="5" viewBox="0 0 8 5">
            <path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.3" />
          </svg>
        </button>
      ) : (
        <span {...stylex.props(styles.arrows)}>
          <button tabIndex={-1} aria-label="增加" onClick={() => nudge(1)} {...stylex.props(styles.arrow, styles.up)}>
            <svg width="7" height="5" viewBox="0 0 8 5">
              <path d="M1 4l3-3 3 3" fill="none" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </button>
          <button tabIndex={-1} aria-label="减少" onClick={() => nudge(-1)} {...stylex.props(styles.arrow)}>
            <svg width="7" height="5" viewBox="0 0 8 5">
              <path d="M1 1l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </button>
        </span>
      )}
    </div>
  );
}
