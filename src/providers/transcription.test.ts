import { describe, it, expect, vi, beforeEach } from "vitest";
import { FasterWhisperProvider } from "./transcription.js";
import { EventEmitter } from "node:events";
import * as child_process from "node:child_process";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

describe("FasterWhisperProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully parse valid JSON output from the child process", async () => {
    const mockSpawn = vi.mocked(child_process.spawn);
    const fakeChild = new EventEmitter() as any;
    fakeChild.stdout = new EventEmitter();
    fakeChild.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(fakeChild);

    const provider = new FasterWhisperProvider();
    const promise = provider.transcribe("fake-audio.mp3", "en");

    // Simulate stdout data
    const fakeOutput = JSON.stringify({
      segments: [
        {
          startMs: 0,
          endMs: 1000,
          text: "Hello world",
          confidence: 0.9,
          words: []
        }
      ]
    });
    
    fakeChild.stdout.emit("data", Buffer.from(fakeOutput));
    // Simulate process close with success
    fakeChild.emit("close", 0);

    const result = await promise;
    expect(result.length).toBe(1);
    expect(result[0]?.text).toBe("Hello world");
    expect(mockSpawn).toHaveBeenCalled();
  });

  it("should throw an error if the process exits with a non-zero code", async () => {
    const mockSpawn = vi.mocked(child_process.spawn);
    const fakeChild = new EventEmitter() as any;
    fakeChild.stdout = new EventEmitter();
    fakeChild.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(fakeChild);

    const provider = new FasterWhisperProvider();
    const promise = provider.transcribe("fake-audio.mp3");

    fakeChild.stderr.emit("data", Buffer.from("Failed to load model"));
    fakeChild.emit("close", 1);

    await expect(promise).rejects.toThrow(/faster-whisper failed \(1\): Failed to load model/);
  });

  it("should throw an error if the transcript has no speech segments", async () => {
    const mockSpawn = vi.mocked(child_process.spawn);
    const fakeChild = new EventEmitter() as any;
    fakeChild.stdout = new EventEmitter();
    fakeChild.stderr = new EventEmitter();
    mockSpawn.mockReturnValue(fakeChild);

    const provider = new FasterWhisperProvider();
    const promise = provider.transcribe("fake-audio.mp3");

    const fakeOutput = JSON.stringify({ segments: [] });
    fakeChild.stdout.emit("data", Buffer.from(fakeOutput));
    fakeChild.emit("close", 0);

    await expect(promise).rejects.toThrow("Transcription produced no speech segments");
  });
});
