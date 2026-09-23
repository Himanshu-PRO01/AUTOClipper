import { describe, expect, it } from "vitest";
import { toSrt } from "./captions.js";
import type { TranscriptSegment } from "../shared/types.js";

describe("toSrt captions generator", () => {
  const mockSegments: TranscriptSegment[] = [
    {
      startMs: 0,
      endMs: 3000,
      text: "Welcome to AutoClip tutorial",
      confidence: 0.95,
      words: [
        { word: "Welcome", startMs: 0, endMs: 600, probability: 0.9 },
        { word: "to", startMs: 600, endMs: 800, probability: 0.95 },
        { word: "AutoClip", startMs: 800, endMs: 1800, probability: 0.99 },
        { word: "tutorial", startMs: 1800, endMs: 2800, probability: 0.92 },
      ],
    },
    {
      startMs: 3500,
      endMs: 7000,
      text: "Create viral shorts automatically.",
      confidence: 0.98,
      words: [
        { word: "Create", startMs: 3500, endMs: 4000, probability: 0.9 },
        { word: "viral", startMs: 4000, endMs: 4600, probability: 0.95 },
        { word: "shorts", startMs: 4600, endMs: 5200, probability: 0.98 },
        { word: "automatically.", startMs: 5200, endMs: 6500, probability: 0.99 },
      ],
    },
  ];

  it("returns empty string when style is 'none'", () => {
    const srt = toSrt(mockSegments, 0, 7000, "none");
    expect(srt).toBe("");
  });

  it("generates valid SRT format with sequential numbering and timestamps", () => {
    const srt = toSrt(mockSegments, 0, 7000, "bold");
    expect(srt).toContain("1\n");
    expect(srt).toMatch(/\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/);
    expect(srt).toContain("Welcome to AutoClip tutorial");
    expect(srt).toContain("Create viral shorts automatically.");
  });

  it("uppercases text for karaoke style", () => {
    const srt = toSrt(mockSegments, 0, 7000, "karaoke");
    expect(srt).toContain("WELCOME TO AUTOCLIP TUTORIAL");
    expect(srt).toContain("CREATE VIRAL SHORTS AUTOMATICALLY.");
  });

  it("properly offsets timestamps relative to clip start", () => {
    const srt = toSrt(mockSegments, 3000, 7000, "bold");
    // Segment starts at 3500ms, relative to 3000ms clip start is 500ms (00:00:00,500)
    expect(srt).toContain("00:00:00,500 -->");
  });
});
