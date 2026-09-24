import type { Clip } from "../api/client.js";
import { ClipCard } from "./ClipCard.js";
import { ScrollTiltedGrid } from "./ScrollTiltedGrid.js";
import "./ClipGrid.css";

interface Props {
  clips: Clip[];
  loading: boolean;
  onUpdated: () => void;
}

function SkeletonCard() {
  return (
    <div className="clip-skeleton card">
      <div className="clip-skeleton-thumb shimmer" />
      <div className="clip-skeleton-body">
        <div className="clip-skeleton-line shimmer" style={{ width: "60%", height: 12 }} />
        <div className="clip-skeleton-line shimmer" style={{ width: "90%", height: 16 }} />
        <div className="clip-skeleton-line shimmer" style={{ width: "70%", height: 12 }} />
        <div className="clip-skeleton-actions">
          <div className="shimmer" style={{ flex: 1, height: 32, borderRadius: 8 }} />
          <div className="shimmer" style={{ flex: 1, height: 32, borderRadius: 8 }} />
        </div>
      </div>
    </div>
  );
}

export function ClipGrid({ clips, loading, onUpdated }: Props) {
  if (loading) {
    return (
      <div className="clip-grid">
        {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (clips.length === 0) {
    return (
      <div className="clip-grid-empty animate-in">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5">
          <rect x="2" y="2" width="20" height="20" rx="4"/>
          <path d="M10 8l6 4-6 4V8z"/>
        </svg>
        <p>No clips generated yet</p>
      </div>
    );
  }

  return (
    <ScrollTiltedGrid
      items={clips}
      itemKey={(clip) => clip.id}
      renderItem={(clip, i) => (
        <div style={{ animationDelay: `${i * 0.06}s`, height: "100%" }}>
          <ClipCard clip={clip} onUpdated={onUpdated} />
        </div>
      )}
    />
  );
}
