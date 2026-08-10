import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  createMidiInputPianoMonitor,
  type MidiInputPianoMonitor,
} from "../../audio/midiInputPianoMonitor";
import { heldNotes } from "../../domain/liveMidi";
import type { ChordSymbol, ChordVoicingMemory, VoicingSnapshot } from "../../domain/types";
import {
  chordCoverage,
  normalizedChordKey,
  resolveVoicingForUse,
  voicingSourceStatus,
  voicingCompatibility,
} from "../../domain/voicing";
import { defaultLiveMidiStore } from "../../liveMidi/defaultLiveMidiStore";
import type { AppLanguage } from "../../i18n";
import { KeyboardVisualizer } from "./KeyboardVisualizer";
import { midiNoteName } from "./midiNoteName";
import { VoicingSourceChip } from "./VoicingSourceChip";

interface VoicingPanelProps {
  chord: ChordSymbol;
  memory?: ChordVoicingMemory;
  generatedNotes: readonly number[];
  language: AppLanguage;
  sourceAvailable: boolean;
  /** False for sources that do not exist (for example text entry), not missing files. */
  sourceApplicable?: boolean;
  reextracting?: boolean;
  onMemoryChange: (memory: ChordVoicingMemory | undefined) => void;
  onReextract: () => void;
  styleSelector?: {
    value: string;
    label: string;
    options: readonly { value: string; label: string; disabled?: boolean }[];
    onChange: (value: string) => void;
  };
}

const copy = {
  ja: {
    title: "ボイシング",
    used: "使用中",
    practice: "鍵盤で記録",
    selectedStyle: "選択スタイル",
    sourceEstimate: "元MIDIから推定",
    generated: "自動生成",
    aggregated: "区間内の音を集約",
    stale: "元MIDIのボイシングは編集前のコード用です。現在は自動生成を使用します。",
    record: "鍵盤で記録",
    replace: "鍵盤で弾いて上書き",
    recordPrompt: "MIDIキーボードで弾き、手を離して保存予定音を確認してください",
    monitorReady: "入力音: ピアノ",
    monitorUnavailable: "ピアノ音を開始できませんでした。ボイシング記録は続けられます。",
    capturedCandidate: "確認する音",
    stable: "安定",
    confirm: "この音を保存予定にする",
    retry: "やり直す",
    cancel: "キャンセル",
    clearPractice: "練習用を解除",
    clearSource: "元MIDI設定を解除",
    reextract: "元MIDIから再取得",
    missing: "元MIDIファイルを見つけられませんでした。鍵盤で練習用ボイシングを記録できます。",
    mismatch: "現在のコードとの構成音一致が低いため、確認してください。",
    detail: "保存するのは音高とオクターブ配置です。音色、ベロシティ、発音順序は保存しません。",
    savedNotes: "このコードの保存予定音",
    midiNotes: "MIDIノート",
    captured: "鍵盤入力を記録しました。Vault保存時にこのコードへ適用されます。",
  },
  en: {
    title: "Voicing",
    used: "In use",
    practice: "Keyboard capture",
    selectedStyle: "Selected style",
    sourceEstimate: "Estimated from source MIDI",
    generated: "Generated",
    aggregated: "Aggregated note set",
    stale: "The source voicing belongs to the chord before editing. Generated voicing is in use.",
    record: "Capture from keyboard",
    replace: "Play and replace",
    recordPrompt: "Play a voicing, release the keys, then confirm the notes to save",
    monitorReady: "Input sound: Piano",
    monitorUnavailable: "Piano monitoring could not start. Keyboard capture is still available.",
    capturedCandidate: "Captured candidate",
    stable: "Stable",
    confirm: "Use these notes for saving",
    retry: "Try again",
    cancel: "Cancel",
    clearPractice: "Clear practice voicing",
    clearSource: "Clear source voicing",
    reextract: "Extract from source MIDI",
    missing: "The source MIDI file was not found. You can capture a practice voicing from a keyboard.",
    mismatch: "The held notes have low coverage for the current chord. Please review them.",
    detail: "Only pitches and octave placement are saved. Sound, velocity, and note order are not saved.",
    savedNotes: "Notes to save for this chord",
    midiNotes: "MIDI notes",
    captured: "Keyboard input recorded. These notes will be applied to this chord when you save to Vault.",
  },
} as const;

export function VoicingPanel({
  chord,
  memory,
  generatedNotes,
  language,
  sourceAvailable,
  sourceApplicable = true,
  reextracting,
  onMemoryChange,
  onReextract,
  styleSelector,
}: VoicingPanelProps) {
  const text = copy[language];
  const liveState = useStore(defaultLiveMidiStore, (state) => state.notes);
  const liveActive = useStore(defaultLiveMidiStore, (state) => state.active);
  const currentHeld = useMemo(() => heldNotes(liveState), [liveState]);
  const [recording, setRecording] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [stableNotes, setStableNotes] = useState<number[]>([]);
  const [monitorAvailable, setMonitorAvailable] = useState(true);
  const [captureConfirmation, setCaptureConfirmation] = useState<{
    chordKey: string;
    notes: number[];
  }>();
  const ownedConnection = useRef(false);
  const monitorRef = useRef<MidiInputPianoMonitor>();
  const captureGeneration = useRef(0);
  const releasedSinceCandidate = useRef(false);
  // Text has no source MIDI. Ignore a malformed caller-supplied source snapshot
  // rather than letting it affect the generated/practice-only text path.
  const usableMemory = sourceApplicable
    ? memory
    : memory?.practiceVoicingOverride
      ? { practiceVoicingOverride: memory.practiceVoicingOverride }
      : undefined;
  const resolved = resolveVoicingForUse(chord, usableMemory, [...generatedNotes]);
  const sourceCompatibility = sourceApplicable && memory?.sourceVoicing
    ? voicingCompatibility(memory.sourceVoicing, chord)
    : undefined;
  const displayedSnapshot = resolved.origin === "practice-override"
    ? memory?.practiceVoicingOverride
    : sourceApplicable && resolved.origin.startsWith("source")
      ? memory?.sourceVoicing
      : undefined;
  const displayedNotes = displayedSnapshot?.midiNotes ?? resolved.midiNotes;
  const captureCoverage = chordCoverage(chord, stableNotes, stableNotes[0]);
  const capturedCandidateReady = stableNotes.length >= 2 && stableNotes.length <= 10;
  const captureDisplayNotes = currentHeld.length ? currentHeld : stableNotes;
  const sourceStatus = sourceApplicable
    ? voicingSourceStatus(chord, memory)
    : { status: "generated" as const, reason: undefined };
  useEffect(() => {
    if (!recording) return undefined;
    if (currentHeld.length === 0) {
      if (stableNotes.length >= 2) releasedSinceCandidate.current = true;
      return undefined;
    }
    if (releasedSinceCandidate.current) {
      releasedSinceCandidate.current = false;
      setStableNotes([]);
      return undefined;
    }
    const isPartialRelease = stableNotes.length > currentHeld.length
      && currentHeld.every((note) => stableNotes.includes(note));
    if (isPartialRelease || currentHeld.length < 2 || currentHeld.length > 10) {
      return undefined;
    }
    const signature = currentHeld.join(",");
    const timer = globalThis.setTimeout(() => {
      if (heldNotes(defaultLiveMidiStore.getState().notes).join(",") === signature) {
        setStableNotes((previous) => previous.join(",") === signature ? previous : [...currentHeld]);
      }
    }, 100);
    return () => globalThis.clearTimeout(timer);
  }, [currentHeld, recording, stableNotes]);

  useEffect(() => {
    if (recording) monitorRef.current?.updateNotes(currentHeld);
  }, [currentHeld, recording]);

  useEffect(() => () => {
    captureGeneration.current += 1;
    monitorRef.current?.dispose();
    monitorRef.current = undefined;
    if (ownedConnection.current) void defaultLiveMidiStore.getState().deactivate();
  }, []);

  async function startRecording() {
    if (recording || preparing) return;
    const generation = captureGeneration.current + 1;
    captureGeneration.current = generation;
    setPreparing(true);
    setCaptureConfirmation(undefined);
    ownedConnection.current = !liveActive;
    const monitorPromise = createMidiInputPianoMonitor().catch(() => undefined);
    const activationPromise = liveActive
      ? Promise.resolve(true)
      : defaultLiveMidiStore.getState().activate().then(
          () => true,
          () => false,
        );
    try {
      const [monitor, activated] = await Promise.all([monitorPromise, activationPromise]);
      if (!activated) {
        ownedConnection.current = false;
        monitor?.dispose();
        setMonitorAvailable(false);
        return;
      }
      if (captureGeneration.current !== generation) {
        monitor?.dispose();
        return;
      }
      monitorRef.current?.dispose();
      monitorRef.current = monitor;
      setMonitorAvailable(Boolean(monitor));
      releasedSinceCandidate.current = false;
      setStableNotes([]);
      setRecording(true);
    } finally {
      if (captureGeneration.current === generation) setPreparing(false);
    }
  }

  async function stopRecording() {
    captureGeneration.current += 1;
    monitorRef.current?.dispose();
    monitorRef.current = undefined;
    setRecording(false);
    releasedSinceCandidate.current = false;
    setStableNotes([]);
    setPreparing(false);
    if (ownedConnection.current) {
      ownedConnection.current = false;
      await defaultLiveMidiStore.getState().deactivate();
    }
  }

  function confirmCapture() {
    if (!capturedCandidateReady) return;
    const snapshot: VoicingSnapshot = {
      schemaVersion: 1,
      source: "live-played",
      representation: "simultaneous-voicing",
      midiNotes: [...stableNotes],
      bassNote: stableNotes[0],
      capturedForChordKey: normalizedChordKey(chord),
      capturedForChordLabel: chord.label,
      confidence: 1,
      userVerified: true,
    };
    setCaptureConfirmation({
      chordKey: normalizedChordKey(chord),
      notes: [...stableNotes],
    });
    onMemoryChange({ ...memory, practiceVoicingOverride: snapshot });
    void stopRecording();
  }

  const practiceOriginLabel = displayedSnapshot?.source === "live-played"
    ? text.practice
    : text.selectedStyle;
  const originLabel = resolved.origin === "practice-override"
    ? practiceOriginLabel
    : resolved.origin.startsWith("source")
      ? (
          displayedSnapshot?.representation === "aggregated-note-set"
            ? text.aggregated
            : text.sourceEstimate
        )
      : text.generated;

  return (
    <section className="mt-4 border-t border-[var(--lv-border)] pt-4" data-voicing-panel>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--lv-text)]">{text.title}</h3>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {styleSelector ? (
            <label className="flex items-center gap-2 text-xs text-[var(--lv-text-muted)]">
              <span>{styleSelector.label}</span>
              <select
                className="min-h-9 border border-[var(--lv-border)] bg-[var(--lv-surface)] px-2 text-xs text-[var(--lv-text)]"
                data-testid="voicing-style-selector"
                value={styleSelector.value}
                disabled={recording}
                onChange={(event) => {
                  setCaptureConfirmation(undefined);
                  styleSelector.onChange(event.target.value);
                }}
              >
                {styleSelector.options.map((option) => (
                  <option key={option.value} value={option.value} disabled={option.disabled}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <VoicingSourceChip
            status={sourceStatus.status}
            reason={sourceStatus.reason}
            sourceAbsentByDesign={!sourceApplicable}
            language={language}
            testId="detail-voicing-source-chip"
          />
          <span className="border border-[var(--lv-border)] px-2 py-1 text-xs text-teal-100">
            {text.used}: {originLabel}
          </span>
        </div>
      </div>
      <div className="mt-3 border border-[var(--lv-border)] bg-[var(--lv-bg)]/60 p-3" data-testid="voicing-saved-notes">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--lv-accent)]">{text.savedNotes}</p>
        <p className="mt-2 text-sm font-semibold text-[var(--lv-text)]">
          {displayedNotes.map(midiNoteName).join("  ")}
        </p>
        <p className="mt-1 text-xs text-[var(--lv-text-muted)]">
          {text.midiNotes}: {displayedNotes.join(", ")} / Bass: {displayedNotes[0] !== undefined ? midiNoteName(displayedNotes[0]) : "-"}
        </p>
      </div>
      <KeyboardVisualizer
        notes={recording ? captureDisplayNotes : displayedNotes}
        bassNote={recording ? captureDisplayNotes[0] : displayedNotes[0]}
      />

      {captureConfirmation?.chordKey === normalizedChordKey(chord) ? (
        <p className="mt-3 border-l-2 border-teal-300 pl-3 text-sm text-teal-100" role="status" data-testid="voicing-capture-confirmation">
          {text.captured} {captureConfirmation.notes.map(midiNoteName).join("  ")}
        </p>
      ) : null}

      {sourceCompatibility === "stale" ? (
        <p className="mt-3 border-l-2 border-amber-300 pl-3 text-xs text-amber-100">{text.stale}</p>
      ) : null}
      {recording ? (
        <div className="mt-4 border border-[var(--lv-border)] p-3">
          <p className="text-sm text-[var(--lv-text)]">{text.recordPrompt}</p>
          <p className={`mt-2 text-xs ${monitorAvailable ? "text-teal-100" : "text-amber-100"}`} role="status">
            {monitorAvailable ? text.monitorReady : text.monitorUnavailable}
          </p>
          <p className="mt-2 text-xs text-[var(--lv-text-secondary)]">
            {text.capturedCandidate}: {stableNotes.map(midiNoteName).join("  ") || "-"} / {text.stable}: {capturedCandidateReady ? "100 ms" : "…"}
          </p>
          {capturedCandidateReady && captureCoverage.requiredCoverage < 0.67 ? (
            <p className="mt-2 text-xs text-amber-100">{text.mismatch}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="lv-button-primary px-3 py-2 text-sm" disabled={!capturedCandidateReady} onClick={confirmCapture}>
              {text.confirm}
            </button>
            <button type="button" className="lv-button-secondary px-3 py-2 text-sm" onClick={() => { releasedSinceCandidate.current = false; setStableNotes([]); monitorRef.current?.stop(); }}>
              {text.retry}
            </button>
            <button type="button" className="lv-button-ghost px-3 py-2 text-sm" onClick={() => void stopRecording()}>
              {text.cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="lv-button-secondary px-3 py-2 text-sm"
            data-testid={sourceApplicable && sourceStatus.status !== "source" ? "detail-voicing-recovery" : undefined}
            disabled={preparing}
            onClick={() => void startRecording()}
          >
            {sourceApplicable && sourceStatus.status !== "source" ? text.replace : text.record}
          </button>
          {sourceApplicable ? (
            <button type="button" className="lv-button-secondary px-3 py-2 text-sm" disabled={!sourceAvailable || reextracting} onClick={onReextract}>
              {text.reextract}
            </button>
          ) : null}
          {memory?.practiceVoicingOverride ? (
            <button type="button" className="lv-button-ghost px-3 py-2 text-sm" onClick={() => { setCaptureConfirmation(undefined); onMemoryChange({ ...memory, practiceVoicingOverride: undefined }); }}>
              {text.clearPractice}
            </button>
          ) : null}
          {sourceApplicable && memory?.sourceVoicing ? (
            <button type="button" className="lv-button-ghost px-3 py-2 text-sm" onClick={() => onMemoryChange({ ...memory, sourceVoicing: undefined })}>
              {text.clearSource}
            </button>
          ) : null}
        </div>
      )}
      {sourceApplicable && !sourceAvailable ? <p className="mt-3 text-xs text-[var(--lv-text-muted)]">{text.missing}</p> : null}
      <p className="mt-3 text-xs text-[var(--lv-text-muted)]" title={text.detail}>{text.detail}</p>
    </section>
  );
}
