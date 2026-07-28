import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
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
  reextracting?: boolean;
  onMemoryChange: (memory: ChordVoicingMemory | undefined) => void;
  onReextract: () => void;
}

const copy = {
  ja: {
    title: "ボイシング",
    used: "使用中",
    practice: "鍵盤で記録",
    sourceEstimate: "元MIDIから推定",
    generated: "自動生成",
    aggregated: "区間内の音を集約",
    stale: "元MIDIのボイシングは編集前のコード用です。現在は自動生成を使用します。",
    record: "鍵盤で記録",
    replace: "鍵盤で弾いて上書き",
    recordPrompt: "MIDIキーボードで押さえてください",
    stable: "安定",
    confirm: "この押さえ方を使う",
    retry: "やり直す",
    cancel: "キャンセル",
    clearPractice: "練習用を解除",
    clearSource: "元MIDI設定を解除",
    reextract: "元MIDIから再取得",
    missing: "元MIDIファイルを見つけられませんでした。鍵盤で練習用ボイシングを記録できます。",
    mismatch: "現在のコードとの構成音一致が低いため、確認してください。",
    detail: "保存するのは音高とオクターブ配置です。音色、ベロシティ、発音順序は保存しません。",
  },
  en: {
    title: "Voicing",
    used: "In use",
    practice: "Keyboard capture",
    sourceEstimate: "Estimated from source MIDI",
    generated: "Generated",
    aggregated: "Aggregated note set",
    stale: "The source voicing belongs to the chord before editing. Generated voicing is in use.",
    record: "Capture from keyboard",
    replace: "Play and replace",
    recordPrompt: "Hold a voicing on your MIDI keyboard",
    stable: "Stable",
    confirm: "Use this voicing",
    retry: "Try again",
    cancel: "Cancel",
    clearPractice: "Clear practice voicing",
    clearSource: "Clear source voicing",
    reextract: "Extract from source MIDI",
    missing: "The source MIDI file was not found. You can capture a practice voicing from a keyboard.",
    mismatch: "The held notes have low coverage for the current chord. Please review them.",
    detail: "Only pitches and octave placement are saved. Sound, velocity, and note order are not saved.",
  },
} as const;

export function VoicingPanel({
  chord,
  memory,
  generatedNotes,
  language,
  sourceAvailable,
  reextracting,
  onMemoryChange,
  onReextract,
}: VoicingPanelProps) {
  const text = copy[language];
  const liveState = useStore(defaultLiveMidiStore, (state) => state.notes);
  const liveActive = useStore(defaultLiveMidiStore, (state) => state.active);
  const currentHeld = useMemo(() => heldNotes(liveState), [liveState]);
  const [recording, setRecording] = useState(false);
  const [stableNotes, setStableNotes] = useState<number[]>([]);
  const [stable, setStable] = useState(false);
  const ownedConnection = useRef(false);
  const resolved = resolveVoicingForUse(chord, memory, [...generatedNotes]);
  const sourceCompatibility = memory?.sourceVoicing
    ? voicingCompatibility(memory.sourceVoicing, chord)
    : undefined;
  const displayedSnapshot = resolved.origin === "practice-override"
    ? memory?.practiceVoicingOverride
    : resolved.origin.startsWith("source")
      ? memory?.sourceVoicing
      : undefined;
  const displayedNotes = displayedSnapshot?.midiNotes ?? resolved.midiNotes;
  const captureCoverage = chordCoverage(chord, stableNotes, stableNotes[0]);
  const sourceStatus = voicingSourceStatus(chord, memory);

  useEffect(() => {
    if (!recording) return undefined;
    setStable(false);
    if (currentHeld.length < 2 || currentHeld.length > 10) {
      setStableNotes([]);
      return undefined;
    }
    const signature = currentHeld.join(",");
    const timer = globalThis.setTimeout(() => {
      if (heldNotes(defaultLiveMidiStore.getState().notes).join(",") === signature) {
        setStableNotes([...currentHeld]);
        setStable(true);
      }
    }, 100);
    return () => globalThis.clearTimeout(timer);
  }, [currentHeld, recording]);

  useEffect(() => () => {
    if (ownedConnection.current) void defaultLiveMidiStore.getState().deactivate();
  }, []);

  async function startRecording() {
    ownedConnection.current = !liveActive;
    if (!liveActive) await defaultLiveMidiStore.getState().activate();
    setStableNotes([]);
    setStable(false);
    setRecording(true);
  }

  async function stopRecording() {
    setRecording(false);
    setStableNotes([]);
    setStable(false);
    if (ownedConnection.current) {
      ownedConnection.current = false;
      await defaultLiveMidiStore.getState().deactivate();
    }
  }

  function confirmCapture() {
    if (!stable || stableNotes.length < 2 || stableNotes.length > 10) return;
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
    onMemoryChange({ ...memory, practiceVoicingOverride: snapshot });
    void stopRecording();
  }

  const originLabel = resolved.origin === "practice-override"
    ? text.practice
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
          <VoicingSourceChip
            status={sourceStatus.status}
            reason={sourceStatus.reason}
            language={language}
            testId="detail-voicing-source-chip"
          />
          <span className="border border-[var(--lv-border)] px-2 py-1 text-xs text-teal-100">
            {text.used}: {originLabel}
          </span>
        </div>
      </div>
      <p className="mt-3 text-sm font-semibold text-[var(--lv-text)]">
        {displayedNotes.map(midiNoteName).join("  ")}
      </p>
      <p className="mt-1 text-xs text-[var(--lv-text-muted)]">
        Bass: {displayedNotes[0] !== undefined ? midiNoteName(displayedNotes[0]) : "-"}
      </p>
      <KeyboardVisualizer
        notes={recording ? currentHeld : displayedNotes}
        bassNote={recording ? currentHeld[0] : displayedNotes[0]}
      />

      {sourceCompatibility === "stale" ? (
        <p className="mt-3 border-l-2 border-amber-300 pl-3 text-xs text-amber-100">{text.stale}</p>
      ) : null}
      {recording ? (
        <div className="mt-4 border border-[var(--lv-border)] p-3">
          <p className="text-sm text-[var(--lv-text)]">{text.recordPrompt}</p>
          <p className="mt-2 text-xs text-[var(--lv-text-secondary)]">
            {currentHeld.map(midiNoteName).join("  ") || "-"} / {text.stable}: {stable ? "100 ms" : "..."}
          </p>
          {stable && captureCoverage.requiredCoverage < 0.67 ? (
            <p className="mt-2 text-xs text-amber-100">{text.mismatch}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="lv-button-primary px-3 py-2 text-sm" disabled={!stable} onClick={confirmCapture}>
              {text.confirm}
            </button>
            <button type="button" className="lv-button-secondary px-3 py-2 text-sm" onClick={() => { setStable(false); setStableNotes([]); }}>
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
            data-testid={sourceStatus.status === "source" ? undefined : "detail-voicing-recovery"}
            onClick={() => void startRecording()}
          >
            {sourceStatus.status === "source" ? text.record : text.replace}
          </button>
          <button type="button" className="lv-button-secondary px-3 py-2 text-sm" disabled={!sourceAvailable || reextracting} onClick={onReextract}>
            {text.reextract}
          </button>
          {memory?.practiceVoicingOverride ? (
            <button type="button" className="lv-button-ghost px-3 py-2 text-sm" onClick={() => onMemoryChange({ ...memory, practiceVoicingOverride: undefined })}>
              {text.clearPractice}
            </button>
          ) : null}
          {memory?.sourceVoicing ? (
            <button type="button" className="lv-button-ghost px-3 py-2 text-sm" onClick={() => onMemoryChange({ ...memory, sourceVoicing: undefined })}>
              {text.clearSource}
            </button>
          ) : null}
        </div>
      )}
      {!sourceAvailable ? <p className="mt-3 text-xs text-[var(--lv-text-muted)]">{text.missing}</p> : null}
      <p className="mt-3 text-xs text-[var(--lv-text-muted)]" title={text.detail}>{text.detail}</p>
    </section>
  );
}
