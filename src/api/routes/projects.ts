import type { FastifyPluginAsync } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { config } from "../../config.js";
import {
  createProject,
  listProjects,
  getProject,
  createJob,
  setProjectStatus,
  createAsset,
} from "../../db/repository.js";
import { mediaQueue } from "../../queue.js";
import { storage, sourceKey } from "../../storage/index.js";
import { extname, resolve } from "node:path";
import { probe } from "../../media/ffmpeg.js";
import type { ProcessingSettings } from "../../shared/types.js";

const ALLOWED_MIME = new Set([
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
  "video/x-matroska",
  "video/mpeg",
  "video/3gpp",
]);

const EXT_TO_MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mpeg": "video/mpeg",
  ".mpg": "video/mpeg",
};

const settingsSchema = z.object({
  clipCount: z.coerce.number().int().min(1).max(20).default(5),
  minDurationSeconds: z.coerce.number().min(10).max(120).default(30),
  maxDurationSeconds: z.coerce.number().min(30).max(300).default(90),
  aspectRatio: z.enum(["9:16", "1:1", "4:5", "16:9"]).default("9:16"),
  captionStyle: z.enum(["bold", "minimal", "karaoke", "none"]).default("bold"),
  quality: z.enum(["draft", "standard", "high"]).default("standard"),
  generateTitles: z
    .string()
    .transform((v) => v === "true")
    .or(z.boolean())
    .default(true),
  language: z.string().optional(),
});

export const projectRoutes: FastifyPluginAsync = async (app) => {
  // List all projects (dashboard)
  app.get("/projects", async (_req, reply) => {
    const projects = await listProjects();
    return reply.send(projects);
  });

  // Upload a video and create a project
  app.post("/projects", async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: "No file uploaded" });

    let mimeType = data.mimetype;
    if (!ALLOWED_MIME.has(mimeType)) {
      const ext = extname(data.filename).toLowerCase();
      if (EXT_TO_MIME[ext]) {
        mimeType = EXT_TO_MIME[ext];
      } else {
        data.file.resume(); // Non-buffering stream drain to prevent DoS
        return reply.status(415).send({ error: "Unsupported video format" });
      }
    }

    // Parse settings from form fields
    const rawSettings: Record<string, string> = {};
    for (const [key, value] of Object.entries(data.fields)) {
      if (value && !Array.isArray(value) && "value" in value) {
        rawSettings[key] = value.value as string;
      }
    }
    const settingsParsed = settingsSchema.safeParse(rawSettings);
    if (!settingsParsed.success) {
      data.file.resume(); // Non-buffering stream drain
      return reply.status(400).send({ error: "Invalid settings", details: settingsParsed.error.flatten() });
    }

    const settings: ProcessingSettings = {
      ...settingsParsed.data,
      generateTitles: Boolean(settingsParsed.data.generateTitles),
    };

    // Validate min/max
    if (settings.minDurationSeconds >= settings.maxDurationSeconds) {
      data.file.resume();
      return reply.status(400).send({ error: "minDurationSeconds must be less than maxDurationSeconds" });
    }

    const filename = data.filename || "upload.mp4";
    const title = filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim() || "Untitled";

    // Create project record
    const project = await createProject({ title, filename, mimeType, settings });

    // Stream file to local temp storage for probing
    const tempPath = resolve(config.WORK_ROOT, `upload-${project.id}${extname(filename)}`);
    const { pipeline } = await import("node:stream/promises");
    const { createWriteStream } = await import("node:fs");
    const { rm } = await import("node:fs/promises");
    
    let bytes = 0;
    const { Transform } = await import("node:stream");
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > config.MAX_UPLOAD_BYTES) {
          callback(new Error(`File size exceeds maximum upload limit of ${config.MAX_UPLOAD_BYTES} bytes`));
          return;
        }
        callback(null, chunk);
      },
    });

    try {
      await setProjectStatus(project.id, "uploading");
      await pipeline(data.file, meter, createWriteStream(tempPath, { flags: "w" }));

      if (bytes === 0) throw new Error("Uploaded file is empty");

      // Validate video format via ffprobe
      const metadata = await probe(tempPath);

      if (metadata.durationMs > config.MAX_DURATION_SECONDS * 1000) {
        throw new Error(
          `Video duration (${Math.round(metadata.durationMs / 1000)}s) exceeds max limit of ${config.MAX_DURATION_SECONDS}s`
        );
      }

      const sKey = sourceKey(project.id);
      await storage.copyFromPath(sKey, tempPath);
      await rm(tempPath, { force: true }).catch(() => {});

      await createAsset(project.id, "source", sKey, mimeType, bytes, {
        originalFilename: filename,
        codec: metadata.codec,
      });

      await setProjectStatus(project.id, "uploaded", {
        bytes,
        durationMs: metadata.durationMs,
        width: metadata.width,
        height: metadata.height,
      });

      // Enqueue analysis job
      const jobId = await createJob(project.id, "analyze");
      await mediaQueue.add("analyze", { kind: "analyze", jobId, projectId: project.id }, { jobId });
      await setProjectStatus(project.id, "queued");

      return reply.status(202).send({ projectId: project.id, jobId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      // Clean up orphaned failed file
      const { rm } = await import("node:fs/promises");
      if (typeof tempPath !== 'undefined') await rm(tempPath, { force: true }).catch(() => {});
      const sKey = sourceKey(project.id);
      await storage.remove(sKey).catch(() => {});

      await setProjectStatus(project.id, "failed", {
        errorCode: "UPLOAD_FAILED",
        errorMessage: msg,
      }).catch(() => {});
      return reply.status(422).send({ error: msg });
    }
  });

  // Get a single project (for polling)
  app.get<{ Params: { id: string } }>("/projects/:id", async (req, reply) => {
    const project = await getProject(req.params.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });
    return reply.send(project);
  });

  // Cancel processing
  app.post<{ Params: { id: string } }>("/projects/:id/cancel", async (req, reply) => {
    const project = await getProject(req.params.id);
    if (!project) return reply.status(404).send({ error: "Project not found" });
    if (!["queued", "processing"].includes(project.status)) {
      return reply.status(409).send({ error: "Project is not in a cancellable state" });
    }

    await setProjectStatus(project.id, "cancel_requested");

    // If job is still queued in BullMQ, cancel/remove it immediately
    try {
      const waitingJobs = await mediaQueue.getJobs(["waiting", "delayed"]);
      for (const j of waitingJobs) {
        if (j.data?.projectId === project.id) {
          await j.remove();
          await setProjectStatus(project.id, "canceled");
          break;
        }
      }
    } catch {}

    return reply.send({ ok: true });
  });
};
