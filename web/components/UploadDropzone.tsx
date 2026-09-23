import { useState, useRef, useCallback } from "react";
import type { ProcessingSettings } from "../api/client.js";
import "./UploadDropzone.css";

interface Props {
  onUpload: (file: File, settings: Partial<ProcessingSettings>) => void;
  disabled?: boolean;
}

const ACCEPTED = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/x-matroska", "video/mpeg"];

export function UploadDropzone({ onUpload, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [settings, setSettings] = useState<Partial<ProcessingSettings>>({
    clipCount: 5,
    minDurationSeconds: 30,
    maxDurationSeconds: 90,
    aspectRatio: "9:16",
    captionStyle: "bold",
    quality: "standard",
    generateTitles: true,
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      setErrorMsg(null);
      if (!ACCEPTED.includes(file.type) && !file.name.match(/\.(mp4|mov|avi|webm|mkv|mpg|mpeg|3gp)$/i)) {
        setErrorMsg("Please upload a supported video file (MP4, MOV, AVI, WebM, MKV)");
        return;
      }
      onUpload(file, settings);
    },
    [onUpload, settings]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const set = <K extends keyof ProcessingSettings>(k: K, v: ProcessingSettings[K]) =>
    setSettings((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="dropzone-page">
      {/* Hero */}
      <div className="dropzone-hero animate-in">
        <div className="dropzone-wordmark">
          <span className="wordmark-auto gradient-text">Auto</span>
          <span className="wordmark-clip">Clip</span>
        </div>
        <p className="dropzone-tagline">
          Drop a video. Get viral clips in minutes.
        </p>
      </div>

      {errorMsg && (
        <div className="upload-error-card card animate-in" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)' }}>
          <p className="upload-error-msg" style={{ margin: 0, color: 'var(--color-error)' }}>{errorMsg}</p>
        </div>
      )}

      {/* Upload Zone */}
      <div
        className={`dropzone-zone animate-in card ${dragging ? "dropzone-dragging" : ""}`}
        style={{ animationDelay: "0.1s" }}
        onDrop={disabled ? undefined : onDrop}
        onDragOver={disabled ? undefined : onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && !disabled && inputRef.current?.click()}
        aria-label="Upload video"
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          disabled={disabled}
        />
        <div className="dropzone-icon-wrap">
          <svg className="dropzone-icon" viewBox="0 0 48 48" fill="none">
            <defs>
              <linearGradient id="dropzone-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--color-accent-start)" />
                <stop offset="100%" stopColor="var(--color-accent-end)" />
              </linearGradient>
            </defs>
            <circle cx="24" cy="24" r="22" fill="url(#dropzone-grad)" opacity="0.15" />
            <path d="M24 14v12M18 20l6-6 6 6" stroke="url(#dropzone-grad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 30v2a2 2 0 002 2h16a2 2 0 002-2v-2" stroke="url(#dropzone-grad)" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div className="dropzone-cta">
          <p className="dropzone-title">Drop your video here</p>
          <p className="dropzone-sub">or <span className="dropzone-link">browse files</span></p>
          <p className="dropzone-meta">MP4, MOV, AVI, WebM, MKV · Up to 10 GB</p>
        </div>
      </div>

      {/* Settings */}
      <div className="dropzone-settings animate-in card" style={{ animationDelay: "0.2s" }}>
        <h3 className="settings-heading">Processing Settings</h3>

        <div className="settings-grid">
          <div className="settings-field">
            <label className="label">Number of clips</label>
            <div className="settings-inline">
              <input
                type="range"
                className="range"
                min={1} max={15} value={settings.clipCount ?? 5}
                onChange={(e) => set("clipCount", Number(e.target.value))}
              />
              <span className="settings-value">{settings.clipCount}</span>
            </div>
          </div>

          <div className="settings-field">
            <label className="label">Clip duration (sec)</label>
            <div className="settings-inline">
              <input
                type="number" className="input"
                min={10} max={120} value={settings.minDurationSeconds ?? 30}
                onChange={(e) => set("minDurationSeconds", Number(e.target.value))}
                style={{ width: 80 }}
              />
              <span style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>to</span>
              <input
                type="number" className="input"
                min={30} max={300} value={settings.maxDurationSeconds ?? 90}
                onChange={(e) => set("maxDurationSeconds", Number(e.target.value))}
                style={{ width: 80 }}
              />
              <span style={{ color: "var(--color-text-muted)", fontSize: "var(--text-sm)" }}>sec</span>
            </div>
          </div>

          <div className="settings-field">
            <label className="label">Aspect Ratio</label>
            <div className="segment-control">
              {(["9:16", "1:1", "4:5", "16:9"] as const).map((r) => (
                <button
                  key={r}
                  className={`segment-option ${settings.aspectRatio === r ? "active" : ""}`}
                  onClick={() => set("aspectRatio", r)}
                  type="button"
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-field">
            <label className="label">Caption Style</label>
            <div className="segment-control">
              {(["bold", "minimal", "karaoke", "none"] as const).map((s) => (
                <button
                  key={s}
                  className={`segment-option ${settings.captionStyle === s ? "active" : ""}`}
                  onClick={() => set("captionStyle", s)}
                  type="button"
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-field">
            <label className="label">Export Quality</label>
            <div className="segment-control">
              {(["draft", "standard", "high"] as const).map((q) => (
                <button
                  key={q}
                  className={`segment-option ${settings.quality === q ? "active" : ""}`}
                  onClick={() => set("quality", q)}
                  type="button"
                >
                  {q.charAt(0).toUpperCase() + q.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-field settings-toggle-field">
            <label className="label" htmlFor="gen-titles">AI Titles & Hooks</label>
            <button
              id="gen-titles"
              role="switch"
              aria-checked={settings.generateTitles}
              className={`toggle ${settings.generateTitles ? "toggle-on" : ""}`}
              onClick={() => set("generateTitles", !settings.generateTitles)}
              type="button"
            >
              <span className="toggle-thumb" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
