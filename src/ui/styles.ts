// Shared text and layout styles for the generic controls in src/ui.
import type { CSSProperties } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors } from "../tokens.stylex";

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
  inline: {
    display: "flex",
    alignItems: "center",
    gap: 8,
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
    flex: "1",
  },
});
