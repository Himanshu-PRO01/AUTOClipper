import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform, type Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import type { StorageProvider } from "./types.js";

export class LocalProvider implements StorageProvider {
  private root: string;

  constructor() {
    this.root = resolve(config.STORAGE_ROOT);
  }

  async ensureStorage(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  private safePath(key: string): string {
    const candidate = resolve(this.root, key);
    const rel = relative(this.root, candidate);
    if (rel.startsWith("..") || isAbsolute(rel) || candidate === this.root) {
      throw new Error(`Unsafe storage key: "${key}" escapes storage root`);
    }
    return candidate;
  }

  async writeStream(key: string, stream: NodeJS.ReadableStream | Readable): Promise<{ bytes: number }> {
    const targetPath = this.safePath(key);
    await mkdir(dirname(targetPath), { recursive: true });

    const tempPath = `${targetPath}.upload-${randomUUID()}`;
    let bytes = 0;

    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > config.MAX_UPLOAD_BYTES) {
          callback(new Error(`File size exceeds maximum upload limit of ${config.MAX_UPLOAD_BYTES} bytes`));
          return;
        }
        callback(null, chunk);
      },
    });

    try {
      await pipeline(stream, meter, createWriteStream(tempPath, { flags: "w" }));
      await rename(tempPath, targetPath);
      return { bytes };
    } catch (err) {
      await rm(tempPath, { force: true }).catch(() => {});
      throw err;
    }
  }

  async copyFromPath(key: string, inputPath: string): Promise<{ bytes: number }> {
    const targetPath = this.safePath(key);
    await mkdir(dirname(targetPath), { recursive: true });

    const tempPath = `${targetPath}.copy-${randomUUID()}`;
    try {
      await pipeline(createReadStream(inputPath), createWriteStream(tempPath, { flags: "w" }));
      await rename(tempPath, targetPath);
      const stats = await stat(targetPath);
      return { bytes: stats.size };
    } catch (err) {
      await rm(tempPath, { force: true }).catch(() => {});
      throw err;
    }
  }

  async downloadToPath(key: string, localPath: string): Promise<void> {
    // For local storage, downloading to a worker temp dir is just a file copy.
    await mkdir(dirname(localPath), { recursive: true });
    await pipeline(createReadStream(this.safePath(key)), createWriteStream(localPath));
  }

  readStream(key: string, range?: { start: number; end: number }): NodeJS.ReadableStream | Readable {
    return createReadStream(this.safePath(key), range);
  }

  async getSize(key: string): Promise<number> {
    const stats = await stat(this.safePath(key));
    return stats.size;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.safePath(key));
      return true;
    } catch {
      return false;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.safePath(key), { force: true });
  }
}
