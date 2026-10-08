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

export interface Project {
  version: number;
  name: string;
  clips: Clip[];
  title: Title;
  filter: Filter;
  audio: Audio;
  transition: { type: "none" | "fade"; duration: number };
  selection: { mode: "manual" | "ai"; targetSeconds: number };
  output: { aspect: "9:16" | "16:9"; fill: "crop" | "black" | "blur"; height: number };
}

export interface ClipsProgress {
  stage: "downloading" | "normalizing";
  done: number;
  total: number;
}

// ---------- commands ----------

export const loadProject = () => invoke<Project>("load_project");
export const saveProject = (project: Project) => invoke<void>("save_project", { project });

export const listIphoneMedia = () => invoke<MediaItem[]>("list_iphone_media");
export const iphoneThumbnails = (ids: string[]) => invoke<Thumbnail[]>("iphone_thumbnails", { ids });
export const addIphoneClips = (ids: string[]) => invoke<Clip[]>("add_iphone_clips", { ids });
export const cropClip = (clip: Clip, cropOffset: number) => invoke<Clip>("crop_clip", { clip, cropOffset });
export const cropFrame = (clip: Clip) => invoke<string>("crop_frame", { clip });

export const importMusic = (path: string) => invoke<string>("import_music", { path });

export const saveTitleImage = (png: Uint8Array) => invoke<string>("save_title_image", { png: Array.from(png) });
export const renderPreview = (project: Project) => invoke<string>("render_preview", { project });
export const exportVideo = (project: Project) => invoke<string>("export_video", { project });

export function onClipsProgress(handler: (progress: ClipsProgress) => void): Promise<UnlistenFn> {
  return listen<ClipsProgress>("clips-progress", (event) => handler(event.payload));
}

/** A local file as a URL the webview can load. */
export const fileUrl = (path: string) => convertFileSrc(path);
