import { useState, useEffect, useCallback, useRef } from "react";
import { uploadProject, type ProcessingSettings, type UploadResponse } from "../api/client.js";

export type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; percent: number; file: File }
  | { phase: "done"; response: UploadResponse; file: File }
  | { phase: "error"; message: string; file?: File };

export function useUpload() {
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const upload = useCallback(
    async (file: File, settings: Partial<ProcessingSettings>) => {
      setState({ phase: "uploading", percent: 0, file });

      try {
        const response = await uploadProject(file, settings, (percent) => {
          setState({ phase: "uploading", percent, file });
        });
        setState({ phase: "done", response, file });
        return response;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setState({ phase: "error", message, file });
        throw err;
      }
    },
    []
  );

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  return { state, upload, reset };
}
