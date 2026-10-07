import { useEffect, useMemo, useState } from "react";
import type { ClipsProgress, MediaItem } from "../api";
import type { Library } from "../useLibrary";

type Filter = "all" | "live" | "video";

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
      {open && <div className="scrim" onClick={busy ? undefined : onClose} />}
      <div className={open ? "sheet open" : "sheet"} role="dialog" aria-label="从 iPhone 选择" aria-hidden={!open}>
        <header>
          <h2>从 iPhone 选择</h2>
          <span className="device">
            <span className={library.state === "ready" ? "dot" : "dot off"} />
            {library.state === "ready" && `iPhone · 已连接 · ${count?.toLocaleString()} 项`}
            {library.state === "loading" && "正在读取 iPhone…"}
            {library.state === "error" && "未连接"}
          </span>
          <span className="spacer" />
          <button className="btn" onClick={onRefresh} disabled={busy || library.state === "loading"}>
            刷新
          </button>
        </header>
        <div className="picker-bar">
          <div className="seg filter">
            {(
              [
                ["all", "全部"],
                ["live", "Live Photo"],
                ["video", "视频"],
              ] as [Filter, string][]
            ).map(([value, label]) => (
              <button key={value} className={filter === value ? "on" : ""} onClick={() => setFilter(value)}>
                {label}
              </button>
            ))}
          </div>
          <span className="spacer" />
          <div className="ai-box" title="即将支持">
            <span className="val">目标 40 秒 ≈ 20 张</span>
            <input type="range" min={30} max={45} defaultValue={40} disabled />
            <button className="btn" disabled>
              AI 选片
            </button>
          </div>
        </div>
        <div className="grid-scroll">
          {library.state === "error" && (
            <div className="notice">
              <p>{library.message}</p>
              <p className="note">用数据线连接 iPhone 并解锁，然后点「刷新」。</p>
            </div>
          )}
          {library.state === "loading" && <p className="notice">正在读取 iPhone…</p>}
          {days.map((day) => (
            <section key={day.label}>
              <div className="day">{day.label}</div>
              <div className="grid">
                {day.items.map((item) => {
                  const on = chosen.has(item.id);
                  const thumb = thumbs[item.id];
                  return (
                    <button
                      key={item.id}
                      className={[
                        "tile",
                        on && "on",
                        !usable(item) && "still",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={thumb ? { backgroundImage: `url("${thumb}")` } : undefined}
                      disabled={!usable(item) || busy}
                      title={usable(item) ? item.name : "静态照片没有动态画面"}
                      onClick={() => toggle(item.id)}
                    >
                      {item.kind === "livePhoto" && <span className="badge">LIVE</span>}
                      {item.kind === "video" && <span className="badge">视频</span>}
                      {usable(item) && <span className="check" />}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <footer>
          <span className="summary">
            {error ?? (busy ? progressLabel(adding) : chosen.size ? `已选 ${chosen.size} 项` : "还没有选择")}
          </span>
          <button className="btn" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button className="btn primary" onClick={add} disabled={busy || chosen.size === 0}>
            {busy ? "添加中…" : chosen.size ? `添加 ${chosen.size} 项` : "添加"}
          </button>
        </footer>
      </div>
    </>
  );
}
