import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ask, open } from "@tauri-apps/plugin-dialog";
import * as stylex from "@stylexjs/stylex";
import {
  addFileClips,
  addIphoneClips,
  cropFrame,
  fileUrl,
  loadProject,
  onClipsProgress,
  renderPreview,
  saveProject,
  saveTitleImage,
  MEDIA_EXTENSIONS,
  type ClipsProgress,
} from "./api";
import { ClipList } from "./components/ClipList";
import { DropOverlay, type Drop } from "./components/DropOverlay";
import { ExportDialog } from "./components/ExportDialog";
import { Inspector } from "./components/Inspector";
import { PickerSheet } from "./components/PickerSheet";
import { Stage, type CropView } from "./components/Stage";
import {
  clipSpans,
  clipStart,
  crossfade,
  hasTitleText,
  reducer,
  renderKey,
  titleImageKey,
  totalLength,
  UNTITLED,
} from "./project";
import { renderTitlePng } from "./title";
import { colors, layout } from "./tokens.stylex";
import { Button, Icon } from "./ui";
import { useLibrary } from "./useLibrary";

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
    paddingLeft: 84,
  },
  toolbarCenter: {
    display: "grid",
    justifyItems: "center",
  },
  toolbarRight: {
    display: "flex",
    justifyContent: "flex-end",
    paddingRight: 14,
  },
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
  },
  meta: {
    fontSize: 11,
    color: colors.muted,
  },
  body: {
    display: "grid",
    gridTemplateColumns: `${layout.sidebarWidth} 1fr ${layout.inspectorWidth}`,
    minHeight: 0,
  },
  sidebar: {
    ...frosted,
    overflowY: "auto",
    paddingBlock: "12px",
    paddingInline: "10px",
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: colors.border,
  },
  sectionTitle: {
    display: "flex",
    justifyContent: "space-between",
    paddingTop: "4px",
    paddingRight: "8px",
    paddingBottom: "8px",
    paddingLeft: "8px",
    fontSize: 11,
    fontWeight: 600,
    color: colors.muted,
  },
  clear: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    color: {
      default: colors.muted,
      ":hover": colors.danger,
    },
    fontSize: 11,
    cursor: "pointer",
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

interface Crop extends Omit<CropView, "applying"> {
  clipId: string;
  /** "rendering" once the new crop is in the project; the overlay stays
   * until the preview that includes it arrives. */
  phase: "drag" | "rendering";
}

function App() {
  const [project, dispatch] = useReducer(reducer, null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [adding, setAdding] = useState<ClipsProgress | "starting" | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [preview, setPreview] = useState<Preview>({ url: null, busy: false, error: null });
  const [seekTo, setSeekTo] = useState<{ time: number; nonce: number } | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const { library, thumbs, refresh, loadThumbs } = useLibrary();

  // ---------- load + autosave ----------
  /** Title fields the current `textImage` was rendered from. */
  const [imageKey, setImageKey] = useState<string | null>(null);
  useEffect(() => {
    loadProject()
      .then((loaded) => {
        dispatch({ type: "load", project: loaded });
        setImageKey(titleImageKey(loaded.title, loaded.output.aspect));
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

  // ---------- preview ----------
  const key = project ? renderKey(project) : null;
  // Wait for the PNG so a text edit never renders with the old title.
  const titleReady = titleKey !== null && titleKey === imageKey;
  const latest = useRef(project);
  latest.current = project;
  const latestCrop = useRef(crop);
  latestCrop.current = crop;
  const renderSeq = useRef(0);
  useEffect(() => {
    const current = latest.current;
    if (!current || !titleReady) return;
    if (current.clips.length === 0) {
      setPreview({ url: null, busy: false, error: null });
      return;
    }
    const seq = ++renderSeq.current;
    const timer = setTimeout(async () => {
      setPreview((p) => ({ ...p, busy: true }));
      try {
        const path = await renderPreview(latest.current!);
        if (seq === renderSeq.current) {
          setPreview({ url: fileUrl(path), busy: false, error: null });
          const applied = latestCrop.current;
          if (applied?.phase === "rendering") {
            setCrop(null);
            // Show the clip that was just cropped, not the start.
            setSeekTo({ time: clipStart(latest.current!, applied.clipId), nonce: Date.now() });
          }
        }
      } catch (e) {
        if (seq === renderSeq.current) {
          setPreview((p) => ({ ...p, busy: false, error: String(e) }));
          setCrop((c) => (c?.phase === "rendering" ? null : c));
        }
      }
    }, PREVIEW_DELAY);
    return () => clearTimeout(timer);
  }, [key, titleReady]);

  // ---------- thumbnails for the clip list ----------
  // Joined into one string so the effect runs only when the set changes;
  // asset ids ("<folder>/<name>") never contain "|".
  const clipAssetKey = project?.clips.map((c) => c.assetId ?? "").join("|") ?? "";
  useEffect(() => {
    const ids = clipAssetKey.split("|").filter(Boolean);
    if (ids.length) loadThumbs(ids);
  }, [clipAssetKey, loadThumbs]);

  // ---------- actions ----------
  const addClips = useCallback(async (ids: string[]) => {
    setAdding("starting");
    setAddError(null);
    const unlisten = await onClipsProgress(setAdding);
    try {
      const clips = await addIphoneClips(ids);
      dispatch({ type: "addClips", clips });
      setSelectedId((current) => current ?? clips[0]?.id ?? null);
      setPickerOpen(false);
    } catch (e) {
      setAddError(String(e));
    } finally {
      unlisten();
      setAdding(null);
    }
  }, []);

  const addFiles = useCallback(async (paths: string[]) => {
    setDrop({ step: "adding", progress: null });
    const unlisten = await onClipsProgress((progress) => setDrop({ step: "adding", progress }));
    try {
      const { clips, skippedStills } = await addFileClips(paths);
      dispatch({ type: "addClips", clips });
      setSelectedId((current) => current ?? clips[0]?.id ?? null);
      if (clips.length) setPickerOpen(false);
      const skipped = skippedStills ? `跳过了 ${skippedStills} 张没有配对视频的静态照片。` : "";
      if (clips.length === 0) setDrop({ step: "message", text: skipped || "没有找到视频或 Live Photo。" });
      else setDrop(skipped ? { step: "message", text: `已添加 ${clips.length} 段，${skipped}` } : null);
    } catch (e) {
      setDrop({ step: "message", text: `添加失败：${e}` });
    } finally {
      unlisten();
    }
  }, []);

  async function pickFiles() {
    const picked = await open({
      multiple: true,
      filters: [{ name: "视频和 Live Photo", extensions: MEDIA_EXTENSIONS }],
    });
    if (picked?.length) void addFiles(picked);
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

  async function clearClips() {
    if (!project) return;
    const confirmed = await ask(`清空全部 ${project.clips.length} 个片段？手机和 Mac 上的原片不受影响。`, {
      title: "清空片段",
      kind: "warning",
      okLabel: "清空",
      cancelLabel: "取消",
    });
    if (!confirmed) return;
    dispatch({ type: "clearClips" });
    setSelectedId(null);
  }

  function selectClip(id: string) {
    if (!project) return;
    setSelectedId(id);
    setSeekTo({ time: clipStart(project, id), nonce: Date.now() });
  }

  // ---------- crop ----------
  function startCrop(time: number) {
    if (!project) return;
    const spans = clipSpans(project);
    const found = spans.findIndex((_, i) => time < spans.slice(0, i + 1).reduce((a, b) => a + b, 0));
    const index = found === -1 ? project.clips.length - 1 : found;
    const clip = project.clips[index];
    if (!clip) return;
    // The same moment inside the clip's own file: the time into its span,
    // plus the half dissolve its span starts after, plus its trimmed head.
    const spanStart = spans.slice(0, index).reduce((a, b) => a + b, 0);
    const into = time - spanStart + (index > 0 ? crossfade(project) / 2 : 0);
    const at = Math.min(clip.trimStart + Math.max(0, into), clip.trimEnd);
    setSelectedId(clip.id);
    setCrop({ clipId: clip.id, frame: null, start: clip.cropOffset, offset: clip.cropOffset, phase: "drag" });
    cropFrame(clip, at)
      .then((path) => setCrop((c) => (c?.clipId === clip.id ? { ...c, frame: fileUrl(path) } : c)))
      .catch((e) => {
        setCrop(null);
        setPreview((p) => ({ ...p, error: String(e) }));
      });
  }

  function endCrop() {
    const clip = project?.clips.find((c) => c.id === crop?.clipId);
    // Whole percent: finer steps are invisible and only churn the preview.
    const offset = crop ? Math.round(crop.offset * 100) / 100 : 0;
    if (!crop || !clip || offset === clip.cropOffset) {
      setCrop(null);
      return;
    }
    // The crop is applied while composing, so only the preview re-renders.
    dispatch({ type: "updateClip", id: clip.id, patch: { cropOffset: offset } });
    setCrop({ ...crop, offset, phase: "rendering" });
  }

  if (loadError) return <p {...stylex.props(styles.fatal)}>无法打开工程：{loadError}</p>;
  if (!project) return null;

  const total = totalLength(project);
  return (
    <div {...stylex.props(styles.app)}>
      <header data-tauri-drag-region {...stylex.props(styles.toolbar)}>
        <div data-tauri-drag-region {...stylex.props(styles.toolbarLeft)}>
          <Button onClick={() => setPickerOpen(true)}>
            <Icon>
              <path d="M8 3v10M3 8h10" />
            </Icon>
            添加照片
          </Button>
        </div>
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
        <div data-tauri-drag-region {...stylex.props(styles.toolbarRight)}>
          <Button variant="primary" disabled={project.clips.length === 0} onClick={() => setExportOpen(true)}>
            <Icon>
              <path d="M8 10V2.5M5 5.5 8 2.5l3 3M3 9.5v3.5h10V9.5" />
            </Icon>
            导出
          </Button>
        </div>
      </header>

      <main {...stylex.props(styles.body)}>
        <aside {...stylex.props(styles.sidebar)}>
          <div {...stylex.props(styles.sectionTitle)}>
            <span>片段 {project.clips.length || ""}</span>
            {project.clips.length > 0 && (
              <button onClick={clearClips} {...stylex.props(styles.clear)}>
                清空
              </button>
            )}
          </div>
          <ClipList
            clips={project.clips}
            selectedId={selectedId}
            thumbs={thumbs}
            noOriginalSound={project.audio.mode === "music" && !!project.audio.musicPath}
            onSelect={selectClip}
            dispatch={dispatch}
          />
        </aside>
        <Stage
          src={preview.url}
          aspect={project.output.aspect}
          croppable={project.output.fill === "crop"}
          lengths={clipSpans(project)}
          seekTo={seekTo}
          busy={preview.busy}
          error={preview.error}
          empty={project.clips.length === 0}
          crop={crop && { ...crop, applying: crop.phase !== "drag" }}
          onCropStart={startCrop}
          onCropChange={(offset) => setCrop((c) => c && { ...c, offset })}
          onCropEnd={endCrop}
          onAdd={() => setPickerOpen(true)}
        />
        <Inspector
          title={project.title}
          audio={project.audio}
          filter={project.filter}
          transition={project.transition}
          output={project.output}
          dispatch={dispatch}
        />
      </main>

      <PickerSheet
        open={pickerOpen}
        library={library}
        thumbs={thumbs}
        adding={adding}
        error={addError}
        onRefresh={refresh}
        onLoadThumbs={loadThumbs}
        onAdd={addClips}
        onPickFiles={pickFiles}
        onClose={() => setPickerOpen(false)}
      />
      <ExportDialog open={exportOpen} project={project} dispatch={dispatch} onClose={() => setExportOpen(false)} />
      <DropOverlay drop={drop} onDismiss={() => setDrop(null)} />
    </div>
  );
}

export default App;
