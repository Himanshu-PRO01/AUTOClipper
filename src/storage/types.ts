import type { Readable } from "node:stream";

export interface StorageProvider {
  /** Ensure bucket or local storage root exists */
  ensureStorage(): Promise<void>;
  
  /** Write stream to storage */
  writeStream(key: string, stream: NodeJS.ReadableStream | Readable): Promise<{ bytes: number }>;
  
  /** Upload a local file to storage */
  copyFromPath(key: string, inputPath: string): Promise<{ bytes: number }>;
  
  /** Download storage file to local path (for worker local processing) */
  downloadToPath(key: string, localPath: string): Promise<void>;
  
  /** Read from storage as Node stream */
  readStream(key: string, range?: { start: number; end: number }): NodeJS.ReadableStream | Readable;
  
  /** Get object size in bytes */
  getSize(key: string): Promise<number>;
  
  /** Check if object exists */
  exists(key: string): Promise<boolean>;
  
  /** Remove object from storage */
  remove(key: string): Promise<void>;
}

export function sourceKey(projectId: string): string {
  return `projects/${projectId}/source/original`;
}

export function derivedKey(projectId: string, kind: string, fileName: string): string {
  return `projects/${projectId}/${kind}/${fileName}`;
}
