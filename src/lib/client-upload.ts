type UploadOptions = {
  url: string;
  token: string;
  file: File;
  onProgress?: (percent: number) => void;
};

type PreparedUpload =
  | { mode: "proxy" }
  | { mode: "direct"; uploadUrl: string; chunkSize: number };

function responseMessage(text: string, fallback: string): string {
  try {
    const result = JSON.parse(text) as { error?: { message?: string } };
    return result.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

function proxyUpload({ url, token, file, onProgress }: UploadOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-upload-token", token);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round(event.loaded / event.total * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      reject(new Error(responseMessage(xhr.responseText, `A file could not be uploaded (HTTP ${xhr.status}).`)));
    };
    xhr.onerror = () => reject(new Error("The upload connection failed."));
    xhr.send(file);
  });
}

function uploadDriveChunk(
  uploadUrl: string,
  file: File,
  start: number,
  end: number,
  onProgress?: (percent: number) => void,
): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const finalChunk = end === file.size;
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.setRequestHeader("content-range", `bytes ${start}-${end - 1}/${file.size}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((start + event.loaded) / file.size * 100));
    };
    xhr.onload = () => {
      if (!finalChunk && xhr.status === 308) return resolve(undefined);
      if (finalChunk && xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText) as { id?: string };
          if (result.id) return resolve(result.id);
        } catch {
          // The error below is intentionally generic; the upload URL is sensitive.
        }
        return reject(new Error("Google Drive completed the upload without returning a file ID."));
      }
      reject(new Error(responseMessage(xhr.responseText, `Google Drive rejected an upload chunk (HTTP ${xhr.status}).`)));
    };
    xhr.onerror = () => reject(new Error("The connection to Google Drive failed during upload."));
    xhr.send(file.slice(start, end));
  });
}

async function directUpload(prepared: Extract<PreparedUpload, { mode: "direct" }>, options: UploadOptions): Promise<void> {
  const { file, onProgress, token, url } = options;
  if (!Number.isInteger(prepared.chunkSize) || prepared.chunkSize < 256 * 1024) {
    throw new Error("The upload service returned an invalid chunk size.");
  }
  if (new URL(prepared.uploadUrl).origin !== "https://www.googleapis.com") {
    throw new Error("The upload service returned an invalid destination.");
  }
  let objectId: string | undefined;
  for (let start = 0; start < file.size; start += prepared.chunkSize) {
    const end = Math.min(start + prepared.chunkSize, file.size);
    objectId = await uploadDriveChunk(prepared.uploadUrl, file, start, end, onProgress) ?? objectId;
  }
  if (!objectId) throw new Error("Google Drive did not finish the upload.");

  const completed = await fetch(`${url}/direct`, {
    method: "PATCH",
    headers: { "content-type": "application/json", "x-upload-token": token },
    body: JSON.stringify({ objectId }),
  });
  if (!completed.ok) {
    const text = await completed.text();
    throw new Error(responseMessage(text, "The uploaded file could not be verified."));
  }
  onProgress?.(100);
}

export async function uploadAttachment(options: UploadOptions): Promise<void> {
  const preparedResponse = await fetch(`${options.url}/direct`, {
    method: "POST",
    headers: { "x-upload-token": options.token },
  });
  if (!preparedResponse.ok) {
    const text = await preparedResponse.text();
    throw new Error(responseMessage(text, "Could not prepare the file upload."));
  }
  const prepared = await preparedResponse.json() as PreparedUpload;
  if (prepared.mode === "direct") return directUpload(prepared, options);
  return proxyUpload(options);
}
