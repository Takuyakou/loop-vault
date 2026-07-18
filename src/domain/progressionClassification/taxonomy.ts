import type { AppLanguage } from "../types";
import type { ProgressionTagCategory } from "./types";

export const PROGRESSION_TAXONOMY_VERSION = 1;

export interface ProgressionTagDefinition {
  id: string;
  category: ProgressionTagCategory;
  label: Record<AppLanguage, string>;
  derivable: boolean;
}

export const progressionTaxonomy: readonly ProgressionTagDefinition[] = [
  tag("source.midi-capture", "source", "MIDI採集", "MIDI Capture", true),
  tag("source.live-midi", "source", "Live MIDI", "Live MIDI", true),
  tag("source.chord-drip", "source", "Chord Drip", "Chord Drip", true),
  tag("source.manual", "source", "手動", "Manual", true),
  tag("feature.maj7-9", "feature", "Maj7 / 9", "Maj7 / 9", true),
  tag("feature.minor9-11", "feature", "Minor 9 / 11", "Minor 9 / 11", true),
  tag("feature.slash-bass", "feature", "分数コード", "Slash Bass", true),
  tag("feature.diminished", "feature", "ディミニッシュ", "Diminished", true),
  tag("feature.augmented", "feature", "オーギュメント", "Augmented", true),
  tag("feature.altered", "feature", "オルタード", "Altered", true),
  tag("feature.dominant-heavy", "feature", "ドミナント中心", "Dominant-heavy", true),
  tag("feature.secondary-dominant", "feature", "セカンダリードミナント", "Secondary Dominant", true),
  tag("feature.diatonic", "feature", "ダイアトニック", "Diatonic", true),
  tag("feature.chromatic", "feature", "クロマチック", "Chromatic", true),
  tag("feature.modal-mixture", "feature", "モーダルインターチェンジ", "Modal Mixture", true),
  tag("use.intro", "use", "イントロ", "Intro", true),
  tag("use.main", "use", "メイン", "Main", true),
  tag("use.turnaround", "use", "ターンアラウンド", "Turnaround", true),
  tag("use.variation", "use", "バリエーション", "Variation", true),
  tag("use.loop", "use", "ループ", "Loop", true),
  tag("use.vamp", "use", "ヴァンプ", "Vamp", true),
  tag("use.verse", "use", "ヴァース", "Verse", false),
  tag("use.chorus", "use", "コーラス", "Chorus", false),
  tag("use.bridge", "use", "ブリッジ", "Bridge", false),
  tag("use.ending", "use", "エンディング", "Ending", false),
  tag("mood.bright", "mood", "明るい", "Bright", true),
  tag("mood.dark", "mood", "暗い", "Dark", true),
  tag("mood.dreamy", "mood", "夢幻的", "Dreamy", true),
  tag("mood.warm", "mood", "温かい", "Warm", true),
  tag("mood.tense", "mood", "緊張感", "Tense", true),
  tag("mood.mysterious", "mood", "ミステリアス", "Mysterious", true),
  tag("mood.floating", "mood", "浮遊感", "Floating", true),
  tag("mood.dramatic", "mood", "ドラマチック", "Dramatic", true),
];

const taxonomyById = new Map(progressionTaxonomy.map((definition) => [definition.id, definition]));

export function getProgressionTagDefinition(tagId: string): ProgressionTagDefinition | undefined {
  return taxonomyById.get(tagId);
}

export function isKnownProgressionTagId(tagId: string): boolean {
  return taxonomyById.has(tagId);
}

export function progressionTagLabel(tagId: string, language: AppLanguage): string {
  return getProgressionTagDefinition(tagId)?.label[language] ?? tagId;
}

function tag(
  id: string,
  category: ProgressionTagCategory,
  ja: string,
  en: string,
  derivable: boolean,
): ProgressionTagDefinition {
  return { id, category, label: { ja, en }, derivable };
}
