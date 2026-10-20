import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { env } from "../env";
import { storageFolderFor } from "./shard";
import type { DownloadObject, PutObjectInput, StorageAdapter, StoredObject } from "./types";

export class LocalStorageAdapter implements StorageAdapter {
  readonly provider = "local" as const;
  private readonly root = path.resolve(process.cwd(), env().LOCAL_STORAGE_PATH);

  async put(input: PutObjectInput): Promise<StoredObject> {
    const directory = path.join(this.root, storageFolderFor(input.clipId), input.clipId);
    const finalPath = path.join(directory, input.attachmentId);
    const temporaryPath = `${finalPath}.partial`;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    try {
      await pipeline(
        Readable.fromWeb(input.body as import("node:stream/web").ReadableStream<Uint8Array>),
        createWriteStream(temporaryPath, { flags: "wx", mode: 0o600 }),
      );
      const details = await stat(temporaryPath);
      if (details.size !== input.size) throw new Error(`Upload size mismatch: expected ${input.size}, received ${details.size}`);
      await rename(temporaryPath, finalPath);
      return { objectId: path.relative(this.root, finalPath) };
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }

  async get(objectId: string): Promise<DownloadObject> {
    const fullPath = this.resolveObject(objectId);
    const details = await stat(fullPath);
    return { body: Readable.toWeb(createReadStream(fullPath)) as ReadableStream<Uint8Array>, size: details.size };
  }

  async delete(objectId: string): Promise<void> {
    await unlink(this.resolveObject(objectId)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }

  async deleteUncommitted(clipId: string, attachmentId: string): Promise<void> {
    const objectId = path.join(storageFolderFor(clipId), clipId, attachmentId);
    await this.delete(objectId);
    await unlink(`${this.resolveObject(objectId)}.partial`).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }

  private resolveObject(objectId: string): string {
    const resolved = path.resolve(this.root, objectId);
    if (!resolved.startsWith(`${this.root}${path.sep}`)) throw new Error("Invalid storage object ID");
    return resolved;
  }
}
