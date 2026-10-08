import type { ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  icon: {
    width: 15,
    height: 15,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
});

/** A 16×16 line icon; pass the SVG paths as children. */
export function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" {...stylex.props(styles.icon)}>
      {children}
    </svg>
  );
}
