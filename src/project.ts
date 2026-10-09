// Edits to the open project. The reducer is the only place the project
// changes; App persists every new state.
import type { Audio, Clip, Filter, Output, Project, Title, Transition } from "./api";

type Aspect = Output["aspect"];

export type Action =
  | { type: "load"; project: Project }
  | { type: "rename"; name: string }
  | { type: "addClips"; clips: Clip[] }
  | { type: "moveClip"; from: number; to: number }
  | { type: "updateClip"; id: string; patch: Partial<Clip> }
  | { type: "removeClip"; id: string }
  | { type: "clearClips" }
  | { type: "updateTitle"; patch: Partial<Title> }
  | { type: "updateFilter"; patch: Partial<Filter> }
  | { type: "updateAudio"; patch: Partial<Audio> }
  | { type: "updateTransition"; patch: Partial<Transition> }
  | { type: "updateOutput"; patch: Partial<Output> };

export function reducer(project: Project | null, action: Action): Project | null {
  if (action.type === "load") return action.project;
  if (!project) return project;
  switch (action.type) {
    case "rename":
      return { ...project, name: action.name };
    case "addClips":
      return { ...project, clips: [...project.clips, ...action.clips] };
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
    case "removeClip":
      return { ...project, clips: project.clips.filter((clip) => clip.id !== action.id) };
    case "clearClips":
      return { ...project, clips: [] };
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
  }
}

export const clipLength = (clip: Clip) => clip.trimEnd - clip.trimStart;

const FPS = 30;

/** Seconds each join cross-dissolves over, computed as the Rust side does:
 * whole frames, at most half the shortest clip. */
export function crossfade(project: Project): number {
  const { clips, transition } = project;
  if (transition.type !== "fade" || clips.length < 2 || transition.duration <= 0) return 0;
  const shortest = Math.min(...clips.map(clipLength));
  return Math.floor(Math.min(transition.duration, shortest / 2) * FPS + 1e-6) / FPS;
}

/** How long each clip holds the joined timeline; a dissolve is split
 * between the two clips it joins, so the boundary sits at its middle. */
export function clipSpans(project: Project): number[] {
  const overlap = crossfade(project);
  const last = project.clips.length - 1;
  return project.clips.map((clip, i) => clipLength(clip) - (i > 0 ? overlap / 2 : 0) - (i < last ? overlap / 2 : 0));
}

/** Where `id` is fully on screen: its start, past the dissolve into it. */
export function clipStart(project: Project, id: string): number {
  const index = project.clips.findIndex((c) => c.id === id);
  const spanStart = clipSpans(project)
    .slice(0, index)
    .reduce((sum, span) => sum + span, 0);
  const settled = index > 0 ? crossfade(project) / 2 : 0;
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

/** Everything that changes the rendered video; previews re-run when it does. */
export function renderKey(project: Project): string {
  const { clips, title, filter, audio, transition, output } = project;
  return JSON.stringify({
    clips: clips.map((c) => [c.normalizedPath, c.trimStart, c.trimEnd, c.muted, c.cropOffset]),
    frame: [output.aspect, output.fill],
    title: hasTitleText(title) ? [title.textImage, title.showFor, title.fadeOut] : null,
    filter,
    audio,
    transition,
  });
}
