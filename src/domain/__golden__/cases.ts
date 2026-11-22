import { createEmptyPracticeFile } from "../../features/bass-practice/infra/repository/practiceRepository";
import { emptyMidiBassLibrary } from "../../features/bass-practice/midi/model";
import { emptyStore } from "../chordDojo/store";
import { emptyDrillRecords } from "../chordDojo/voicingDrillRecords";
import { sourceBasslineSignature } from "../sourceBassline/snapshot";
import reviewThresholdsJson from "../../../docs/phase10.0/contracts/P10-review-thresholds.json";

/**
 * P23 / DEP-01 §2-1: the inputs of the golden set. Every entry gets at least one sample of the real shape, a way to
 * break each part of it, and the shapes an older release wrote (the v1/v2 Vault and the version-1 preferences).
 * The samples are synthetic; no real titles or personal paths.
 */
export interface GoldenCase {
  readonly entry: string;
  readonly case: string;
  readonly input: unknown;
}

const at = "2026-07-04T00:00:00.000Z";

const idea = (overrides: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  title: "Night Drive",
  bpm: 74,
  key: "F",
  genre: "future garage",
  moods: ["late night"],
  status: "loop",
  nextAction: { text: "Make two drum variations", updatedAt: at },
  chordMemo: "Fmaj7 - Am7 - Gm7 - C7",
  references: [{ title: "Reference", url: "https://example.com/reference", memo: "Snare texture" }],
  assets: [{ id: "22222222-2222-4222-8222-222222222222", type: "flp", path: "C:\\Music\\night-drive.flp" }],
  statusHistory: [{ status: "idea", at }],
  createdAt: at,
  updatedAt: at,
  ...overrides,
});

const vaultV2 = {
  app: "loopvault",
  fileVersion: 2,
  settings: { monthlyGoal: 1, language: "ja" },
  ideas: [idea()],
};

/** The Phase 8.9 retention shape: every optional field non-default (it must survive as written). */
const vaultV2Full = {
  app: "loopvault",
  fileVersion: 2,
  settings: { monthlyGoal: 7, language: "en", showRomanNumerals: false },
  ideas: [
    idea({
      status: "done",
      prevStatus: "mix",
      completedAt: at,
      statusHistory: [
        { status: "idea", at },
        { status: "hold", at, reason: "waiting for a vocalist" },
        { status: "done", at },
      ],
      references: [{ title: "Reference", url: "https://example.com/reference", memo: "Snare texture" }],
      assets: [
        { id: "a1a1a1a1-0000-4000-8000-000000000001", type: "midi", path: "C:\\Music\\take.mid" },
        { id: "a1a1a1a1-0000-4000-8000-000000000002", type: "audio", path: "C:\\Music\\take.wav" },
      ],
    }),
  ],
};

const vaultV1 = { ...vaultV2, fileVersion: 1 };
const vaultV3 = { ...vaultV2, fileVersion: 3 };
const vaultV3Quarantine = {
  app: "loopvault",
  fileVersion: 3,
  settings: { monthlyGoal: 1, language: "ja" },
  ideas: [idea(), { id: "broken" }],
};
const vaultV1WithSourceBassline = {
  app: "loopvault",
  fileVersion: 1,
  settings: { monthlyGoal: 1, language: "ja" },
  ideas: [idea({ progressionBlocks: [{ id: "b1", sourceBassline: { schemaVersion: 1 } }] })],
};

const bassPracticeFile = createEmptyPracticeFile(new Date("2026-01-01T00:00:00.000Z"));

const dojoRecentEntry = {
  kind: "standard",
  id: "builtin:i-v-vi-iv:1",
  key: 3,
  stage: "see",
  random: false,
  at,
};

const earRecord = {
  at,
  play: "play-1",
  run: "run-1",
  questionId: "ear:builtin:1",
  source: "builtin",
  benchmark: 2,
  level: 2,
  length: 4,
  chordLevel: 2,
  kind: "maj7・6",
  move: 5,
  index: 0,
  given: false,
  manual: false,
  wrongs: 1,
  hint: 0,
  seconds: 3.5,
  firstAnswerSeconds: 2.25,
  replays: 1,
  judge: "core",
};

const sourceBasslineBody = {
  schemaVersion: 1 as const,
  sourceKind: "selected-bass-voice" as const,
  capturedMeter: { numerator: 4 as const, denominator: 4 as const },
  length: { numerator: 4, denominator: 1 },
  notes: [{
    pitch: 40,
    start: { numerator: 0, denominator: 1 },
    duration: { numerator: 1, denominator: 1 },
    velocity: 0.8,
    continuesFromBefore: false,
    continuesAfterEnd: false,
  }],
};

const sourceBasslineSnapshot = {
  ...sourceBasslineBody,
  snapshotSignature: sourceBasslineSignature(sourceBasslineBody),
};

const roleLog = [
  {
    schemaVersion: 1,
    sourcePosition: "master",
    autoRole: "bass",
    autoRoleConfidence: 0.9,
    assignedRole: "bass",
    dominantProgram: 33,
    channel: 1,
    noteCount: 16,
    minPitch: 28,
    maxPitch: 43,
    averageDurationBeats: 0.5,
    averagePolyphony: 1,
    preset: "auto",
    manuallyChanged: false,
    includedForAnalysis: true,
    exactDuplicateExcluded: false,
    analyzeExecuted: true,
    occurredAt: at,
  },
].map((event) => JSON.stringify(event)).join("\n");

export const goldenCases: readonly GoldenCase[] = [
  // --- the Vault (app data.json) ---
  { entry: "vault", case: "v2-basic", input: JSON.stringify(vaultV2) },
  { entry: "vault", case: "v2-every-field", input: JSON.stringify(vaultV2Full) },
  { entry: "vault", case: "v1-read-as-v3", input: JSON.stringify(vaultV1) },
  { entry: "vault", case: "v3-read-as-v3", input: JSON.stringify(vaultV3) },
  { entry: "vault", case: "v3-quarantines-a-broken-idea", input: JSON.stringify(vaultV3Quarantine) },
  { entry: "vault", case: "v1-quarantines-a-source-bassline", input: JSON.stringify(vaultV1WithSourceBassline) },
  { entry: "vault", case: "future-version", input: JSON.stringify({ ...vaultV2, fileVersion: 4 }) },
  { entry: "vault", case: "invalid-json", input: "{\"app\":\"loopvault\"," },
  { entry: "vault", case: "missing-app", input: JSON.stringify({ fileVersion: 2, settings: { monthlyGoal: 1 }, ideas: [] }) },
  { entry: "vault", case: "unknown-settings-key", input: JSON.stringify({ ...vaultV2, settings: { monthlyGoal: 1, extra: true } }) },
  { entry: "vault-legacy-v1", case: "v1", input: JSON.stringify(vaultV1) },
  { entry: "vault-legacy-v1", case: "v2-is-a-future-version", input: JSON.stringify(vaultV2) },

  // --- the Chord Dojo (store, drill records, recent) ---
  { entry: "dojo-store", case: "empty", input: emptyStore(new Date(at)) },
  { entry: "dojo-store", case: "wrong-app", input: { ...emptyStore(new Date(at)), app: "other" } },
  { entry: "dojo-store", case: "wrong-file-version", input: { ...emptyStore(new Date(at)), fileVersion: 9 } },
  { entry: "dojo-recent", case: "empty", input: [] },
  { entry: "dojo-recent", case: "one", input: [dojoRecentEntry] },
  { entry: "dojo-recent", case: "keeps-three-at-most", input: Array.from({ length: 5 }, (_, index) => ({ ...dojoRecentEntry, at: `2026-07-0${index + 1}T00:00:00.000Z` })) },
  { entry: "dojo-recent", case: "drops-the-broken-one", input: [dojoRecentEntry, { kind: "standard" }] },
  { entry: "dojo-recent", case: "invalid-json", input: "[" },
  { entry: "dojo-recent-entry", case: "valid", input: dojoRecentEntry },
  { entry: "dojo-recent-entry", case: "standard-without-key", input: { kind: "standard", id: "x", at } },
  { entry: "dojo-recent-entry", case: "unknown-key", input: { ...dojoRecentEntry, extra: 1 } },
  { entry: "voicing-drill-records", case: "empty", input: emptyDrillRecords() },
  { entry: "voicing-drill-records", case: "wrong-app", input: { ...emptyDrillRecords(), app: "other" } },
  { entry: "voicing-drill-records", case: "empty-object", input: {} },

  // --- the bass practice file and the bass MIDI library ---
  { entry: "bass-practice-file", case: "empty", input: bassPracticeFile },
  { entry: "bass-practice-file", case: "wrong-app", input: { ...bassPracticeFile, app: "other" } },
  { entry: "bass-practice-file", case: "future-version", input: { ...bassPracticeFile, fileVersion: 3 } },
  { entry: "bass-practice-file", case: "empty-object", input: {} },
  { entry: "midi-bass-library", case: "empty", input: emptyMidiBassLibrary() },
  { entry: "midi-bass-library", case: "wrong-file-version", input: { ...emptyMidiBassLibrary(), fileVersion: 2 } },
  { entry: "midi-bass-library", case: "extra-key", input: { ...emptyMidiBassLibrary(), extra: true } },

  // --- the completion (lap) records: a partial set is the normal shape; an unknown id is not. ---
  { entry: "lap-records", case: "partial", input: { app: "loopvault-jazz-practice", fileVersion: 1, version: 1, revision: 1, laps: { "jazz-progressions-001": { "0": { count: 2, lastAt: at }, "5": { count: 1, lastAt: at } } }, operations: ["op-1"] } },
  { entry: "lap-records", case: "empty-laps", input: { app: "loopvault-jazz-practice", fileVersion: 1, version: 1, revision: 1, laps: {}, operations: [] } },
  { entry: "lap-records", case: "unknown-progression", input: { app: "loopvault-jazz-practice", fileVersion: 1, version: 1, revision: 1, laps: { other: { "0": { count: 1, lastAt: at } } }, operations: [] } },
  { entry: "lap-records", case: "bad-tonic", input: { app: "loopvault-jazz-practice", fileVersion: 1, version: 1, revision: 1, laps: { "jazz-progressions-001": { "12": { count: 1, lastAt: at } } }, operations: [] } },

  // --- the ear practice records ---
  { entry: "ear-chord-record", case: "valid", input: earRecord },
  { entry: "ear-chord-record", case: "missing-level", input: { ...earRecord, level: undefined } },
  { entry: "ear-chord-record", case: "wrong-source", input: { ...earRecord, source: "radio" } },
  { entry: "ear-chord-record", case: "unknown-key", input: { ...earRecord, extra: 1 } },
  { entry: "ear-chord-record", case: "seconds-out-of-range", input: { ...earRecord, seconds: 99_999 } },

  // --- the source bassline snapshots ---
  { entry: "source-bassline-snapshot", case: "valid", input: sourceBasslineSnapshot },
  { entry: "source-bassline-snapshot", case: "half-bar-length", input: { ...sourceBasslineSnapshot, length: { numerator: 2, denominator: 1 } } },
  { entry: "source-bassline-snapshot", case: "bad-signature", input: { ...sourceBasslineSnapshot, snapshotSignature: "xyz" } },
  { entry: "source-bassline-snapshot", case: "no-notes", input: { ...sourceBasslineSnapshot, notes: [] } },

  // --- the device-local preferences ---
  { entry: "live-midi-preferences", case: "empty-object-defaults", input: {} },
  { entry: "live-midi-preferences", case: "full", input: { preferredInput: { backendId: "b1", name: "Keys", previousIndex: 2 }, miniBounds: { x: 10, y: 20, width: 640, height: 360 }, alwaysOnTop: false, showHistory: false } },
  { entry: "live-midi-preferences", case: "bad-bounds", input: { miniBounds: { x: 0, y: 0, width: -1, height: 10 } } },
  { entry: "live-midi-preferences", case: "unknown-key", input: { extra: 1 } },
  { entry: "live-midi-preferences", case: "invalid-json", input: "{" },
  { entry: "auto-connect", case: "on", input: { autoConnect: true } },
  { entry: "auto-connect", case: "off", input: { autoConnect: false } },
  { entry: "auto-connect", case: "wrong-type", input: { autoConnect: "yes" } },
  { entry: "auto-connect", case: "invalid-json", input: "{," },
  { entry: "llm-preferences", case: "empty-object-defaults", input: {} },
  { entry: "llm-preferences", case: "full", input: { provider: "openai", local: { baseUrl: "http://127.0.0.1:1234", model: "m", timeoutSeconds: 60 }, openai: { model: "gpt-x", confirmBeforePaidRequest: false }, language: "en" } },
  { entry: "llm-preferences", case: "timeout-too-small", input: { local: { baseUrl: "http://127.0.0.1:1", model: "", timeoutSeconds: 4 } } },
  { entry: "llm-preferences", case: "unknown-key", input: { extra: 1 } },

  // --- the review thresholds and the role-correction log ---
  { entry: "review-thresholds", case: "contract-file", input: reviewThresholdsJson },
  { entry: "review-thresholds", case: "missing-percussion", input: { ...reviewThresholdsJson, percussion: undefined } },
  { entry: "review-thresholds", case: "negative-tolerance", input: { ...reviewThresholdsJson, melody: { ...reviewThresholdsJson.melody, continuedToleranceBeats: -1 } } },
  { entry: "role-correction-log", case: "one-line", input: roleLog },
  { entry: "role-correction-log", case: "empty", input: "" },
  { entry: "role-correction-log", case: "broken-line", input: `${roleLog}\n{"schemaVersion":1}` },
];
