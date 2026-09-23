import { Worker } from "bullmq";
import { config } from "../config.js";
import { connection, type WorkerPayload } from "../queue.js";
import { processMediaJob } from "./processor.js";
import { ensureStorage } from "../storage/local.js";

await ensureStorage();
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
worker.on("completed", (job) => console.log(JSON.stringify({ level: "info", message: "media_job_completed", queueJobId: job.id, payload: job.data })));
worker.on("failed", (job, error) => console.error(JSON.stringify({ level: "error", message: "media_job_failed", queueJobId: job?.id, payload: job?.data, error: error.message })));
console.log(JSON.stringify({ level: "info", message: "media_worker_started", concurrency: 1, env: config.NODE_ENV }));

