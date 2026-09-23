import { useState, useCallback } from "react";
import { useUpload } from "../hooks/useUpload.js";
import { useProject } from "../hooks/useProject.js";
import { useClips } from "../hooks/useClips.js";
import { cancelProject, type ProcessingSettings } from "../api/client.js";
import { Layout } from "../components/Layout.js";
import { UploadDropzone } from "../components/UploadDropzone.js";
import { ProcessingStatus } from "../components/ProcessingStatus.js";
import { ClipGrid } from "../components/ClipGrid.js";
import { ProjectList } from "../components/ProjectList.js";
import "./ProjectPage.css";

type View = "upload" | "processing" | "clips";

export function ProjectPage() {
  const { state: uploadState, upload, reset: resetUpload } = useUpload();
  const [projectId, setProjectId] = useState<string | null>(null);
  const { project, refetch: refetchProject } = useProject(projectId);
  const { clips, loading: clipsLoading, refetch: refetchClips } = useClips(
    projectId,
    project?.status === "ready"
  );
  const [showHistory, setShowHistory] = useState(false);

  const view: View =
    project?.status === "ready" ? "clips" :
    (uploadState.phase !== "idle" || projectId) ? "processing" :
    "upload";

  const handleUpload = useCallback(
    async (file: File, settings: Partial<ProcessingSettings>) => {
      try {
        const response = await upload(file, settings);
        setProjectId(response.projectId);
      } catch {
        // error already in uploadState
      }
    },
    [upload]
  );

  const handleCancel = async () => {
    if (!projectId) return;
    await cancelProject(projectId).catch(() => {});
    await refetchProject();
  };

  const handleReset = () => {
    setProjectId(null);
    resetUpload();
  };

  const uploadPercent = uploadState.phase === "uploading" ? uploadState.percent : undefined;

  return (
    <Layout
      onHome={view !== "upload" ? handleReset : undefined}
      projectTitle={project?.title}
    >
      <div className="project-page">
        {view === "upload" && (
          <>
            <UploadDropzone
              onUpload={handleUpload}
              disabled={uploadState.phase === "uploading"}
            />
            <div className="history-section">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowHistory((v) => !v)}
                type="button"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                </svg>
                {showHistory ? "Hide" : "View"} recent projects
              </button>
              {showHistory && (
                <ProjectList onSelect={(id) => setProjectId(id)} />
              )}
            </div>
          </>
        )}

        {view === "processing" && project && (
          <div className="proc-page animate-in">
            <ProcessingStatus
              project={project}
              uploadPercent={uploadPercent}
              onCancel={handleCancel}
            />
          </div>
        )}

        {/* While uploading (before we have a project object) */}
        {uploadState.phase === "uploading" && !project && (
          <div className="proc-page animate-in">
            <div className="upload-progress-card card">
              <div className="upload-progress-title">
                <span className="spinner" />
                Uploading {(uploadState as { file: File }).file?.name}…
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${uploadState.percent}%` }} />
              </div>
              <div className="upload-progress-pct">{uploadState.percent}%</div>
            </div>
          </div>
        )}

        {uploadState.phase === "error" && !project && (
          <div className="proc-page animate-in">
            <div className="upload-error-card card">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
              </svg>
              <div>
                <p className="upload-error-title">Upload failed</p>
                <p className="upload-error-msg">{(uploadState as { message: string }).message}</p>
              </div>
              <button className="btn btn-secondary" onClick={handleReset} type="button">Try again</button>
            </div>
          </div>
        )}

        {view === "clips" && project && (
          <div className="clips-page">
            <div className="clips-header">
              <div>
                <h1 className="clips-page-title">
                  {clips.length} clip{clips.length !== 1 ? "s" : ""} generated
                </h1>
                <p className="clips-page-sub">
                  From <strong>{project.originalFilename}</strong>
                  {project.durationMs && (
                    <> · {Math.round(project.durationMs / 1000 / 60)}m{" "}
                    {Math.round((project.durationMs / 1000) % 60)}s</>
                  )}
                </p>
              </div>
              <div className="clips-header-actions">
                <button className="btn btn-ghost btn-sm" onClick={handleReset} type="button">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12l7-7 7 7"/>
                  </svg>
                  New video
                </button>
              </div>
            </div>
            <ClipGrid clips={clips} loading={clipsLoading} onUpdated={refetchClips} />
          </div>
        )}
      </div>
    </Layout>
  );
}
