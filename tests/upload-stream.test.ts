import { describe, expect, it } from "vitest";
import { validatedUploadStream } from "@/lib/upload-stream";

async function consume(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const values: number[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) return Uint8Array.from(values);
    values.push(...value);
  }
}

describe("upload streaming boundary", () => {
  it("passes bytes without buffering the complete file", async () => {
    const bytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 1, 2]);
    const source = new Blob([bytes]).stream();
    expect(await consume(validatedUploadStream(source, bytes.length, "application/pdf"))).toEqual(bytes);
  });
  it("rejects MIME signature mismatches", async () => {
    const source = new Blob([Uint8Array.from([1, 2, 3, 4])]).stream();
    await expect(consume(validatedUploadStream(source, 4, "application/pdf"))).rejects.toThrow(/does not match/i);
  });
  it("rejects more bytes than were reserved", async () => {
    const source = new Blob([Uint8Array.from([1, 2, 3, 4, 5])]).stream();
    await expect(consume(validatedUploadStream(source, 4, "application/octet-stream"))).rejects.toThrow(/exceeded/i);
  });
});
