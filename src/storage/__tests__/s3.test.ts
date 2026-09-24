import { describe, it, expect, vi, beforeEach } from "vitest";
import { S3Provider } from "../s3.js";
import { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  return {
    S3Client: class {
      send = mockSend;
    },
    HeadObjectCommand: vi.fn(),
    DeleteObjectCommand: vi.fn(),
    GetObjectCommand: vi.fn(),
  };
});

vi.mock("@aws-sdk/lib-storage", () => {
  return {
    Upload: vi.fn().mockImplementation(() => ({
      done: vi.fn().mockResolvedValue({}),
    })),
  };
});

describe("S3Provider", () => {
  let provider: S3Provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new S3Provider();
  });

  it("should get size of object", async () => {
    mockSend.mockResolvedValueOnce({ ContentLength: 1024 });
    const size = await provider.getSize("test.mp4");
    
    expect(size).toBe(1024);
    expect(HeadObjectCommand).toHaveBeenCalledWith({
      Bucket: expect.any(String),
      Key: "test.mp4",
    });
  });

  it("should return 0 size if ContentLength is missing", async () => {
    mockSend.mockResolvedValueOnce({});
    const size = await provider.getSize("test.mp4");
    expect(size).toBe(0);
  });

  it("should return true if object exists", async () => {
    mockSend.mockResolvedValueOnce({ ContentLength: 500 });
    const exists = await provider.exists("file.mp4");
    expect(exists).toBe(true);
  });

  it("should return false if object does not exist (404)", async () => {
    const error: any = new Error("Not Found");
    error.name = "NotFound";
    mockSend.mockRejectedValueOnce(error);
    
    const exists = await provider.exists("missing.mp4");
    expect(exists).toBe(false);
  });

  it("should remove object", async () => {
    mockSend.mockResolvedValueOnce({});
    await provider.remove("old.mp4");
    
    expect(DeleteObjectCommand).toHaveBeenCalledWith({
      Bucket: expect.any(String),
      Key: "old.mp4",
    });
  });
});
