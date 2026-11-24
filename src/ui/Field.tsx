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
  // Label beside the control, like a Mac inspector, so a page of
  // settings fits without scrolling.
  row: {
    gridTemplateColumns: "52px minmax(0, 1fr)",
    alignItems: "center",
    columnGap: 8,
  },
  label: {
    fontSize: 11,
    color: colors.muted,
  },
  rowLabel: {
    fontSize: 12,
    whiteSpace: "nowrap",
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
  /** Shown at the right of the label, e.g. a slider's current value;
   * puts the label over the control. */
  aside?: ReactNode;
  /** The label over the control, for a long label or a wide control. */
  stacked?: boolean;
  children: ReactNode;
}

/** A labelled form row: the label at the left, or over the control when
 * `stacked` or given an `aside`. A div, not a label: a label wrapping
 * buttons would click the first one whenever its text is clicked. */
export function Field({ label, aside, stacked, children }: Props) {
  const row = !!label && !aside && !stacked;
  const title = label && <span {...stylex.props(styles.label, row && styles.rowLabel)}>{label}</span>;
  return (
    <div {...stylex.props(styles.field, row && styles.row)}>
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
