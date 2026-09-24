import { resolve } from 'node:path';
import { getProject, getTranscript, getClip } from './src/db/repository.ts';
import { toSrt } from './src/media/captions.ts';
import { renderClip } from './src/media/ffmpeg.ts';
import { promises as fs } from 'node:fs';
import 'dotenv/config';

function pathFor(key: string) { return resolve('./data/storage', key); }

async function run() {
  const projectId = '500fed8d-4f69-4390-90d7-1d7fbafcee08';
  const clipId = '83ac4174-831b-40e4-af6f-3a2334c0379b';

  const project = await getProject(projectId);
  if (!project) throw new Error('project not found');

  const clip = await getClip(clipId);
  if (!clip) throw new Error('clip not found');

  const transcript = await getTranscript(projectId);
  const srtPath = pathFor(`projects/${projectId}/work/${clipId}.srt`);
  
  // ensure work dir exists
  await fs.mkdir(resolve('./data/storage', `projects/${projectId}/work`), { recursive: true });

  const srtContent = toSrt(transcript, clip.start_ms, clip.end_ms);
  await fs.writeFile(srtPath, srtContent);
  console.log(`Generated SRT at ${srtPath}`);

  const sourcePath = pathFor(`projects/${projectId}/source/original`);
  const previewPath = pathFor(`projects/${projectId}/work/${clipId}.mp4`);

  console.log(`Starting renderClip...`);
  try {
    await renderClip(sourcePath, previewPath, {
      startMs: clip.start_ms,
      endMs: clip.end_ms,
      ratio: clip.aspect_ratio as "1:1" | "4:5" | "9:16",
      quality: project.settings.quality,
      srtPath,
      captionStyle: clip.caption_style as "bold" | "minimal",
      cropMode: clip.crop_mode as "center" | "face",
      normalizedX: 0.5
    });
    console.log(`Rendered clip successfully to ${previewPath}`);
  } catch (err) {
    console.error(`Failed to render clip:`, err);
  }

  process.exit(0);
}

run();
