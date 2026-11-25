// Edits to the open project. The reducer is the only place the project
// changes; App persists every new state.
import type { Audio, Caption, Clip, ClipsProgress, Filter, Output, Project, Title, Transition, Watermark } from "./api";

type Aspect = Output["aspect"];

export type Action =
  | { type: "load"; project: Project }
  | { type: "rename"; name: string }
  /** New clips go after clip `after`, or at the end without it. */
  | { type: "addClips"; clips: Clip[]; after?: string | null }
  | { type: "moveClip"; from: number; to: number }
  | { type: "updateClip"; id: string; patch: Partial<Clip> }
  | { type: "removeClip"; id: string }
  /** Only the PNG, so text typed while it rendered is kept. */
  | { type: "setCaptionImage"; id: string; image: string }
  | { type: "updateTitle"; patch: Partial<Title> }
  | { type: "updateFilter"; patch: Partial<Filter> }
  | { type: "updateAudio"; patch: Partial<Audio> }
  | { type: "updateTransition"; patch: Partial<Transition> }
  | { type: "updateOutput"; patch: Partial<Output> }
  | { type: "updateWatermark"; patch: Partial<Watermark> }
  /** The settings panel back to a new project's, keeping what was chosen
   * rather than tuned: title and watermark text, music track and export
   * folder. */
  | { type: "replaceClip"; id: string; clip: Clip }
  | { type: "resetSettings"; defaults: Project };

export function reducer(project: Project | null, action: Action): Project | null {
  if (action.type === "load") return action.project;
  if (!project) return project;
  switch (action.type) {
    case "rename":
      return { ...project, name: action.name };
    case "addClips": {
      // A lost clip added again takes its old place and keeps its edits.
      const fresh = [...action.clips];
      const clips = project.clips.map((clip) => {
        const i = isMissing(clip) ? fresh.findIndex((c) => c.assetId && c.assetId === clip.assetId) : -1;
        if (i === -1) return clip;
        const [found] = fresh.splice(i, 1);
        const trimEnd = Math.min(clip.trimEnd, found.duration);
        const { id, cropOffset, caption } = clip;
        return { ...found, id, cropOffset, caption, trimStart: Math.min(clip.trimStart, trimEnd), trimEnd };
      });
      const at = action.after ? clips.findIndex((clip) => clip.id === action.after) : -1;
      if (at === -1) return { ...project, clips: [...clips, ...fresh] };
      return { ...project, clips: [...clips.slice(0, at + 1), ...fresh, ...clips.slice(at + 1)] };
    }
    case "replaceClip":
      // The new picture takes the old one's place and caption; its trim
      // and crop start over, since what they framed is gone.
      return {
        ...project,
        clips: project.clips.map((clip) =>
          clip.id === action.id ? { ...action.clip, id: clip.id, caption: clip.caption } : clip,
        ),
      };
    case "moveClip": {
      const clips = [...project.clips];
      const [moved] = clips.splice(action.from, 1);
      clips.splice(action.to, 0, moved);
      return { ...project, clips };
    }
    case "updateClip":
      return {
        ...project,
        clips: project.clips.map((clip) => (clip.id === action.id ? { ...clip, ...action.patch } : clip)),
      };
    case "setCaptionImage":
      return {
        ...project,
        clips: project.clips.map((clip) =>
          clip.id === action.id && clip.caption ? { ...clip, caption: { ...clip.caption, image: action.image } } : clip,
        ),
      };
    case "removeClip":
      return { ...project, clips: project.clips.filter((clip) => clip.id !== action.id) };
    case "updateTitle":
      return { ...project, title: { ...project.title, ...action.patch } };
    case "updateFilter":
      return { ...project, filter: { ...project.filter, ...action.patch } };
    case "updateAudio":
      return { ...project, audio: { ...project.audio, ...action.patch } };
    case "updateTransition":
      return { ...project, transition: { ...project.transition, ...action.patch } };
    case "updateOutput":
      return { ...project, output: { ...project.output, ...action.patch } };
    case "updateWatermark":
      return { ...project, watermark: { ...project.watermark, ...action.patch } };
    case "resetSettings": {
      const { title, audio, filter, transition, output, watermark } = action.defaults;
      const { text, subtitle, textImage } = project.title;
      return {
        ...project,
        title: { ...title, text, subtitle, textImage },
        audio: { ...audio, musicPath: project.audio.musicPath },
        filter,
        transition,
        output: { ...output, folder: project.output.folder },
        watermark: { ...watermark, text: project.watermark.text, image: project.watermark.image },
      };
    }
  }
}

export const clipLength = (clip: Clip) => clip.trimEnd - clip.trimStart;

/** Its original went too when macOS cleared the cache; `load_project`
 * clears the intermediate's path then. */
export const isMissing = (clip: Clip) => !clip.normalizedPath;

/** The project as the preview plays it, lost clips left out. Export
 * refuses them instead, so a reel never goes out a clip short. */
export function playable(project: Project): Project {
  const clips = project.clips.filter((clip) => !isMissing(clip));
  return clips.length === project.clips.length ? project : { ...project, clips };
}

/** "第 3 段" for one lost clip, "2 段" for several; null for none. */
export function missingLabel(clips: Clip[]): string | null {
  const lost = clips.flatMap((clip, i) => (isMissing(clip) ? [i + 1] : []));
  if (lost.length === 0) return null;
  return lost.length === 1 ? `第 ${lost[0]} 段` : `${lost.length} 段`;
}

/** Output frame in pixels, matching `Shape::size` in Rust. The short side
 * is always 1080, so text sized for it looks the same in every shape. */
export const FRAME: Record<Aspect, [number, number]> = {
  "9:16": [1080, 1920],
  "3:4": [1080, 1440],
  "1:1": [1080, 1080],
  "16:9": [1920, 1080],
};

/** Shortest a trimmed clip may get, in seconds. */
export const MIN_CLIP_LENGTH = 0.5;

/** Moves one end of `clip`'s trim to `t`, to the nearest 0.1 s, keeping
 * at least `MIN_CLIP_LENGTH` between the ends. */
export function trimPatch(clip: Clip, edge: "start" | "end", t: number): Partial<Clip> {
  const rounded = Math.round(t * 10) / 10;
  return edge === "start"
    ? { trimStart: Math.max(0, Math.min(rounded, clip.trimEnd - MIN_CLIP_LENGTH)) }
    : { trimEnd: Math.min(clip.duration, Math.max(rounded, clip.trimStart + MIN_CLIP_LENGTH)) };
}

/** "1:02.5" */
export const formatTime = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

/** Reads "1:02.5" or "62.5" as seconds; null if it is neither. */
export function parseTime(text: string): number | null {
  const match = /^\s*(?:(\d+):)?(\d+(?:\.\d*)?)\s*$/.exec(text);
  if (!match) return null;
  const seconds = Number(match[2]);
  if (match[1] !== undefined && seconds >= 60) return null;
  return Number(match[1] ?? 0) * 60 + seconds;
}

const FPS = 30;
/** Least a clip shows whole between its joins, and the shortest join
 * that isn't a cut; `CLEAR` and `SHORTEST_JOIN` in compose.rs. */
const CLEAR = 0.8;
const SHORTEST_JOIN = 0.1;

/** Seconds each join overlaps its two clips, as `Composition::joins` in
 * Rust: the transition's length, cut down so each clip keeps `CLEAR`
 * whole, in whole frames; under `SHORTEST_JOIN` it is a cut. */
export function joins(project: Project): number[] {
  const { clips, transition } = project;
  if (transition.type === "none" || transition.duration <= 0) return clips.slice(1).map(() => 0);
  const room = (clip: Clip) => Math.max(0, (clipLength(clip) - CLEAR) / 2);
  return clips.slice(1).map((clip, i) => {
    const join = Math.floor(Math.min(transition.duration, room(clips[i]), room(clip)) * FPS + 1e-6) / FPS;
    return join < SHORTEST_JOIN ? 0 : join;
  });
}

/** How long each clip holds the joined timeline; a join is split between
 * the two clips it joins, so the boundary sits at its middle. */
export function clipSpans(project: Project): number[] {
  const overlaps = joins(project);
  return project.clips.map((clip, i) => clipLength(clip) - (i > 0 ? overlaps[i - 1] / 2 : 0) - (overlaps[i] ?? 0) / 2);
}

/** Where `id` is fully on screen: its start, past the join into it. */
export function clipStart(project: Project, id: string): number {
  const index = project.clips.findIndex((c) => c.id === id);
  const spanStart = clipSpans(project)
    .slice(0, index)
    .reduce((sum, span) => sum + span, 0);
  const settled = index > 0 ? joins(project)[index - 1] / 2 : 0;
  return spanStart + settled + 0.01;
}

export const totalLength = (project: Project) => clipSpans(project).reduce((sum, span) => sum + span, 0);

/** "IMG_2388" from "202609_a/IMG_2388.HEIC". */
export function clipLabel(clip: Clip): string {
  const name = (clip.assetId ?? clip.videoPath).split("/").pop() ?? "";
  return name.replace(/\.[^.]+$/, "");
}

/** Title fields, and the frame shape, that change the rendered PNG. */
export function titleImageKey(title: Title, aspect: Aspect): string {
  const { text, subtitle, font, fontSize, color, position, lineGap, weight, textStyle } = title;
  return JSON.stringify({ text, subtitle, font, fontSize, color, position, lineGap, weight, textStyle, aspect });
}

/** Shown in place of an empty project name, and used as the file name. */
export const UNTITLED = "Untitled";

/** "影片 › HD Live Reel" for the default, else the folder's last two
 * levels, like "Desktop › Trips". */
export function folderLabel(folder?: string | null): string {
  if (!folder) return "影片 › HD Live Reel";
  return folder.split("/").filter(Boolean).slice(-2).join(" › ");
}

/** "Elegy of Ashes" from "<cache>/music/Elegy of Ashes-<hash>.flac". */
export function musicName(path: string): string {
  const file = path.split("/").pop() ?? "";
  return file.replace(/-[0-9a-f]{16}\.flac$/, "");
}

export const hasTitleText = (title: Title) => title.text.trim() !== "" || title.subtitle.trim() !== "";

/** A caption before any text is typed. */
export const NEW_CAPTION: Caption = { text: "", position: "bottom", showFor: null };
/** The "first seconds" choice for how long a caption shows. */
export const CAPTION_FIRST_SECONDS = 1.5;

export const hasCaption = (clip: Clip) => !!clip.caption?.text.trim();

/** Caption fields, the title's look and the frame shape: what changes a
 * caption's rendered PNG. */
export function captionImageKey(caption: Caption, title: Title, aspect: Aspect): string {
  const { font, fontSize, color, weight, textStyle } = title;
  return JSON.stringify({
    text: caption.text.trim(),
    position: caption.position,
    font,
    fontSize,
    color,
    weight,
    textStyle,
    aspect,
  });
}

export const hasWatermark = (watermark: Watermark) => watermark.text.trim() !== "";

/** Watermark fields, and the frame shape, that change its rendered PNG. */
export function watermarkImageKey(watermark: Watermark, aspect: Aspect): string {
  const { position, size, style } = watermark;
  return JSON.stringify({ text: watermark.text.trim(), position, size, style, aspect });
}

/** Everything that changes the rendered video; previews re-run when it does. */
export function renderKey(project: Project): string {
  const { clips, title, filter, audio, transition, output, watermark } = project;
  return JSON.stringify({
    clips: clips.map((c) => [
      c.normalizedPath,
      c.trimStart,
      c.trimEnd,
      c.cropOffset,
      hasCaption(c) ? [c.caption!.image, c.caption!.showFor] : null,
    ]),
    frame: [output.aspect, output.fill],
    title: hasTitleText(title) ? [title.textImage, title.showFor, title.fadeOut] : null,
    watermark: hasWatermark(watermark) ? [watermark.image, watermark.opacity] : null,
    filter,
    audio,
    transition,
  });
}

/** "正在处理第 2 / 9 段… 40%"; the percentage only once there is one. */
export function normalizingLabel({ done, total, current }: ClipsProgress): string {
  const share = current > 0 ? ` ${Math.round(current * 100)}%` : "";
  return `正在处理第 ${done + 1} / ${total} 段…${share}`;
}
