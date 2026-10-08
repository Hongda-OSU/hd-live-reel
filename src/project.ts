// Edits to the open project. The reducer is the only place the project
// changes; App persists every new state.
import type { Clip, Project, Title } from "./api";

export type Action =
  | { type: "load"; project: Project }
  | { type: "rename"; name: string }
  | { type: "addClips"; clips: Clip[] }
  | { type: "moveClip"; from: number; to: number }
  | { type: "updateClip"; id: string; patch: Partial<Clip> }
  | { type: "removeClip"; id: string }
  | { type: "updateTitle"; patch: Partial<Title> };

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
  }
}

export const clipLength = (clip: Clip) => clip.trimEnd - clip.trimStart;

export const totalLength = (project: Project) => project.clips.reduce((sum, clip) => sum + clipLength(clip), 0);

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

export const hasTitleText = (title: Title) => title.text.trim() !== "" || title.subtitle.trim() !== "";

/** Everything that changes the rendered video; previews re-run when it does. */
export function renderKey(project: Project): string {
  const { clips, title } = project;
  return JSON.stringify({
    clips: clips.map((c) => [c.normalizedPath, c.trimStart, c.trimEnd, c.muted]),
    title: hasTitleText(title) ? [title.textImage, title.showFor, title.fadeOut] : null,
  });
}
