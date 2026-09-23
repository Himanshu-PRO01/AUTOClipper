import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform, type Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

const root = resolve(config.STORAGE_ROOT);

export async function ensureStorage(): Promise<void> {
  await mkdir(root, { recursive: true });
}

export function safePath(key: string): string {
  const normalizedRoot = resolve(root);
  const candidate = resolve(normalizedRoot, key);
  const rel = relative(normalizedRoot, candidate);

  if (rel.startsWith("..") || isAbsolute(rel) || candidate === normalizedRoot) {
    throw new Error(`Unsafe storage key: "${key}" escapes storage root`);
  }
  return candidate;
}

export function sourceKey(projectId: string): string {
  return join("projects", projectId, "source", "original");
}

export function derivedKey(projectId: string, kind: string, fileName: string): string {
  return join("projects", projectId, kind, basename(fileName));
}

export async function writeStream(key: string, stream: Readable): Promise<{ bytes: number }> {
  const targetPath = safePath(key);
  const targetDir = dirname(targetPath);
  await mkdir(targetDir, { recursive: true });

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

export async function copyFromPath(key: string, inputPath: string): Promise<{ bytes: number }> {
  const targetPath = safePath(key);
  const targetDir = dirname(targetPath);
  await mkdir(targetDir, { recursive: true });

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

export function pathFor(key: string): string {
  return safePath(key);
}

export function readStream(key: string) {
  return createReadStream(safePath(key));
}

export async function exists(key: string): Promise<boolean> {
  try {
    await access(safePath(key));
    return true;
  } catch {
    return false;
  }
}

export async function remove(key: string): Promise<void> {
  await rm(safePath(key), { force: true });
}

