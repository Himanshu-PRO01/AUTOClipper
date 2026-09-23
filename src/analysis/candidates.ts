import type { ClipCandidate, GeminiRanking, ProcessingSettings, TranscriptSegment } from "../shared/types.js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function cleanText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

const CONJUNCTION_STARTERS = new Set([
  "and", "but", "so", "because", "or", "then", "like", "well", "plus", "also", "however", "though"
]);

const HOOK_PATTERNS = [
  /\?/,
  /\b(how to|why you|what if|the secret|the biggest mistake|never|always|stop doing|the truth about|here is how|here's how|nobody talks about|i discovered|best way|worst thing|did you know|watch this|listen to this|before you)\b/i,
  /\b(you need to|you should|if you want|the reason why|number one rule|unbelievable|mind-blowing)\b/i,
];

function isSentenceStart(segment: TranscriptSegment, prevSegment?: TranscriptSegment): boolean {
  const text = segment.text.trim();
  if (!text) return false;
  // If preceded by long pause (> 600ms), likely a new thought
  if (prevSegment && segment.startMs - prevSegment.endMs >= 600) return true;
  // Capital letter start and not starting with a conjunction
  const firstWord = text.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  if (CONJUNCTION_STARTERS.has(firstWord)) return false;
  return /^[A-Z0-9"']/.test(text);
}

function isSentenceEnd(segment: TranscriptSegment, nextSegment?: TranscriptSegment): boolean {
  const text = segment.text.trim();
  if (!text) return true;
  // Terminal punctuation
  if (/[.!?]["']?$/.test(text)) return true;
  // Significant pause before next speech (> 700ms)
  if (nextSegment && nextSegment.startMs - segment.endMs >= 700) return true;
  return false;
}

function evaluateHook(segments: TranscriptSegment[], clipStartMs: number): number {
  // Extract words in the first 7 seconds of the clip
  const openingSegments = segments.filter(
    (s) => s.startMs < clipStartMs + 7000 && s.endMs > clipStartMs
  );
  const openingText = openingSegments.map((s) => s.text).join(" ");
  if (!openingText) return 0.2;

  let score = 0.2;
  for (const pattern of HOOK_PATTERNS) {
    if (pattern.test(openingText)) {
      score += 0.3;
    }
  }

  // Direct address bonus ("you", "your") in opening
  if (/\b(you|your|you're)\b/i.test(openingText)) {
    score += 0.2;
  }

  return clamp(score, 0, 1);
}

function generateLocalTitleAndHook(segments: TranscriptSegment[]): { title: string; hook: string } {
  const fullText = segments.map((s) => s.text.trim()).join(" ");
  const sentences = fullText.split(/(?<=[.!?])\s+/).filter(Boolean);

  let title = "";
  let hook = "";

  if (sentences.length > 0) {
    const firstSentence = sentences[0]?.trim() ?? "";
    hook = firstSentence.slice(0, 140);

    // Look for a question or strong statement for the title
    const questionSentence = sentences.find((s) => s.includes("?"));
    if (questionSentence && questionSentence.length <= 80) {
      title = questionSentence.replace(/[.!?]+$/, "");
    } else {
      title = firstSentence.slice(0, 75).replace(/[.!?]+$/, "");
    }
  } else {
    title = fullText.slice(0, 75);
    hook = fullText.slice(0, 140);
  }

  return {
    title: title || "Video Highlight",
    hook: hook || "Watch this highlight",
  };
}

export function buildCandidates(
  segments: TranscriptSegment[],
  settings: ProcessingSettings,
  durationMs: number
): ClipCandidate[] {
  if (segments.length === 0) return [];

  const requestedMinMs = settings.minDurationSeconds * 1000;
  // If the source video duration is shorter than requested min duration, adapt dynamically
  const minMs = durationMs > 0 && durationMs < requestedMinMs
    ? Math.max(4000, Math.floor(durationMs * 0.35))
    : requestedMinMs;
  const maxMs = settings.maxDurationSeconds * 1000;
  const output: ClipCandidate[] = [];

  for (let startIndex = 0; startIndex < segments.length; startIndex++) {
    const startSegment = segments[startIndex];
    if (!startSegment) continue;

    // Prefer starting at clean sentence starts
    const prevSegment = startIndex > 0 ? segments[startIndex - 1] : undefined;
    const isCleanStart = isSentenceStart(startSegment, prevSegment);

    const currentGroup: TranscriptSegment[] = [];
    const clipStartMs = startSegment.startMs;

    for (let index = startIndex; index < segments.length; index++) {
      const segment = segments[index];
      if (!segment) break;

      const currentDuration = segment.endMs - clipStartMs;
      if (currentDuration > maxMs) break;

      currentGroup.push(segment);

      if (currentDuration >= minMs) {
        const nextSegment = index + 1 < segments.length ? segments[index + 1] : undefined;
        const isCleanEnd = isSentenceEnd(segment, nextSegment);

        // Score this candidate window
        const clipEndMs = segment.endMs;
        const clipDurationSec = (clipEndMs - clipStartMs) / 1000;
        const text = cleanText(currentGroup.map((s) => s.text).join(" "));
        const words = text.split(/\s+/).filter(Boolean);
        const wpm = (words.length / clipDurationSec) * 60;

        // Pacing score: 130 - 180 WPM is optimal
        const pacingScore = clamp(1.0 - Math.abs(wpm - 150) / 100, 0.2, 1.0);

        // Silence penalty: count any gaps > 2.5s within the clip
        let deadAirCount = 0;
        for (let g = 0; g < currentGroup.length - 1; g++) {
          const gap = (currentGroup[g + 1]?.startMs ?? 0) - (currentGroup[g]?.endMs ?? 0);
          if (gap > 2500) deadAirCount++;
        }
        const silencePenalty = Math.max(0, deadAirCount * 0.15);

        // Hook score in the first 7s
        const hookScore = evaluateHook(currentGroup, clipStartMs);

        // Transcript confidence
        const avgConfidence =
          currentGroup.reduce((sum, s) => sum + (s.confidence ?? 0.8), 0) / currentGroup.length;

        // Boundary bonus: reward complete thoughts
        const boundaryBonus = (isCleanStart ? 0.1 : 0) + (isCleanEnd ? 0.1 : 0);

        const compositeScore = clamp(
          0.2 +
            hookScore * 0.3 +
            pacingScore * 0.25 +
            avgConfidence * 0.15 +
            boundaryBonus -
            silencePenalty,
          0.1,
          1.0
        );

        const { title, hook } = generateLocalTitleAndHook(currentGroup);

        output.push({
          startMs: clipStartMs,
          endMs: clipEndMs,
          score: Number(compositeScore.toFixed(3)),
          scoreBreakdown: {
            hookStrength: hookScore,
            speechPacing: pacingScore,
            confidence: avgConfidence,
            boundaryQuality: isCleanStart && isCleanEnd ? 1.0 : isCleanStart || isCleanEnd ? 0.6 : 0.2,
          },
          title,
          hook,
          transcriptExcerpt: text,
        });

        // If we hit a very clean sentence end, we can record this candidate and continue exploring
        // up to maxMs to find longer multi-sentence thoughts
      }
    }
  }

  const validOutput = output.filter((c) => c.endMs <= durationMs);
  if (validOutput.length > 0) return validOutput;

  const first = segments[0];
  const last = segments[segments.length - 1];
  if (first && last) {
    const fallbackEnd = Math.min(durationMs, last.endMs);
    if (fallbackEnd > first.startMs) {
      const text = cleanText(segments.map((s) => s.text).join(" "));
      const { title, hook } = generateLocalTitleAndHook(segments);
      return [{
        startMs: first.startMs,
        endMs: fallbackEnd,
        score: 0.85,
        scoreBreakdown: { hookStrength: 0.8, speechPacing: 0.8, confidence: 0.9, boundaryQuality: 1.0 },
        title,
        hook,
        transcriptExcerpt: text,
      }];
    }
  }

  return [];
}

export function applyGeminiRankings(
  candidates: ClipCandidate[],
  rankings: GeminiRanking[]
): ClipCandidate[] {
  if (!rankings || rankings.length === 0) return candidates;

  return candidates.map((candidate) => {
    const ranked = rankings.find(
      (item) =>
        Math.abs(item.startMs - candidate.startMs) < 3000 &&
        Math.abs(item.endMs - candidate.endMs) < 4500
    );

    if (!ranked) return candidate;

    const semantic = clamp(ranked.semanticScore, 0, 1);
    const hook = clamp(ranked.hookScore, 0, 1);

    const updatedScore = clamp(candidate.score * 0.5 + semantic * 0.35 + hook * 0.15, 0, 1);

    return {
      ...candidate,
      score: Number(updatedScore.toFixed(3)),
      scoreBreakdown: {
        ...candidate.scoreBreakdown,
        semanticInterest: semantic,
        geminiHook: hook,
      },
      title: ranked.title?.trim() || candidate.title,
      hook: ranked.hook?.trim() || candidate.hook,
    };
  });
}

function wordTokenSet(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  return new Set(tokens);
}

function tokenOverlapRatio(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  return intersection / Math.min(setA.size, setB.size);
}

export function selectNonOverlapping(
  candidates: ClipCandidate[],
  requested: number
): ClipCandidate[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const selected: ClipCandidate[] = [];
  const tokenSets: Set<string>[] = [];

  for (const candidate of sorted) {
    const candidateTokens = wordTokenSet(candidate.transcriptExcerpt);

    const hasConflict = selected.some((existing, idx) => {
      // Time overlap (IoU)
      const interStart = Math.max(candidate.startMs, existing.startMs);
      const interEnd = Math.min(candidate.endMs, existing.endMs);
      const intersection = Math.max(0, interEnd - interStart);
      const minDuration = Math.min(
        candidate.endMs - candidate.startMs,
        existing.endMs - existing.startMs
      );

      if (intersection / minDuration > 0.35) return true;

      // Textual / Semantic deduplication (prevent duplicate takes of the same idea)
      const existingTokens = tokenSets[idx];
      if (existingTokens && tokenOverlapRatio(candidateTokens, existingTokens) > 0.5) {
        return true;
      }

      return false;
    });

    if (!hasConflict) {
      selected.push(candidate);
      tokenSets.push(candidateTokens);
    }

    if (selected.length >= requested) break;
  }

  return selected.map((candidate, index) => ({
    ...candidate,
    score: Number(candidate.score.toFixed(3)),
    title: candidate.title.trim().slice(0, 100) || `Highlight Clip #${index + 1}`,
  }));
}

