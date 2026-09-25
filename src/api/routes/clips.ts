import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  listClips,
  getClip,
  updateClip,
  getProject,
  createJob,
  createExport,
  getAsset,
  getTranscript,
} from "../../db/repository.js";
import { mediaQueue } from "../../queue.js";
import { buildCaptionCues } from "../../media/captions.js";

const updateClipSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  hook: z.string().max(200).nullable().optional(),
  captionStyle: z.enum(["bold", "minimal", "karaoke", "none"]).optional(),
  aspectRatio: z.enum(["9:16", "1:1", "4:5", "16:9"]).optional(),
  cropMode: z.enum(["center", "face"]).optional(),
  startMs: z.number().int().min(0).optional(),
  endMs: z.number().int().min(0).optional(),
});

export const clipRoutes: FastifyPluginAsync = async (app) => {
  // List clips for a project
  app.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/clips",
    async (req, reply) => {
      const project = await getProject(req.params.projectId);
      if (!project) return reply.status(404).send({ error: "Project not found" });

      const clips = await listClips(project.id);

      // Enrich with asset URLs for preview
      const enriched = await Promise.all(
        clips.map(async (clip) => {
          let previewUrl: string | null = null;
          let captionsUrl: string | null = null;

          if (clip.preview_asset_id) {
            const asset = await getAsset(clip.preview_asset_id);
            if (asset) previewUrl = `/api/assets/${asset.id}`;
          }
          if (clip.captions_asset_id) {
            const asset = await getAsset(clip.captions_asset_id);
            if (asset) captionsUrl = `/api/assets/${asset.id}`;
          }

          return {
            id: clip.id,
            projectId: clip.project_id,
            rank: clip.rank,
            startMs: clip.start_ms,
            endMs: clip.end_ms,
            durationMs: clip.end_ms - clip.start_ms,
            score: clip.score,
            scoreBreakdown: clip.score_breakdown,
            title: clip.title,
            hook: clip.hook,
            transcriptExcerpt: clip.transcript_excerpt,
            cropMode: clip.crop_mode,
            captionStyle: clip.caption_style,
            aspectRatio: clip.aspect_ratio,
            previewUrl,
            captionsUrl,
          };
        })
      );

      return reply.send(enriched);
    }
  );

  // Update a clip's settings
  app.patch<{ Params: { id: string } }>("/clips/:id", async (req, reply) => {
    const clip = await getClip(req.params.id);
    if (!clip) return reply.status(404).send({ error: "Clip not found" });

    const parsed = updateClipSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid update", details: parsed.error.flatten() });
    }

    // Validate start/end ordering if both provided
    const patch = parsed.data;
    const newStart = patch.startMs ?? clip.start_ms;
    const newEnd = patch.endMs ?? clip.end_ms;
    if (newEnd <= newStart) {
      return reply.status(400).send({ error: "endMs must be greater than startMs" });
    }

    await updateClip(clip.id, patch);
    return reply.send({ ok: true });
  });

  // Live caption cues for the editor preview overlay. This never touches ffmpeg —
  // it just re-chunks the already-transcribed words for this clip's time range, so
  // the editor can render a synced caption overlay instantly instead of needing a
  // fresh video render every time the user tries a different caption style.
  app.get<{ Params: { id: string }; Querystring: { style?: string } }>(
    "/clips/:id/caption-cues",
    async (req, reply) => {
      const clip = await getClip(req.params.id);
      if (!clip) return reply.status(404).send({ error: "Clip not found" });

      const validStyles = ["bold", "minimal", "karaoke", "none"] as const;
      const requested = req.query.style;
      const style = (validStyles as readonly string[]).includes(requested ?? "")
        ? (requested as (typeof validStyles)[number])
        : (clip.caption_style as (typeof validStyles)[number]);

      const transcript = await getTranscript(clip.project_id);
      const cues = buildCaptionCues(transcript, clip.start_ms, clip.end_ms, style);
      return reply.send(cues);
    }
  );

  // Trigger export for a clip
  app.post<{ Params: { id: string } }>("/clips/:id/export", async (req, reply) => {
    const clip = await getClip(req.params.id);
    if (!clip) return reply.status(404).send({ error: "Clip not found" });

    const project = await getProject(clip.project_id);
    if (!project) return reply.status(404).send({ error: "Project not found" });
    if (project.status !== "ready") {
      return reply.status(409).send({ error: "Project is not ready for export" });
    }

    const exportId = await createExport(clip.id, "social");
    const jobId = await createJob(project.id, "export");
    await mediaQueue.add("export", {
      kind: "export",
      jobId,
      projectId: project.id,
      clipId: clip.id,
      exportId,
    });

    return reply.status(202).send({ exportId, jobId });
  });
};
