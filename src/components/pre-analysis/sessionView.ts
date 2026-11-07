import type {
  AnalysisSession,
  AnalysisSessionVoice,
  PreAnalysisVoiceRole,
} from "../../domain/midi/preAnalysis";

/**
 * How the "import check" screen talks about a part. The words change; the values do not:
 * コード = harmony, ベース = bass, メロディ = melody-weak, 使わない = exclude.
 */
export type RoleView = "chord" | "bass" | "melody" | "off";

export const ROLE_ORDER: readonly RoleView[] = ["chord", "bass", "melody", "off"];

export const ROLE_LABEL: Readonly<Record<RoleView, string>> = {
  chord: "コード",
  bass: "ベース",
  melody: "メロディ",
  off: "使わない",
};

/** Role colours. The accent (teal) is for playback and controls only, never a role. */
export const ROLE_COLOR: Readonly<Record<RoleView, string>> = {
  chord: "#f2b84b",
  bass: "#b79cff",
  melody: "#6cc7ff",
  off: "#3a4a5c",
};

export function roleValue(role: RoleView): PreAnalysisVoiceRole {
  return role === "chord"
    ? "harmony"
    : role === "bass"
      ? "bass"
      : role === "melody"
        ? "melody-weak"
        : "exclude";
}

/**
 * The same rule the analysis input uses to pick parts (`isSelectedVoice` in
 * `analyzerInput.ts`, which is not exported). `sessionView.test.ts` checks the two agree.
 */
export function isAnalyzedVoice(voice: AnalysisSessionVoice): boolean {
  return !voice.isDrum && voice.included && voice.assignedRole !== "exclude";
}

export function voiceRoleView(voice: AnalysisSessionVoice): RoleView {
  if (!isAnalyzedVoice(voice)) return "off";
  return voice.assignedRole === "bass"
    ? "bass"
    : voice.assignedRole === "melody-weak"
      ? "melody"
      : "chord";
}

/** True while the part is exactly what the app proposed (no role, include or duplicate change). */
export function isAutoVoice(voice: AnalysisSessionVoice): boolean {
  const proposedIncluded = !voice.isDrum
    && voice.autoRole !== "exclude"
    && voice.duplicateOf === undefined;
  return voice.assignedRole === voice.autoRole && voice.included === proposedIncluded;
}

/** 1. track name  2. instrument name  3. 「パート n」. Channel 10 reads 「ドラム」 (its program number is not an instrument). */
export function partName(voice: AnalysisSessionVoice, ordinal: number): string {
  const track = voice.trackName?.trim();
  if (track) return track;
  if (voice.isDrum) return "ドラム";
  if (voice.gmProgramName) return voice.gmProgramName;
  return `パート ${ordinal}`;
}

export function partNames(session: AnalysisSession): ReadonlyMap<string, string> {
  return new Map(session.voices.map((voice, index) => [
    voice.id,
    partName(voice, index + 1),
  ]));
}

export interface SessionSummaryGroup {
  readonly role: RoleView;
  readonly names: readonly string[];
}

/** What the analysis will actually take, by role. Empty groups are left out. */
export function sessionSummary(
  session: AnalysisSession,
  /** Parts with a line in effect → the pitch the melody starts at. */
  lines: Readonly<Record<string, number>> = {},
): SessionSummaryGroup[] {
  const names = partNames(session);
  const groups: Record<RoleView, string[]> = { chord: [], bass: [], melody: [], off: [] };
  for (const voice of session.voices) {
    const name = names.get(voice.id) ?? voice.displayName;
    const line = lines[voice.id];
    if (line !== undefined && voiceRoleView(voice) === "chord") {
      // Below the line: analysed as chords. From the line up: shown as melody, not analysed.
      groups.chord.push(`${name}（${pitchLabel(line)}より下）`);
      groups.melody.push(`${name}（${pitchLabel(line)}以上・解析には使わない）`);
      continue;
    }
    groups[voiceRoleView(voice)].push(name);
  }
  return ROLE_ORDER
    .filter((role) => groups[role].length > 0)
    .map((role) => ({ role, names: groups[role] }));
}

/** A pitch as the screen writes it (C4 = 60). */
export function pitchLabel(pitch: number): string {
  const names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
  return `${names[pitch % 12]}${Math.floor(pitch / 12) - 1}`;
}

export function analyzedVoiceCount(session: AnalysisSession): number {
  return session.voices.filter(isAnalyzedVoice).length;
}

/** The reason a part is left out automatically, when there is one worth saying. */
export function autoOffReason(voice: AnalysisSessionVoice): string | undefined {
  if (voice.isDrum) return "ドラム（10チャンネル）なので使いません";
  if (voice.duplicateOf) return "ほかのファイルと同じ内容なので使いません";
  if (voice.autoRole === "exclude") {
    return voice.autoRoleEvidenceKinds?.includes("percussion-soft-signature")
      ? "打楽器のように見えるので使いません"
      : "音の動きから、使わないと見立てました";
  }
  return undefined;
}

/** Tooltip of the 「自動」 mark: confidence and the reasons, in plain words. */
export function autoTooltip(voice: AnalysisSessionVoice): string {
  const bucket = voice.autoRoleConfidenceBucket
    ?? (voice.autoRoleConfidence >= 0.75 ? "high" : voice.autoRoleConfidence >= 0.45 ? "medium" : "low");
  const confidence = bucket === "high" ? "高い" : bucket === "medium" ? "ふつう" : "低い（確かめてください）";
  const reasons = (voice.autoRoleEvidenceKinds ?? [])
    .map((kind) => EVIDENCE_LABEL[kind])
    .filter((label): label is string => Boolean(label));
  return [
    `アプリの見立て：${ROLE_LABEL[voice.autoRole === "bass" ? "bass" : voice.autoRole === "melody-weak" ? "melody" : voice.autoRole === "exclude" ? "off" : "chord"]}`,
    `自信：${confidence}`,
    reasons.length ? `理由：${reasons.join("・")}` : undefined,
  ].filter(Boolean).join("\n");
}

const EVIDENCE_LABEL: Readonly<Record<string, string>> = {
  "channel-10": "ドラムのチャンネル",
  "dominant-program": "音色",
  "track-name-hint": "トラック名",
  "low-pitch-center": "低い音域",
  "high-pitch-center": "高い音域",
  "time-weighted-monophony": "単音が多い",
  "time-weighted-polyphony": "和音が多い",
  "sustained-duration": "音が長い",
  "stepwise-motion": "順に動く",
  "percussion-soft-signature": "打楽器のような動き",
  "mixed-fallback": "混ざっている可能性",
  "manual-override": "手で指定",
};
