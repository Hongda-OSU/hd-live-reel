import * as stylex from "@stylexjs/stylex";
import { colors } from "../tokens.stylex";
import { withStyle } from "./styles";

const styles = stylex.create({
  row: {
    display: "flex",
    gap: 8,
  },
  swatch: {
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
});

/** Round colour buttons; `options` pairs a CSS colour with its name. */
export function Swatches({
  options,
  value,
  onChange,
}: {
  options: [string, string][];
  value: string;
  onChange: (value: string) => void;
}) {
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
    </div>
  );
}
