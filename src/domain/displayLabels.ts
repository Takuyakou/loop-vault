import type { AppLanguage, Status } from "./types";

const statusLabels: Record<AppLanguage, Record<Status, string>> = {
  ja: {
    idea: "Idea",
    loop: "ループ",
    arrange: "展開",
    mix: "ミックス",
    done: "完成",
    hold: "保留",
    abandoned: "没",
  },
  en: {
    idea: "Idea",
    loop: "Loop",
    arrange: "Arrange",
    mix: "Mix",
    done: "Done",
    hold: "Hold",
    abandoned: "Abandoned",
  },
};

const candidateLabels: Record<AppLanguage, Record<string, string>> = {
  ja: {
    main: "メイン",
    "intro-like": "イントロ向き",
    turnaround: "ターンアラウンド",
    variation: "変化形",
    "chorus-like": "サビ向き",
    "bridge-like": "ブリッジ向き",
  },
  en: {
    main: "Main",
    "intro-like": "Intro-like",
    turnaround: "Turnaround",
    variation: "Variation",
    "chorus-like": "Chorus-like",
    "bridge-like": "Bridge-like",
  },
};

export function statusLabel(status: Status, language: AppLanguage): string {
  return statusLabels[language][status];
}

export function candidateLabel(label: string, language: AppLanguage): string {
  return candidateLabels[language][label] ?? label;
}

export function candidateLabelList(labels: readonly string[], language: AppLanguage): string[] {
  return labels.map((label) => candidateLabel(label, language));
}

export function displayKey(key: string | undefined, language: AppLanguage): string | undefined {
  if (!key || language !== "ja") return key;

  const match = /^([A-G](?:#|b)?)(?:\s*(major|minor)|m)?$/i.exec(key.trim());
  if (!match) return key;

  return `${match[1]}${match[2]?.toLowerCase() === "minor" || key.trim().endsWith("m") ? "マイナー" : "メジャー"}`;
}
