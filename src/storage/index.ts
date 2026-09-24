import { config } from "../config.js";
import { LocalProvider } from "./local.js";
import { S3Provider } from "./s3.js";
import type { StorageProvider } from "./types.js";

// Export common helpers
export { sourceKey, derivedKey } from "./types.js";
export type { StorageProvider } from "./types.js";

// Create singleton instance based on configuration
let provider: StorageProvider;

if (config.STORAGE_BACKEND === "s3") {
  provider = new S3Provider();
} else {
  provider = new LocalProvider();
}

export const storage = provider;
