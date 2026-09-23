import { config } from "../config.js";
import type { GeminiRanking } from "../shared/types.js";

export interface HighlightProvider {
  rank(candidates: Array<{ startMs: number; endMs: number; transcriptExcerpt: string }>): Promise<GeminiRanking[]>;
}

export class GeminiHighlightProvider implements HighlightProvider {
  async rank(
    candidates: Array<{ startMs: number; endMs: number; transcriptExcerpt: string }>
  ): Promise<GeminiRanking[]> {
    if (!config.GEMINI_API_KEY) {
      console.warn("GEMINI_API_KEY not configured; using local heuristic highlight ranking");
      return [];
    }

    try {
      const prompt = `You rank candidate short-form video clips. Return JSON only: an array of objects with startMs, endMs, semanticScore (0-1), hookScore (0-1), title (max 90 chars), hook (max 140 chars), rationale (max 160 chars). Do not invent timestamps. Judge standalone clarity, useful insight, curiosity, specificity, and an opening hook. Candidates:\n${JSON.stringify(candidates)}`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(config.GEMINI_API_KEY)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2,
            },
          }),
          signal: AbortSignal.timeout(60_000),
        }
      );

      if (!response.ok) {
        console.warn(`Gemini ranking API responded with status ${response.status}: ${await response.text()}`);
        return [];
      }

      const body = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text =
        body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";

      const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
      if (!cleaned) return [];

      const parsed: unknown = JSON.parse(cleaned);
      if (!Array.isArray(parsed)) return [];

      return parsed.filter(
        (item): item is GeminiRanking =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as GeminiRanking).startMs === "number" &&
          typeof (item as GeminiRanking).endMs === "number"
      );
    } catch (err) {
      console.warn("Gemini highlight ranking encountered an error; falling back to local scoring:", err instanceof Error ? err.message : err);
      return [];
    }
  }
}

