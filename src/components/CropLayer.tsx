import * as stylex from "@stylexjs/stylex";
import { colors } from "../tokens.stylex";
import { withStyle } from "../ui";

const FRAME_ASPECT = 9 / 16;

/** How many frame widths and heights an uncropped still covers when it
 * fills the 9:16 frame; one of the two is always 1. */
export function fillFactor(width: number, height: number) {
  const aspect = width / height;
  return aspect > FRAME_ASPECT ? { x: aspect / FRAME_ASPECT, y: 1 } : { x: 1, y: FRAME_ASPECT / aspect };
}

const styles = stylex.create({
  image: {
    position: "absolute",
    maxWidth: "none",
    pointerEvents: "none",
    userSelect: "none",
  },
  outside: {
    opacity: 0.35,
  },
  window: {
    position: "absolute",
    inset: 0,
    overflow: "hidden",
    borderRadius: "inherit",
    pointerEvents: "none",
  },
  outline: {
    position: "absolute",
    inset: 0,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.accent,
    borderRadius: "inherit",
    pointerEvents: "none",
  },
});

interface Props {
  /** URL of the uncropped still. */
  src: string;
  /** Natural size of `src` once loaded. */
  size: { width: number; height: number } | null;
  offset: number;
  onSize: (size: { width: number; height: number }) => void;
}

/** The whole picture behind the 9:16 frame: dimmed where the crop cuts it
 * away, full strength inside. Sits inside the frame and spills past it. */
export function CropLayer({ src, size, offset, onSize }: Props) {
  const factor = size ? fillFactor(size.width, size.height) : { x: 1, y: 1 };
  const place = {
    width: `${factor.x * 100}%`,
    height: `${factor.y * 100}%`,
    left: `${-(factor.x - 1) * offset * 100}%`,
    top: `${-(factor.y - 1) * offset * 100}%`,
    visibility: size ? undefined : ("hidden" as const),
  };
  return (
    <>
      <img src={src} alt="" draggable={false} {...withStyle(stylex.props(styles.image, styles.outside), place)} />
      <div {...stylex.props(styles.window)}>
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={(e) => onSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
          {...withStyle(stylex.props(styles.image), place)}
        />
      </div>
      <div {...stylex.props(styles.outline)} />
    </>
  );
}
