// Typed wrappers around the Rust commands in src-tauri/src/lib.rs.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type MediaKind = "photo" | "video" | "livePhoto";

export interface FileRef {
  id: string;
  name: string;
  size: number;
}

export interface MediaItem {
  /** "<device folder>/<file name>" */
  id: string;
  kind: MediaKind;
  name: string;
  size: number;
  /** ISO 8601, UTC */
  createdAt?: string | null;
  /** The paired video of a Live Photo. */
  video?: FileRef | null;
}

export interface Progress {
  stage: "downloading" | "normalizing" | "composing";
  done: number;
  total: number;
}

export function listIphoneMedia(): Promise<MediaItem[]> {
  return invoke("list_iphone_media");
}

/** Resolves to a URL the <video> element can play. */
export async function makePreview(ids: string[]): Promise<string> {
  const path = await invoke<string>("make_preview", { ids });
  // The file is rewritten in place; bust the webview cache.
  return `${convertFileSrc(path)}?t=${Date.now()}`;
}

export function onPreviewProgress(handler: (progress: Progress) => void): Promise<UnlistenFn> {
  return listen<Progress>("preview-progress", (event) => handler(event.payload));
}
