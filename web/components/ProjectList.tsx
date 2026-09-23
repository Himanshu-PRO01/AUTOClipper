import { useState, useEffect } from "react";
import { listProjects, type Project } from "../api/client.js";
import "./ProjectList.css";

interface Props {
  onSelect: (projectId: string) => void;
}

function statusDot(status: string) {
  if (status === "ready") return "dot-success";
  if (status === "failed") return "dot-error";
  if (["queued", "processing"].includes(status)) return "dot-processing";
  return "dot-muted";
}

function statusLabel(status: string) {
  const m: Record<string, string> = {
    draft: "Draft", uploading: "Uploading", uploaded: "Uploaded",
    queued: "Queued", processing: "Processing", ready: "Done",
    failed: "Failed", cancel_requested: "Canceling", canceled: "Canceled",
  };
  return m[status] ?? status;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function formatBytes(n: number) {
  if (n > 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
  return `${(n / 1024 / 1024).toFixed(0)} MB`;
}

export function ProjectList({ onSelect }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="plist-wrap">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="plist-skeleton shimmer" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p style={{ color: "var(--color-error)", fontSize: "var(--text-sm)" }}>{error}</p>;
  }

  if (projects.length === 0) {
    return <p style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>No projects yet.</p>;
  }

  return (
    <div className="plist-wrap">
      {projects.map((p) => (
        <button
          key={p.id}
          className="plist-item card card-hover"
          onClick={() => onSelect(p.id)}
          type="button"
        >
          <div className="plist-left">
            <div className={`plist-dot ${statusDot(p.status)}`} />
          </div>
          <div className="plist-body">
            <span className="plist-title">{p.title}</span>
            <span className="plist-meta">
              {statusLabel(p.status)}
              {p.bytes > 0 && ` · ${formatBytes(p.bytes)}`}
              {p.durationMs && ` · ${Math.round(p.durationMs / 60000)}m`}
              {` · ${formatDate(p.updatedAt)}`}
            </span>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      ))}
    </div>
  );
}
