import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { config } from "../config.js";
import { buildCandidates, applyGeminiRankings, selectNonOverlapping } from "../analysis/candidates.js";
import { toSrt } from "../media/captions.js";
import {
  cleanupWorkDir,
  createProxy,
  createWorkDir,
  detectFaceCrop,
  detectSceneBoundaries,
  extractAudio,
  localFile,
  probe,
  renderClip,
} from "../media/ffmpeg.js";
import {
  attachClipAssets,
  createAsset,
  findAsset,
  getClip,
  getProject,
  getTranscript,
  replaceClips,
  replaceTranscript,
  setExport,
  setProjectStatus,
  updateJob,
  addStep,
  updateClip,
} from "../db/repository.js";
import { storage, derivedKey } from "../storage/index.js";
import { FasterWhisperProvider } from "../providers/transcription.js";
import { GeminiHighlightProvider } from "../providers/gemini.js";
import type { AspectRatio, CaptionStyle } from "../shared/types.js";
import type { WorkerPayload } from "../queue.js";
import { logger } from "../logger.js";

async function stage(jobId: string, name: string, progress: number): Promise<void> {
  await updateJob(jobId, "running", name, progress);
  await addStep(jobId, name, "running");
}

function expires(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

async function assertNotCanceled(projectId: string): Promise<void> {
  const p = await getProject(projectId);
  if (p?.status === "cancel_requested") {
    throw new Error("Processing canceled by user");
  }
}

export async function processMediaJob(payload: WorkerPayload): Promise<void> {
  if (payload.kind === "export") return processExport(payload);
  return processAnalysis(payload);
}

async function processAnalysis(payload: Extract<WorkerPayload, { kind: "analyze" }>): Promise<void> {
  const project = await getProject(payload.projectId);
  if (!project) throw new Error("Project not found");
  const source = await findAsset(project.id, "source");
  if (!source) throw new Error("Source video is missing");

  const workDir = await createWorkDir(payload.jobId);

  try {
    await setProjectStatus(project.id, "processing");
    await stage(payload.jobId, "validating_source", 5);

    const sourcePath = localFile(workDir, "source.mp4");
    await storage.downloadToPath(source.storage_key, sourcePath);
    
    const metadata = await probe(sourcePath);

    if (metadata.durationMs > config.MAX_DURATION_SECONDS * 1000) {
      throw new Error(`Video exceeds configured duration limit of ${config.MAX_DURATION_SECONDS}s`);
    }
    if (!metadata.hasAudio) {
      throw new Error("Video has no audio stream; automatic transcription cannot run");
    }

    await setProjectStatus(project.id, "processing", {
      durationMs: metadata.durationMs,
      width: metadata.width,
      height: metadata.height,
    });
    await assertNotCanceled(project.id);

    await stage(payload.jobId, "creating_analysis_proxy", 15);
    const proxyPath = localFile(workDir, "proxy.mp4");
    const audioPath = localFile(workDir, "audio.wav");

    await Promise.all([createProxy(sourcePath, proxyPath), extractAudio(sourcePath, audioPath)]);
    await assertNotCanceled(project.id);

    const proxyKey = derivedKey(project.id, "analysis", "proxy.mp4");
    const audioKey = derivedKey(project.id, "analysis", "audio.wav");

    const [proxyStored, audioStored] = await Promise.all([
      storage.copyFromPath(proxyKey, proxyPath),
      storage.copyFromPath(audioKey, audioPath),
    ]);

    await Promise.all([
      createAsset(project.id, "proxy", proxyKey, "video/mp4", proxyStored.bytes, { analysis: true }, expires(3)),
      createAsset(project.id, "audio", audioKey, "audio/wav", audioStored.bytes, { analysis: true }, expires(3)),
    ]);

    await stage(payload.jobId, "transcribing", 32);
    const transcript = await new FasterWhisperProvider().transcribe(audioPath, project.settings.language);
    await replaceTranscript(project.id, transcript);
    await assertNotCanceled(project.id);

    await stage(payload.jobId, "detecting_scenes", 48);
    const scenes = await detectSceneBoundaries(proxyPath);
    await addStep(payload.jobId, "detecting_scenes", "succeeded", { sceneBoundaryCount: scenes.length });

    await stage(payload.jobId, "ranking_highlights", 60);
    let candidates = buildCandidates(transcript, project.settings, metadata.durationMs);

    if (candidates.length === 0) {
      throw new Error("No speech segments match the selected clip duration range");
    }

    if (project.settings.generateTitles) {
      try {
        const rankings = await new GeminiHighlightProvider().rank(candidates.slice(0, 80));
        candidates = applyGeminiRankings(candidates, rankings);
      } catch (err) {
        logger.warn({ error: err }, "Gemini ranking skipped, continuing with local rankings");
      }
    }

    const clips = selectNonOverlapping(candidates, project.settings.clipCount);
    if (clips.length === 0) {
      throw new Error("No non-overlapping highlight clips were selected");
    }

    const clipIds = await replaceClips(
      project.id,
      clips,
      project.settings.aspectRatio,
      project.settings.captionStyle
    );
    await assertNotCanceled(project.id);

    await stage(payload.jobId, "rendering_previews", 72);
    const isPortraitOrSquare = ["9:16", "1:1", "4:5"].includes(project.settings.aspectRatio);

    for (const [index, clipId] of clipIds.entries()) {
      const clip = clips[index];
      if (!clip) continue;

      const srtPath = localFile(workDir, `${clipId}.srt`);
      const previewPath = localFile(workDir, `${clipId}.mp4`);

      await writeFile(
        srtPath,
        toSrt(transcript, clip.startMs, clip.endMs, project.settings.captionStyle),
        "utf8"
      );

      // Perform face tracking if vertical or square re-framing is requested
      let faceResult = { cropX: 0, normalizedX: 0.5, detected: false };
      if (isPortraitOrSquare) {
        faceResult = await detectFaceCrop(
          proxyPath,
          clip.startMs,
          clip.endMs,
          project.settings.aspectRatio
        );
      }

      await renderClip(sourcePath, previewPath, {
        startMs: clip.startMs,
        endMs: clip.endMs,
        ratio: project.settings.aspectRatio,
        quality: "draft",
        srtPath,
        captionStyle: project.settings.captionStyle,
        cropMode: faceResult.detected ? "face" : "center",
        normalizedX: faceResult.normalizedX,
      });

      // Update clip's crop mode if face was detected
      if (faceResult.detected) {
        await updateClip(clipId, { cropMode: "face" });
      }

      const srtKey = derivedKey(project.id, "captions", `${clipId}.srt`);
      const previewKey = derivedKey(project.id, "previews", `${clipId}.mp4`);

      const [srtStored, previewStored] = await Promise.all([
        storage.copyFromPath(srtKey, srtPath),
        storage.copyFromPath(previewKey, previewPath),
      ]);

      const [srtAsset, previewAsset] = await Promise.all([
        createAsset(project.id, "captions", srtKey, "application/x-subrip", srtStored.bytes, {}, expires(config.EXPORT_RETENTION_DAYS)),
        createAsset(project.id, "preview", previewKey, "video/mp4", previewStored.bytes, {
          clipId,
          cropMode: faceResult.detected ? "face" : "center",
          normalizedX: faceResult.normalizedX,
        }, expires(config.EXPORT_RETENTION_DAYS)),
      ]);

      await attachClipAssets(clipId, previewAsset, srtAsset);
      await updateJob(
        payload.jobId,
        "running",
        "rendering_previews",
        72 + Math.round(((index + 1) / clipIds.length) * 23)
      );
      await assertNotCanceled(project.id);
    }

    await setProjectStatus(project.id, "ready");
    await updateJob(payload.jobId, "succeeded", "results_ready", 100);
    await addStep(payload.jobId, "results_ready", "succeeded", { clipCount: clipIds.length });
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      logger.error({ stderr: (error as any).stderr }, "FFMPEG STDERR");
    }
    const message = error instanceof Error ? error.message : "Unknown media processing error";
    const canceled = message === "Processing canceled by user";

    await setProjectStatus(project.id, canceled ? "canceled" : "failed", {
      errorCode: canceled ? "CANCELED" : "PROCESSING_FAILED",
      errorMessage: message,
    });
    await updateJob(
      payload.jobId,
      canceled ? "canceled" : "retryable_failed",
      canceled ? "canceled" : "failed",
      0,
      { code: canceled ? "CANCELED" : "PROCESSING_FAILED", message }
    );
    throw error;
  } finally {
    await cleanupWorkDir(workDir);
  }
}

async function processExport(payload: Extract<WorkerPayload, { kind: "export" }>): Promise<void> {
  const clip = await getClip(payload.clipId);
  const project = await getProject(payload.projectId);
  const source = project ? await findAsset(project.id, "source") : null;

  if (!clip || !project || !source) throw new Error("Export source data is missing");
  const workDir = await createWorkDir(payload.jobId);

  try {
    await setExport(payload.exportId, "running");
    await stage(payload.jobId, "rendering_export", 20);

    const transcript = await getTranscript(project.id);
    const srtPath = join(workDir, "captions.srt");
    const outputPath = join(workDir, "export.mp4");
    const sourcePath = join(workDir, "source.mp4");

    await mkdir(workDir, { recursive: true });
    await storage.downloadToPath(source.storage_key, sourcePath);
    
    await writeFile(
      srtPath,
      toSrt(transcript, clip.start_ms, clip.end_ms, clip.caption_style as CaptionStyle),
      "utf8"
    );

    // If face crop mode is requested for vertical or square format, detect face position
    let faceResult = { cropX: 0, normalizedX: 0.5, detected: false };
    if (clip.crop_mode === "face" && ["9:16", "1:1", "4:5"].includes(clip.aspect_ratio)) {
      faceResult = await detectFaceCrop(
        sourcePath,
        clip.start_ms,
        clip.end_ms,
        clip.aspect_ratio as AspectRatio
      );
    }

    await renderClip(sourcePath, outputPath, {
      startMs: clip.start_ms,
      endMs: clip.end_ms,
      ratio: clip.aspect_ratio as AspectRatio,
      quality: project.settings.quality,
      srtPath,
      captionStyle: clip.caption_style as CaptionStyle,
      cropMode: clip.crop_mode === "face" && faceResult.detected ? "face" : "center",
      normalizedX: faceResult.normalizedX,
    });

    const key = derivedKey(project.id, "exports", `${payload.exportId}.mp4`);
    const stored = await storage.copyFromPath(key, outputPath);
    const asset = await createAsset(
      project.id,
      "export",
      key,
      "video/mp4",
      stored.bytes,
      { clipId: clip.id, preset: "social" },
      expires(config.EXPORT_RETENTION_DAYS)
    );

    await setExport(payload.exportId, "succeeded", asset);
    await updateJob(payload.jobId, "succeeded", "export_ready", 100);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown export error";
    await setExport(payload.exportId, "retryable_failed", undefined, message);
    await updateJob(payload.jobId, "retryable_failed", "export_failed", 0, {
      code: "EXPORT_FAILED",
      message,
    });
    throw error;
  } finally {
    await cleanupWorkDir(workDir);
  }
}

