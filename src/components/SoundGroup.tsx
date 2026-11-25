import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import * as stylex from "@stylexjs/stylex";
import { importMusic, type Audio } from "../api";
import { musicName, type Action } from "../project";
import { colors } from "../tokens.stylex";
import { Button, Field, Group, Icon, Slider, Switch, ui } from "../ui";

const AUDIO_EXTENSIONS = ["mp3", "m4a", "aac", "wav", "aif", "aiff", "flac", "ogg"];

const styles = stylex.create({
  // The song's name with a note before it and 更换… at the right.
  track: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  song: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    flexGrow: 1,
    color: colors.muted,
  },
  name: {
    minWidth: 0,
    overflow: "hidden",
    color: colors.text,
    fontSize: 12,
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  none: {
    color: colors.muted,
  },
});

const percent = (gain: number) => `${Math.round(gain * 100)}%`;

interface Props {
  audio: Audio;
  dispatch: (action: Action) => void;
}

/** The 声音 page: the clips' own sound, always there with a volume (0
 * mutes it), and music switched on or off over it. Stored as `mode`:
 * music off is `original`, on is `mix`. The older music-only `music`
 * mode shows as the clips' sound at 0 and becomes `mix` once moved. */
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

  const music = audio.mode !== "original";
  const clips = audio.mode === "music" ? 0 : audio.originalVolume;
  const track = audio.musicPath ? musicName(audio.musicPath) : null;
  return (
    <>
      <Group title="原声">
        <Field label="音量">
          <Slider
            min={0}
            max={2}
            step={0.05}
            value={clips}
            shown={percent(clips)}
            onChange={(originalVolume) => set({ originalVolume, mode: music ? "mix" : "original" })}
          />
        </Field>
      </Group>
      <Group
        title="配乐"
        action={<Switch on={music} label="配乐" onToggle={() => set({ mode: music ? "original" : "mix" })} />}
      >
        {music && (
          <>
            <Field label="音乐">
              <div {...stylex.props(styles.track)}>
                <span title={track ?? undefined} {...stylex.props(styles.song)}>
                  <Icon>
                    <path d="M6 12.5V4l7-1.5V11" />
                    <circle cx="4.5" cy="12.5" r="1.5" />
                    <circle cx="11.5" cy="11" r="1.5" />
                  </Icon>
                  <span {...stylex.props(styles.name, !track && !importing && styles.none)}>
                    {importing ? "正在导入…" : (track ?? "还没选")}
                  </span>
                </span>
                <Button variant="link" disabled={importing} onClick={chooseMusic}>
                  {audio.musicPath ? "更换…" : "选择…"}
                </Button>
              </div>
            </Field>
            <Field label="音量">
              <Slider
                min={0}
                max={2}
                step={0.05}
                value={audio.musicVolume}
                shown={percent(audio.musicVolume)}
                onChange={(musicVolume) => set({ musicVolume })}
              />
            </Field>
            {error && <p {...stylex.props(ui.error)}>{error}</p>}
            {!audio.musicPath && !importing && <p {...stylex.props(ui.note)}>还没选音乐，现在播放的仍是原声。</p>}
          </>
        )}
      </Group>
    </>
  );
}
