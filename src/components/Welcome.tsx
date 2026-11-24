import { useEffect, useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { getVersion } from "@tauri-apps/api/app";
import { colors } from "../tokens.stylex";
import { Icon } from "../ui";

const styles = stylex.create({
  // Two halves, like Xcode's welcome window: the ways in on the left,
  // how it goes on the right. They stop growing, so a wide window adds
  // margin rather than stretching the rows.
  page: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 470px) 1px minmax(0, 470px)",
    justifyContent: "center",
    alignItems: "center",
    minHeight: 0,
    paddingLeft: "clamp(32px, 7vw, 96px)",
    paddingRight: "clamp(32px, 7vw, 96px)",
    backgroundColor: colors.stage,
  },
  left: {
    display: "grid",
    gap: 6,
    paddingRight: "clamp(24px, 5vw, 64px)",
  },
  title: {
    margin: 0,
    color: colors.text,
    fontSize: 34,
    fontWeight: 700,
    letterSpacing: "-0.02em",
  },
  tagline: {
    margin: 0,
    marginBottom: 28,
    color: colors.muted,
    fontSize: 14,
  },
  entry: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    paddingBlock: "10px",
    paddingInline: "12px",
    borderWidth: 0,
    borderRadius: 9,
    backgroundColor: {
      default: "transparent",
      ":hover": colors.hover,
    },
    color: colors.text,
    textAlign: "left",
    cursor: "pointer",
  },
  // The phone is the main way in, so it stands out without hovering.
  main: {
    backgroundColor: {
      default: colors.hover,
      ":hover": "rgba(127, 127, 127, 0.18)",
    },
  },
  badge: {
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: colors.surface2,
    color: colors.text,
  },
  mainBadge: {
    backgroundColor: colors.accent,
    color: "#fff",
  },
  entryText: {
    display: "grid",
    gap: 2,
  },
  entryTitle: {
    fontSize: 13,
    fontWeight: 600,
  },
  note: {
    color: colors.muted,
    fontSize: 11,
  },
  version: {
    marginTop: 28,
  },
  divider: {
    height: "min(380px, 60%)",
    backgroundColor: colors.border,
  },
  right: {
    paddingLeft: "clamp(24px, 5vw, 64px)",
  },
  heading: {
    margin: 0,
    marginBottom: 2,
    color: colors.muted,
    fontSize: 11,
    fontWeight: 600,
  },
  steps: {
    margin: 0,
    padding: 0,
    listStyle: "none",
  },
  step: {
    display: "grid",
    gridTemplateColumns: "26px 1fr",
    columnGap: 12,
    rowGap: 4,
    paddingBlock: "18px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: {
      default: colors.border,
      ":last-child": "transparent",
    },
  },
  stepNumber: {
    gridRowStart: 1,
    gridRowEnd: 3,
    color: colors.muted,
    fontSize: 20,
    fontWeight: 700,
    lineHeight: 1.1,
  },
  stepTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: 600,
  },
  stepText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 1.5,
  },
});

const STEPS = [
  ["选照片", "从 iPhone 或 Mac 加进来，按拍摄时间排好"],
  ["调整", "排序、剪头尾，加标题、文字、配乐和滤镜，预览自动更新"],
  ["导出", "在「导出」页导出 MP4，微信里直接发"],
];

interface Props {
  /** Opens the iPhone picker. */
  onAdd: () => void;
  /** Opens the file dialog. */
  onPickFiles: () => void;
}

/** What an empty project shows in place of the editor: the app, the two
 * ways to bring photos in, and the three steps to a reel. */
export function Welcome({ onAdd, onPickFiles }: Props) {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    getVersion().then(setVersion, () => {});
  }, []);

  return (
    <section {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.left)}>
        <h1 {...stylex.props(styles.title)}>HD Live Reel</h1>
        <p {...stylex.props(styles.tagline)}>把 Live Photo 拼成一段视频</p>
        <Entry
          main
          icon={
            <>
              <rect x="4.5" y="1.5" width="7" height="13" rx="1.6" />
              <path d="M7.2 12.4h1.6" />
            </>
          }
          title="从 iPhone 选择…"
          note="插线读取手机里的照片，可以 AI 选片"
          onClick={onAdd}
        />
        <Entry
          icon={
            <path d="M1.8 4.2A1.2 1.2 0 0 1 3 3h3.2l1.5 1.6H13a1.2 1.2 0 0 1 1.2 1.2v6.2a1.2 1.2 0 0 1-1.2 1.2H3a1.2 1.2 0 0 1-1.2-1.2z" />
          }
          title="从 Mac 选择…"
          note="文件或整个文件夹；也可以直接拖进窗口"
          onClick={onPickFiles}
        />
        {version && <span {...stylex.props(styles.note, styles.version)}>版本 {version}</span>}
      </div>
      <div {...stylex.props(styles.divider)} />
      <div {...stylex.props(styles.right)}>
        <h2 {...stylex.props(styles.heading)}>三步做一段视频</h2>
        <ol {...stylex.props(styles.steps)}>
          {STEPS.map(([title, text], i) => (
            <li key={title} {...stylex.props(styles.step)}>
              <span {...stylex.props(styles.stepNumber)}>{i + 1}</span>
              <span {...stylex.props(styles.stepTitle)}>{title}</span>
              <span {...stylex.props(styles.stepText)}>{text}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Entry({
  main = false,
  icon,
  title,
  note,
  onClick,
}: {
  main?: boolean;
  icon: ReactNode;
  title: string;
  note: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} {...stylex.props(styles.entry, main && styles.main)}>
      <span {...stylex.props(styles.badge, main && styles.mainBadge)}>
        <Icon>{icon}</Icon>
      </span>
      <span {...stylex.props(styles.entryText)}>
        <span {...stylex.props(styles.entryTitle)}>{title}</span>
        <span {...stylex.props(styles.note)}>{note}</span>
      </span>
    </button>
  );
}
