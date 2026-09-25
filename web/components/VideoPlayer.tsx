import { useState, useRef, useEffect } from "react";
import type { Clip, CaptionCue } from "../api/client.js";
import { getCaptionCues } from "../api/client.js";
import "./VideoPlayer.css";

interface Props {
  clip: Clip;
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const secs = s % 60;
  return `${m}:${secs.toString().padStart(2, "0")}`;
}

export function VideoPlayer({ clip }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cues, setCues] = useState<CaptionCue[]>([]);

  const duration = clip.durationMs / 1000;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Fetch caption cues once per clip. Preview video is rendered without
  // burned-in captions, so this overlay is what actually shows captions —
  // and it reacts to caption-style changes instantly (no re-fetch, no
  // re-render), since only CSS/casing differ between bold/minimal/karaoke.
  useEffect(() => {
    let cancelled = false;
    setCues([]);
    if (!clip.id) return;
    getCaptionCues(clip.id)
      .then((result) => { if (!cancelled) setCues(result); })
      .catch(() => { if (!cancelled) setCues([]); });
    return () => { cancelled = true; };
  }, [clip.id]);

  const currentMs = currentTime * 1000;
  const activeCue = clip.captionStyle !== "none"
    ? cues.find((c) => currentMs >= c.startMs && currentMs < c.endMs)
    : undefined;

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setPlaying(false);
    } else {
      setError(null);
      void v.play().catch((e) => setError("Playback error: " + (e.message || "cannot play video")));
      setPlaying(true);
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = ratio * duration;
    setCurrentTime(v.currentTime);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !muted;
    setMuted(!muted);
  };

  if (!clip.previewUrl) {
    return (
      <div className="player-placeholder">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5">
          <polygon points="5,3 19,12 5,21"/>
        </svg>
        <p>Preview rendering…</p>
      </div>
    );
  }

  return (
    <div className={`player-wrap player-ratio-${clip.aspectRatio.replace(":", "-")}`}>
      <div className="player-inner">
        <video
          ref={videoRef}
          src={clip.previewUrl}
          className="player-video"
          onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
          onEnded={() => setPlaying(false)}
          onWaiting={() => setLoading(true)}
          onCanPlay={() => {
            setLoading(false);
            setError(null);
          }}
          onError={() => {
            setLoading(false);
            setError("Preview video could not be loaded");
          }}
          onClick={toggle}
          playsInline
          preload="metadata"
        />

        {activeCue && (
          <div className={`caption-overlay caption-style-${clip.captionStyle}`}>
            <span>{clip.captionStyle === "karaoke" ? activeCue.text.toUpperCase() : activeCue.text}</span>
          </div>
        )}

        {loading && (
          <div className="player-play-overlay" style={{ pointerEvents: "none" }}>
            <span className="spinner" style={{ width: 32, height: 32 }} />
          </div>
        )}

        {error && (
          <div className="player-play-overlay" style={{ background: "rgba(0,0,0,0.8)" }}>
            <div style={{ textAlign: "center", color: "var(--color-error)", padding: 12 }}>
              <p style={{ fontSize: 13, marginBottom: 8 }}>{error}</p>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setError(null);
                  if (videoRef.current) {
                    videoRef.current.load();
                  }
                }}
                type="button"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Big play overlay */}
        {!playing && !loading && !error && (
          <button className="player-play-overlay" onClick={toggle} aria-label="Play">
            <div className="player-play-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <polygon points="5,3 19,12 5,21"/>
              </svg>
            </div>
          </button>
        )}

        {/* Controls bar */}
        <div className="player-controls">
          <button className="player-ctrl-btn" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
            {playing ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                <rect x="6" y="4" width="4" height="16" rx="1"/>
                <rect x="14" y="4" width="4" height="16" rx="1"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                <polygon points="5,3 19,12 5,21"/>
              </svg>
            )}
          </button>

          {/* Timeline */}
          <div className="player-timeline" onClick={seek} role="slider" aria-label="Seek">
            <div className="player-timeline-track">
              <div className="player-timeline-fill" style={{ width: `${progress}%` }} />
              <div className="player-timeline-thumb" style={{ left: `${progress}%` }} />
            </div>
          </div>

          <span className="player-time">
            {formatTime(currentTime * 1000)} / {formatTime(clip.durationMs)}
          </span>

          <button className="player-ctrl-btn" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
            {muted ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
