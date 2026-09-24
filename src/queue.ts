import { Queue } from "bullmq";
import { Redis as IORedis } from "ioredis";
import { config } from "./config.js";
import { logger } from "./logger.js";

export type AnalyzeJobPayload = { jobId: string; projectId: string; kind: "analyze" };
export type ExportJobPayload = { jobId: string; projectId: string; clipId: string; exportId: string; kind: "export" };
export type WorkerPayload = AnalyzeJobPayload | ExportJobPayload;
export const connection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });
connection.on("error", (err) => logger.error({ error: err.message }, "redis_connection_error"));

export const mediaQueue = new Queue<WorkerPayload>("media", { connection, defaultJobOptions: { attempts: config.JOB_ATTEMPTS, backoff: { type: "exponential", delay: 3000 }, removeOnComplete: 100, removeOnFail: 500 } });
