export function isCleanRound(
  eventResults: readonly ("pending" | "match" | "miss")[],
  roundDirty: boolean,
): boolean {
  return !roundDirty
    && eventResults.length > 0
    && eventResults.every((result) => result === "match");
}

export function nextCleanFlowCount(previous: number, clean: boolean): number {
  return clean ? previous + 1 : 0;
}

