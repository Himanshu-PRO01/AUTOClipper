import { useState } from "react";
import type { Clip } from "../api/client.js";
import { exportClip, getExport } from "../api/client.js";
import { VideoPlayer } from "./VideoPlayer.js";
import { ClipEditor } from "./ClipEditor.js";
import "./ClipCard.css";

interface Props {
  clip: Clip;
  onUpdated: () => void;
}

function formatMs(ms: number) {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

function scoreColor(score: number) {
  if (score >= 0.75) return "var(--color-success)";
  if (score >= 0.5) return "var(--color-warning)";
  return "var(--color-text-muted)";
}

export function ClipCard({ clip, onUpdated }: Props) {
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setExporting(true);
    setError(null);
    try {
      const { exportId } = await exportClip(clip.id);
      let attempts = 0;
      const poll = async () => {
        if (attempts++ > 60) return;
        const exp = await getExport(exportId);
        if (exp.status === "succeeded" && exp.downloadUrl) {
          setExported(true);
          setExporting(false);
          window.open(exp.downloadUrl, "_blank");
        } else if (["retryable_failed", "terminal_failed"].includes(exp.status)) {
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

  return (
    <>
      <div className="clip-card card card-hover animate-in">
        {/* Thumbnail / player preview */}
        <div className="clip-card-thumb">
          <VideoPlayer clip={clip} />

          {/* Rank badge */}
          <div className="clip-rank-badge">#{clip.rank}</div>

          {/* Score pill */}
          <div className="clip-score-pill" style={{ color: scoreColor(clip.score) }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            {(clip.score * 100).toFixed(0)}%
          </div>
        </div>

        {/* Content */}
        <div className="clip-card-body">
          <div className="clip-meta-row">
            <span className="badge badge-default">{clip.aspectRatio}</span>
            <span className="badge badge-default">{formatMs(clip.durationMs)}</span>
            <span className="badge badge-default">{clip.captionStyle}</span>
          </div>

          <h3 className="clip-title" title={clip.title}>{clip.title}</h3>

          {clip.hook && (
            <p className="clip-hook">"{clip.hook}"</p>
          )}

          {/* Score bar */}
          <div className="clip-score-bar-wrap">
            <div className="score-bar">
              <div className="score-bar-fill" style={{ width: `${clip.score * 100}%` }} />
            </div>
          </div>

          {error && <p className="clip-error">{error}</p>}

          {/* Actions */}
          <div className="clip-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setEditing(true)}
              type="button"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
              Edit
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleExport}
              disabled={exporting || exported}
              type="button"
            >
              {exporting ? (
                <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} /> Exporting…</>
              ) : exported ? (
                <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg> Done!</>
              ) : (
                <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v10M5 15l7 7 7-7"/><path d="M5 19h14"/></svg> Export</>
              )}
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <ClipEditor
          clip={clip}
          onUpdated={() => { setEditing(false); onUpdated(); }}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  );
}
