import type { Project } from "../api/client.js";
import "./ProcessingStatus.css";

const STAGE_LABELS: Record<string, string> = {
  queued: "Waiting in queue…",
  validating_source: "Validating video…",
  creating_analysis_proxy: "Creating analysis proxy…",
  transcribing: "Transcribing audio with Whisper…",
  detecting_scenes: "Detecting scene boundaries…",
  ranking_highlights: "Ranking highlights with AI…",
  rendering_previews: "Rendering clip previews…",
  results_ready: "All done!",
  rendering_export: "Rendering final export…",
  export_ready: "Export ready!",
  failed: "Processing failed",
  canceled: "Canceled",
};

interface Props {
  project: Project;
  uploadPercent?: number;
  onCancel?: () => void;
}

function statusBadgeClass(status: string) {
  if (status === "ready") return "badge badge-success";
  if (status === "failed") return "badge badge-error";
  if (status === "canceled") return "badge badge-default";
  return "badge badge-accent";
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    draft: "Draft",
    uploading: "Uploading",
    uploaded: "Uploaded",
    queued: "Queued",
    processing: "Processing",
    ready: "Ready",
    failed: "Failed",
    cancel_requested: "Canceling…",
    canceled: "Canceled",
  };
  return map[status] ?? status;
}

export function ProcessingStatus({ project, uploadPercent, onCancel }: Props) {
  const isUploading = project.status === "uploading" || project.status === "draft";
  const isProcessing = ["queued", "processing"].includes(project.status);
  const isReady = project.status === "ready";
  const isFailed = project.status === "failed";
  const isCanceled = project.status === "canceled";

  // Steps for the visual pipeline
  const steps = [
    { key: "upload",     label: "Upload",       done: !isUploading },
    { key: "transcribe", label: "Transcribe",   done: ["rendering_previews","results_ready","ready"].some(s => project.status === s || project.status === "ready") },
    { key: "analyze",    label: "AI Analysis",  done: project.status === "ready" },
    { key: "render",     label: "Render Clips", done: project.status === "ready" },
  ];

  const progressValue = isUploading
    ? (uploadPercent ?? 0)
    : project.status === "ready"
    ? 100
    : project.status === "queued"
    ? 5
    : 50;

  return (
    <div className="proc-card card animate-in">
      {/* Header */}
      <div className="proc-header">
        <div className="proc-title-row">
          <h2 className="proc-title">{project.title}</h2>
          <span className={statusBadgeClass(project.status)}>
            {!isReady && !isFailed && !isCanceled && (
              <span className="status-dot" />
            )}
            {statusLabel(project.status)}
          </span>
        </div>
        <p className="proc-filename">{project.originalFilename}</p>
      </div>

      {/* Progress bar */}
      {(isUploading || isProcessing) && (
        <div className="proc-progress-wrap">
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${progressValue}%` }}
            />
          </div>
          <div className="proc-progress-row">
            <span className="proc-stage">
              {isUploading
                ? `Uploading… ${uploadPercent ?? 0}%`
                : STAGE_LABELS[project.status] ?? "Processing…"}
            </span>
            <span className="proc-percent">{progressValue}%</span>
          </div>
        </div>
      )}

      {/* Step pipeline */}
      <div className="proc-pipeline">
        {steps.map((step, idx) => {
          const isActive = !step.done && (idx === 0 ? isUploading : isProcessing);
          return (
            <div key={step.key} className={`proc-step ${step.done ? "done" : ""} ${isActive ? "active" : ""}`}>
              <div className="proc-step-dot">
                {step.done ? (
                  <svg width="10" height="10" viewBox="0 0 10 10">
                    <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                  </svg>
                ) : isActive ? (
                  <span className="step-spinner" />
                ) : (
                  <span className="step-num">{idx + 1}</span>
                )}
              </div>
              <span className="proc-step-label">{step.label}</span>
              {idx < steps.length - 1 && <div className="proc-step-line" />}
            </div>
          );
        })}
      </div>

      {/* Metadata */}
      {project.durationMs && (
        <div className="proc-meta">
          {project.durationMs && (
            <span>
              Duration: {Math.round(project.durationMs / 1000 / 60)}m{" "}
              {Math.round((project.durationMs / 1000) % 60)}s
            </span>
          )}
          {project.width && project.height && (
            <span>Resolution: {project.width}×{project.height}</span>
          )}
          {project.bytes > 0 && (
            <span>Size: {(project.bytes / 1024 / 1024).toFixed(1)} MB</span>
          )}
        </div>
      )}

      {/* Error */}
      {isFailed && project.errorMessage && (
        <div className="proc-error">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
          </svg>
          <span>{project.errorMessage}</span>
        </div>
      )}

      {/* Actions */}
      {isProcessing && onCancel && (
        <div className="proc-actions">
          <button className="btn btn-ghost btn-sm" onClick={onCancel} type="button">
            Cancel processing
          </button>
        </div>
      )}
    </div>
  );
}
