const candidateLabels: Record<"ja", Record<string, string>> = {
  ja: {
    main: "メイン",
    "intro-like": "イントロ向き",
    turnaround: "ターンアラウンド",
    variation: "変化形",
    "chorus-like": "サビ向き",
    "bridge-like": "ブリッジ向き",
  },
};

export function candidateLabel(label: string): string {
  return candidateLabels.ja[label] ?? label;
}

export function candidateLabelList(labels: readonly string[]): string[] {
  return labels.map((label) => candidateLabel(label));
}

export function displayKey(key: string | undefined): string | undefined {
  if (!key) return key;

  const match = /^([A-G](?:#|b)?)(?:\s*(major|minor)|m)?$/i.exec(key.trim());
  if (!match) return key;

  return `${match[1]}${match[2]?.toLowerCase() === "minor" || key.trim().endsWith("m") ? "マイナー" : "メジャー"}`;
}
