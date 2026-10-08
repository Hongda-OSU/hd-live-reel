// What is on the connected iPhone, plus thumbnails as they arrive. Kept
// above the picker so reopening it is instant.
import { useCallback, useRef, useState } from "react";
import { fileUrl, iphoneThumbnails, listIphoneMedia, type MediaItem } from "./api";

export type Library =
  { state: "idle" | "loading" } | { state: "error"; message: string } | { state: "ready"; items: MediaItem[] };

/** Thumbnails requested per helper call; the phone answers ~40 ms each. */
const BATCH = 100;

export function useLibrary() {
  const [library, setLibrary] = useState<Library>({ state: "idle" });
  /** Asset id → URL of its thumbnail. */
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const requested = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    setLibrary({ state: "loading" });
    try {
      setLibrary({ state: "ready", items: await listIphoneMedia() });
    } catch (e) {
      setLibrary({ state: "error", message: String(e) });
    }
  }, []);

  /** Fetches thumbnails for `ids` in order, a batch at a time. */
  const loadThumbs = useCallback(async (ids: string[]) => {
    const todo = ids.filter((id) => !requested.current.has(id));
    todo.forEach((id) => requested.current.add(id));
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      try {
        const results = await iphoneThumbnails(batch);
        setThumbs((current) => {
          const next = { ...current };
          for (const t of results) if (t.path) next[t.id] = fileUrl(t.path);
          return next;
        });
      } catch {
        // Phone gone or locked: allow a later retry.
        batch.forEach((id) => requested.current.delete(id));
        return;
      }
    }
  }, []);

  return { library, thumbs, refresh, loadThumbs };
}
