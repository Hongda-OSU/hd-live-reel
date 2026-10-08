import { useEffect, useMemo, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import type { ClipsProgress, MediaItem } from "../api";
import { colors, layout, shadows } from "../tokens.stylex";
import type { Library } from "../useLibrary";
import { Button, Seg, ui, withStyle } from "../ui";

type Filter = "all" | "live" | "video";

const styles = stylex.create({
  scrim: {
    position: "absolute",
    top: layout.toolbarHeight,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    backgroundColor: colors.scrim,
  },
  // Slides down from under the toolbar, like a macOS sheet.
  sheet: {
    position: "absolute",
    zIndex: 11,
    left: "50%",
    top: layout.toolbarHeight,
    display: "grid",
    gridTemplateRows: "auto auto 1fr auto",
    width: "min(1040px, calc(100% - 60px))",
    height: "calc(100% - 92px)",
    borderRadius: "0 0 12px 12px",
    backgroundColor: colors.window,
    boxShadow: shadows.window,
    transform: "translate(-50%, -105%)",
    visibility: "hidden",
    transition: "transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1), visibility 0s 0.28s",
  },
  open: {
    transform: "translate(-50%, 0)",
    visibility: "visible",
    transitionDelay: "0s",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "16px 20px 10px",
  },
  heading: {
    margin: 0,
    fontSize: 15,
  },
  device: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: colors.muted,
    fontSize: 12,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    backgroundColor: colors.success,
  },
  dotOff: {
    backgroundColor: colors.muted,
  },
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "0 20px 12px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  filter: {
    width: 240,
  },
  ai: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "4px 6px 4px 10px",
    borderRadius: 8,
    backgroundColor: colors.surface2,
    opacity: 0.6,
  },
  aiRange: {
    width: 110,
  },
  scroll: {
    overflowY: "auto",
    padding: "14px 20px",
  },
  notice: {
    color: colors.muted,
  },
  day: {
    margin: "4px 0 8px",
    color: colors.muted,
    fontSize: 12,
    fontWeight: 600,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))",
    gap: 4,
    marginBottom: 18,
  },
  tile: {
    position: "relative",
    aspectRatio: "3 / 4",
    padding: 0,
    borderWidth: 0,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: colors.surface2,
    backgroundPosition: "center",
    backgroundSize: "cover",
    cursor: "pointer",
    "::after": {
      content: '""',
      position: "absolute",
      inset: 0,
      borderRadius: 4,
      boxShadow: "inset 0 0 0 3px transparent",
      transition: "box-shadow 0.1s",
    },
  },
  tileOn: {
    "::after": {
      boxShadow: `inset 0 0 0 3px ${colors.accent}`,
    },
  },
  // Still photos have no motion to stitch.
  tileStill: {
    opacity: 0.4,
    cursor: "default",
  },
  badge: {
    position: "absolute",
    top: 6,
    left: 6,
    color: "#fff",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.04em",
    textShadow: shadows.overlayText,
  },
  check: {
    position: "absolute",
    top: 6,
    right: 6,
    display: "grid",
    placeItems: "center",
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderStyle: "solid",
    borderColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: "50%",
    backgroundColor: "rgba(0, 0, 0, 0.15)",
  },
  checkOn: {
    borderColor: "#fff",
    backgroundColor: colors.accent,
    "::after": {
      content: '""',
      width: 8,
      height: 4,
      borderWidth: "0 0 2px 2px",
      borderStyle: "solid",
      borderColor: "#fff",
      transform: "translateY(-1px) rotate(-45deg)",
    },
  },
  footer: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 20px",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.border,
  },
  summary: {
    flex: 1,
    color: colors.muted,
  },
});

interface Props {
  open: boolean;
  library: Library;
  thumbs: Record<string, string>;
  adding: ClipsProgress | "starting" | null;
  error: string | null;
  onRefresh: () => void;
  onLoadThumbs: (ids: string[]) => void;
  onAdd: (ids: string[]) => void;
  onClose: () => void;
}

const dayFormat = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" });

function dayLabel(iso?: string | null): string {
  if (!iso) return "日期未知";
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return "今天";
  if (date.toDateString() === yesterday.toDateString()) return "昨天";
  return dayFormat.format(date);
}

const usable = (item: MediaItem) => item.kind !== "photo";

function progressLabel(adding: Props["adding"]): string {
  if (adding === "starting") return "正在准备…";
  if (!adding) return "";
  return adding.stage === "downloading"
    ? `正在从 iPhone 复制 ${adding.total} 项…`
    : `正在处理第 ${adding.done + 1} / ${adding.total} 段…`;
}

export function PickerSheet({ open, library, thumbs, adding, error, onRefresh, onLoadThumbs, onAdd, onClose }: Props) {
  const [filter, setFilter] = useState<Filter>("live");
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && library.state === "idle") onRefresh();
  }, [open, library.state, onRefresh]);

  // Newest first, matching the grid, so the top fills in first.
  useEffect(() => {
    if (open && library.state === "ready") onLoadThumbs(library.items.filter(usable).map((i) => i.id));
  }, [open, library, onLoadThumbs]);

  const items = library.state === "ready" ? library.items : [];
  const days = useMemo(() => {
    const groups: { label: string; items: MediaItem[] }[] = [];
    for (const item of items) {
      const keep =
        filter === "all" || (filter === "live" && item.kind === "livePhoto") || (filter === "video" && item.kind === "video");
      if (!keep) continue;
      const label = dayLabel(item.createdAt);
      const last = groups[groups.length - 1];
      if (last?.label === label) last.items.push(item);
      else groups.push({ label, items: [item] });
    }
    return groups;
  }, [items, filter]);

  function toggle(id: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function add() {
    // Capture order, oldest first.
    const ids = items
      .filter((i) => chosen.has(i.id))
      .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
      .map((i) => i.id);
    onAdd(ids);
  }

  // Clear the selection once a batch has been added and the sheet closes.
  useEffect(() => {
    if (!open) setChosen(new Set());
  }, [open]);

  const busy = adding !== null;
  const count = library.state === "ready" ? library.items.length : null;

  return (
    <>
      {open && <div onClick={busy ? undefined : onClose} {...stylex.props(styles.scrim)} />}
      <div role="dialog" aria-label="从 iPhone 选择" aria-hidden={!open} {...stylex.props(styles.sheet, open && styles.open)}>
        <header {...stylex.props(styles.header)}>
          <h2 {...stylex.props(styles.heading)}>从 iPhone 选择</h2>
          <span {...stylex.props(styles.device)}>
            <span {...stylex.props(styles.dot, library.state !== "ready" && styles.dotOff)} />
            {library.state === "ready" && `iPhone · 已连接 · ${count?.toLocaleString()} 项`}
            {library.state === "loading" && "正在读取 iPhone…"}
            {library.state === "error" && "未连接"}
          </span>
          <span {...stylex.props(ui.spacer)} />
          <Button onClick={onRefresh} disabled={busy || library.state === "loading"}>
            刷新
          </Button>
        </header>
        <div {...stylex.props(styles.bar)}>
          <Seg<Filter>
            options={[
              ["all", "全部"],
              ["live", "Live Photo"],
              ["video", "视频"],
            ]}
            value={filter}
            onChange={setFilter}
            xstyle={styles.filter}
          />
          <span {...stylex.props(ui.spacer)} />
          <div title="即将支持" {...stylex.props(styles.ai)}>
            <span {...stylex.props(ui.value)}>目标 40 秒 ≈ 20 张</span>
            <input type="range" min={30} max={45} defaultValue={40} disabled {...stylex.props(styles.aiRange)} />
            <Button disabled>AI 选片</Button>
          </div>
        </div>
        <div {...stylex.props(styles.scroll)}>
          {library.state === "error" && (
            <div {...stylex.props(styles.notice)}>
              <p>{library.message}</p>
              <p {...stylex.props(ui.note)}>用数据线连接 iPhone 并解锁，然后点「刷新」。</p>
            </div>
          )}
          {library.state === "loading" && <p {...stylex.props(styles.notice)}>正在读取 iPhone…</p>}
          {days.map((day) => (
            <section key={day.label}>
              <div {...stylex.props(styles.day)}>{day.label}</div>
              <div {...stylex.props(styles.grid)}>
                {day.items.map((item) => {
                  const on = chosen.has(item.id);
                  const thumb = thumbs[item.id];
                  return (
                    <button
                      key={item.id}
                      disabled={!usable(item) || busy}
                      title={usable(item) ? item.name : "静态照片没有动态画面"}
                      onClick={() => toggle(item.id)}
                      {...withStyle(
                        stylex.props(styles.tile, on && styles.tileOn, !usable(item) && styles.tileStill),
                        thumb ? { backgroundImage: `url("${thumb}")` } : undefined,
                      )}
                    >
                      {item.kind === "livePhoto" && <span {...stylex.props(styles.badge)}>LIVE</span>}
                      {item.kind === "video" && <span {...stylex.props(styles.badge)}>视频</span>}
                      {usable(item) && <span {...stylex.props(styles.check, on && styles.checkOn)} />}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <footer {...stylex.props(styles.footer)}>
          <span {...stylex.props(styles.summary)}>
            {error ?? (busy ? progressLabel(adding) : chosen.size ? `已选 ${chosen.size} 项` : "还没有选择")}
          </span>
          <Button onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button variant="primary" onClick={add} disabled={busy || chosen.size === 0}>
            {busy ? "添加中…" : chosen.size ? `添加 ${chosen.size} 项` : "添加"}
          </Button>
        </footer>
      </div>
    </>
  );
}
