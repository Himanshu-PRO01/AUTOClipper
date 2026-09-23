import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import type { AspectRatio, CaptionStyle, VideoMetadata } from "../shared/types.js";

export class MediaError extends Error {
  constructor(message: string, public readonly stderr: string) {
    super(message);
    this.name = "MediaError";
  }
}

export interface RunResult {
  stdout: string;
  stderr: string;
}

export async function run(
  binary: string,
  args: string[],
  timeoutMs = 7_200_000
): Promise<RunResult> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(binary, args, { windowsHide: true, shell: false });
    let stderr = "";
    let stdout = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (process.platform === "win32" && child.pid) {
          spawn("taskkill", ["/pid", child.pid.toString(), "/f", "/t"], { windowsHide: true, shell: false });
        } else {
          child.kill("SIGKILL");
        }
      } catch {
        child.kill();
      }
    }, timeoutMs);

    child.stdout.on("data", (data: Buffer) => {
      if (stdout.length < 2_000_000) stdout += data.toString();
    });

    child.stderr.on("data", (data: Buffer) => {
      if (stderr.length < 2_000_000) stderr += data.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolvePromise({ stdout, stderr });
      } else {
        const errorMsg = timedOut ? "Process timed out" : `${binary} exited with code ${code}`;
        reject(new MediaError(errorMsg, stderr));
      }
    });
  });
}

export async function probe(input: string): Promise<VideoMetadata> {
  const result = await run(
    config.FFPROBE_PATH,
    [
      "-v", "error",
      "-show_entries", "format=duration:stream=codec_type,codec_name,width,height",
      "-of", "json",
      input,
    ],
    60_000
  );

  const parsed = JSON.parse(result.stdout) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type: string;
      codec_name?: string;
      width?: number;
      height?: number;
    }>;
  };

  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const audio = parsed.streams?.some((stream) => stream.codec_type === "audio") ?? false;
  const durationMs = Math.round(Number(parsed.format?.duration ?? 0) * 1000);

  if (!video || !Number.isFinite(durationMs) || durationMs <= 0 || !video.width || !video.height) {
    throw new MediaError("Unsupported or corrupt video", "No valid video stream or duration detected");
  }

  return {
    durationMs,
    width: video.width,
    height: video.height,
    codec: video.codec_name ?? "unknown",
    hasAudio: audio,
  };
}

export async function createWorkDir(jobId: string): Promise<string> {
  const dir = resolve(config.WORK_ROOT, `${jobId}-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function cleanupWorkDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 2 });
}

export async function extractAudio(input: string, output: string): Promise<void> {
  await mkdir(dirname(output), { recursive: true });
  await run(config.FFMPEG_PATH, [
    "-y",
    "-i", input,
    "-vn",
    "-ac", "1",
    "-ar", "16000",
    "-c:a", "pcm_s16le",
    output,
  ]);
}

export async function createProxy(input: string, output: string): Promise<void> {
  await mkdir(dirname(output), { recursive: true });
  await run(config.FFMPEG_PATH, [
    "-y",
    "-i", input,
    "-vf", "scale='min(1280,iw)':-2:force_original_aspect_ratio=decrease",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "24",
    "-c:a", "aac",
    "-movflags", "+faststart",
    output,
  ]);
}

export async function detectSceneBoundaries(input: string): Promise<number[]> {
  try {
    const result = await run(
      config.FFMPEG_PATH,
      [
        "-hide_banner",
        "-i", input,
        "-filter_complex", "select='gt(scene,0.35)',showinfo",
        "-an",
        "-f", "null",
        "-",
      ],
      900_000
    );

    const matches = [...result.stderr.matchAll(/pts_time:([0-9.]+)/g)];
    return matches
      .map((match) => Math.round(Number(match[1]) * 1000))
      .filter(Number.isFinite);
  } catch (error) {
    if (error instanceof MediaError) {
      const matches = [...error.stderr.matchAll(/pts_time:([0-9.]+)/g)];
      return matches
        .map((match) => Math.round(Number(match[1]) * 1000))
        .filter(Number.isFinite);
    }
    throw error;
  }
}

export interface FaceCropResult {
  cropX: number;
  normalizedX: number;
  detected: boolean;
}

export async function detectFaceCrop(
  videoPath: string,
  startMs: number,
  endMs: number,
  ratio: AspectRatio
): Promise<FaceCropResult> {
  const here = dirname(fileURLToPath(import.meta.url));
  const script = resolve(here, "../../scripts/detect_face_crop.py");

  const startSec = (startMs / 1000).toFixed(2);
  const endSec = (endMs / 1000).toFixed(2);

  try {
    const result = await run(
      config.PYTHON_PATH,
      [
        script,
        "--video", videoPath,
        "--start", startSec,
        "--end", endSec,
        "--ratio", ratio,
        "--samples", "12",
      ],
      30_000
    );

    const parsed = JSON.parse(result.stdout.trim()) as FaceCropResult;
    return {
      cropX: parsed.cropX ?? 0,
      normalizedX: typeof parsed.normalizedX === "number" ? parsed.normalizedX : 0.5,
      detected: Boolean(parsed.detected),
    };
  } catch {
    // If detection script fails, fall back to center crop cleanly
    return { cropX: 0, normalizedX: 0.5, detected: false };
  }
}

const dimensions: Record<AspectRatio, [number, number]> = {
  "9:16": [1080, 1920],
  "1:1": [1080, 1080],
  "4:5": [1080, 1350],
  "16:9": [1920, 1080],
};

function subtitleFilter(
  srtPath: string,
  style: CaptionStyle,
  ratio: AspectRatio
): string | undefined {
  if (style === "none") return undefined;

  const escaped = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const [, height] = dimensions[ratio];

  // Scale font size and vertical margin according to display canvas height
  const scaleFactor = height / 1920;
  const baseMargin = Math.round(180 * scaleFactor);
  const baseFontSize = Math.round(24 * scaleFactor);

  let forceStyle = "";
  switch (style) {
    case "minimal": {
      const fontSize = Math.max(14, Math.round(18 * scaleFactor));
      const marginV = Math.max(40, Math.round(120 * scaleFactor));
      forceStyle = `FontName=Arial,Bold=0,FontSize=${fontSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,Outline=1,Shadow=1,Alignment=2,MarginV=${marginV}`;
      break;
    }
    case "karaoke": {
      // High-energy punchy cyan highlight
      const fontSize = Math.max(18, Math.round(26 * scaleFactor));
      const marginV = Math.max(50, baseMargin);
      forceStyle = `FontName=Arial,Bold=1,FontSize=${fontSize},PrimaryColour=&H00FFFF00,OutlineColour=&H00000000,Outline=3,Shadow=2,Alignment=2,MarginV=${marginV}`;
      break;
    }
    case "bold":
    default: {
      // Punchy modern yellow subtitle with thick outline
      const fontSize = Math.max(18, baseFontSize);
      const marginV = Math.max(50, baseMargin);
      forceStyle = `FontName=Arial,Bold=1,FontSize=${fontSize},PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,Outline=3,Shadow=2,Alignment=2,MarginV=${marginV}`;
      break;
    }
  }

  return `subtitles=filename='${escaped}':force_style='${forceStyle}'`;
}

export interface RenderClipOptions {
  startMs: number;
  endMs: number;
  ratio: AspectRatio;
  quality: "draft" | "standard" | "high";
  srtPath?: string;
  captionStyle: CaptionStyle;
  cropMode?: "center" | "face";
  normalizedX?: number;
}

export async function renderClip(
  input: string,
  output: string,
  options: RenderClipOptions
): Promise<void> {
  const [targetW, targetH] = dimensions[options.ratio];

  // Compute crop filter:
  // If face tracking is enabled and normalizedX is supplied, align horizontal center to face
  let cropFilter = "";
  if (options.cropMode === "face" && typeof options.normalizedX === "number") {
    const normX = Math.max(0.1, Math.min(0.9, options.normalizedX));
    // Scale so both dimensions meet or exceed target, then crop at calculated x-offset
    const cropXExpr = `max(0,min(iw-${targetW},iw*${normX}-${targetW}/2))`;
    cropFilter = `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH}:${cropXExpr}:(ih-${targetH})/2`;
  } else {
    // Default center crop
    cropFilter = `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH}`;
  }

  const subtitles = options.srtPath
    ? subtitleFilter(options.srtPath, options.captionStyle, options.ratio)
    : undefined;

  const filters = subtitles ? `${cropFilter},${subtitles}` : cropFilter;
  const crf = options.quality === "high" ? "18" : options.quality === "draft" ? "28" : "22";

  await mkdir(dirname(output), { recursive: true });
  await run(config.FFMPEG_PATH, [
    "-y",
    "-ss", (options.startMs / 1000).toFixed(3),
    "-to", (options.endMs / 1000).toFixed(3),
    "-i", input,
    "-map", "0:v:0",
    "-map", "0:a?",
    "-vf", filters,
    "-c:v", "libx264",
    "-preset", options.quality === "high" ? "medium" : "veryfast",
    "-crf", crf,
    "-c:a", "aac",
    "-b:a", "160k",
    "-movflags", "+faststart",
    output,
  ]);
}

export function localFile(dir: string, name: string): string {
  return join(dir, name);
}

