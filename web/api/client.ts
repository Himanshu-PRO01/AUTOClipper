/* Typed API client — all calls go through this module */

const BASE = "/api";

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  };
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const json = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, (json as { error?: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// ---- Types ----
export interface Project {
  id: string;
  title: string;
  status: string;
  originalFilename: string;
  mimeType: string;
  bytes: number;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  settings: ProcessingSettings;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessingSettings {
  clipCount: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  aspectRatio: "9:16" | "1:1" | "4:5" | "16:9";
  captionStyle: "bold" | "minimal" | "karaoke" | "none";
  quality: "draft" | "standard" | "high";
  generateTitles: boolean;
  language?: string;
}

export interface Clip {
  id: string;
  projectId: string;
  rank: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  score: number;
  scoreBreakdown: Record<string, number>;
  title: string;
  hook: string | null;
  transcriptExcerpt: string;
  cropMode: string;
  captionStyle: string;
  aspectRatio: string;
  previewUrl: string | null;
  captionsUrl: string | null;
}

export interface ClipPatch {
  title?: string;
  hook?: string | null;
  captionStyle?: string;
  aspectRatio?: string;
  cropMode?: string;
  startMs?: number;
  endMs?: number;
}

export interface Export {
  id: string;
  clipId: string;
  status: string;
  preset: string;
  downloadUrl: string | null;
  errorMessage: string | null;
}

export interface UploadResponse {
  projectId: string;
  jobId: string;
}

export interface ExportResponse {
  exportId: string;
  jobId: string;
}

// ---- API Functions ----
export async function listProjects(): Promise<Project[]> {
  return request<Project[]>("GET", "/projects");
}

export async function getProject(id: string): Promise<Project> {
  return request<Project>("GET", `/projects/${id}`);
}

export async function cancelProject(id: string): Promise<void> {
  await request("POST", `/projects/${id}/cancel`);
}

export async function uploadProject(
  file: File,
  settings: Partial<ProcessingSettings>,
  onProgress: (percent: number) => void
): Promise<UploadResponse> {
  return new Promise<UploadResponse>((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);

    for (const [k, v] of Object.entries(settings)) {
      if (v !== undefined) form.append(k, String(v));
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}/projects`);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });

    xhr.addEventListener("load", () => {
      if (xhr.status === 202) {
        resolve(JSON.parse(xhr.responseText) as UploadResponse);
      } else {
        const err = JSON.parse(xhr.responseText) as { error?: string };
        reject(new ApiError(xhr.status, err.error ?? "Upload failed"));
      }
    });

    xhr.addEventListener("error", () => reject(new ApiError(0, "Network error")));
    xhr.send(form);
  });
}

export async function listClips(projectId: string): Promise<Clip[]> {
  return request<Clip[]>("GET", `/projects/${projectId}/clips`);
}

export async function patchClip(id: string, patch: ClipPatch): Promise<void> {
  await request("PATCH", `/clips/${id}`, patch);
}

export async function exportClip(id: string): Promise<ExportResponse> {
  return request<ExportResponse>("POST", `/clips/${id}/export`);
}

export async function getExport(id: string): Promise<Export> {
  return request<Export>("GET", `/exports/${id}`);
}
