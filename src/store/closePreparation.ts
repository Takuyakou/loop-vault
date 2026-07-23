export type ClosePreparation = () => void;

const preparations = new Set<ClosePreparation>();

export function registerClosePreparation(
  preparation: ClosePreparation,
): () => void {
  preparations.add(preparation);
  return () => preparations.delete(preparation);
}

export function runClosePreparations(): void {
  for (const preparation of [...preparations]) preparation();
}
