import { useState, useEffect, useCallback } from "react";
import { getProject, type Project } from "../api/client.js";

const TERMINAL_STATUSES = new Set(["ready", "failed", "canceled"]);
const POLL_INTERVAL_MS = 2000;

export function useProject(projectId: string | null) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!projectId) return;
    try {
      const data = await getProject(projectId);
      setProject(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      return;
    }

    setLoading(true);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const poll = async () => {
      try {
        const data = await getProject(projectId);
        if (!cancelled) {
          setProject(data);
          setError(null);
          setLoading(false);

          if (!TERMINAL_STATUSES.has(data.status)) {
            timer = setTimeout(poll, POLL_INTERVAL_MS);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load project");
          setLoading(false);
          // retry on transient errors
          timer = setTimeout(poll, POLL_INTERVAL_MS * 2);
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [projectId]);

  return { project, error, loading, refetch };
}
