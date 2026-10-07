import type { Title, TitlePosition } from "../api";
import type { Action } from "../project";

interface Props {
  title: Title;
  dispatch: (action: Action) => void;
}

/** Fade used by the "淡出" choice, in seconds. */
const FADE = 0.3;

function Seg<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: [T, string][];
  value: T;
  onChange?: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={String(v)} className={v === value ? "on" : ""} disabled={disabled} onClick={() => onChange?.(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Inspector({ title, dispatch }: Props) {
  const set = (patch: Partial<Title>) => dispatch({ type: "updateTitle", patch });

  return (
    <aside className="inspector">
      <div className="group">
        <h3>标题</h3>
        <label className="field">
          <span>主标题</span>
          <input
            className="text-input"
            value={title.text}
            placeholder="留空则不显示标题"
            onChange={(e) => set({ text: e.target.value })}
          />
        </label>
        <label className="field">
          <span>副标题</span>
          <input className="text-input" value={title.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
        </label>
        <div className="field">
          <span>显示时长</span>
          <div className="inline">
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.1}
              value={title.showFor}
              onChange={(e) => {
                const showFor = Number(e.target.value);
                set({ showFor, fadeOut: Math.min(title.fadeOut, showFor) });
              }}
            />
            <span className="val">{title.showFor.toFixed(1)} 秒</span>
          </div>
        </div>
        <div className="field">
          <span>消失方式</span>
          <Seg
            options={[
              [0, "直接消失"],
              [FADE, "淡出"],
            ]}
            value={title.fadeOut > 0 ? FADE : 0}
            onChange={(fadeOut) => set({ fadeOut: Math.min(fadeOut, title.showFor) })}
          />
        </div>
        <div className="field">
          <span>位置</span>
          <Seg<TitlePosition>
            options={[
              ["top", "上"],
              ["center", "中"],
              ["bottom", "下"],
            ]}
            value={title.position}
            onChange={(position) => set({ position })}
          />
        </div>
        <div className="field">
          <span>字号</span>
          <div className="inline">
            <input
              type="range"
              min={40}
              max={140}
              step={2}
              value={title.fontSize}
              onChange={(e) => set({ fontSize: Number(e.target.value) })}
            />
            <span className="val">{title.fontSize}</span>
          </div>
        </div>
      </div>

      <div className="group disabled">
        <h3>
          声音 <span className="soon">即将支持</span>
        </h3>
        <Seg
          options={[
            ["original", "原声"],
            ["music", "配乐"],
            ["mix", "配乐 + 原声"],
          ]}
          value="original"
          disabled
        />
        <p className="note">每段已自动拉齐响度，接缝处不爆音。</p>
      </div>

      <div className="group disabled">
        <h3>
          滤镜 <span className="soon">即将支持</span>
        </h3>
        <Seg
          options={[
            ["none", "原片"],
            ["forest", "林间"],
            ["river", "水色"],
            ["golden", "暖阳"],
          ]}
          value="none"
          disabled
        />
      </div>

      <div className="group disabled">
        <h3>
          画幅 <span className="soon">即将支持</span>
        </h3>
        <div className="field">
          <Seg
            options={[
              ["9:16", "9:16 竖屏"],
              ["16:9", "16:9 横屏"],
            ]}
            value="9:16"
            disabled
          />
        </div>
        <div className="field">
          <span>转场</span>
          <Seg
            options={[
              ["none", "硬切"],
              ["fade", "淡入淡出"],
            ]}
            value="none"
            disabled
          />
        </div>
      </div>
    </aside>
  );
}
