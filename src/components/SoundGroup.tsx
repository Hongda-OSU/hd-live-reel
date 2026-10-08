import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import * as stylex from "@stylexjs/stylex";
import { importMusic, type Audio } from "../api";
import { musicName, type Action } from "../project";
import { Button, Field, Group, Seg, Slider, ui } from "../ui";

const AUDIO_EXTENSIONS = ["mp3", "m4a", "aac", "wav", "aif", "aiff", "flac", "ogg"];

const styles = stylex.create({
  track: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 12,
  },
});

const NOTES: Record<Audio["mode"], string> = {
  original: "每段已自动拉齐响度，接缝处不爆音。",
  music: "配乐自动裁到视频长度，结尾 2 秒淡出；比视频短会循环。",
  mix: "配乐为主，原声压低保留。",
};

const percent = (gain: number) => `${Math.round(gain * 100)}%`;

interface Props {
  audio: Audio;
  dispatch: (action: Action) => void;
}

/** Original sound, music, or both, with the music file picker. */
export function SoundGroup({ audio, dispatch }: Props) {
  const set = (patch: Partial<Audio>) => dispatch({ type: "updateAudio", patch });
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function chooseMusic() {
    const picked = await open({ multiple: false, filters: [{ name: "音乐", extensions: AUDIO_EXTENSIONS }] });
    if (!picked) return;
    setImporting(true);
    setError(null);
    try {
      set({ musicPath: await importMusic(picked) });
    } catch (e) {
      setError(String(e));
    } finally {
      setImporting(false);
    }
  }

  const withMusic = audio.mode !== "original";
  return (
    <Group title="声音">
      <Field>
        <Seg<Audio["mode"]>
          options={[
            ["original", "原声"],
            ["music", "配乐"],
            ["mix", "配乐 + 原声"],
          ]}
          value={audio.mode}
          onChange={(mode) => set({ mode })}
        />
      </Field>
      {withMusic && (
        <Field label="配乐">
          <div {...stylex.props(ui.inline)}>
            <span {...stylex.props(styles.track, ui.spacer)}>
              {importing ? "正在导入…" : audio.musicPath ? musicName(audio.musicPath) : "还没选音乐"}
            </span>
            <Button disabled={importing} onClick={chooseMusic}>
              {audio.musicPath ? "更换…" : "选择音乐…"}
            </Button>
          </div>
        </Field>
      )}
      {withMusic && (
        <Field label="配乐音量">
          <Slider
            min={0}
            max={2}
            step={0.05}
            value={audio.musicVolume}
            shown={percent(audio.musicVolume)}
            onChange={(musicVolume) => set({ musicVolume })}
          />
        </Field>
      )}
      {audio.mode === "mix" && (
        <Field label="原声音量">
          <Slider
            min={0}
            max={2}
            step={0.05}
            value={audio.originalVolume}
            shown={percent(audio.originalVolume)}
            onChange={(originalVolume) => set({ originalVolume })}
          />
        </Field>
      )}
      {error && <p {...stylex.props(ui.error)}>{error}</p>}
      <p {...stylex.props(ui.note)}>
        {withMusic && !audio.musicPath ? "还没选音乐，现在播放的仍是原声。" : NOTES[audio.mode]}
      </p>
    </Group>
  );
}
