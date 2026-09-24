import { S3Client, HeadObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { config } from "../config.js";
import { logger } from "../logger.js";
import type { StorageProvider } from "./types.js";
import type { Readable } from "node:stream";

export class S3Provider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = config.S3_BUCKET || "autoclip-assets";
    this.client = new S3Client({
      region: config.S3_REGION || "us-east-1",
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY || "",
        secretAccessKey: config.S3_SECRET_KEY || "",
      },
      endpoint: config.S3_ENDPOINT, // Optional, for S3-compatible like MinIO/R2
      forcePathStyle: !!config.S3_ENDPOINT // Required for MinIO
    });
  }

  async ensureStorage(): Promise<void> {
    logger.info({ bucket: this.bucket }, "S3 Storage Provider initialized");
  }

  async writeStream(key: string, stream: NodeJS.ReadableStream | Readable): Promise<{ bytes: number }> {
    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: stream as any,
      }
    });

    await upload.done();
    const size = await this.getSize(key);
    return { bytes: size };
  }

  async copyFromPath(key: string, inputPath: string): Promise<{ bytes: number }> {
    const stream = createReadStream(inputPath);
    return this.writeStream(key, stream);
  }

  async downloadToPath(key: string, localPath: string): Promise<void> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    
    const response = await this.client.send(command);
    if (!response.Body) {
      throw new Error(`Failed to download ${key}: Empty body`);
    }

    await pipeline(
      response.Body as NodeJS.ReadableStream,
      createWriteStream(localPath)
    );
  }

  readStream(key: string, range?: { start: number; end: number }): NodeJS.ReadableStream | Readable {
    const { PassThrough } = require("node:stream");
    const pass = new PassThrough();
    const commandParams: any = {
      Bucket: this.bucket,
      Key: key,
    };
    if (range) {
      commandParams.Range = `bytes=${range.start}-${range.end}`;
    }

    this.client.send(new GetObjectCommand(commandParams)).then((response) => {
      if (response.Body) {
        (response.Body as NodeJS.ReadableStream).pipe(pass);
      } else {
        pass.destroy(new Error("Empty body"));
      }
    }).catch(err => {
      pass.destroy(err);
    });

    return pass;
  }

  async getSize(key: string): Promise<number> {
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const response = await this.client.send(command);
    return response.ContentLength || 0;
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.getSize(key);
      return true;
    } catch (err: any) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw err;
    }
  }

  async remove(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    await this.client.send(command);
  }
}
