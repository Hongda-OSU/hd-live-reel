import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors } from "../tokens.stylex";

const styles = stylex.create({
  field: {
    display: "grid",
    gap: 4,
    marginBottom: {
      default: 10,
      ":last-child": 0,
    },
  },
  label: {
    fontSize: 11,
    color: colors.muted,
  },
});

/** A labelled form row. A div, not a label: a label wrapping buttons
 * would click the first one whenever its text is clicked. */
export function Field({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div {...stylex.props(styles.field)}>
      {label && <span {...stylex.props(styles.label)}>{label}</span>}
      {children}
    </div>
  );
}
