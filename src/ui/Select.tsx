import * as stylex from "@stylexjs/stylex";
import { ui } from "./styles";

const styles = stylex.create({
  select: {
    width: "100%",
    paddingInline: 6,
  },
});

/** A native drop-down for one of several labelled values. */
export function Select<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: [T, string][];
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
    </select>
  );
}
