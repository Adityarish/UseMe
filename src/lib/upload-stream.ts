const signatures: Array<{ mime: string; bytes: number[] }> = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "application/zip", bytes: [0x50, 0x4b] },
];

export function validateUploadPrefix(prefix: Uint8Array, declaredMime: string): void {
  const signature = signatures.find((entry) => entry.mime === declaredMime);
  if (signature && !signature.bytes.every((byte, index) => prefix[index] === byte)) {
    throw new Error("File content does not match its declared type");
  }
}

export function validatedUploadStream(source: ReadableStream<Uint8Array>, expectedSize: number, declaredMime: string): ReadableStream<Uint8Array> {
  let bytesRead = 0;
  let prefix = new Uint8Array();
  let checked = false;

  return source.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytesRead += chunk.byteLength;
      if (bytesRead > expectedSize) throw new Error("Upload exceeded its declared size");
      if (!checked) {
        const take = chunk.slice(0, Math.max(0, 16 - prefix.length));
        const combined = new Uint8Array(prefix.length + take.length);
        combined.set(prefix);
        combined.set(take, prefix.length);
        prefix = combined;
        if (prefix.length >= 4 || bytesRead === expectedSize) {
          validateUploadPrefix(prefix, declaredMime);
          checked = true;
        }
      }
      controller.enqueue(chunk);
    },
    flush() {
      if (bytesRead !== expectedSize) throw new Error(`Upload size mismatch: expected ${expectedSize}, received ${bytesRead}`);
    },
  }));
}
