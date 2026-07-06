const openableExtensions = new Set([
  ".flp",
  ".mid",
  ".midi",
  ".wav",
  ".mp3",
  ".flac",
  ".zip",
]);

export function assetExtension(path: string): string {
  const normalized = path.trim().replace(/\\/g, "/");
  const fileName = normalized.split("/").pop() ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLocaleLowerCase() : "";
}

export function canOpenAssetPath(path: string | undefined): boolean {
  return Boolean(path && openableExtensions.has(assetExtension(path)));
}

export function openableAssetExtensions(): string[] {
  return [...openableExtensions].sort();
}
