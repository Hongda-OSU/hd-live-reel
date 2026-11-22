import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors } from "../tokens.stylex";

const styles = stylex.create({
  field: {
    display: "grid",
    // WebKit sizes an auto column to the row's full content, so a long
    // music file name pushed the row past the panel; minmax(0, …) caps it.
    gridTemplateColumns: "minmax(0, 1fr)",
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
  heading: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
});

interface Props {
  label?: string;
  /** Shown at the right of the label, e.g. a slider's current value. */
  aside?: ReactNode;
  children: ReactNode;
}

/** A labelled form row. A div, not a label: a label wrapping buttons
 * would click the first one whenever its text is clicked. */
export function Field({ label, aside, children }: Props) {
  const title = label && <span {...stylex.props(styles.label)}>{label}</span>;
  return (
    <div {...stylex.props(styles.field)}>
      {aside ? (
        <div {...stylex.props(styles.heading)}>
          {title}
          {aside}
        </div>
      ) : (
        title
      )}
      {children}
    </div>
  );
}
