import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { colors } from "../tokens.stylex";

const styles = stylex.create({
  group: {
    paddingTop: "12px",
    paddingRight: "16px",
    paddingBottom: "14px",
    paddingLeft: "16px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  heading: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "0",
    marginRight: "0",
    marginBottom: "10px",
    marginLeft: "0",
  },
  title: {
    margin: 0,
    fontSize: 12,
    fontWeight: 600,
  },
  badge: {
    paddingBlock: "1px",
    paddingInline: "6px",
    borderRadius: 99,
    backgroundColor: colors.surface2,
    color: colors.muted,
    fontSize: 10,
    fontWeight: 500,
  },
  dimmed: {
    opacity: 0.45,
  },
});

/** A section of a settings panel, titled unless it is alone on its page.
 * `dimmed` greys out the body but keeps the heading and badge readable;
 * `action`, such as a link button, sits at the heading's right. */
export function Group({
  title,
  badge,
  action,
  dimmed,
  children,
}: {
  title?: string;
  badge?: string;
  action?: ReactNode;
  dimmed?: boolean;
  children: ReactNode;
}) {
  return (
    <div {...stylex.props(styles.group)}>
      {(title || badge || action) && (
        <div {...stylex.props(styles.heading)}>
          <h3 {...stylex.props(styles.title)}>{title}</h3>
          {badge && <span {...stylex.props(styles.badge)}>{badge}</span>}
          {action}
        </div>
      )}
      <div {...stylex.props(dimmed && styles.dimmed)}>{children}</div>
    </div>
  );
}
