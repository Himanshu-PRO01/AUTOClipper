import type { FastifyPluginAsync } from "fastify";
import { getExport, getAsset } from "../../db/repository.js";
import { pathFor } from "../../storage/local.js";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

export const exportRoutes: FastifyPluginAsync = async (app) => {
  // Poll export status
  app.get<{ Params: { exportId: string } }>("/exports/:exportId", async (req, reply) => {
    const exp = await getExport(req.params.exportId);
    if (!exp) return reply.status(404).send({ error: "Export not found" });

    let downloadUrl: string | null = null;
    if (exp.status === "succeeded" && exp.asset_id) {
      downloadUrl = `/api/exports/${exp.id}/download`;
    }

    return reply.send({
      id: exp.id,
      clipId: exp.clip_id,
      status: exp.status,
      preset: exp.preset,
      downloadUrl,
      errorMessage: exp.error_message,
    });
  });

  // Download export file
  app.get<{ Params: { exportId: string } }>(
    "/exports/:exportId/download",
    async (req, reply) => {
      const exp = await getExport(req.params.exportId);
      if (!exp || exp.status !== "succeeded" || !exp.asset_id) {
        return reply.status(404).send({ error: "Export not ready or not found" });
      }

      const asset = await getAsset(exp.asset_id);
      if (!asset) return reply.status(404).send({ error: "Export asset missing" });

      const filePath = pathFor(asset.storage_key);
      let fileSize: number;
      try {
        fileSize = (await stat(filePath)).size;
      } catch {
        return reply.status(404).send({ error: "Export file not found on disk" });
      }

      reply.header("Content-Disposition", `attachment; filename="clip-${exp.clip_id}.mp4"`);
      reply.header("Content-Type", "video/mp4");
      reply.header("Content-Length", fileSize);
      reply.header("Cache-Control", "private, max-age=86400");

      return reply.send(createReadStream(filePath));
    }
  );
};
