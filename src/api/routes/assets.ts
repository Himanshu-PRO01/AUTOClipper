import type { FastifyPluginAsync } from "fastify";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { getAsset } from "../../db/repository.js";
import { pathFor } from "../../storage/local.js";

export const assetRoutes: FastifyPluginAsync = async (app) => {
  // Stream a media asset by its DB id
  app.get<{ Params: { assetId: string } }>("/assets/:assetId", async (req, reply) => {
    const asset = await getAsset(req.params.assetId);
    if (!asset) return reply.status(404).send({ error: "Asset not found or expired" });

    const filePath = pathFor(asset.storage_key);

    let fileSize: number;
    try {
      const stats = await stat(filePath);
      fileSize = stats.size;
    } catch {
      return reply.status(404).send({ error: "Asset file not found on disk" });
    }

    const rangeHeader = req.headers.range;

    if (rangeHeader && rangeHeader.startsWith("bytes=")) {
      // Support range requests for video seeking
      const [startStr, endStr] = rangeHeader.replace("bytes=", "").split("-");
      const start = parseInt(startStr ?? "0", 10);
      let end = endStr ? parseInt(endStr, 10) : fileSize - 1;

      if (isNaN(start) || isNaN(end) || start < 0 || start >= fileSize || end < start) {
        reply.header("Content-Range", `bytes */${fileSize}`);
        return reply.status(416).send({ error: "Requested range not satisfiable" });
      }

      if (end >= fileSize) {
        end = fileSize - 1;
      }

      const chunkSize = end - start + 1;

      reply.header("Content-Range", `bytes ${start}-${end}/${fileSize}`);
      reply.header("Accept-Ranges", "bytes");
      reply.header("Content-Length", chunkSize);
      reply.header("Content-Type", asset.mime_type);
      reply.header("Cache-Control", "private, max-age=3600");
      reply.status(206);

      return reply.send(createReadStream(filePath, { start, end }));
    }

    reply.header("Content-Length", fileSize);
    reply.header("Content-Type", asset.mime_type);
    reply.header("Accept-Ranges", "bytes");
    reply.header("Cache-Control", "private, max-age=3600");

    return reply.send(createReadStream(filePath));
  });
};
