import * as stylex from "@stylexjs/stylex";
import { colors } from "../tokens.stylex";

const styles = stylex.create({
  circle: {
    display: "grid",
    placeItems: "center",
    width: 14,
    height: 14,
    boxSizing: "border-box",
    borderWidth: 1.5,
    borderStyle: "solid",
    borderColor: colors.muted,
    borderRadius: "50%",
  },
  // Some of the group is ticked: a dash.
  some: {
    borderColor: colors.accent,
    "::after": {
      content: '""',
      width: 6,
      height: 1.5,
      backgroundColor: colors.accent,
    },
  },
  all: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
    "::after": {
      content: '""',
      width: 6,
      height: 3,
      borderTopWidth: "0",
      borderRightWidth: "0",
      borderBottomWidth: "1.5px",
      borderLeftWidth: "1.5px",
      borderStyle: "solid",
      borderColor: "#fff",
      transform: "translateY(-1px) rotate(-45deg)",
    },
  },
});

export type CheckState = "none" | "some" | "all";

/** How many of `ids` are in `chosen`, as a check state. */
export function checkState(ids: string[], chosen: Set<string>): CheckState {
  const ticked = ids.filter((id) => chosen.has(id)).length;
  if (ticked === 0) return "none";
  return ticked === ids.length ? "all" : "some";
}

/** A small round check for a group: empty, a dash for some, or a tick
 * for all. */
export function CheckCircle({ state }: { state: CheckState }) {
  return <span {...stylex.props(styles.circle, state === "all" ? styles.all : state === "some" && styles.some)} />;
}
