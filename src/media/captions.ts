import type { CaptionStyle, TranscriptSegment } from "../shared/types.js";

function formatTimestamp(milliseconds: number): string {
  const ms = Math.max(0, Math.round(milliseconds));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const remainderMs = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(remainderMs).padStart(3, "0")}`;
}

interface SubtitleCue {
  startMs: number;
  endMs: number;
  text: string;
}

export function toSrt(
  segments: TranscriptSegment[],
  clipStartMs: number,
  clipEndMs: number,
  style: CaptionStyle = "bold"
): string {
  if (style === "none") return "";

  const durationMs = clipEndMs - clipStartMs;
  const cues: SubtitleCue[] = [];

  // Filter segments that overlap with clip
  const relevant = segments.filter(
    (segment) => segment.endMs > clipStartMs && segment.startMs < clipEndMs
  );

  for (const segment of relevant) {
    // If word-level timing is available, group words into 3-5 word rhythmic chunks
    if (segment.words && segment.words.length > 0) {
      const validWords = segment.words.filter(
        (w) => w.endMs > clipStartMs && w.startMs < clipEndMs
      );

      if (validWords.length > 0) {
        let chunk: typeof validWords = [];
        let chunkCharCount = 0;

        for (const word of validWords) {
          const wordLen = word.word.length;
          const wouldExceedCharLimit = chunkCharCount + wordLen > 28;
          const reachesWordLimit = chunk.length >= 4;
          const hasPunctuation = /[.!?]$/.test(word.word);

          chunk.push(word);
          chunkCharCount += wordLen + 1;

          if (reachesWordLimit || wouldExceedCharLimit || hasPunctuation) {
            const first = chunk[0];
            const last = chunk[chunk.length - 1];
            if (first && last) {
              const cueStart = Math.max(0, first.startMs - clipStartMs);
              const cueEnd = Math.min(durationMs, Math.max(cueStart + 400, last.endMs - clipStartMs));
              let text = chunk.map((w) => w.word.trim()).join(" ").trim();
              if (style === "karaoke") {
                text = text.toUpperCase();
              }
              if (text) {
                cues.push({ startMs: cueStart, endMs: cueEnd, text });
              }
            }
            chunk = [];
            chunkCharCount = 0;
          }
        }

        // Remainder chunk
        if (chunk.length > 0) {
          const first = chunk[0];
          const last = chunk[chunk.length - 1];
          if (first && last) {
            const cueStart = Math.max(0, first.startMs - clipStartMs);
            const cueEnd = Math.min(durationMs, Math.max(cueStart + 400, last.endMs - clipStartMs));
            let text = chunk.map((w) => w.word.trim()).join(" ").trim();
            if (style === "karaoke") {
              text = text.toUpperCase();
            }
            if (text) {
              cues.push({ startMs: cueStart, endMs: cueEnd, text });
            }
          }
        }
        continue;
      }
    }

    // Fallback: segment-level breakdown if no word timestamps
    const segStart = Math.max(0, segment.startMs - clipStartMs);
    const segEnd = Math.min(durationMs, segment.endMs - clipStartMs);
    const textWords = segment.text.trim().split(/\s+/).filter(Boolean);

    if (textWords.length <= 5) {
      let text = segment.text.trim();
      if (style === "karaoke") text = text.toUpperCase();
      cues.push({ startMs: segStart, endMs: segEnd, text });
    } else {
      // Split into 4-word subchunks with distributed timestamps
      const chunkSize = 4;
      const totalChunks = Math.ceil(textWords.length / chunkSize);
      const segDuration = segEnd - segStart;
      const chunkDuration = segDuration / totalChunks;

      for (let i = 0; i < totalChunks; i++) {
        const subWords = textWords.slice(i * chunkSize, (i + 1) * chunkSize);
        const cStart = segStart + Math.round(i * chunkDuration);
        const cEnd = Math.min(durationMs, segStart + Math.round((i + 1) * chunkDuration));
        let text = subWords.join(" ");
        if (style === "karaoke") text = text.toUpperCase();
        cues.push({ startMs: cStart, endMs: cEnd, text });
      }
    }
  }

  // Deduplicate / ensure strictly increasing timestamps
  cues.sort((a, b) => a.startMs - b.startMs);

  return cues
    .map((cue, index) => {
      return `${index + 1}\n${formatTimestamp(cue.startMs)} --> ${formatTimestamp(cue.endMs)}\n${cue.text}\n`;
    })
    .join("\n");
}

