import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as stylex from "@stylexjs/stylex";
import { aiSelect, type AiReason, type AiVerdict, type ClipsProgress, type MediaItem } from "../api";
import { normalizingLabel } from "../project";
import { groupDays, sceneLabel, type Day } from "../scenes";
import { colors, layout, shadows } from "../tokens.stylex";
import { useDragSelect } from "../hooks/useDragSelect";
import type { Library } from "../hooks/useLibrary";
import { Button, Seg, ui, withStyle } from "../ui";
import { AiPanel, TARGET } from "./AiPanel";

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
    gridTemplateRows: "auto auto 1fr auto",
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
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    paddingTop: "16px",
    paddingRight: "20px",
    paddingBottom: "10px",
    paddingLeft: "20px",
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
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    paddingTop: "0",
    paddingRight: "20px",
    paddingBottom: "12px",
    paddingLeft: "20px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  filter: {
    width: 240,
  },
  aiAnchor: {
    position: "relative",
  },
  scroll: {
    overflowY: "auto",
    paddingBlock: "14px",
    paddingInline: "20px",
  },
  notice: {
    color: colors.muted,
  },
  // Day and scene titles double as buttons that tick all their photos.
  groupTitle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginTop: "4px",
    marginRight: "0",
    marginBottom: "8px",
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
    fontWeight: 500,
  },
  groupTitleOn: {
    color: colors.accent,
  },
  groupCheck: {
    display: "grid",
    placeItems: "center",
    width: 14,
    height: 14,
    boxSizing: "border-box",
    borderWidth: 1.5,
    borderStyle: "solid",
    borderColor: colors.muted,
    borderRadius: "50%",
  },
  // Some of the group is ticked: a dash.
  groupCheckSome: {
    borderColor: colors.accent,
    "::after": {
      content: '""',
      width: 6,
      height: 1.5,
      backgroundColor: colors.accent,
    },
  },
  groupCheckAll: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
    "::after": {
      content: '""',
      width: 6,
      height: 3,
      borderTopWidth: "0",
      borderRightWidth: "0",
      borderBottomWidth: "1.5px",
      borderLeftWidth: "1.5px",
      borderStyle: "solid",
      borderColor: "#fff",
      transform: "translateY(-1px) rotate(-45deg)",
    },
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
    flex: "1",
    color: colors.muted,
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
  onRefresh: () => void;
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

const usable = (item: MediaItem) => item.kind !== "photo";

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
  const order = useMemo(
    () =>
      days
        .flatMap((day) => day.scenes)
        .flatMap((scene) => scene.items)
        .filter((item) => usable(item) && visible(item))
        .map((item) => item.id),
    // `visible` only depends on `filter`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, filter],
  );
  const scroller = useRef<HTMLDivElement>(null);
  const dragSelect = useDragSelect({ order, selected: chosen, onChange: setChosen, scroller });

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
          <h2 {...stylex.props(styles.heading)}>从 iPhone 选择</h2>
          <span {...stylex.props(styles.device)}>
            <span {...stylex.props(styles.dot, library.state !== "ready" && styles.dotOff)} />
            {library.state === "ready" && `iPhone · 已连接 · ${count?.toLocaleString()} 项`}
            {library.state === "loading" && "正在读取 iPhone…"}
            {library.state === "error" && "未连接"}
          </span>
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
          <Button onClick={onPickFiles} disabled={busy}>
            从 Mac 选择…
          </Button>
          {/* The panel hangs from its button. */}
          <span {...stylex.props(styles.aiAnchor)}>
            <Button onClick={() => setAiOpen((o) => !o)} disabled={busy}>
              {ai.busy ? "挑选中…" : "AI 选片…"}
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
          <Button onClick={onRefresh} disabled={busy || library.state === "loading"}>
            刷新
          </Button>
        </div>
        <div ref={scroller} {...stylex.props(styles.scroll)}>
          {library.state === "error" && (
            <div {...stylex.props(styles.notice)}>
              <p>{library.message}</p>
              <p {...stylex.props(ui.note)}>用数据线连接 iPhone 并解锁，然后点「刷新」。</p>
              <p {...stylex.props(ui.note)}>文件已经在 Mac 上：点「从 Mac 选择…」，或直接把文件、文件夹拖进窗口。</p>
            </div>
          )}
          {library.state === "loading" && <p {...stylex.props(styles.notice)}>正在读取 iPhone…</p>}
          {days.map((day) => (
            <DaySection
              key={day.label}
              day={day}
              visible={visible}
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
                        <span {...stylex.props(styles.reason)}>{verdict.picked ? `AI · ${caption}` : caption}</span>
                        <span {...stylex.props(styles.points)}>{points(verdict.value)}</span>
                      </span>
                    )}
                  </button>
                );
              }}
            />
          ))}
        </div>
        <footer {...stylex.props(styles.footer)}>
          <span {...stylex.props(styles.summary)}>
            {error ??
              ai.error ??
              (ai.busy
                ? "AI 正在挑选…（第一次要先从 iPhone 读取缩略图）"
                : busy
                  ? progressLabel(adding)
                  : chosen.size
                    ? `已选 ${chosen.size} 项`
                    : "点击或拖动勾选照片，再用「AI 选片…」挑出精选")}
          </span>
          {chosen.size > 0 && (
            <Button variant="ghost" onClick={() => setChosen(new Set())} disabled={busy}>
              全部取消选择
            </Button>
          )}
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

/** A day's title and its pictures, split under scene titles when the day
 * has more than one scene. Either title ticks all its photos shown. */
function DaySection({
  day,
  visible,
  chosen,
  onToggle,
  renderTile,
}: {
  day: Day;
  visible: (item: MediaItem) => boolean;
  chosen: Set<string>;
  onToggle: (ids: string[]) => void;
  renderTile: (item: MediaItem) => ReactNode;
}) {
  const scenes = day.scenes
    .map((scene) => ({ scene, shown: scene.items.filter(visible) }))
    .filter(({ shown }) => shown.length > 0);
  if (scenes.length === 0) return null;
  const split = day.scenes.length > 1;
  return (
    <section>
      <GroupTitle items={scenes.flatMap(({ shown }) => shown)} chosen={chosen} onToggle={onToggle}>
        {day.label}
      </GroupTitle>
      {scenes.map(({ scene, shown }) => (
        <div key={scene.key}>
          {split && (
            <div>
              <GroupTitle items={shown} chosen={chosen} onToggle={onToggle} scene>
                {sceneLabel(scene)} · {shown.length} 张
              </GroupTitle>
            </div>
          )}
          <div {...stylex.props(styles.grid)}>{shown.map(renderTile)}</div>
        </div>
      ))}
    </section>
  );
}

/** A day or scene title with a check showing none, some or all of its
 * usable photos ticked; clicking it ticks or unticks them all. */
function GroupTitle({
  items,
  chosen,
  onToggle,
  scene = false,
  children,
}: {
  items: MediaItem[];
  chosen: Set<string>;
  onToggle: (ids: string[]) => void;
  scene?: boolean;
  children: ReactNode;
}) {
  const ids = items.filter(usable).map((item) => item.id);
  const ticked = ids.filter((id) => chosen.has(id)).length;
  const all = ids.length > 0 && ticked === ids.length;
  return (
    <button
      disabled={ids.length === 0}
      title={all ? "取消勾选这一段" : "勾选这一段的全部照片"}
      onClick={() => onToggle(ids)}
      {...stylex.props(styles.groupTitle, scene && styles.sceneTitle, all && styles.groupTitleOn)}
    >
      <span {...stylex.props(styles.groupCheck, all ? styles.groupCheckAll : ticked > 0 && styles.groupCheckSome)} />
      {children}
    </button>
  );
}
