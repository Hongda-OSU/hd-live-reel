// Groups picker items into days and, within a day, scenes: runs of
// pictures with no gap longer than SCENE_GAP_MS. AI selection splits what
// it is given by the same gap (`SCENE_GAP` in src-tauri/src/select.rs).
import type { MediaItem } from "./api";

export const SCENE_GAP_MS = 30 * 60 * 1000;

export interface Scene {
  /** Id of its newest item; stable while the library is. */
  key: string;
  /** Newest first, as the picker shows them. */
  items: MediaItem[];
}

export interface Day {
  label: string;
  scenes: Scene[];
}

/** `items` newest first; `dayLabel` names the day an item belongs to. */
export function groupDays(items: MediaItem[], dayLabel: (item: MediaItem) => string): Day[] {
  const days: Day[] = [];
  let previous: MediaItem | null = null;
  for (const item of items) {
    const label = dayLabel(item);
    let day = days[days.length - 1];
    if (day?.label !== label) {
      day = { label, scenes: [] };
      days.push(day);
    }
    const gap = previous ? time(previous) - time(item) : Infinity;
    const scene = day.scenes[day.scenes.length - 1];
    if (scene && gap <= SCENE_GAP_MS) scene.items.push(item);
    else day.scenes.push({ key: item.id, items: [item] });
    previous = item;
  }
  return days;
}

const time = (item: MediaItem) => (item.createdAt ? Date.parse(item.createdAt) : NaN);

const clock = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

/** "10:14–11:19", or one time for a single moment. */
export function sceneLabel(scene: Scene): string {
  const newest = scene.items[0]?.createdAt;
  const oldest = scene.items[scene.items.length - 1]?.createdAt;
  if (!newest || !oldest) return "时间未知";
  const [from, to] = [clock.format(new Date(oldest)), clock.format(new Date(newest))];
  return from === to ? from : `${from}–${to}`;
}
