import { renderClip } from "./src/media/ffmpeg.js";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";

async function run() {
  try {
    mkdirSync("scratch", { recursive: true });
  } catch (e) {}
  
  const srtPath = resolve("scratch/test.srt");
  writeFileSync(srtPath, "1\n00:00:00,000 --> 00:00:01,000\nTest\n");
  
  const inPath = resolve("scratch/dummy.mp4");
  const cp = await import("node:child_process");
  cp.execSync(`ffmpeg -y -f lavfi -i testsrc=duration=2:size=1280x720:rate=30 "${inPath}"`, { stdio: 'inherit' });
  
  try {
    await renderClip(inPath, resolve("scratch/out.mp4"), {
      startMs: 0,
      endMs: 2000,
      ratio: "9:16",
      quality: "draft",
      srtPath,
      captionStyle: "bold",
      cropMode: "face",
      normalizedX: 0.6
    });
    console.log("SUCCESS");
  } catch(e) {
    console.error("ERROR:", e);
  }
}
run();
