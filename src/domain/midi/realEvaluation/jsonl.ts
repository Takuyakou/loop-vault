export function parseJsonLines(raw: string, sourceName = "JSONL input"): unknown[] {
  return raw.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      throw new Error(`${sourceName} contains invalid JSON at line ${index + 1}`);
    }
  });
}
