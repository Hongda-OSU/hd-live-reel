import { useEffect, useEffectEvent, useRef, useState, type RefObject, type SyntheticEvent } from "react";

export interface SeekTo {
  time: number;
  nonce: number;
  /** Only shows an edit there: playing then starts from the top. */
  peek?: boolean;
}

export interface Playback {
  /** For the preview's <video>. */
  video: RefObject<HTMLVideoElement | null>;
  /** Spread on the <video> to keep the state below current. */
  events: {
    onLoadedMetadata: (e: SyntheticEvent<HTMLVideoElement>) => void;
    onTimeUpdate: (e: SyntheticEvent<HTMLVideoElement>) => void;
    onPlay: () => void;
    onPause: () => void;
  };
  time: number;
  duration: number;
  playing: boolean;
  /** Play or pause; play starts from the top while parked on an edit. */
  toggle: () => void;
  /** Jumps to `time` seconds, as the viewer's own move. */
  seek: (time: number) => void;
}

/** WebKit's player, left paused for a while, can take a seek without
 * drawing the new frame (or without finishing it at all), though the
 * whole preview is loaded. If no frame reaches the screen within this
 * many ms, the video is reloaded and sent to the latest target. */
const SEEK_TIMEOUT = 700;

/** The preview's play state, shared by the stage that shows the video and
 * the timeline that controls it. `seekTo` jumps when it changes. */
export function usePlayback(seekTo: SeekTo | null): Playback {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  /** Set while parked on an edit; cleared by any seek of the viewer's own. */
  const rewind = useRef(false);
  /** Pending check on the first seek not yet finished, and where the
   * latest one is headed: clicks in a row do not restart the wait. */
  const stuckSeek = useRef<number | undefined>(undefined);
  const target = useRef(0);

  /** Moves the video to `to`, reloading it if no frame is drawn. */
  function jump(to: number) {
    const v = video.current;
    if (!v) return;
    target.current = to;
    if (Math.abs(v.currentTime - to) < 0.001 && !v.seeking) return;
    v.currentTime = to;
    v.requestVideoFrameCallback(() => {
      window.clearTimeout(stuckSeek.current);
      stuckSeek.current = undefined;
    });
    if (stuckSeek.current !== undefined) return;
    stuckSeek.current = window.setTimeout(() => {
      stuckSeek.current = undefined;
      if (v !== video.current) return;
      v.addEventListener("loadedmetadata", () => (v.currentTime = target.current), { once: true });
      v.load();
    }, SEEK_TIMEOUT);
  }

  function toggle() {
    const v = video.current;
    if (!v) return;
    if (!v.paused) return v.pause();
    if (rewind.current) v.currentTime = 0;
    rewind.current = false;
    void v.play();
  }

  function seek(to: number) {
    rewind.current = false;
    setTime(to);
    jump(to);
  }

  useEffect(() => {
    if (!seekTo) return;
    rewind.current = !!seekTo.peek;
    jump(seekTo.time);
  }, [seekTo]);

  // `timeupdate` comes four times a second; the playhead moves every frame.
  useEffect(() => {
    if (!playing) return;
    let frame = requestAnimationFrame(function tick() {
      if (video.current) setTime(video.current.currentTime);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    const typing = ["INPUT", "TEXTAREA"].includes((document.activeElement as HTMLElement)?.tagName);
    if (e.code === "Space" && !typing && video.current) {
      e.preventDefault();
      toggle();
    }
  });
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return {
    video,
    events: {
      // A new preview waits, paused at the start (or where a seek made
      // while it loaded put it). The replaced <video> fired no pause
      // event, so reset the state here.
      onLoadedMetadata: (e) => {
        setDuration(e.currentTarget.duration);
        setTime(e.currentTarget.currentTime);
        setPlaying(false);
      },
      onTimeUpdate: (e) => setTime(e.currentTarget.currentTime),
      onPlay: () => setPlaying(true),
      onPause: () => setPlaying(false),
    },
    time,
    duration,
    playing,
    toggle,
    seek,
  };
}
