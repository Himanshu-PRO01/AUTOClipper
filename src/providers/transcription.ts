import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { config } from "../config.js";
import type { TranscriptSegment } from "../shared/types.js";

export interface TranscriptionProvider {
  transcribe(audioPath: string, language?: string): Promise<TranscriptSegment[]>;
}

export class FasterWhisperProvider implements TranscriptionProvider {
  async transcribe(audioPath: string, language?: string): Promise<TranscriptSegment[]> {
    const here = dirname(fileURLToPath(import.meta.url));
    const script = resolve(here, "../../scripts/transcribe.py");
    const args = [script, "--audio", audioPath, "--model", config.FASTER_WHISPER_MODEL];
    if (language) args.push("--language", language);

    const output = await new Promise<string>((resolvePromise, reject) => {
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(new Error("Transcription timed out after 5 minutes")), 300_000);
      
      const child = spawn(config.PYTHON_PATH, args, { windowsHide: true, shell: false, signal: ac.signal });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
      child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });
      child.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          resolvePromise(stdout);
        } else {
          reject(new Error(`faster-whisper failed (${code}): ${stderr.slice(-1000)}`));
        }
      });
    });

    const parsed = JSON.parse(output) as { segments: TranscriptSegment[] };
    if (!Array.isArray(parsed.segments) || parsed.segments.length === 0) {
      throw new Error("Transcription produced no speech segments");
    }
    return parsed.segments;
  }
}
