// Types mirroring the Rust structs, and typed wrappers around the commands
// in src-tauri/src/lib.rs.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ---------- iPhone ----------

export type MediaKind = "photo" | "video" | "livePhoto";

export interface MediaItem {
  /** "<device folder>/<file name>" */
  id: string;
  kind: MediaKind;
  name: string;
  size: number;
  /** ISO 8601, UTC */
  createdAt?: string | null;
  video?: { id: string; name: string; size: number } | null;
}

export interface Thumbnail {
  id: string;
  path: string | null;
  error: string | null;
}

/** Why AI selection did or didn't pick an item (`select::Reason`). */
export type AiReason =
  | { type: "bestInScene" }
  | { type: "highScore" }
  | { type: "duplicate"; of: string }
  | { type: "plain" }
  | { type: "utility" }
  | { type: "cut" }
  | { type: "lowScore" }
  | { type: "portrait" };

export interface AiVerdict {
  id: string;
  picked: boolean;
  /** Aesthetics after penalties, about -1 to 1. */
  value: number;
  reason: AiReason;
}

// ---------- project.json ----------

export interface Clip {
  id: string;
  source: "library" | "iphone" | "file";
  kind: "livePhoto" | "video";
  assetId?: string | null;
  stillPath?: string | null;
  videoPath: string;
  normalizedPath?: string | null;
  takenAt?: string | null;
  duration: number;
  trimStart: number;
  trimEnd: number;
  muted: boolean;
  cropOffset: number;
  aiScore?: number | null;
  aiReason?: string | null;
}

export type TitlePosition = "top" | "center" | "bottom";
export type TitleWeight = "light" | "regular" | "bold";
export type TitleTextStyle = "outline" | "shadow" | "none";

export interface Title {
  text: string;
  subtitle: string;
  font: string;
  /** Pixels at 1080 wide. */
  fontSize: number;
  color: string;
  position: TitlePosition;
  /** Space between title and subtitle, in pixels at 1080 wide. */
  lineGap: number;
  weight: TitleWeight;
  textStyle: TitleTextStyle;
  showFor: number;
  fadeOut: number;
  textImage?: string | null;
}

export interface Filter {
  preset: "none" | "forest" | "river" | "golden";
  /** Added to luma; 0 leaves it alone. */
  brightness: number;
  /** 1 leaves it alone. */
  contrast: number;
  /** 1 leaves it alone. */
  saturation: number;
}

export interface Audio {
  mode: "original" | "music" | "mix";
  /** The normalized copy in the app cache, not the file the user picked. */
  musicPath?: string | null;
  /** Linear gain; 1 keeps the normalized level. */
  musicVolume: number;
  originalVolume: number;
}

export interface Transition {
  type: "none" | "fade";
  /** Seconds each join cross-dissolves over. */
  duration: number;
}

export interface Output {
  aspect: "9:16" | "16:9";
  fill: "crop" | "black" | "blur";
  height: number;
  /** Folder exports are saved in; empty means Movies › HD Live Reel. */
  folder?: string | null;
}

export interface Project {
  version: number;
  name: string;
  clips: Clip[];
  title: Title;
  filter: Filter;
  audio: Audio;
  transition: Transition;
  selection: { mode: "manual" | "ai"; targetSeconds: number };
  output: Output;
}

export interface ClipsProgress {
  stage: "downloading" | "normalizing";
  done: number;
  total: number;
  /** Share of item `done` normalized so far, 0 to 1. */
  current: number;
}

export interface AddedFiles {
  clips: Clip[];
  /** Photos without a same-named video, which have no motion. */
  skippedStills: number;
}

/** What the "从 Mac 选择" dialog offers; a Live Photo is its photo and MOV. */
export const MEDIA_EXTENSIONS = ["mov", "mp4", "m4v", "heic", "heif", "jpg", "jpeg"];

// ---------- commands ----------

export const loadProject = () => invoke<Project>("load_project");
export const saveProject = (project: Project) => invoke<void>("save_project", { project });

export const listIphoneMedia = () => invoke<MediaItem[]>("list_iphone_media");
/** Thumbnails for iPhone item ids and the asset ids of clips. */
export const thumbnails = (ids: string[]) => invoke<Thumbnail[]>("thumbnails", { ids });
/** Picks about `targetSeconds` from `items`, with selfies and portraits
 * only if `people`; a verdict per usable item. */
export const aiSelect = (items: MediaItem[], targetSeconds: number, people: boolean) =>
  invoke<AiVerdict[]>("ai_select", { items, targetSeconds, people });
export const addIphoneClips = (ids: string[]) => invoke<Clip[]>("add_iphone_clips", { ids });
/** Videos, Live Photo pairs and folders on the Mac, oldest first. */
export const addFileClips = (paths: string[]) => invoke<AddedFiles>("add_file_clips", { paths });
/** The uncropped picture of `clip` at `at` seconds into its normalized file. */
export const cropFrame = (clip: Clip, at: number) => invoke<string>("crop_frame", { clip, at });

export const importMusic = (path: string) => invoke<string>("import_music", { path });

export const saveTitleImage = (png: Uint8Array) => invoke<string>("save_title_image", { png: Array.from(png) });
export const renderPreview = (project: Project) => invoke<string>("render_preview", { project });
export const exportVideo = (project: Project) => invoke<string>("export_video", { project });
export const cancelExport = () => invoke<void>("cancel_export");
/** What `exportVideo` rejects with after `cancelExport`. */
export const EXPORT_CANCELLED = "cancelled";

/** Share of the export done so far, 0 to 1. */
export function onExportProgress(handler: (progress: number) => void): Promise<UnlistenFn> {
  return listen<number>("export-progress", (event) => handler(event.payload));
}

export function onClipsProgress(handler: (progress: ClipsProgress) => void): Promise<UnlistenFn> {
  return listen<ClipsProgress>("clips-progress", (event) => handler(event.payload));
}

/** A local file as a URL the webview can load. */
export const fileUrl = (path: string) => convertFileSrc(path);
