export const STORAGE_FOLDERS = ["Storage1", "Storage2", "Storage3"] as const;

export function storageFolderFor(clipId: string): typeof STORAGE_FOLDERS[number] {
  const shard = [...clipId].reduce((total, character) => total + character.charCodeAt(0), 0) % STORAGE_FOLDERS.length;
  return STORAGE_FOLDERS[shard];
}

export function googleDriveFolderId(value: string): string {
  const input = value.trim();
  if (!input.includes("://")) return input;
  try {
    const url = new URL(input);
    const folderMatch = url.pathname.match(/\/folders\/([^/]+)/);
    const id = folderMatch?.[1] ?? url.searchParams.get("id");
    if (id) return decodeURIComponent(id);
  } catch {
    // The validation error below gives the user a configuration-specific fix.
  }
  throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID must be a Drive folder ID or folder URL");
}
