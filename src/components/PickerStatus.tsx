import * as stylex from "@stylexjs/stylex";
import { colors } from "../tokens.stylex";

const spin = stylex.keyframes({
  to: { transform: "rotate(360deg)" },
});

const styles = stylex.create({
  // Takes the whole body: an empty outline and grid would only add noise.
  page: {
    display: "grid",
    placeItems: "center",
    padding: 24,
  },
  card: {
    display: "grid",
    justifyItems: "center",
    gap: 10,
    maxWidth: 420,
    textAlign: "center",
  },
  art: {
    width: 44,
    height: 44,
    fill: "none",
    stroke: colors.muted,
    strokeWidth: 1.1,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
  spinner: {
    width: 28,
    height: 28,
    boxSizing: "border-box",
    borderWidth: 3,
    borderStyle: "solid",
    borderColor: colors.surface2,
    borderTopColor: colors.muted,
    borderRadius: "50%",
    animationName: {
      default: spin,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: "0.9s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
  },
  title: {
    marginTop: 4,
    fontSize: 17,
    fontWeight: 600,
  },
  body: {
    margin: 0,
    color: colors.muted,
    lineHeight: 1.5,
  },
  detail: {
    margin: 0,
    color: colors.muted,
    fontSize: 11,
    opacity: 0.7,
  },
  waiting: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    color: colors.muted,
    fontSize: 12,
  },
  smallSpinner: {
    width: 10,
    height: 10,
    borderWidth: 2,
  },
});

type Problem = "locked" | "missing" | "stalled" | "other";

/** Sorts the helper's English error into what the user should do. */
function problemOf(message: string): Problem {
  if (/locked/i.test(message)) return "locked";
  if (/no device found|disconnected/i.test(message)) return "missing";
  if (/stopped sending|timed out/i.test(message)) return "stalled";
  return "other";
}

const PROBLEMS: Record<Problem, { status: string; title: string; body: string; waiting: string }> = {
  locked: {
    status: "已锁定",
    title: "iPhone 已锁定",
    body: "解锁 iPhone 后，照片会自动出现。",
    waiting: "正在等待 iPhone 解锁…",
  },
  missing: {
    status: "未连接",
    title: "没有找到 iPhone",
    body: "用数据线连接 iPhone 并解锁。第一次连接时，在手机上点「信任」。",
    waiting: "正在等待连接 iPhone…",
  },
  stalled: {
    status: "未连接",
    title: "iPhone 没有送来照片列表",
    body: "拔掉数据线重新插上，并保持 iPhone 解锁。",
    waiting: "正在等待 iPhone…",
  },
  other: {
    status: "未连接",
    title: "读不到 iPhone",
    body: "确认 iPhone 已连接并解锁。",
    waiting: "过几秒会自动重试…",
  },
};

/** The short status beside the picker's title for a failed read. */
export const problemStatus = (message: string) => PROBLEMS[problemOf(message)].status;

/** What the picker shows instead of photos while the phone is being read,
 * or when it could not be; the picker keeps retrying meanwhile, so there
 * is nothing to press. */
export function PickerStatus({
  error,
}: {
  /** The helper's message, or null while reading. */
  error: string | null;
}) {
  if (error === null) {
    return (
      <div {...stylex.props(styles.page)}>
        <div {...stylex.props(styles.card)}>
          <span {...stylex.props(styles.spinner)} />
          <div {...stylex.props(styles.title)}>正在读取 iPhone 里的照片</div>
          <p {...stylex.props(styles.body)}>照片多的时候要十几秒。读取期间请保持 iPhone 解锁。</p>
        </div>
      </div>
    );
  }
  const problem = problemOf(error);
  const { title, body, waiting } = PROBLEMS[problem];
  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.card)}>
        <svg viewBox="0 0 16 16" aria-hidden {...stylex.props(styles.art)}>
          <rect x="4" y="1" width="8" height="14" rx="1.8" />
          {problem === "locked" ? (
            <>
              <rect x="6" y="7.2" width="4" height="3.3" rx="0.6" />
              <path d="M6.8 7.2V6a1.2 1.2 0 0 1 2.4 0v1.2" />
            </>
          ) : (
            <path d="M7 12.6h2" />
          )}
        </svg>
        <div {...stylex.props(styles.title)}>{title}</div>
        <p {...stylex.props(styles.body)}>
          {body}
          <br />
          照片已经在 Mac 上的话，用右上角的「从 Mac 选择…」，或把文件拖进窗口。
        </p>
        {problem === "other" && <p {...stylex.props(styles.detail)}>{error}</p>}
        <span {...stylex.props(styles.waiting)}>
          <span {...stylex.props(styles.spinner, styles.smallSpinner)} />
          {waiting}
        </span>
      </div>
    </div>
  );
}
