import { describe, expect, it } from "vitest";
import { buildCandidates, selectNonOverlapping, applyGeminiRankings } from "./candidates.js";
import type { ProcessingSettings, TranscriptSegment, GeminiRanking } from "../shared/types.js";

describe("Candidate highlighting and ranking", () => {
  const defaultSettings: ProcessingSettings = {
    clipCount: 3,
    minDurationSeconds: 10,
    maxDurationSeconds: 60,
    aspectRatio: "9:16",
    captionStyle: "bold",
    quality: "standard",
    generateTitles: true,
  };

  const sampleTranscript: TranscriptSegment[] = [
    {
      startMs: 0,
      endMs: 6000,
      text: "Did you know that ninety percent of viral videos hook the viewer immediately?",
      confidence: 0.95,
      words: [],
    },
    {
      startMs: 6500,
      endMs: 14000,
      text: "The biggest mistake creators make is introducing themselves before the value.",
      confidence: 0.92,
      words: [],
    },
    {
      startMs: 15000,
      endMs: 24000,
      text: "Here is the secret to keeping audience retention high throughout your entire clip.",
      confidence: 0.94,
      words: [],
    },
    {
      startMs: 25000,
      endMs: 35000,
      text: "Always use dynamic pacing, bold captions, and remove boring pauses.",
      confidence: 0.96,
      words: [],
    },
  ];

  it("builds candidates that meet duration criteria and have valid scoring", () => {
    const candidates = buildCandidates(sampleTranscript, defaultSettings, 35000);
    expect(candidates.length).toBeGreaterThan(0);

    for (const c of candidates) {
      expect(c.startMs).toBeGreaterThanOrEqual(0);
      expect(c.endMs).toBeLessThanOrEqual(35000);
      expect(c.endMs).toBeGreaterThan(c.startMs);
      expect(c.score).toBeGreaterThanOrEqual(0);
      expect(c.score).toBeLessThanOrEqual(1);
      expect(c.title).toBeTruthy();
      expect(c.hook).toBeTruthy();
    }
  });

  it("adapts dynamically if video duration is shorter than requested min duration", () => {
    const shortSettings: ProcessingSettings = {
      ...defaultSettings,
      minDurationSeconds: 45, // video is only 20s
    };
    const shortTranscript = sampleTranscript.slice(0, 2); // 0 to 14000ms
    const candidates = buildCandidates(shortTranscript, shortSettings, 14000);
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("selectNonOverlapping limits to requested count and rejects conflicting overlaps", () => {
    const candidates = buildCandidates(sampleTranscript, defaultSettings, 35000);
    const selected = selectNonOverlapping(candidates, 2);

    expect(selected.length).toBeLessThanOrEqual(2);
    if (selected.length === 2) {
      const first = selected[0]!;
      const second = selected[1]!;
      const interStart = Math.max(first.startMs, second.startMs);
      const interEnd = Math.min(first.endMs, second.endMs);
      const overlap = Math.max(0, interEnd - interStart);
      const minLen = Math.min(first.endMs - first.startMs, second.endMs - second.startMs);
      expect(overlap / minLen).toBeLessThanOrEqual(0.35);
    }
  });

  it("applies Gemini rankings to elevate semantic score and title", () => {
    const candidates = buildCandidates(sampleTranscript, defaultSettings, 35000);
    const initialCandidate = candidates[0]!;

    const geminiRankings: GeminiRanking[] = [
      {
        startMs: initialCandidate.startMs,
        endMs: initialCandidate.endMs,
        semanticScore: 0.99,
        hookScore: 0.95,
        title: "Ultimate Retention Formula",
        hook: "Mind-blowing retention trick",
        rationale: "Exceptional hook and pacing",
      },
    ];

    const updated = applyGeminiRankings(candidates, geminiRankings);
    const updatedCandidate = updated.find(
      (c) => c.startMs === initialCandidate.startMs && c.endMs === initialCandidate.endMs
    );

    expect(updatedCandidate).toBeDefined();
    expect(updatedCandidate?.title).toBe("Ultimate Retention Formula");
    expect(updatedCandidate?.hook).toBe("Mind-blowing retention trick");
  });
});
