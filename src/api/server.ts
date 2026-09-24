import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { FastifyAdapter } from "@bull-board/fastify";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { logger } from "../logger.js";
import { mediaQueue } from "../queue.js";
import { storage } from "../storage/index.js";
import { projectRoutes } from "./routes/projects.js";
import { clipRoutes } from "./routes/clips.js";
import { assetRoutes } from "./routes/assets.js";
import { exportRoutes } from "./routes/exports.js";

export async function buildServer() {
  const app = Fastify({
    loggerInstance: logger,
    bodyLimit: config.MAX_UPLOAD_BYTES,
    trustProxy: config.NODE_ENV === "production",
  });

  await app.register(fastifyCors, {
    origin: config.WEB_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  await app.register(fastifyMultipart, {
    limits: {
      fileSize: config.MAX_UPLOAD_BYTES,
      files: 1,
      fieldSize: 4096,
    },
  });

  // Serve processed media assets
  const storageRoot = resolve(config.STORAGE_ROOT);
  await app.register(fastifyStatic, {
    root: storageRoot,
    prefix: "/api/media/",
    decorateReply: false,
    serve: false, // manual serving with auth in routes
  });

  await app.register(projectRoutes, { prefix: "/api" });
  await app.register(clipRoutes, { prefix: "/api" });
  await app.register(assetRoutes, { prefix: "/api" });
  await app.register(exportRoutes, { prefix: "/api" });

  app.get("/api/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  }));

  const serverAdapter = new FastifyAdapter();
  createBullBoard({
    queues: [new BullMQAdapter(mediaQueue)],
    serverAdapter,
  });
  serverAdapter.setBasePath("/api/admin/queues");
  await app.register(serverAdapter.registerPlugin(), { prefix: "/api/admin/queues" });

  return app;
}

async function main() {
  await storage.ensureStorage();
  await mkdir(resolve(config.WORK_ROOT), { recursive: true });

  // Verify DB connection
  await pool.query("SELECT 1");

  const app = await buildServer();
  try {
    await app.listen({ host: config.HOST, port: config.PORT });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

import url from "node:url";

if (
  process.argv[1] &&
  import.meta.url === url.pathToFileURL(process.argv[1]).href
) {
  main().catch((err) => {
    logger.error(err);
    process.exit(1);
  });
}
