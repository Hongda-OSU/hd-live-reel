// Edits to the open project. The reducer is the only place the project
// changes; App persists every new state.
import type { Audio, Clip, Filter, Project, Title, Transition } from "./api";

export type Action =
  | { type: "load"; project: Project }
  | { type: "rename"; name: string }
  | { type: "addClips"; clips: Clip[] }
  | { type: "moveClip"; from: number; to: number }
  | { type: "updateClip"; id: string; patch: Partial<Clip> }
  | { type: "removeClip"; id: string }
  | { type: "updateTitle"; patch: Partial<Title> }
  | { type: "updateFilter"; patch: Partial<Filter> }
  | { type: "updateAudio"; patch: Partial<Audio> }
  | { type: "updateTransition"; patch: Partial<Transition> };

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
    case "updateTitle":
      return { ...project, title: { ...project.title, ...action.patch } };
    case "updateFilter":
      return { ...project, filter: { ...project.filter, ...action.patch } };
    case "updateAudio":
      return { ...project, audio: { ...project.audio, ...action.patch } };
    case "updateTransition":
      return { ...project, transition: { ...project.transition, ...action.patch } };
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

export const totalLength = (project: Project) => clipSpans(project).reduce((sum, span) => sum + span, 0);

/** "IMG_2388" from "202609_a/IMG_2388.HEIC". */
export function clipLabel(clip: Clip): string {
  const name = (clip.assetId ?? clip.videoPath).split("/").pop() ?? "";
  return name.replace(/\.[^.]+$/, "");
}

/** Title fields that change the rendered PNG. */
export function titleImageKey(title: Title): string {
  const { text, subtitle, font, fontSize, color, position, lineGap, weight, textStyle } = title;
  return JSON.stringify({ text, subtitle, font, fontSize, color, position, lineGap, weight, textStyle });
}

/** "Elegy of Ashes" from "<cache>/music/Elegy of Ashes-<hash>.flac". */
export function musicName(path: string): string {
  const file = path.split("/").pop() ?? "";
  return file.replace(/-[0-9a-f]{16}\.flac$/, "");
}

export const hasTitleText = (title: Title) => title.text.trim() !== "" || title.subtitle.trim() !== "";

/** Everything that changes the rendered video; previews re-run when it does. */
export function renderKey(project: Project): string {
  const { clips, title, filter, audio, transition } = project;
  return JSON.stringify({
    clips: clips.map((c) => [c.normalizedPath, c.trimStart, c.trimEnd, c.muted]),
    title: hasTitleText(title) ? [title.textImage, title.showFor, title.fadeOut] : null,
    filter,
    audio,
    transition,
  });
}
