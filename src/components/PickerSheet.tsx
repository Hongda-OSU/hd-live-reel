import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { aiSelect, type AiReason, type AiVerdict, type ClipsProgress, type MediaItem } from "../api";
import { normalizingLabel } from "../project";
import { groupDays, sceneLabel } from "../scenes";
import { colors, layout, shadows } from "../tokens.stylex";
import { useDragSelect } from "../hooks/useDragSelect";
import type { Library } from "../hooks/useLibrary";
import { Button, CheckCircle, checkState, Icon, Seg, ui, withStyle } from "../ui";
import { AiPanel, TARGET } from "./AiPanel";
import { PickerSidebar, type DayNode, type Focus, type SceneNode } from "./PickerSidebar";
import { PickerStatus, problemStatus } from "./PickerStatus";

type Filter = "all" | "live" | "video";

/** The "connected" dot breathes, like a Mac's sleep light. */
const breathe = stylex.keyframes({
  "0%, 100%": { opacity: 1, boxShadow: `0 0 0 0 ${colors.success}` },
  "50%": { opacity: 0.45, boxShadow: "0 0 6px 1px transparent" },
});

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
    gridTemplateRows: "auto 1fr auto",
    width: "min(1040px, calc(100% - 60px))",
    height: "calc(100% - 92px)",
    borderTopLeftRadius: "0",
    borderTopRightRadius: "0",
    borderBottomRightRadius: "12px",
    borderBottomLeftRadius: "12px",
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
  // One row in three parts, like the Photos toolbar: where the photos come
  // from, which kinds to show, and what to do with them.
  header: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    gap: 12,
    paddingTop: "14px",
    paddingRight: "20px",
    paddingBottom: "12px",
    paddingLeft: "20px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  heading: {
    margin: 0,
    fontSize: 15,
  },
  device: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    height: 18,
    color: colors.muted,
    fontSize: 11,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    backgroundColor: colors.success,
    animationName: {
      default: breathe,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: "2.4s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
  },
  dotOff: {
    backgroundColor: colors.muted,
    animationName: "none",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
  },
  // Rereading the phone is an action like the others, but a minor one.
  refresh: {
    display: "inline-flex",
    color: colors.muted,
  },
  divider: {
    width: 1,
    height: 16,
    backgroundColor: colors.border,
  },
  // Narrower wraps "Live Photo": each option carries the button's own
  // padding, and the chosen one is bolder.
  filter: {
    width: 240,
  },
  aiAnchor: {
    position: "relative",
  },
  // The one action this bar leads to, so it alone is in the accent colour.
  aiLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: colors.accent,
    fontWeight: 600,
  },
  // The outline on the left, the chosen day or scene on the right.
  body: {
    display: "grid",
    gridTemplateColumns: "220px minmax(0, 1fr)",
    minHeight: 0,
  },
  pane: {
    display: "grid",
    gridTemplateRows: "auto 1fr",
    minHeight: 0,
  },
  // A heading over the grid rather than a bar: no rule, so the one line
  // of text doesn't read as an empty toolbar.
  paneHead: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    paddingTop: "16px",
    paddingInline: "20px",
  },
  crumb: {
    color: colors.muted,
    fontSize: 12,
  },
  crumbArrow: {
    alignSelf: "center",
    width: 10,
    height: 10,
    fill: "none",
    stroke: colors.muted,
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
  paneTitle: {
    fontSize: 19,
    fontWeight: 700,
  },
  paneCount: {
    color: colors.muted,
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
  },
  scroll: {
    overflowY: "auto",
    paddingBlock: "14px",
    paddingInline: "20px",
  },
  sceneRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  // Scene titles double as buttons that tick all their photos.
  groupTitle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginBlock: "0",
    marginRight: "0",
    marginLeft: "-6px",
    paddingBlock: "2px",
    paddingInline: "6px",
    borderWidth: 0,
    borderRadius: 6,
    backgroundColor: {
      default: "transparent",
      ":hover": colors.hover,
    },
    color: colors.muted,
    fontSize: 12,
    fontWeight: 600,
    cursor: {
      default: "pointer",
      ":disabled": "default",
    },
  },
  sceneTitle: {
    fontSize: 11,
    fontWeight: 500,
  },
  groupTitleOn: {
    color: colors.accent,
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
  // Already in the project: darkened, but it can still be ticked again,
  // say to use two parts of one video.
  tileAdded: {
    "::before": {
      content: '""',
      position: "absolute",
      inset: 0,
      backgroundColor: "rgba(0, 0, 0, 0.45)",
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
      borderTopWidth: "0",
      borderRightWidth: "0",
      borderBottomWidth: "2px",
      borderLeftWidth: "2px",
      borderStyle: "solid",
      borderColor: "#fff",
      transform: "translateY(-1px) rotate(-45deg)",
    },
  },
  caption: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    display: "flex",
    gap: 4,
    paddingTop: "10px",
    paddingRight: "6px",
    paddingBottom: "4px",
    paddingLeft: "6px",
    backgroundImage: "linear-gradient(transparent, rgba(0, 0, 0, 0.65))",
    color: "#fff",
    fontSize: 10,
    textAlign: "left",
  },
  captionPicked: {
    fontWeight: 600,
  },
  reason: {
    flex: "1",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  points: {
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    paddingBlock: "12px",
    paddingInline: "20px",
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.border,
  },
  summary: {
    color: colors.muted,
  },
  picked: {
    fontVariantNumeric: "tabular-nums",
  },
  clear: {
    color: colors.accent,
  },
});

interface Props {
  open: boolean;
  library: Library;
  thumbs: Record<string, string>;
  /** Ids of the photos and videos already in the project. */
  added: Set<string>;
  adding: ClipsProgress | "starting" | null;
  error: string | null;
  /** Rereads the phone; `quiet` keeps what is shown until it answers. */
  onRefresh: (quiet?: boolean) => void;
  onLoadThumbs: (ids: string[]) => void;
  onAdd: (ids: string[]) => void;
  /** Opens a file dialog to add from the Mac instead. */
  onPickFiles: () => void;
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

const monthFormat = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" });

const monthLabel = (iso?: string | null) => (iso ? monthFormat.format(new Date(iso)) : "日期未知");

const usable = (item: MediaItem) => item.kind !== "photo";

/** Pause between automatic rereads of a phone that could not be read. */
const RETRY_MS = 3000;

/** Rough length of `items` in the reel, as AI selection counts it
 * (`LIVE_PHOTO_SECONDS` and `VIDEO_SECONDS` in src-tauri/src/select.rs). */
const estimate = (items: MediaItem[]) => items.reduce((sum, item) => sum + (item.kind === "video" ? 5 : 2), 0);

/** "26 秒" or "3 分 20 秒". */
function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const rest = seconds % 60;
  return rest ? `${Math.floor(seconds / 60)} 分 ${rest} 秒` : `${Math.floor(seconds / 60)} 分`;
}

const selectable = (items: MediaItem[]) => items.filter(usable).map((item) => item.id);

/** AI's value (about -1 to 1, after penalties) as 0 to 100 points. */
const points = (value: number) => Math.round(Math.min(1, Math.max(0, (value + 1) / 2)) * 100);

/** "IMG_2388" from "202609_a/IMG_2388.HEIC". */
const shortName = (id: string) => (id.split("/").pop() ?? id).replace(/\.[^.]+$/, "");

/** A tile caption and the longer tooltip for why AI did what it did. */
function explainReason(reason: AiReason): [string, string] {
  switch (reason.type) {
    case "bestInScene":
      return ["本段最佳", "这一段里评分最高的一张"];
    case "highScore":
      return ["评分高", "画面评分高"];
    case "duplicate":
      return [`和 ${shortName(reason.of)} 重复`, `和 ${shortName(reason.of)} 几乎一样，留下了评分更高的那张`];
    case "plain":
      return ["画面太空", "画面大部分是空的，比如只有天空"];
    case "utility":
      return ["像截图或地图", "看起来像截图、地图或文件"];
    case "cut":
      return ["名额已满", "不错，但目标时长已经被评分更高的照片填满了"];
    case "lowScore":
      return ["评分较低", "画面评分较低，可能模糊、太暗或逆光"];
    case "portrait":
      return ["人像", "有人像或自拍；打开「包含人像」才会选"];
  }
}

function progressLabel(adding: Props["adding"]): string {
  if (adding === "starting") return "正在准备…";
  if (!adding) return "";
  return adding.stage === "downloading" ? `正在从 iPhone 复制 ${adding.total} 项…` : normalizingLabel(adding);
}

export function PickerSheet({
  open,
  library,
  thumbs,
  added,
  adding,
  error,
  onRefresh,
  onLoadThumbs,
  onAdd,
  onPickFiles,
  onClose,
}: Props) {
  const [filter, setFilter] = useState<Filter>("live");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState(TARGET.initial);
  /** Off by default: reels are mostly the place, not the people. */
  const [people, setPeople] = useState(false);
  const [verdicts, setVerdicts] = useState<Map<string, AiVerdict>>(new Map());
  const [ai, setAi] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const [aiOpen, setAiOpen] = useState(false);
  /** What the last AI run picked from and picked, so a rerun with other
   * settings starts from the same photos rather than the picks. */
  const [lastRun, setLastRun] = useState<{ pool: MediaItem[]; picks: Set<string> } | null>(null);

  useEffect(() => {
    if (open && library.state === "idle") onRefresh();
  }, [open, library.state, onRefresh]);

  // Newest first, matching the grid, so the top fills in first. Stills
  // can't be used but still need a picture to be recognised; they come
  // after everything usable.
  useEffect(() => {
    if (open && library.state === "ready") {
      const [usableItems, stills] = [library.items.filter(usable), library.items.filter((i) => !usable(i))];
      onLoadThumbs([...usableItems, ...stills].map((i) => i.id));
    }
  }, [open, library, onLoadThumbs]);

  const items = useMemo(() => (library.state === "ready" ? library.items : []), [library]);
  // Grouped before filtering, so scenes stay put when the filter changes.
  const days = useMemo(() => groupDays(items, (item) => dayLabel(item.createdAt)), [items]);
  const visible = (item: MediaItem) =>
    filter === "all" ||
    (filter === "live" && item.kind === "livePhoto") ||
    (filter === "video" && item.kind === "video");

  // The outline: what the filter lets through, empty days and scenes left
  // out.
  const tree: DayNode[] = useMemo(
    () =>
      days
        .map((day) => ({
          key: day.scenes[0].key,
          label: day.label,
          month: monthLabel(day.scenes[0].items[0].createdAt),
          scenes: day.scenes
            .map((scene) => ({ key: scene.key, label: sceneLabel(scene), items: scene.items.filter(visible) }))
            .filter((scene) => scene.items.length > 0),
        }))
        .filter((day) => day.scenes.length > 0),
    // `visible` only depends on `filter`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, filter],
  );
  const scroller = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // The newest day until one is chosen, or when the chosen one is gone.
  const shownDay = tree.find((day) => day.key === focus?.day) ?? tree[0] ?? null;
  const shownScene = shownDay?.scenes.find((scene) => scene.key === focus?.scene) ?? null;
  const shownScenes: SceneNode[] = shownScene ? [shownScene] : (shownDay?.scenes ?? []);
  const shownIds = selectable(shownScenes.flatMap((scene) => scene.items));

  function show(next: Focus) {
    setFocus(next);
    setExpanded((current) => new Set(current).add(next.day));
    scroller.current?.scrollTo({ top: 0 });
  }

  function toggleExpanded(day: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(day)) next.add(day);
      return next;
    });
  }

  // ⌘A ticks everything shown, or unticks it when it all is, as in
  // Photos; the outline's circles do the same with the pointer.
  const onSelectAll = useEffectEvent((event: KeyboardEvent) => {
    if (!event.metaKey || event.key.toLowerCase() !== "a" || busy) return;
    if (event.target instanceof HTMLElement && event.target.closest("input, textarea")) return;
    event.preventDefault();
    toggleGroup(shownIds);
  });
  useEffect(() => {
    if (!open) return;
    window.addEventListener("keydown", onSelectAll);
    return () => window.removeEventListener("keydown", onSelectAll);
  }, [open]);

  /** Ticks all of `ids`, or unticks them when they all are. */
  function toggleGroup(ids: string[]) {
    setChosen((current) => {
      const next = new Set(current);
      const all = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  const closeAi = useCallback(() => setAiOpen(false), []);

  const again =
    lastRun !== null && lastRun.picks.size === chosen.size && [...chosen].every((id) => lastRun.picks.has(id));
  const pool = again ? lastRun.pool : items.filter((item) => chosen.has(item.id) && usable(item));

  async function runAi() {
    setAi({ busy: true, error: null });
    try {
      const result = await aiSelect(pool, target, people);
      const picks = new Set(result.filter((v) => v.picked).map((v) => v.id));
      setVerdicts(new Map(result.map((v) => [v.id, v])));
      // AI's picks replace the ticked photos.
      setChosen(picks);
      setLastRun({ pool, picks });
      setAi({ busy: false, error: null });
      setAiOpen(false);
    } catch (e) {
      setAi({ busy: false, error: `AI 选片失败：${e}` });
    }
  }

  // Selectable tiles in the order shown, for drag and Shift-click ranges.
  const order = shownIds;
  const dragSelect = useDragSelect({ order, selected: chosen, onChange: setChosen, scroller });

  function toggle(id: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Rereads the phone. AI's verdicts were about the old list, so they go;
   * ticks stay. */
  function refresh() {
    setVerdicts(new Map());
    setLastRun(null);
    onRefresh();
  }

  function add() {
    // Capture order, oldest first.
    const ids = items
      .filter((i) => chosen.has(i.id))
      .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
      .map((i) => i.id);
    onAdd(ids);
  }

  // Clear the selection when the sheet closes. Adjusting state during
  // render (rather than in an effect) avoids an extra render pass.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setChosen(new Set());
      setLastRun(null);
      setVerdicts(new Map());
      setAi({ busy: false, error: null });
      setAiOpen(false);
    }
  }

  const busy = adding !== null || ai.busy;

  // While the phone can't be read, try again every few seconds, quietly, so
  // the photos appear on their own once it is unlocked or plugged in.
  useEffect(() => {
    if (!open || library.state !== "error") return;
    const timer = setTimeout(() => onRefresh(true), RETRY_MS);
    return () => clearTimeout(timer);
  }, [open, library, onRefresh]);
  /** Errors and progress take the selection summary's place. */
  const status =
    error ??
    ai.error ??
    (ai.busy ? "AI 正在挑选…（第一次要先从 iPhone 读取缩略图）" : busy ? progressLabel(adding) : null);
  const count = library.state === "ready" ? library.items.length : null;

  return (
    <>
      {open && <div onClick={busy ? undefined : onClose} {...stylex.props(styles.scrim)} />}
      <div
        role="dialog"
        aria-label="从 iPhone 选择"
        aria-hidden={!open}
        {...stylex.props(styles.sheet, open && styles.open)}
      >
        <header {...stylex.props(styles.header)}>
          <div>
            <h2 {...stylex.props(styles.heading)}>从 iPhone 选择</h2>
            <span {...stylex.props(styles.device)}>
              <span {...stylex.props(styles.dot, library.state !== "ready" && styles.dotOff)} />
              {library.state === "ready" && `已连接 · ${count?.toLocaleString()} 项`}
              {(library.state === "loading" || library.state === "idle") && "正在读取…"}
              {library.state === "error" && problemStatus(library.message)}
            </span>
          </div>
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
          <div {...stylex.props(styles.actions)}>
            <Button
              variant="ghost"
              onClick={refresh}
              disabled={busy || library.state === "loading"}
              aria-label="刷新"
              title="重新读取 iPhone"
            >
              <span {...stylex.props(styles.refresh)}>
                <Icon>
                  <path d="M13.2 8a5.2 5.2 0 1 1-1.6-3.7M13.3 2.4v2.9h-2.9" />
                </Icon>
              </span>
            </Button>
            <span {...stylex.props(styles.divider)} />
            <Button variant="ghost" onClick={onPickFiles} disabled={busy}>
              <Icon>
                <path d="M1.8 4.2A1.2 1.2 0 0 1 3 3h3.2l1.5 1.6H13a1.2 1.2 0 0 1 1.2 1.2v6.2a1.2 1.2 0 0 1-1.2 1.2H3a1.2 1.2 0 0 1-1.2-1.2z" />
              </Icon>
              从 Mac 选择…
            </Button>
            {/* The panel hangs from its button. */}
            <span {...stylex.props(styles.aiAnchor)}>
              <Button variant="ghost" onClick={() => setAiOpen((o) => !o)} disabled={busy || library.state !== "ready"}>
                <span {...stylex.props(styles.aiLabel)}>
                  <Icon>
                    <path d="M6.5 1.8 7.6 5.4l3.6 1.1-3.6 1.1-1.1 3.6-1.1-3.6-3.6-1.1 3.6-1.1zM12.3 9.8l.5 1.6 1.6.5-1.6.5-.5 1.6-.5-1.6-1.6-.5 1.6-.5z" />
                  </Icon>
                  {ai.busy ? "挑选中…" : "AI 选片…"}
                </span>
              </Button>
              {aiOpen && (
                <AiPanel
                  poolSize={pool.length}
                  again={again}
                  target={target}
                  people={people}
                  busy={ai.busy}
                  onTarget={setTarget}
                  onPeople={setPeople}
                  onRun={runAi}
                  onClose={closeAi}
                />
              )}
            </span>
          </div>
        </header>
        {library.state !== "ready" ? (
          <PickerStatus error={library.state === "error" ? library.message : null} />
        ) : (
          <div {...stylex.props(styles.body)}>
            <PickerSidebar
              days={tree}
              focus={shownDay && { day: shownDay.key, scene: shownScene?.key ?? null }}
              expanded={expanded}
              chosen={chosen}
              selectable={selectable}
              onFocus={show}
              onExpand={toggleExpanded}
              onToggle={toggleGroup}
            />
            <div {...stylex.props(styles.pane)}>
              <div {...stylex.props(styles.paneHead)}>
                {shownDay && shownScene && (
                  <>
                    <span {...stylex.props(styles.crumb)}>{shownDay.label}</span>
                    <svg viewBox="0 0 10 10" aria-hidden {...stylex.props(styles.crumbArrow)}>
                      <path d="M3.5 2 6.5 5 3.5 8" />
                    </svg>
                  </>
                )}
                {shownDay && (
                  <>
                    <span {...stylex.props(styles.paneTitle)}>{shownScene ? shownScene.label : shownDay.label}</span>
                    <span {...stylex.props(styles.paneCount)}>
                      {shownScenes.reduce((sum, scene) => sum + scene.items.length, 0)} 张
                      {shownScenes.length > 1 && ` · ${shownScenes.length} 个时段`}
                    </span>
                  </>
                )}
              </div>
              <div ref={scroller} {...stylex.props(styles.scroll)}>
                {shownScenes.map((scene) => (
                  <SceneSection
                    key={scene.key}
                    scene={scene}
                    titled={!shownScene && shownScenes.length > 1}
                    chosen={chosen}
                    onToggle={toggleGroup}
                    renderTile={(item) => {
                      const on = chosen.has(item.id);
                      const thumb = thumbs[item.id];
                      const verdict = verdicts.get(item.id);
                      const [caption, why] = verdict ? explainReason(verdict.reason) : [null, null];
                      return (
                        <button
                          key={item.id}
                          disabled={!usable(item) || busy}
                          title={
                            !usable(item)
                              ? "静态照片没有动态画面"
                              : added.has(item.id) && !verdict
                                ? `${item.name}：已在工程里，再勾选会多加一段`
                                : verdict
                                  ? `${item.name}：${why}（${points(verdict.value)} 分）`
                                  : item.name
                          }
                          data-select-id={usable(item) ? item.id : undefined}
                          onPointerDown={(e) => !busy && dragSelect.onPointerDown(item.id, e)}
                          // Pointer clicks are handled above; this is the keyboard.
                          onClick={(e) => e.detail === 0 && toggle(item.id)}
                          {...withStyle(
                            stylex.props(
                              styles.tile,
                              on && styles.tileOn,
                              added.has(item.id) && styles.tileAdded,
                              !usable(item) && styles.tileStill,
                            ),
                            thumb ? { backgroundImage: `url("${thumb}")` } : undefined,
                          )}
                        >
                          {item.kind !== "photo" && (
                            <span {...stylex.props(styles.badge)}>
                              {item.kind === "livePhoto" ? "LIVE" : "视频"}
                              {added.has(item.id) && " · 已添加"}
                            </span>
                          )}
                          {usable(item) && <span {...stylex.props(styles.check, on && styles.checkOn)} />}
                          {verdict && (
                            <span {...stylex.props(styles.caption, verdict.picked && styles.captionPicked)}>
                              <span {...stylex.props(styles.reason)}>
                                {verdict.picked ? `AI · ${caption}` : caption}
                              </span>
                              <span {...stylex.props(styles.points)}>{points(verdict.value)}</span>
                            </span>
                          )}
                        </button>
                      );
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <footer {...stylex.props(styles.footer)}>
          {status ? (
            <span {...stylex.props(styles.summary)}>{status}</span>
          ) : library.state !== "ready" ? null : chosen.size ? (
            <>
              <span {...stylex.props(styles.picked)}>
                已选 {chosen.size} 项 · 约 {formatSeconds(estimate(items.filter((i) => chosen.has(i.id))))}
              </span>
              <Button variant="ghost" onClick={() => setChosen(new Set())}>
                <span {...stylex.props(styles.clear)}>清除</span>
              </Button>
            </>
          ) : (
            <span {...stylex.props(styles.summary)}>点击或拖动勾选照片，再用「AI 选片…」挑出精选</span>
          )}
          <span {...stylex.props(ui.spacer)} />
          <Button onClick={onClose} disabled={busy}>
            取消
          </Button>
          {library.state === "ready" && (
            <Button variant="primary" onClick={add} disabled={busy || chosen.size === 0}>
              {busy ? "添加中…" : chosen.size ? `添加 ${chosen.size} 项` : "添加"}
            </Button>
          )}
        </footer>
      </div>
    </>
  );
}

/** A scene's pictures, under its title when the whole day is shown. */
function SceneSection({
  scene,
  titled,
  chosen,
  onToggle,
  renderTile,
}: {
  scene: SceneNode;
  titled: boolean;
  chosen: Set<string>;
  onToggle: (ids: string[]) => void;
  renderTile: (item: MediaItem) => ReactNode;
}) {
  const ids = selectable(scene.items);
  const state = checkState(ids, chosen);
  return (
    <section>
      {titled && (
        <div {...stylex.props(styles.sceneRow)}>
          <button
            disabled={ids.length === 0}
            title={state === "all" ? "取消勾选这一段" : "勾选这一段的全部照片"}
            onClick={() => onToggle(ids)}
            {...stylex.props(styles.groupTitle, styles.sceneTitle, state === "all" && styles.groupTitleOn)}
          >
            <CheckCircle state={state} />
            {scene.label} · {scene.items.length} 张
          </button>
        </div>
      )}
      <div {...stylex.props(styles.grid)}>{scene.items.map(renderTile)}</div>
    </section>
  );
}
