import { env } from "../env";
import { GoogleDriveStorageAdapter } from "./google-drive";
import { LocalStorageAdapter } from "./local";
import type { StorageAdapter } from "./types";

let adapter: StorageAdapter | undefined;

export function storage(): StorageAdapter {
  if (!adapter) adapter = env().STORAGE_PROVIDER === "google-drive" ? new GoogleDriveStorageAdapter() : new LocalStorageAdapter();
  return adapter;
}
