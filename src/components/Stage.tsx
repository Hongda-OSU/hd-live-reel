import { useEffect, useRef, useState } from "react";

interface Props {
  /** Playable URL of the latest preview, or null before the first one. */
  src: string | null;
  /** Clip lengths in order, for the boundary ticks under the scrubber. */
  lengths: number[];
  /** Seconds to jump to; changes when a clip is picked in the list. */
  seekTo: { time: number; nonce: number } | null;
  busy: boolean;
  error: string | null;
  empty: boolean;
  onAdd: () => void;
}

const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

export function Stage({ src, lengths, seekTo, busy, error, empty, onAdd }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Keep the playhead where it was when a new preview replaces the old one.
  const resumeAt = useRef(0);
  useEffect(() => {
    resumeAt.current = video.current?.currentTime ?? 0;
  }, [src]);

  useEffect(() => {
    if (seekTo && video.current) video.current.currentTime = seekTo.time;
  }, [seekTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ["INPUT", "TEXTAREA"].includes((document.activeElement as HTMLElement)?.tagName);
      if (e.code === "Space" && !typing && video.current) {
        e.preventDefault();
        if (video.current.paused) video.current.play();
        else video.current.pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const total = lengths.reduce((a, b) => a + b, 0);
  let acc = 0;
  const ticks = lengths.slice(0, -1).map((len) => (acc += len) / total);

  return (
    <section className="stage-area">
      <div className="stage-wrap">
        <div className="stage">
          {src && (
            <video
              ref={video}
              key={src}
              src={src}
              playsInline
              onLoadedMetadata={(e) => {
                setDuration(e.currentTarget.duration);
                e.currentTarget.currentTime = Math.min(resumeAt.current, e.currentTarget.duration);
              }}
              onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onClick={(e) => (e.currentTarget.paused ? e.currentTarget.play() : e.currentTarget.pause())}
            />
          )}
          {empty && (
            <div className="stage-empty">
              <p>预览会显示在这里</p>
              <button className="btn primary" onClick={onAdd}>
                添加照片
              </button>
            </div>
          )}
          {busy && <div className="stage-busy">正在更新预览…</div>}
          {error && !busy && <div className="stage-error">{error}</div>}
        </div>
      </div>
      <div className="transport">
        <button
          className="round"
          aria-label={playing ? "暂停" : "播放"}
          disabled={!src}
          onClick={() => (video.current?.paused ? video.current.play() : video.current?.pause())}
        >
          {playing ? (
            <svg className="icon" viewBox="0 0 16 16">
              <path d="M5 3.5v9M11 3.5v9" strokeWidth="2.2" />
            </svg>
          ) : (
            <svg className="icon" viewBox="0 0 16 16">
              <path d="M5 3.5v9l7-4.5z" fill="currentColor" stroke="none" />
            </svg>
          )}
        </button>
        <span className="time">
          {fmt(time)} / {fmt(duration || total)}
        </span>
        <div className="scrub">
          <div className="ticks">
            {ticks.map((t, i) => (
              <i key={i} style={{ left: `${t * 100}%` }} />
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.01}
            value={time}
            disabled={!src}
            onChange={(e) => {
              if (video.current) video.current.currentTime = Number(e.target.value);
            }}
          />
        </div>
        <span className="quality">低清预览 · 与导出同一处理链</span>
      </div>
    </section>
  );
}
