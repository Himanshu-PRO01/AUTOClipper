import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  STORAGE_ROOT: z.string().default("./data/storage"),
  WORK_ROOT: z.string().default("./data/work"),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().max(50 * 1024 * 1024 * 1024).default(10 * 1024 * 1024 * 1024),
  MAX_DURATION_SECONDS: z.coerce.number().int().positive().max(24 * 3600).default(4 * 3600),
  UPLOAD_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(10),
  SESSION_SECRET: z.string().min(24),
  PRIVATE_ACCESS_TOKEN: z.string().min(16),
  FFMPEG_PATH: z.string().default("ffmpeg"),
  FFPROBE_PATH: z.string().default("ffprobe"),
  PYTHON_PATH: z.string().default("python"),
  TRANSCRIPTION_PROVIDER: z.enum(["faster-whisper"]).default("faster-whisper"),
  FASTER_WHISPER_MODEL: z.string().default("small"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  JOB_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  SOURCE_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(14),
  EXPORT_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30)
});

export type AppConfig = z.infer<typeof schema>;
export const config: AppConfig = schema.parse(process.env);
