export interface PutObjectInput {
  clipId: string;
  attachmentId: string;
  size: number;
  mimeType: string;
  body: ReadableStream<Uint8Array>;
}

export interface StoredObject {
  objectId: string;
}

export interface DownloadObject {
  body: ReadableStream<Uint8Array>;
  size?: number;
}

export interface StorageAdapter {
  readonly provider: "local" | "google-drive";
  put(input: PutObjectInput): Promise<StoredObject>;
  get(objectId: string): Promise<DownloadObject>;
  delete(objectId: string): Promise<void>;
  deleteUncommitted(clipId: string, attachmentId: string): Promise<void>;
}
