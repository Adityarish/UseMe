type UploadOptions = {
  url: string;
  token: string;
  file: File;
  onProgress?: (percent: number) => void;
};

type PreparedUpload =
  | { mode: "proxy" }
  | { mode: "direct"; uploadUrl: string; chunkSize: number };
const APP_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

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

function uploadChunkThroughApp(
  appUrl: string,
  token: string,
  uploadUrl: string,
  file: File,
  start: number,
  end: number,
  onProgress?: (percent: number) => void,
): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${appUrl}/direct`);
    xhr.setRequestHeader("x-upload-token", token);
    xhr.setRequestHeader("x-drive-upload-url", uploadUrl);
    xhr.setRequestHeader("x-drive-content-range", `bytes ${start}-${end - 1}/${file.size}`);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((start + event.loaded) / file.size * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result = JSON.parse(xhr.responseText) as { complete?: boolean; objectId?: string };
          return resolve(result.complete ? result.objectId : undefined);
        } catch {
          return reject(new Error("The upload service returned an invalid chunk response."));
        }
      }
      reject(new Error(responseMessage(xhr.responseText, `The upload service rejected a chunk (HTTP ${xhr.status}).`)));
    };
    xhr.onerror = () => reject(new Error("The connection to the upload service failed during upload."));
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
  for (let start = 0; start < file.size; start += APP_UPLOAD_CHUNK_BYTES) {
    const end = Math.min(start + APP_UPLOAD_CHUNK_BYTES, file.size);
    objectId = await uploadChunkThroughApp(url, token, prepared.uploadUrl, file, start, end, onProgress) ?? objectId;
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
