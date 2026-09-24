import { useState } from "react";
import type { Clip, ClipPatch } from "../api/client.js";
import { patchClip, exportClip, getExport } from "../api/client.js";
import { VideoPlayer } from "./VideoPlayer.js";
import "./ClipEditor.css";

interface Props {
  clip: Clip;
  onUpdated: () => void;
  onClose: () => void;
}

const ASPECT_RATIOS = ["9:16", "1:1", "4:5", "16:9"] as const;
const CAPTION_STYLES = ["bold", "minimal", "karaoke", "none"] as const;
const CROP_MODES = [
  { id: "face", label: "Smart Face Track" },
  { id: "center", label: "Center Crop" },
] as const;

function formatMs(ms: number) {
  const totalS = Math.floor(ms / 1000);
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ClipEditor({ clip, onUpdated, onClose }: Props) {
  const [title, setTitle] = useState(clip.title);
  const [hook, setHook] = useState(clip.hook ?? "");
  const [aspectRatio, setAspectRatio] = useState(clip.aspectRatio);
  const [captionStyle, setCaptionStyle] = useState(clip.captionStyle);
  const [cropMode, setCropMode] = useState(clip.cropMode || "center");
  const [startMs, setStartMs] = useState(clip.startMs);
  const [endMs, setEndMs] = useState(clip.endMs);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportId, setExportId] = useState<string | null>(null);
  const [exportDone, setExportDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (endMs <= startMs + 5000) {
      setError("Clip duration must be at least 5 seconds");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const patch: ClipPatch = {
        title: title.trim() || undefined,
        hook: hook.trim() || null,
        aspectRatio,
        captionStyle,
        cropMode,
        startMs,
        endMs,
      };
      await patchClip(clip.id, patch);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const triggerExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const { exportId: eid } = await exportClip(clip.id);
      setExportId(eid);
      // Poll for export completion
      let attempts = 0;
      const poll = async () => {
        if (attempts++ > 60) return;
        const exp = await getExport(eid);
        if (exp.status === "succeeded" && exp.downloadUrl) {
          setExportDone(true);
          setExporting(false);
          window.open(exp.downloadUrl, "_blank");
        } else if (exp.status === "retryable_failed" || exp.status === "terminal_failed") {
          setError(exp.errorMessage ?? "Export failed");
          setExporting(false);
        } else {
          setTimeout(() => void poll(), 2000);
        }
      };
      void poll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
      setExporting(false);
    }
  };

  const durationMs = endMs - startMs;

  return (
    <div className="editor-backdrop modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="editor-modal" role="dialog" aria-label="Edit clip">
        {/* Header */}
        <div className="editor-header">
          <div>
            <h2 className="editor-title">Edit Clip #{clip.rank}</h2>
            <p className="editor-duration">
              Duration: {formatMs(durationMs)} · Score: {(clip.score * 100).toFixed(0)}%
            </p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div className="editor-body">
          {/* Left: Player */}
          <div className="editor-preview">
            <VideoPlayer clip={{ ...clip, aspectRatio, captionStyle, cropMode }} />
          </div>

          {/* Right: Controls */}
          <div className="editor-controls">
            {/* Title */}
            <div>
              <label className="label" htmlFor="clip-title">Title</label>
              <input
                id="clip-title"
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="Clip title…"
              />
            </div>

            {/* Hook */}
            <div>
              <label className="label" htmlFor="clip-hook">Hook / Caption</label>
              <input
                id="clip-hook"
                className="input"
                value={hook}
                onChange={(e) => setHook(e.target.value)}
                maxLength={200}
                placeholder="Opening hook text…"
              />
            </div>

            {/* Timing */}
            <div>
              <label className="label">Timing</label>
              <div className="editor-timing">
                <div className="editor-timing-field">
                  <span className="label" style={{ marginBottom: 4, textTransform: "none", fontSize: "11px" }}>Start</span>
                  <input
                    type="number"
                    className="input"
                    value={Math.round(startMs / 1000)}
                    min={0}
                    onChange={(e) => setStartMs(Number(e.target.value) * 1000)}
                    style={{ fontFamily: "var(--font-mono)" }}
                  />
                </div>
                <div className="editor-timing-arrow">→</div>
                <div className="editor-timing-field">
                  <span className="label" style={{ marginBottom: 4, textTransform: "none", fontSize: "11px" }}>End</span>
                  <input
                    type="number"
                    className="input"
                    value={Math.round(endMs / 1000)}
                    min={startMs / 1000 + 5}
                    onChange={(e) => setEndMs(Number(e.target.value) * 1000)}
                    style={{ fontFamily: "var(--font-mono)" }}
                  />
                </div>
                <div className="editor-timing-field">
                  <span className="label" style={{ marginBottom: 4, textTransform: "none", fontSize: "11px" }}>Dur.</span>
                  <div className="input" style={{ display: "flex", alignItems: "center", color: "var(--color-accent-start)", fontFamily: "var(--font-mono)" }}>
                    {formatMs(durationMs)}
                  </div>
                </div>
              </div>
            </div>

            {/* Aspect Ratio */}
            <div>
              <label className="label">Aspect Ratio</label>
              <div className="segment-control">
                {ASPECT_RATIOS.map((r) => (
                  <button
                    key={r}
                    className={`segment-option ${aspectRatio === r ? "active" : ""}`}
                    onClick={() => setAspectRatio(r)}
                    type="button"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Reframe / Crop Mode */}
            <div>
              <label className="label">Reframe Mode</label>
              <div className="segment-control">
                {CROP_MODES.map((m) => (
                  <button
                    key={m.id}
                    className={`segment-option ${cropMode === m.id ? "active" : ""}`}
                    onClick={() => setCropMode(m.id)}
                    type="button"
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Caption Style */}
            <div>
              <label className="label">Caption Style</label>
              <div className="segment-control">
                {CAPTION_STYLES.map((s) => (
                  <button
                    key={s}
                    className={`segment-option ${captionStyle === s ? "active" : ""}`}
                    onClick={() => setCaptionStyle(s)}
                    type="button"
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Score breakdown */}
            <div>
              <label className="label">Score Breakdown</label>
              <div className="editor-scores">
                {Object.entries(clip.scoreBreakdown).map(([k, v]) => (
                  <div key={k} className="editor-score-row">
                    <span className="editor-score-key">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
                    <div className="score-bar" style={{ flex: 1 }}>
                      <div className="score-bar-fill" style={{ width: `${Math.round(v * 100)}%` }} />
                    </div>
                    <span className="editor-score-val">{(v * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Transcript excerpt */}
            <div>
              <label className="label">Transcript</label>
              <p className="editor-excerpt">{clip.transcriptExcerpt}</p>
            </div>

            {error && <div className="proc-error" style={{ marginTop: 0 }}>{error}</div>}
          </div>
        </div>

        {/* Footer */}
        <div className="editor-footer">
          <button className="btn btn-ghost" onClick={onClose} type="button">Cancel</button>
          <button className="btn btn-secondary" onClick={save} disabled={saving} type="button">
            {saving ? <><span className="spinner" /> Saving…</> : "Save changes"}
          </button>
          <button
            className="btn btn-primary"
            onClick={triggerExport}
            disabled={exporting || exportDone}
            type="button"
          >
            {exporting ? (
              <><span className="spinner" /> Exporting…</>
            ) : exportDone ? (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg> Downloaded!</>
            ) : (
              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v10M5 15l7 7 7-7"/><path d="M5 19h14"/></svg> Export & Download</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
