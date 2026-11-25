import { useCallback, useEffect, useEffectEvent, useMemo, useReducer, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ask, message, open } from "@tauri-apps/plugin-dialog";
import * as stylex from "@stylexjs/stylex";
import {
  addFileClips,
  addIphoneClips,
  defaultProject,
  saveDefaults,
  fileUrl,
  loadProject,
  onClipsProgress,
  renderPreview,
  saveProject,
  saveTitleImage,
  MEDIA_EXTENSIONS,
  type Clip,
  type ClipsProgress,
  type Project,
} from "./api";
import { DropOverlay, type Drop } from "./components/DropOverlay";
import { ExportPanel } from "./components/ExportPanel";
import { AddClipsButton } from "./components/AddClipsButton";
import { ClipGrid } from "./components/ClipGrid";
import { ClipPanel } from "./components/ClipPanel";
import { Inspector, type InspectorPage } from "./components/Inspector";
import { PickerSheet } from "./components/PickerSheet";
import { Stage } from "./components/Stage";
import { Timeline } from "./components/Timeline";
import { TrimEditor } from "./components/TrimEditor";
import { Welcome } from "./components/Welcome";
import {
  captionImageKey,
  clipSpans,
  clipStart,
  hasCaption,
  hasTitleText,
  isMissing,
  missingLabel,
  playable,
  reducer,
  renderKey,
  titleImageKey,
  hasWatermark,
  watermarkImageKey,
  totalLength,
  UNTITLED,
  type Action,
} from "./project";
import { renderCaptionPng, renderTitlePng, renderWatermarkPng } from "./title";
import { colors, layout } from "./tokens.stylex";
import { IconButton } from "./ui";
import { useAppMenu } from "./hooks/useAppMenu";
import { useExport } from "./hooks/useExport";
import { useLibrary } from "./hooks/useLibrary";
import { usePlayback, type SeekTo } from "./hooks/usePlayback";

const frosted = {
  backgroundColor: colors.sidebar,
  backdropFilter: "blur(30px) saturate(1.6)",
} as const;

const styles = stylex.create({
  app: {
    position: "relative",
    display: "grid",
    gridTemplateRows: `${layout.toolbarHeight} 1fr`,
    height: "100%",
    color: colors.text,
    backgroundColor: colors.window,
  },
  fatal: {
    padding: 40,
    color: colors.danger,
  },
  // The macOS traffic lights overlay the toolbar's left edge.
  toolbar: {
    ...frosted,
    display: "grid",
    gridTemplateColumns: `${layout.sidebarWidth} 1fr ${layout.inspectorWidth}`,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.border,
  },
  toolbarLeft: {
    display: "flex",
    alignItems: "center",
    paddingLeft: 84,
  },
  toolbarCenter: {
    display: "grid",
    justifyItems: "center",
    rowGap: 3,
  },
  // Export says what it will make before it is clicked: the button's
  // right part, a shade darker, shows the size and length.
  name: {
    width: 260,
    paddingBlock: "1px",
    paddingInline: "6px",
    borderWidth: 0,
    borderRadius: 5,
    backgroundColor: {
      default: "transparent",
      ":hover": colors.surface,
      ":focus": colors.surface,
    },
    outline: "none",
    textAlign: "center",
    fontWeight: 600,
    // The field is centred, so while typing into an empty name the caret
    // would sit in the middle of "Untitled"; the hint steps aside.
    "::placeholder": {
      color: {
        default: null,
        ":focus": "transparent",
      },
    },
  },
  meta: {
    fontSize: 11,
    color: colors.muted,
  },
  // The preview and settings on top, the timeline across the bottom.
  body: {
    display: "grid",
    gridTemplateColumns: `1fr ${layout.inspectorWidth}`,
    gridTemplateRows: "minmax(0, 1fr)",
    minHeight: 0,
  },
  withTimeline: {
    gridTemplateRows: `minmax(0, 1fr) ${layout.timelineHeight}`,
  },
  // An empty project is only the welcome page; settings come with clips.
  welcome: {
    gridTemplateColumns: "1fr",
  },
  withSidebar: {
    gridTemplateColumns: `${layout.sidebarWidth} 1fr ${layout.inspectorWidth}`,
  },
  withRail: {
    gridTemplateColumns: `${layout.railWidth} 1fr ${layout.inspectorWidth}`,
  },
  // The hidden grid leaves a strip with the button that brings it back.
  rail: {
    ...frosted,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    paddingTop: "8px",
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: colors.border,
  },
  // Scrolls without a bar: thumbnails cut off at the bottom already show
  // there is more.
  sidebar: {
    ...frosted,
    overflowY: "auto",
    scrollbarWidth: "none",
    "::-webkit-scrollbar": { display: "none" },
    paddingInline: "10px",
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: colors.border,
  },
});

/** Quiet time after an edit before saving / re-rendering, in ms. */
const SAVE_DELAY = 400;
const TITLE_DELAY = 250;
const PREVIEW_DELAY = 350;

interface Preview {
  url: string | null;
  busy: boolean;
  error: string | null;
}

const SIDEBAR_KEY = "sidebarOpen";

/** Whether the clip grid was left open; open the first time. */
function readSidebarOpen(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== "false";
  } catch {
    return true;
  }
}

/** Keys for the caption PNGs a loaded project already has. */
function renderedCaptionKeys(project: Project): Record<string, string> {
  return Object.fromEntries(
    project.clips
      .filter((clip) => hasCaption(clip) && clip.caption!.image)
      .map((clip) => [clip.id, captionImageKey(clip.caption!, project.title, project.output.aspect)]),
  );
}

function App() {
  const [project, dispatch] = useReducer(reducer, null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The clip the picker's photos go after; null puts them at the end. */
  const [addAfter, setAddAfter] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** The clip being swapped for another photo, while picking it. */
  const [replacing, setReplacing] = useState<string | null>(null);
  const [adding, setAdding] = useState<ClipsProgress | "starting" | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [preview, setPreview] = useState<Preview>({ url: null, busy: false, error: null });
  const [seekTo, setSeekTo] = useState<SeekTo | null>(null);
  /** Clip open in the large trim view, which takes the preview's place. */
  const [trimming, setTrimming] = useState<string | null>(null);
  const [inspectorPage, setInspectorPage] = useState<InspectorPage>("title");
  const [sidebarOpen, setSidebarOpen] = useState(() => readSidebarOpen());
  const { library, thumbs, refresh, loadThumbs } = useLibrary();

  // ---------- load + autosave ----------
  /** Title fields the current `textImage` was rendered from. */
  const [imageKey, setImageKey] = useState<string | null>(null);
  /** Per clip, the caption fields its current `caption.image` was rendered from. */
  const [captionKeys, setCaptionKeys] = useState<Record<string, string>>({});
  /** Watermark fields the current `watermark.image` was rendered from. */
  const [markKey, setMarkKey] = useState<string | null>(null);
  /** Puts `next` in place and marks only the PNGs it actually has as
   * rendered, so a missing one is drawn even if its fields look unchanged. */
  function adopt(next: Project) {
    dispatch({ type: "load", project: next });
    // A title whose PNG is gone (cleared with the cache) is drawn again.
    setImageKey(
      !hasTitleText(next.title) || next.title.textImage ? titleImageKey(next.title, next.output.aspect) : null,
    );
    setCaptionKeys(renderedCaptionKeys(next));
    setMarkKey(
      !hasWatermark(next.watermark) || next.watermark.image
        ? watermarkImageKey(next.watermark, next.output.aspect)
        : null,
    );
  }
  useEffect(() => {
    loadProject()
      .then((loaded) => {
        adopt(loaded);
        setSelectedId(loaded.clips[0]?.id ?? null);
        if (loaded.clips.length === 0) setPickerOpen(true);
      })
      .catch((e) => setLoadError(String(e)));
  }, []);

  const firstState = useRef(true);
  useEffect(() => {
    if (!project) return;
    if (firstState.current) {
      firstState.current = false; // just loaded; nothing to save
      return;
    }
    const timer = setTimeout(() => {
      saveProject(project)
        .then(() => setSaveError(null))
        .catch((e) => setSaveError(String(e)));
    }, SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [project]);

  // ---------- title PNG ----------
  const title = project?.title ?? null;
  const aspect = project?.output.aspect ?? "9:16";
  const titleKey = title ? titleImageKey(title, aspect) : null;
  useEffect(() => {
    // Only the title's look matters; other title edits find the keys equal.
    if (!title || titleKey === imageKey) return;
    if (!hasTitleText(title)) {
      setImageKey(titleKey);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const path = await saveTitleImage(await renderTitlePng(title, aspect));
      if (cancelled) return;
      dispatch({ type: "updateTitle", patch: { textImage: path } });
      setImageKey(titleKey);
    }, TITLE_DELAY);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [title, aspect, titleKey, imageKey]);

  // ---------- caption PNGs ----------
  // Same as the title: re-render a clip's caption when its text or
  // position, or the title's look it borrows, changes.
  const captionJobs =
    project && title
      ? project.clips.filter(hasCaption).flatMap((clip) => {
          const key = captionImageKey(clip.caption!, title, aspect);
          return captionKeys[clip.id] === key ? [] : [{ id: clip.id, caption: clip.caption!, title, aspect, key }];
        })
      : [];
  const pendingCaptions = JSON.stringify(captionJobs.map((job) => job.key));
  const latestJobs = useRef(captionJobs);
  latestJobs.current = captionJobs;
  useEffect(() => {
    const jobs = latestJobs.current;
    if (jobs.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      for (const job of jobs) {
        const path = await saveTitleImage(await renderCaptionPng(job.caption, job.title, job.aspect));
        if (cancelled) return;
        dispatch({ type: "setCaptionImage", id: job.id, image: path });
        setCaptionKeys((keys) => ({ ...keys, [job.id]: job.key }));
      }
    }, TITLE_DELAY);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pendingCaptions]);

  // ---------- watermark PNG ----------
  // Same as the title: re-render when its text, corner or size changes.
  const watermark = project?.watermark ?? null;
  const watermarkKey = watermark ? watermarkImageKey(watermark, aspect) : null;
  useEffect(() => {
    if (!watermark || watermarkKey === markKey) return;
    if (!hasWatermark(watermark)) {
      setMarkKey(watermarkKey);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const path = await saveTitleImage(await renderWatermarkPng(watermark, aspect));
      if (cancelled) return;
      dispatch({ type: "updateWatermark", patch: { image: path } });
      setMarkKey(watermarkKey);
    }, TITLE_DELAY);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [watermark, aspect, watermarkKey, markKey]);

  // ---------- preview ----------
  // The preview leaves lost clips out (export refuses them instead).
  const key = project ? renderKey(playable(project)) : null;
  // Wait for the PNGs so a text edit never renders with the old text.
  const titleReady = titleKey !== null && titleKey === imageKey;
  const captionsReady = captionJobs.length === 0;
  const watermarkReady = watermarkKey !== null && watermarkKey === markKey;
  const latest = useRef(project);
  latest.current = project;
  /** Clip to show once the preview in the works arrives; `peek` when it
   * was edited, so play still starts from the top. */
  const seekAfterRender = useRef<{ id: string; peek: boolean } | null>(null);
  /** `renderKey` of the preview on screen. */
  const shownKey = useRef<string | null>(null);
  const renderSeq = useRef(0);
  useEffect(() => {
    const current = latest.current && playable(latest.current);
    if (!current || !titleReady || !captionsReady || !watermarkReady) return;
    if (current.clips.length === 0) {
      setPreview({ url: null, busy: false, error: null });
      return;
    }
    const seq = ++renderSeq.current;
    const timer = setTimeout(async () => {
      setPreview((p) => ({ ...p, busy: true }));
      try {
        const rendered = playable(latest.current!);
        const path = await renderPreview(rendered);
        if (seq === renderSeq.current) {
          setPreview({ url: fileUrl(path), busy: false, error: null });
          shownKey.current = renderKey(rendered);
          // Show the clip that was just trimmed or picked, not the start.
          const target = seekAfterRender.current;
          seekAfterRender.current = null;
          if (target && rendered.clips.some((c) => c.id === target.id)) {
            setSeekTo({ time: clipStart(rendered, target.id), nonce: Date.now(), peek: target.peek });
          }
        }
      } catch (e) {
        if (seq === renderSeq.current) {
          setPreview((p) => ({ ...p, busy: false, error: String(e) }));
        }
      }
    }, PREVIEW_DELAY);
    return () => clearTimeout(timer);
  }, [key, titleReady, captionsReady, watermarkReady]);

  // ---------- thumbnails for the timeline ----------
  // Joined into one string so the effect runs only when the set changes;
  // asset ids ("<folder>/<name>") never contain "|".
  const clipAssetKey = project?.clips.map((c) => c.assetId ?? "").join("|") ?? "";
  // Lost clips show a warning instead, and asking for theirs would hold
  // the rest up while the phone is looked for.
  const thumbKey = project
    ? playable(project)
        .clips.map((c) => c.assetId ?? "")
        .join("|")
    : "";
  useEffect(() => {
    const ids = thumbKey.split("|").filter(Boolean);
    if (ids.length) loadThumbs(ids);
  }, [thumbKey, loadThumbs]);
  // Marked in the picker, so a photo isn't added twice by accident.
  const added = useMemo(() => new Set(clipAssetKey.split("|").filter(Boolean)), [clipAssetKey]);

  // ---------- actions ----------
  /** Shows clips just put after `after`: selects the last, so the next
   * batch follows it, and moves the preview there once it has them. */
  const showInserted = useCallback((clips: Clip[], after: string | null | undefined) => {
    const last = clips[clips.length - 1]?.id;
    if (after && last) {
      setSelectedId(last);
      seekAfterRender.current = { id: clips[0].id, peek: true };
    } else setSelectedId((current) => current ?? clips[0]?.id ?? null);
  }, []);

  const addClips = useCallback(
    async (ids: string[], after?: string | null) => {
      setAdding("starting");
      setAddError(null);
      const unlisten = await onClipsProgress(setAdding);
      try {
        const clips = await addIphoneClips(ids);
        dispatch({ type: "addClips", clips, after });
        showInserted(clips, after);
        setPickerOpen(false);
      } catch (e) {
        setAddError(String(e));
      } finally {
        unlisten();
        setAdding(null);
      }
    },
    [showInserted],
  );

  const addFiles = useCallback(
    async (paths: string[], after?: string | null) => {
      setDrop({ step: "adding", progress: null });
      const unlisten = await onClipsProgress((progress) => setDrop({ step: "adding", progress }));
      try {
        const { clips, skippedStills } = await addFileClips(paths);
        dispatch({ type: "addClips", clips, after });
        showInserted(clips, after);
        if (clips.length) setPickerOpen(false);
        const skipped = skippedStills ? `跳过了 ${skippedStills} 张没有配对视频的静态照片。` : "";
        if (clips.length === 0) setDrop({ step: "message", text: skipped || "没有找到视频或 Live Photo。" });
        else setDrop(skipped ? { step: "message", text: `已添加 ${clips.length} 段，${skipped}` } : null);
      } catch (e) {
        setDrop({ step: "message", text: `添加失败：${e}` });
      } finally {
        unlisten();
      }
    },
    [showInserted],
  );

  /** Adds files from the Mac, or with `replace` puts the first in that
   * clip's place. Several can still be picked, since a Live Photo is its
   * picture and its video together. */
  async function pickFiles(replace?: string | null, after?: string | null) {
    const picked = await open({
      multiple: true,
      filters: [{ name: "视频和 Live Photo", extensions: MEDIA_EXTENSIONS }],
    });
    if (!picked?.length) return;
    if (replace) void replaceFromFiles(replace, picked);
    else void addFiles(picked, after);
  }

  /** Swaps clip `id` for a photo from the phone, keeping its place. */
  async function replaceFromPhone(id: string, ids: string[]) {
    setAdding("starting");
    setAddError(null);
    const unlisten = await onClipsProgress(setAdding);
    try {
      const [clip] = await addIphoneClips(ids.slice(0, 1));
      if (clip) replaceWith(id, clip);
    } catch (e) {
      setAddError(String(e));
    } finally {
      unlisten();
      setAdding(null);
    }
  }

  async function replaceFromFiles(id: string, paths: string[]) {
    setDrop({ step: "adding", progress: null });
    const unlisten = await onClipsProgress((progress) => setDrop({ step: "adding", progress }));
    try {
      const { clips, skippedStills } = await addFileClips(paths);
      if (clips.length === 0) {
        const still = skippedStills ? "静态照片不能用，Live Photo 要把照片和同名的 MOV 一起选上。" : "";
        setDrop({ step: "message", text: still || "没有找到视频或 Live Photo。" });
        return;
      }
      replaceWith(id, clips[0]);
      setDrop(clips.length > 1 ? { step: "message", text: `选了 ${clips.length} 段，只用第一段替换。` } : null);
    } catch (e) {
      setDrop({ step: "message", text: `替换失败：${e}` });
    } finally {
      unlisten();
    }
  }

  function replaceWith(id: string, clip: Clip) {
    dispatch({ type: "replaceClip", id, clip });
    // Show the new picture once the preview has it.
    seekAfterRender.current = { id, peek: true };
    setPickerOpen(false);
    setReplacing(null);
  }

  /** Opens the picker; what it adds goes after clip `after`, or at the
   * end without it. */
  function openPicker(after: string | null = null) {
    setAddAfter(after);
    setPickerOpen(true);
  }

  function closePicker() {
    setPickerOpen(false);
    setReplacing(null);
  }

  // Files dragged from Finder anywhere onto the window.
  const busyAdding = useRef(false);
  busyAdding.current = adding !== null || drop?.step === "adding";
  useEffect(() => {
    const stop = getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (busyAdding.current) return;
      if (payload.type === "leave") setDrop((d) => (d?.step === "hover" ? null : d));
      else if (payload.type !== "drop") setDrop((d) => (d?.step === "hover" ? d : { step: "hover" }));
      else if (payload.paths.length) void addFiles(payload.paths);
      else setDrop(null);
    });
    return () => void stop.then((unlisten) => unlisten());
  }, [addFiles]);

  async function clearProject() {
    if (!project) return;
    const confirmed = await ask("片段和所有设置都会清空，原片不受影响。", {
      title: "清空工程？",
      kind: "warning",
      okLabel: "清空",
      cancelLabel: "取消",
    });
    if (!confirmed) return;
    adopt(await defaultProject());
    setSelectedId(null);
  }

  /** Keeps this project's looks as where new and cleared projects start. */
  async function keepDefaults() {
    if (!project) return;
    const confirmed = await ask(
      "以后「清空工程」和新工程都从这套设置开始。\n\n会存：片头和字幕的样式、滤镜和调整、转场、水印、原声和配乐的音量。\n不存：片段、片头和字幕的文字、配乐、文件名和导出文件夹。",
      { title: "存为我的默认设置？", okLabel: "存为默认", cancelLabel: "取消" },
    );
    if (!confirmed) return;
    try {
      await saveDefaults(project);
    } catch (e) {
      await message(String(e), { title: "没能存为默认设置", kind: "error" });
    }
  }

  /** Back to the user's kept settings, or the built-in ones. */
  async function resetSettings(factory: boolean) {
    const to = factory ? "app 出厂的样子" : "你存的默认设置（没存过就是出厂设置）";
    const confirmed = await ask(
      `文字样式、片头的位置和时长、声音、滤镜、转场和水印会回到${to}。片头文字、配乐文件和导出文件夹保留，片段和字幕不受影响。`,
      {
        title: factory ? "恢复出厂设置" : "恢复为我的默认设置",
        kind: "warning",
        okLabel: "恢复",
        cancelLabel: "取消",
      },
    );
    if (!confirmed) return;
    dispatch({ type: "resetSettings", defaults: await defaultProject(factory) });
  }

  /** Edits in the clip panel, such as a caption, show on that clip once
   * the preview has them, not back at the start. Removing a clip selects
   * and shows the one now in its place, as Mail and Photos do (the one
   * before it, if it was last), so bad clips can go one after another. */
  function clipDispatch(action: Action) {
    if (action.type === "updateClip") seekAfterRender.current = { id: action.id, peek: true };
    if (action.type === "removeClip" && project) {
      const at = project.clips.findIndex((clip) => clip.id === action.id);
      const next = project.clips[at + 1] ?? project.clips[at - 1];
      if (at !== -1 && action.id === selectedId) {
        setSelectedId(next?.id ?? null);
        if (next) seekAfterRender.current = { id: next.id, peek: true };
      }
    }
    dispatch(action);
  }

  function selectClip(id: string) {
    if (!project) return;
    setSelectedId(id);
    setTrimming((open) => open && id);
    const shown = playable(project);
    if (!shown.clips.some((c) => c.id === id)) return;
    // A preview still being made, or one in the old order, would show
    // the wrong picture: jump once the new one arrives.
    if (shownKey.current === renderKey(shown)) setSeekTo({ time: clipStart(shown, id), nonce: Date.now() });
    else seekAfterRender.current = { id, peek: false };
  }

  function finishTrim() {
    const id = trimming;
    setTrimming(null);
    if (!id || !project) return;
    // Back on the preview at the trimmed clip, once it shows the new trim.
    const shown = playable(project);
    if (shownKey.current === renderKey(shown)) {
      setSeekTo({ time: clipStart(shown, id), nonce: Date.now(), peek: true });
    } else seekAfterRender.current = { id, peek: true };
  }

  const playback = usePlayback(seekTo);

  function toggleSidebar() {
    setSidebarOpen((open) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, String(!open));
      } catch {
        // Not remembered, which is fine.
      }
      return !open;
    });
  }

  /** Moves the selected clip to `to`, or one step by `by`. */
  function moveSelected(place: { to: number } | { by: number }) {
    if (!project) return;
    const from = project.clips.findIndex((c) => c.id === selectedId);
    if (from < 0) return;
    const to = "to" in place ? place.to : from + place.by;
    if (to < 0 || to >= project.clips.length || to === from) return;
    dispatch({ type: "moveClip", from, to });
  }

  // ⌥← ⌥→ move the selected clip one place, except while typing, where
  // they move the caret by a word.
  const onMoveKey = useEffectEvent((e: KeyboardEvent) => {
    if (!e.altKey || e.metaKey || e.ctrlKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    if (e.target instanceof HTMLElement && e.target.closest("input, textarea")) return;
    if (pickerOpen) return;
    e.preventDefault();
    moveSelected({ by: e.key === "ArrowLeft" ? -1 : 1 });
  });
  useEffect(() => {
    window.addEventListener("keydown", onMoveKey);
    return () => window.removeEventListener("keydown", onMoveKey);
  }, []);

  // The menu bar works over dialogs, so it waits for them to close.
  const exporter = useExport();
  const exporting = exporter.phase.step === "running";
  const idle = project !== null && !pickerOpen;
  const clipCount = project?.clips.length ?? 0;
  const canMove = idle && clipCount > 1 && project!.clips.some((c) => c.id === selectedId);
  useAppMenu(
    {
      add: idle,
      export: idle && clipCount > 0,
      keep: idle && clipCount > 0 && !exporting,
      reset: idle && clipCount > 0 && !exporting,
      factory: idle && clipCount > 0 && !exporting,
      clear: idle && clipCount > 0 && !exporting,
      first: canMove,
      last: canMove,
      sidebar: clipCount > 0,
    },
    sidebarOpen,
    (command) => {
      if (command === "sidebar") toggleSidebar();
      else if (command === "add") openPicker();
      else if (command === "export") setInspectorPage("export");
      else if (command === "clear") void clearProject();
      else if (command === "keep") void keepDefaults();
      else if (command === "reset") void resetSettings(false);
      else if (command === "factory") void resetSettings(true);
      else moveSelected({ to: command === "first" ? 0 : clipCount - 1 });
    },
  );

  if (loadError) return <p {...stylex.props(styles.fatal)}>无法打开工程：{loadError}</p>;
  if (!project) return null;

  const total = totalLength(project);
  const shown = playable(project);
  const spans = clipSpans(shown);
  const selectedIndex = project.clips.findIndex((c) => c.id === selectedId);
  const selectedClip = project.clips[selectedIndex];
  const selectedLost =
    selectedIndex >= 0 && isMissing(project.clips[selectedIndex]) ? project.clips[selectedIndex] : null;
  // Gone if the clip was removed while open.
  const trimClip = trimming ? project.clips.find((c) => c.id === trimming) : undefined;
  const showSidebar = sidebarOpen && project.clips.length > 0;
  const showRail = !sidebarOpen && project.clips.length > 0;
  /** Picking a clip in the grid or on the timeline is asking to edit it. */
  const pickClip = (id: string) => {
    selectClip(id);
    setInspectorPage("clip");
  };
  return (
    <div {...stylex.props(styles.app)}>
      <header data-tauri-drag-region {...stylex.props(styles.toolbar)}>
        <div data-tauri-drag-region {...stylex.props(styles.toolbarLeft)}></div>
        <div data-tauri-drag-region {...stylex.props(styles.toolbarCenter)}>
          <input
            value={project.name}
            placeholder={UNTITLED}
            aria-label="工程名称"
            onChange={(e) => dispatch({ type: "rename", name: e.target.value })}
            {...stylex.props(styles.name)}
          />
          <div data-tauri-drag-region {...stylex.props(styles.meta)}>
            {saveError
              ? `保存失败：${saveError}`
              : project.clips.length
                ? `${project.clips.length} 段 · ${total.toFixed(1)} 秒`
                : "空工程"}
          </div>
        </div>
        <div data-tauri-drag-region />
      </header>

      <main
        {...stylex.props(
          styles.body,
          project.clips.length > 0 ? styles.withTimeline : styles.welcome,
          showSidebar && styles.withSidebar,
          showRail && styles.withRail,
        )}
      >
        {showSidebar && (
          <aside {...stylex.props(styles.sidebar)}>
            <ClipGrid
              clips={project.clips}
              selectedId={selectedId}
              thumbs={thumbs}
              onSelect={pickClip}
              onMove={(from, to) => dispatch({ type: "moveClip", from, to })}
              onAdd={(after) => openPicker(after ? selectedId : null)}
              onClear={() => void clearProject()}
              canClear={!exporting}
              onHide={toggleSidebar}
            />
          </aside>
        )}
        {showRail && (
          <aside {...stylex.props(styles.rail)}>
            <IconButton label="显示片段栏" shortcut="⌃⌘S" onClick={toggleSidebar}>
              <path d="M6 4l4 4-4 4" />
            </IconButton>
            <AddClipsButton
              clips={project.clips}
              selectedId={selectedId}
              onAdd={(after) => openPicker(after ? selectedId : null)}
            />
          </aside>
        )}
        {project.clips.length === 0 ? (
          <Welcome onAdd={() => openPicker()} onPickFiles={() => void pickFiles()} />
        ) : trimClip ? (
          <TrimEditor key={trimClip.id} clip={trimClip} dispatch={dispatch} onDone={finishTrim} />
        ) : (
          <Stage
            src={preview.url}
            aspect={project.output.aspect}
            playback={playback}
            busy={preview.busy}
            error={preview.error}
            skipped={missingLabel(project.clips)}
            missing={
              selectedLost && {
                title: `第 ${selectedIndex + 1} 段的原件找不到了`,
                reason:
                  selectedLost.source === "file"
                    ? "原来的文件被移动或删除了，找到它再添加一次。"
                    : "缓存被系统清理过，插上 iPhone 重新添加这一张，会放回原来的位置。",
                onRemove: () => clipDispatch({ type: "removeClip", id: selectedLost.id }),
                onReadd: () => (selectedLost.source === "file" ? void pickFiles() : openPicker()),
              }
            }
          />
        )}
        {project.clips.length > 0 && (
          <Inspector
            title={project.title}
            audio={project.audio}
            filter={project.filter}
            transition={project.transition}
            watermark={project.watermark}
            page={inspectorPage}
            onPage={setInspectorPage}
            clip={
              <ClipPanel
                clip={project.clips[selectedIndex] ?? null}
                index={selectedIndex}
                thumb={selectedClip?.assetId ? thumbs[selectedClip.assetId] : undefined}
                onReplace={(from) => {
                  if (!selectedId) return;
                  if (from === "mac") return void pickFiles(selectedId);
                  setReplacing(selectedId);
                  openPicker();
                }}
                onTrim={() => setTrimming(selectedId)}
                dispatch={clipDispatch}
              />
            }
            exportPage={<ExportPanel project={project} exporter={exporter} dispatch={dispatch} />}
            dispatch={dispatch}
          />
        )}
        {project.clips.length > 0 && (
          <Timeline
            clips={project.clips}
            spans={Object.fromEntries(shown.clips.map((clip, i) => [clip.id, spans[i]]))}
            selectedId={selectedId}
            thumbs={thumbs}
            playback={playback}
            ready={preview.url !== null && !trimClip}
            onSelect={pickClip}
            onMove={(from, to) => dispatch({ type: "moveClip", from, to })}
          />
        )}
      </main>

      <PickerSheet
        open={pickerOpen}
        library={library}
        thumbs={thumbs}
        added={added}
        adding={adding}
        error={addError}
        onRefresh={refresh}
        onLoadThumbs={loadThumbs}
        onAdd={replacing ? (ids) => void replaceFromPhone(replacing, ids) : (ids) => void addClips(ids, addAfter)}
        onPickFiles={() => void (replacing ? pickFiles(replacing) : pickFiles(null, addAfter))}
        onClose={closePicker}
        replacing={replacing ? project.clips.findIndex((c) => c.id === replacing) + 1 || null : null}
      />
      <DropOverlay drop={drop} onDismiss={() => setDrop(null)} />
    </div>
  );
}

export default App;
