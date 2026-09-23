export const projectStatuses = ["draft", "uploading", "uploaded", "queued", "processing", "ready", "failed", "cancel_requested", "canceled"] as const;
export type ProjectStatus = (typeof projectStatuses)[number];
export type JobStatus = "queued" | "running" | "succeeded" | "retryable_failed" | "terminal_failed" | "canceled";
export type AssetKind = "source" | "audio" | "proxy" | "preview" | "export" | "captions" | "thumbnail";
export type AspectRatio = "9:16" | "1:1" | "4:5" | "16:9";
export type CaptionStyle = "bold" | "minimal" | "karaoke" | "none";

export interface ProcessingSettings {
  clipCount: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  aspectRatio: AspectRatio;
  captionStyle: CaptionStyle;
  quality: "draft" | "standard" | "high";
  generateTitles: boolean;
  language?: string;
}

export interface TranscriptWord { word: string; startMs: number; endMs: number; probability?: number; }
export interface TranscriptSegment { startMs: number; endMs: number; text: string; speaker?: string; confidence?: number; words: TranscriptWord[]; }
export interface VideoMetadata { durationMs: number; width: number; height: number; codec: string; hasAudio: boolean; }
export interface ClipCandidate { startMs: number; endMs: number; score: number; scoreBreakdown: Record<string, number>; title: string; hook?: string; transcriptExcerpt: string; }
export interface GeminiRanking { startMs: number; endMs: number; semanticScore: number; hookScore: number; title: string; hook: string; rationale: string; }

export interface ProjectRecord {
  id: string; title: string; status: ProjectStatus; originalFilename: string; mimeType: string; bytes: number;
  durationMs: number | null; width: number | null; height: number | null; settings: ProcessingSettings;
  errorCode: string | null; errorMessage: string | null; createdAt: string; updatedAt: string;
}
