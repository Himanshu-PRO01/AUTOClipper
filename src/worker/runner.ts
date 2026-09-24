import { Worker } from "bullmq";
import { config } from "../config.js";
import { connection, type WorkerPayload } from "../queue.js";
import { processMediaJob } from "./processor.js";
import { storage } from "../storage/index.js";
import { logger } from "../logger.js";

await storage.ensureStorage();
const worker = new Worker<WorkerPayload>(
  "media",
  async (job) => {
    return processMediaJob(job.data);
  },
  {
    connection,
    concurrency: 1,
    lockDuration: 300_000,
    stalledInterval: 60_000,
    maxStalledCount: 2,
  }
);
worker.on("completed", (job) => logger.info({ queueJobId: job.id, payload: job.data }, "media_job_completed"));
worker.on("failed", (job, error) => logger.error({ queueJobId: job?.id, payload: job?.data, error: error.message }, "media_job_failed"));
worker.on("error", (error) => logger.error({ error: error.message }, "bullmq_worker_error"));
logger.info({ concurrency: 1, env: config.NODE_ENV }, "media_worker_started");

