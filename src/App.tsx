import { useEffect, useMemo, useState } from "react";
import { listIphoneMedia, makePreview, onPreviewProgress, type MediaItem, type Progress } from "./api";
import "./App.css";

type Phone =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; items: MediaItem[] };

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function progressLabel({ stage, done, total }: Progress): string {
  switch (stage) {
    case "downloading":
      return `Copying ${total} from iPhone…`;
    case "normalizing":
      return `Preparing clip ${done + 1} of ${total}…`;
    case "composing":
      return "Building preview…";
  }
}

function App() {
  const [phone, setPhone] = useState<Phone>({ state: "loading" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadPhone() {
    setPhone({ state: "loading" });
    try {
      setPhone({ state: "ready", items: await listIphoneMedia() });
    } catch (e) {
      setPhone({ state: "error", message: String(e) });
    }
  }

  useEffect(() => {
    loadPhone();
    const unlisten = onPreviewProgress(setProgress);
    return () => {
      unlisten.then((stop) => stop());
    };
  }, []);

  // Still photos have no motion to stitch.
  const usable = useMemo(
    () => (phone.state === "ready" ? phone.items.filter((item) => item.kind !== "photo") : []),
    [phone],
  );

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function generate() {
    // Default order is capture time, oldest first.
    const ids = usable
      .filter((item) => selected.has(item.id))
      .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))
      .map((item) => item.id);
    setBusy(true);
    setError(null);
    try {
      setPreviewUrl(await makePreview(ids));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <div className="app">
      <header className="toolbar">
        <h1>HD Live Reel</h1>
        <span className="count">
          {selected.size > 0 ? `${selected.size} selected` : "Pick Live Photos to stitch"}
        </span>
        <button onClick={loadPhone} disabled={busy || phone.state === "loading"}>
          Refresh
        </button>
        <button className="primary" onClick={generate} disabled={busy || selected.size === 0}>
          {busy ? "Working…" : "Make Preview"}
        </button>
      </header>

      <main className="layout">
        <section className="picker" aria-label="iPhone media">
          {phone.state === "loading" && <p className="notice">Reading iPhone…</p>}
          {phone.state === "error" && (
            <div className="notice">
              <p>{phone.message}</p>
              <p className="hint">Connect your iPhone with a cable, unlock it, then Refresh.</p>
            </div>
          )}
          {phone.state === "ready" && (
            <ul className="grid">
              {usable.map((item) => (
                <li key={item.id}>
                  <label className={selected.has(item.id) ? "card selected" : "card"}>
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggle(item.id)}
                      disabled={busy}
                    />
                    <span className="badge">{item.kind === "livePhoto" ? "LIVE" : "VIDEO"}</span>
                    <span className="name">{item.name}</span>
                    <span className="date">
                      {item.createdAt ? dateFormat.format(new Date(item.createdAt)) : "—"}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="preview" aria-label="Preview">
          <div className="frame">
            {previewUrl ? (
              <video key={previewUrl} src={previewUrl} controls autoPlay />
            ) : (
              <p className="placeholder">Preview appears here</p>
            )}
          </div>
          <p className="status" role="status">
            {error ?? (progress ? progressLabel(progress) : busy ? "Starting…" : "")}
          </p>
        </aside>
      </main>
    </div>
  );
}

export default App;
