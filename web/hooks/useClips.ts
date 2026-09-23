import { useState, useEffect, useCallback } from "react";
import { listClips, type Clip } from "../api/client.js";

export function useClips(projectId: string | null, ready: boolean) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClips = useCallback(async () => {
    if (!projectId || !ready) return;
    setLoading(true);
    try {
      const data = await listClips(projectId);
      setClips(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load clips");
    } finally {
      setLoading(false);
    }
  }, [projectId, ready]);

  useEffect(() => {
    void fetchClips();
  }, [fetchClips]);

  return { clips, loading, error, refetch: fetchClips };
}
