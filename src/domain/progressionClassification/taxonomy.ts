import type { ProgressionTagCategory } from "./types";

export const PROGRESSION_TAXONOMY_VERSION = 1;

export interface ProgressionTagDefinition {
  id: string;
  category: ProgressionTagCategory;
  label: { ja: string };
  derivable: boolean;
}

export const progressionTaxonomy: readonly ProgressionTagDefinition[] = [
  tag("source.midi-capture", "source", "MIDI採集", true),
  tag("source.live-midi", "source", "Live MIDI", true),
  tag("source.chord-drip", "source", "Chord Drip", true),
  tag("source.manual", "source", "手動", true),
  tag("feature.maj7-9", "feature", "Maj7 / 9", true),
  tag("feature.minor9-11", "feature", "Minor 9 / 11", true),
  tag("feature.slash-bass", "feature", "分数コード", true),
  tag("feature.diminished", "feature", "ディミニッシュ", true),
  tag("feature.augmented", "feature", "オーギュメント", true),
  tag("feature.altered", "feature", "オルタード", true),
  tag("feature.dominant-heavy", "feature", "ドミナント中心", true),
  tag("feature.secondary-dominant", "feature", "セカンダリードミナント", true),
  tag("feature.diatonic", "feature", "ダイアトニック", true),
  tag("feature.chromatic", "feature", "クロマチック", true),
  tag("feature.modal-mixture", "feature", "モーダルインターチェンジ", true),
  tag("use.intro", "use", "イントロ", true),
  tag("use.main", "use", "メイン", true),
  tag("use.turnaround", "use", "ターンアラウンド", true),
  tag("use.variation", "use", "バリエーション", true),
  tag("use.loop", "use", "ループ", true),
  tag("use.vamp", "use", "ヴァンプ", true),
  tag("use.verse", "use", "ヴァース", false),
  tag("use.chorus", "use", "コーラス", false),
  tag("use.bridge", "use", "ブリッジ", false),
  tag("use.ending", "use", "エンディング", false),
  tag("mood.bright", "mood", "明るい", true),
  tag("mood.dark", "mood", "暗い", true),
  tag("mood.dreamy", "mood", "夢幻的", true),
  tag("mood.warm", "mood", "温かい", true),
  tag("mood.tense", "mood", "緊張感", true),
  tag("mood.mysterious", "mood", "ミステリアス", true),
  tag("mood.floating", "mood", "浮遊感", true),
  tag("mood.dramatic", "mood", "ドラマチック", true),
];

const taxonomyById = new Map(progressionTaxonomy.map((definition) => [definition.id, definition]));

export function getProgressionTagDefinition(tagId: string): ProgressionTagDefinition | undefined {
  return taxonomyById.get(tagId);
}

export function isKnownProgressionTagId(tagId: string): boolean {
  return taxonomyById.has(tagId);
}

export function progressionTagLabel(tagId: string): string {
  return getProgressionTagDefinition(tagId)?.label.ja ?? tagId;
}

function tag(
  id: string,
  category: ProgressionTagCategory,
  ja: string,
  derivable: boolean,
): ProgressionTagDefinition {
  return { id, category, label: { ja }, derivable };
}
