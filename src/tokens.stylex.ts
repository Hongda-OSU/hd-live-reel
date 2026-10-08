// Design tokens from docs/design/ui-prototype.html. Light by default; the
// dark values follow the system appearance.
import * as stylex from "@stylexjs/stylex";

const DARK = "@media (prefers-color-scheme: dark)";

export const colors = stylex.defineVars({
  accent: "#0a84ff",
  accentSoft: "color-mix(in srgb, #0a84ff 16%, transparent)",
  onAccent: "#ffffff",
  window: { default: "#f6f6f8", [DARK]: "#1f1f22" },
  sidebar: { default: "rgba(236, 236, 240, 0.78)", [DARK]: "rgba(40, 40, 44, 0.8)" },
  surface: { default: "#ffffff", [DARK]: "#2c2c2f" },
  surface2: { default: "#ececf0", [DARK]: "#38383c" },
  border: { default: "rgba(0, 0, 0, 0.1)", [DARK]: "rgba(255, 255, 255, 0.1)" },
  text: { default: "#1d1d1f", [DARK]: "#f5f5f7" },
  muted: { default: "#6e6e73", [DARK]: "#98989f" },
  stage: { default: "#e9e9ed", [DARK]: "#161618" },
  danger: { default: "#ff3b30", [DARK]: "#ff453a" },
  success: "#30d158",
  trimHandle: "#ffd60a",
  hover: "rgba(127, 127, 127, 0.1)",
  scrim: "rgba(0, 0, 0, 0.18)",
});

export const shadows = stylex.defineVars({
  window: {
    default: "0 24px 60px rgba(0, 0, 0, 0.22), 0 0 0 0.5px rgba(0, 0, 0, 0.18)",
    [DARK]: "0 24px 60px rgba(0, 0, 0, 0.6), 0 0 0 0.5px rgba(255, 255, 255, 0.12)",
  },
  control: "0 0.5px 1px rgba(0, 0, 0, 0.08)",
  raised: "0 0.5px 2px rgba(0, 0, 0, 0.18)",
  lifted: "0 6px 20px rgba(0, 0, 0, 0.18)",
  stage: "0 8px 30px rgba(0, 0, 0, 0.25)",
  overlayText: "0 1px 2px rgba(0, 0, 0, 0.6)",
});

/** Fixed column widths shared by the toolbar and the body grid. */
export const layout = stylex.defineVars({
  toolbarHeight: "52px",
  sidebarWidth: "232px",
  inspectorWidth: "272px",
});
