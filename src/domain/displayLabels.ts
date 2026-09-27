import type { Status } from "./types";

const statusLabels: Record<"ja", Record<Status, string>> = {
  ja: {
    idea: "Idea",
    loop: "ループ",
    arrange: "展開",
    mix: "ミックス",
    done: "完成",
    hold: "保留",
    abandoned: "没",
  },
};

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

export function statusLabel(status: Status): string {
  return statusLabels.ja[status];
}

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
