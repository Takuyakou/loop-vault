/**
 * P24-05: the `# Key:` / `# BPM:` lines are proposals only. They never change the reading until the person
 * presses their button (the extended screen's behaviour, kept on the one screen).
 */
export function detectTextMetadataHints(input: string): { key?: string; bpm?: number } {
  const key = /^\s*#\s*Key\s*:\s*(.+?)\s*$/im.exec(input)?.[1];
  const rawBpm = /^\s*#\s*BPM\s*:\s*(\d+(?:\.\d+)?)\s*$/im.exec(input)?.[1];
  const bpm = rawBpm === undefined ? undefined : Number(rawBpm);
  return {
    ...(key === undefined ? {} : { key }),
    ...(bpm !== undefined && Number.isFinite(bpm) && bpm >= 30 && bpm <= 240 ? { bpm } : {}),
  };
}
