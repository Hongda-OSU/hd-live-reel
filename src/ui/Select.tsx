import * as stylex from "@stylexjs/stylex";
import { colors } from "../tokens.stylex";
import { ui } from "./styles";

const styles = stylex.create({
  // The text field's focus ring stays on after the menu closes, so show
  // it only when focus came from the keyboard, like a Mac pop-up button.
  select: {
    width: "100%",
    paddingInline: 6,
    borderColor: {
      default: colors.border,
      ":focus-visible": colors.accent,
    },
    outline: {
      default: "none",
      ":focus-visible": `3px solid ${colors.accentSoft}`,
    },
  },
});

/** A native drop-down for one of several labelled values; `groups`
 * follow `options` under their own headings. */
export function Select<T extends string>({
  options,
  groups = [],
  value,
  onChange,
  label,
}: {
  options: [T, string][];
  groups?: [string, [T, string][]][];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value as T)}
      {...stylex.props(ui.textInput, styles.select)}
    >
      {options.map(([v, text]) => (
        <option key={v} value={v}>
          {text}
        </option>
      ))}
      {groups.map(([heading, items]) => (
        <optgroup key={heading} label={heading}>
          {items.map(([v, text]) => (
            <option key={v} value={v}>
              {text}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
