import * as stylex from "@stylexjs/stylex";
import { colors } from "../tokens.stylex";
import { withStyle } from "./styles";

const styles = stylex.create({
  row: {
    display: "flex",
    gap: 8,
  },
  swatch: {
    position: "relative",
    display: "block",
    flexShrink: 0,
    width: 22,
    height: 22,
    padding: 0,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.border,
    borderRadius: "50%",
    cursor: "pointer",
  },
  on: {
    outlineWidth: 2,
    outlineStyle: "solid",
    outlineColor: colors.accent,
    outlineOffset: 2,
  },
  // Until a custom colour is picked, a rainbow ring (like the macOS colour
  // well) says "any colour". The hue wheel starts and ends on the same red,
  // so there is no seam.
  wheel: {
    borderWidth: 0,
    backgroundImage:
      "conic-gradient(hsl(0 90% 60%), hsl(60 90% 55%), hsl(120 70% 50%), hsl(180 80% 50%), hsl(240 90% 65%), hsl(300 80% 60%), hsl(360 90% 60%))",
    maskImage: "radial-gradient(circle, transparent 5.5px, #000 6.5px)",
  },
  // The native picker sits invisibly on top so a click opens it.
  picker: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    padding: 0,
    borderWidth: 0,
    opacity: 0,
    cursor: "pointer",
  },
});

/** Round colour buttons; `options` pairs a hex colour with its name. With
 * `customLabel`, a last swatch opens the system colour picker. */
export function Swatches({
  options,
  value,
  onChange,
  customLabel,
}: {
  options: [string, string][];
  value: string;
  onChange: (value: string) => void;
  customLabel?: string;
}) {
  const custom = !options.some(([colour]) => colour === value);
  return (
    <div role="radiogroup" {...stylex.props(styles.row)}>
      {options.map(([colour, name]) => (
        <button
          key={colour}
          role="radio"
          aria-checked={colour === value}
          aria-label={name}
          title={name}
          onClick={() => onChange(colour)}
          {...withStyle(stylex.props(styles.swatch, colour === value && styles.on), { backgroundColor: colour })}
        />
      ))}
      {customLabel && (
        <span
          title={customLabel}
          {...withStyle(
            stylex.props(styles.swatch, custom ? styles.on : styles.wheel),
            custom ? { backgroundColor: value } : undefined,
          )}
        >
          <input
            type="color"
            aria-label={customLabel}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            {...stylex.props(styles.picker)}
          />
        </span>
      )}
    </div>
  );
}
