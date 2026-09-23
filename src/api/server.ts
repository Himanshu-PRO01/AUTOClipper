import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { ensureStorage } from "../storage/local.js";
import { projectRoutes } from "./routes/projects.js";
import { clipRoutes } from "./routes/clips.js";
import { assetRoutes } from "./routes/assets.js";
import { exportRoutes } from "./routes/exports.js";

export async function buildServer() {
  const app = Fastify({
    logger: {
      transport:
        config.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
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

  return app;
}

async function main() {
  await ensureStorage();
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
