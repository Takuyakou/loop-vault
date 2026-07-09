import {
  open as openFileDialog,
} from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useEffect, useRef, useState } from "react";
import { parseChordLabel } from "../domain/chords";
import type {
  ChordSymbol,
  ChordTimelineItem,
  MidiProgressionAnalysis,
  ProgressionBlockCandidate,
  SongIdea,
  Status,
} from "../domain/types";
import type { AnalysisState } from "../store/vaultStore";
import type { AppCopy, AppLanguage } from "../i18n";
import { ProgressionGrid, timelineStartBeat } from "../ui/ProgressionGrid";
import { chordProgressFraction } from "../ui/playbackProgress";
import { confidenceLabel, shouldShowConfidence, warningLabel } from "./captureLabels";

interface CaptureViewProps {
  ideas: SongIdea[];
  analysis: AnalysisState;
  analyzeMidiBytes: (
    bytes: Uint8Array,
    options?: { fileName?: string; sourceAssetId?: string },
  ) => MidiProgressionAnalysis | undefined;
  clearAnalysis: () => void;
  createIdeaFromDraft: (draft: {
    title: string;
    status?: Status;
    bpm?: number;
    key?: string;
    chordMemo?: string;
    nextAction?: string;
    progressionBlock?: ProgressionBlockCandidate;
    progressionAnalysis?: MidiProgressionAnalysis;
  }) => string | undefined;
  appendBlockToIdea: (
    ideaId: string,
    block: ProgressionBlockCandidate,
    analysis?: MidiProgressionAnalysis,
  ) => void;
  updateIdea: (id: string, changes: Partial<SongIdea>) => void;
  setToast: (toast: string) => void;
  copy: AppCopy;
  language: AppLanguage;
}

const inputClass = "w-full rounded border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 outline-none focus:border-teal-400";

export function CaptureView({
  ideas,
  analysis,
  analyzeMidiBytes,
  clearAnalysis,
  createIdeaFromDraft,
  appendBlockToIdea,
  updateIdea,
  setToast,
  copy,
  language,
}: CaptureViewProps) {
  async function chooseMidi() {
    if (!("__TAURI_INTERNALS__" in window)) {
      setToast(copy.toast.desktopMidiOnly);
      return;
    }

    const path = await openFileDialog({
      multiple: false,
      filters: [{ name: "MIDI", extensions: ["mid", "midi"] }],
    });
    if (typeof path !== "string") {
      return;
    }

    try {
      const bytes = await readFile(path);
      const result = analyzeMidiBytes(bytes, { fileName: fileNameFromPath(path) });
      setToast(result ? copy.toast.midiAnalyzed : copy.toast.midiFailed);
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.midiReadFailed);
    }
  }

  function saveNew(candidate: ProgressionBlockCandidate, title: string, nextAction: string) {
    const id = createIdeaFromDraft({
      title,
      status: "idea",
      bpm: analysis.result?.bpm,
      key: analysis.result?.detectedKey,
      chordMemo: candidate.summaryText,
      nextAction,
      progressionBlock: candidate,
      progressionAnalysis: analysis.result,
    });
    setToast(id ? (language === "ja" ? "コード進行からIdeaを作成しました。" : "Created an idea from the progression.") : (language === "ja" ? "Ideaを作成できませんでした。" : "Could not create the idea."));
  }

  function appendExisting(candidate: ProgressionBlockCandidate, ideaId: string) {
    if (!ideaId) {
      setToast(language === "ja" ? "追加先のIdeaを選んでください。" : "Choose an idea first.");
      return;
    }

    appendBlockToIdea(ideaId, candidate, analysis.result);
    setToast(copy.toast.blockSaved);
  }

  function copyMemo(candidate: ProgressionBlockCandidate, ideaId: string) {
    if (!ideaId) {
      setToast(language === "ja" ? "追加先のIdeaを選んでください。" : "Choose an idea first.");
      return;
    }

    updateIdea(ideaId, { chordMemo: candidate.summaryText });
    setToast(copy.toast.blockCopied);
  }

  async function previewCandidate(candidate: ProgressionBlockCandidate) {
    try {
      await previewTimeline(candidate.chords, analysis.result?.bpm);
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed);
    }
  }

  async function previewCandidateChord(candidate: ProgressionBlockCandidate, chordIndex: number) {
    try {
      const chord = candidate.chords[chordIndex]?.chord;
      if (chord) {
        await previewSingleChord(chord);
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed);
    }
  }

  const result = analysis.result;

  if (!result) {
    return (
      <div className="py-5">
        <CaptureEmptyState
          status={analysis.status}
          error={analysis.error}
          onChooseMidi={() => void chooseMidi()}
          copy={copy}
          language={language}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-5 py-5">
      <section className="border border-stone-800 bg-stone-950/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">
              {language === "ja" ? "採集結果" : "Capture Result"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold">{result.fileName ?? "MIDI"}</h2>
            <p className="mt-2 max-w-2xl text-sm text-stone-400">
              {language === "ja"
                ? "候補を聴いて、使えそうなコード進行だけLoop Vaultへ保存してください。"
                : "Preview the candidates and save only the progressions worth keeping."}
            </p>
          </div>
          <div className="flex gap-2">
            <button className="rounded bg-teal-400 px-3 py-2 text-sm font-semibold text-stone-950" onClick={() => void chooseMidi()}>
              {copy.capture.chooseAnother}
            </button>
            <button className="rounded border border-stone-700 px-3 py-2 text-sm" onClick={clearAnalysis}>
              {copy.capture.clear}
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-4">
          <Metric label={copy.capture.file} value={result.fileName ?? "MIDI"} />
          <Metric label={copy.capture.bars} value={result.totalBars.toString()} />
          <Metric label="BPM" value={result.bpm ? Math.round(result.bpm).toString() : "Unknown"} />
          <Metric label={copy.capture.timeSignature} value={result.timeSignature ?? (language === "ja" ? "不明" : "Unknown")} />
        </div>
      </section>

      <section className="border border-stone-800 bg-stone-950/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">{copy.capture.candidates}</h2>
            <p className="mt-2 text-sm text-stone-400">{copy.capture.candidateHint}</p>
          </div>
          <span className="rounded bg-stone-800 px-3 py-1 text-sm text-teal-200">
            {language === "ja" ? `${result.blockCandidates.length}件` : `${result.blockCandidates.length} items`}
          </span>
        </div>

        <div className="mt-5 space-y-4">
          {result.blockCandidates.length > 0 ? (
            result.blockCandidates.map((candidate, index) => (
              <ProgressionCandidateCard
                key={candidate.id}
                candidate={candidate}
                candidateIndex={index}
                bpm={result.bpm ?? 96}
                ideas={ideas}
                onCreate={saveNew}
                onAppend={appendExisting}
                onCopyMemo={copyMemo}
                onPreview={previewCandidate}
                onPreviewChord={previewCandidateChord}
                copy={copy}
                language={language}
              />
            ))
          ) : (
            <p className="text-sm text-stone-400">{language === "ja" ? "使えそうな進行候補は見つかりませんでした。" : "No reusable progression candidates were found."}</p>
          )}
        </div>
      </section>

      <TimelineDetails result={result} copy={copy} language={language} />
    </div>
  );
}

function CaptureEmptyState({
  status,
  error,
  onChooseMidi,
  copy,
  language,
}: {
  status: AnalysisState["status"];
  error?: string;
  onChooseMidi: () => void;
  copy: AppCopy;
  language: AppLanguage;
}) {
  return (
    <section className="grid min-h-[32rem] place-items-center border border-stone-800 bg-stone-950/70 p-6 text-center">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-300">
          {language === "ja" ? "MIDI Capture" : "MIDI Capture"}
        </p>
        <h2 className="mt-3 text-3xl font-semibold">{copy.capture.title}</h2>
        <p className="mt-3 text-sm leading-6 text-stone-400">{copy.capture.emptyDescription}</p>
        <div className="mt-6 grid gap-3 text-left sm:grid-cols-3">
          <StepCard index="1" text={copy.capture.emptyStepTimeline} />
          <StepCard index="2" text={copy.capture.emptyStepCandidates} />
          <StepCard index="3" text={copy.capture.emptyStepSave} />
        </div>
        <button className="mt-7 rounded bg-teal-400 px-5 py-3 text-sm font-semibold text-stone-950" onClick={onChooseMidi}>
          {copy.capture.loadMidi}
        </button>
        <p className="mt-3 text-xs text-stone-500">{language === "ja" ? ".mid / .midi に対応" : ".mid / .midi supported"}</p>
        {status === "analyzing" ? (
          <div className="mt-6 border border-cyan-500/30 bg-cyan-500/10 p-4 text-left text-sm text-cyan-100">
            <p className="font-semibold">{copy.capture.analyzing}</p>
            <p className="mt-2 text-cyan-100/80">{copy.capture.analyzingDetail}</p>
          </div>
        ) : null}
        {status === "error" ? (
          <div className="mt-6 border border-red-500/30 bg-red-500/10 p-4 text-left text-sm text-red-100">
            <p className="font-semibold">{language === "ja" ? "読み込めませんでした" : "Could not load the MIDI"}</p>
            <p className="mt-2 text-red-100/80">{error}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StepCard({ index, text }: { index: string; text: string }) {
  return (
    <div className="border border-stone-800 bg-stone-950 p-4">
      <p className="text-xs font-semibold text-teal-300">{index}</p>
      <p className="mt-2 text-sm text-stone-200">{text}</p>
    </div>
  );
}

function TimelineDetails({
  result,
  copy,
  language,
}: {
  result: MidiProgressionAnalysis;
  copy: AppCopy;
  language: AppLanguage;
}) {
  return (
    <details className="border border-stone-800 bg-stone-950/70 p-5">
      <summary className="cursor-pointer text-lg font-semibold text-stone-100">
        {copy.capture.timeline}
      </summary>
      <p className="mt-3 text-sm text-stone-400">{copy.capture.timelineDescription}</p>
      <div className="mt-5">
        {result.fullTimeline.length > 0 ? (
          <ProgressionGrid
            chords={result.fullTimeline}
            currentBar={null}
            selectedChordIndex={undefined}
            playingChordIndex={null}
          />
        ) : (
          <p className="text-sm text-stone-400">{copy.capture.noTimeline}</p>
        )}
      </div>
      <p className="mt-4 text-xs text-stone-500">
        {language === "ja" ? "候補ブロックに含まれない部分も確認できます。" : "This also shows chords outside the reusable candidate blocks."}
      </p>
    </details>
  );
}

export function ProgressionCandidateCard({
  candidate,
  candidateIndex,
  bpm,
  ideas,
  onCreate,
  onAppend,
  onCopyMemo,
  onPreview,
  onPreviewChord,
  copy,
  language,
}: {
  candidate: ProgressionBlockCandidate;
  candidateIndex: number;
  bpm: number;
  ideas: SongIdea[];
  onCreate: (candidate: ProgressionBlockCandidate, title: string, nextAction: string) => void;
  onAppend: (candidate: ProgressionBlockCandidate, ideaId: string) => void;
  onCopyMemo: (candidate: ProgressionBlockCandidate, ideaId: string) => void;
  onPreview: (candidate: ProgressionBlockCandidate) => void | Promise<void>;
  onPreviewChord: (
    candidate: ProgressionBlockCandidate,
    chordIndex: number,
  ) => void | Promise<void>;
  copy: AppCopy;
  language: AppLanguage;
}) {
  const [summary, setSummary] = useState(candidate.summaryText);
  const [title, setTitle] = useState(`${language === "ja" ? "コード進行" : "Progression"} ${candidate.labels.slice(0, 4).join(" - ")}`);
  const [chords, setChords] = useState(candidate.chords);
  const [labelError, setLabelError] = useState<string>();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [selectedChordIndex, setSelectedChordIndex] = useState(0);
  const [playingChordIndex, setPlayingChordIndex] = useState<number | null>(null);
  const [previewStartedAt, setPreviewStartedAt] = useState<number | null>(null);
  const [, forcePlaybackTick] = useState(0);
  const visualTimers = useRef<number[]>([]);
  const editedCandidate = {
    ...candidate,
    summaryText: summary,
    chords,
    labels: [...new Set(chords.map((item) => item.chord.label))],
  };

  useEffect(() => {
    setSummary(candidate.summaryText);
    setTitle(`${language === "ja" ? "コード進行" : "Progression"} ${candidate.labels.slice(0, 4).join(" - ")}`);
    setChords(candidate.chords);
    setLabelError(undefined);
    setIsEditing(false);
    setIsSaveOpen(false);
    setSelectedChordIndex(0);
    stopVisualPreview();
    return stopVisualPreview;
  }, [candidate, language]);

  useEffect(() => {
    if (previewStartedAt === null) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      forcePlaybackTick((value) => value + 1);
    }, 100);

    return () => window.clearInterval(interval);
  }, [previewStartedAt]);

  function updateChordLabel(index: number, label: string) {
    const parsed = parseChordLabel(label);
    if (!parsed) {
      setLabelError(language === "ja" ? `未対応のコード表記です: ${label}` : `Unsupported chord label: ${label}`);
      return;
    }

    setLabelError(undefined);
    setChords((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, chord: parsed } : item,
      ),
    );
  }

  function stopVisualPreview() {
    for (const timer of visualTimers.current) {
      window.clearTimeout(timer);
    }
    visualTimers.current = [];
    setPlayingChordIndex(null);
    setPreviewStartedAt(null);
  }

  function stopCandidatePreview() {
    stopVisualPreview();
    void stopPreviewAudio();
  }

  function resetEdits() {
    setSummary(candidate.summaryText);
    setTitle(`${language === "ja" ? "コード進行" : "Progression"} ${candidate.labels.slice(0, 4).join(" - ")}`);
    setChords(candidate.chords);
    setLabelError(undefined);
    setSelectedChordIndex(0);
  }

  async function previewWholeCandidate() {
    stopVisualPreview();
    const baseBeat = firstTimelineBeat(chords);
    const beatSeconds = 60 / bpm;
    setPreviewStartedAt(window.performance.now());

    for (const [index, chord] of chords.entries()) {
      const delayMs = Math.max(0, (timelineStartBeat(chord) - baseBeat) * beatSeconds * 1000);
      visualTimers.current.push(
        window.setTimeout(() => {
          setPlayingChordIndex(index);
          setSelectedChordIndex(index);
        }, delayMs),
      );
    }

    const last = chords[chords.length - 1];
    const totalMs = last
      ? (timelineStartBeat(last) - baseBeat + last.durationBeats) * beatSeconds * 1000
      : 0;
    visualTimers.current.push(window.setTimeout(stopVisualPreview, totalMs + 120));
    await onPreview(editedCandidate);
  }

  async function selectChord(index: number) {
    setSelectedChordIndex(index);
    await onPreviewChord(editedCandidate, index);
  }

  const playingChord = playingChordIndex === null ? undefined : chords[playingChordIndex];
  const elapsedSeconds =
    previewStartedAt === null ? 0 : (window.performance.now() - previewStartedAt) / 1000;
  const playingProgress =
    previewStartedAt === null || playingChord === undefined
      ? null
      : chordProgressFraction(
          {
            startBeat: timelineStartBeat(playingChord) - firstTimelineBeat(chords),
            durationBeats: playingChord.durationBeats,
          },
          bpm,
          elapsedSeconds,
        );
  const selectedChord = chords[selectedChordIndex] ?? chords[0];
  const visibleWarnings = candidate.warnings.map((warning) => warningLabel(warning, language));
  const shouldDisplayConfidence = shouldShowConfidence(candidate.confidence);

  return (
    <div className="border border-stone-800 bg-stone-950 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300">
            {language === "ja" ? `候補 ${candidateIndex + 1}` : `Candidate ${candidateIndex + 1}`}
          </p>
          <p className="mt-2 font-semibold">{language === "ja" ? `${candidate.startBar}-${candidate.endBar}小節` : `Bars ${candidate.startBar}-${candidate.endBar}`} ({candidate.lengthBars})</p>
          {shouldDisplayConfidence ? (
            <p className="mt-1 text-sm text-amber-200">
              {language === "ja" ? "信頼度" : "Confidence"}: {confidenceLabel(candidate.confidence, language)}
            </p>
          ) : null}
        </div>
        <span className="rounded bg-stone-800 px-2 py-1 text-xs text-teal-200">{candidate.labels.join(" - ")}</span>
      </div>
      {summary.trim() ? <p className="mt-3 text-sm text-stone-300">{summary}</p> : null}
      <div className="mt-4">
        <ProgressionGrid
          chords={chords}
          currentBar={playingChord?.bar ?? null}
          selectedChordIndex={selectedChordIndex}
          playingChordIndex={playingChordIndex}
          playingProgress={playingProgress}
          onChordSelect={(index) => void selectChord(index)}
        />
      </div>
      {visibleWarnings.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {visibleWarnings.map((warning) => (
            <span key={warning} className="rounded border border-amber-400/40 bg-amber-400/10 px-2 py-1 text-xs text-amber-100">
              {language === "ja" ? "要確認" : "Review"}: {warning}
            </span>
          ))}
        </div>
      ) : null}

      {isEditing ? (
        <div className="mt-4 border border-stone-800 bg-stone-900/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold">{language === "ja" ? `編集中: 候補 ${candidateIndex + 1}` : `Editing Candidate ${candidateIndex + 1}`}</p>
            <button className="rounded border border-stone-700 px-3 py-2 text-sm" onClick={() => setIsEditing(false)}>
              {language === "ja" ? "編集を閉じる" : "Close editor"}
            </button>
          </div>
          <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            {language === "ja" ? "保存タイトル" : "Save title"}
          </label>
          <input className={`${inputClass} mt-2`} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={copy.capture.newIdeaTitle} />
          <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            Summary
          </label>
          <textarea className={`${inputClass} mt-2 min-h-20`} value={summary} onChange={(event) => setSummary(event.target.value)} />
          {selectedChord ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                key={`${selectedChord.bar}-${selectedChord.beat}-${selectedChordIndex}`}
                className={inputClass}
                defaultValue={selectedChord.chord.label}
                onBlur={(event) => updateChordLabel(selectedChordIndex, event.target.value)}
                aria-label={language === "ja" ? `Bar ${selectedChord.bar} のコード` : `Chord at bar ${selectedChord.bar}`}
              />
              <button className="rounded border border-stone-700 px-3 py-2 text-sm" onClick={() => void selectChord(selectedChordIndex)}>
                ▶ {copy.capture.selectedChord}
              </button>
            </div>
          ) : null}
          {labelError ? <p className="mt-2 text-xs text-red-200">{labelError}</p> : null}
          <button className="mt-3 rounded border border-stone-700 px-3 py-2 text-sm" onClick={resetEdits}>
            {language === "ja" ? "元に戻す" : "Reset edits"}
          </button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button className="rounded bg-cyan-400 px-3 py-2 text-sm font-semibold text-stone-950" onClick={() => void previewWholeCandidate()}>
          {copy.common.preview}
        </button>
        {previewStartedAt !== null ? (
          <button className="rounded border border-stone-700 px-3 py-2 text-sm" onClick={stopCandidatePreview}>
            {copy.common.stop}
          </button>
        ) : null}
        <button className="rounded border border-stone-700 px-3 py-2 text-sm" onClick={() => setIsEditing((value) => !value)}>
          {isEditing ? (language === "ja" ? "編集を閉じる" : "Close editor") : (language === "ja" ? "編集" : "Edit")}
        </button>
        <button className="rounded bg-teal-400 px-3 py-2 text-sm font-semibold text-stone-950" onClick={() => setIsSaveOpen(true)}>
          {language === "ja" ? "保存" : "Save"}
        </button>
      </div>
      {isSaveOpen ? (
        <ProgressionSaveDialog
          candidate={editedCandidate}
          title={title}
          ideas={ideas}
          onTitleChange={setTitle}
          onClose={() => setIsSaveOpen(false)}
          onCreate={(saveTitle, nextAction) => {
            onCreate(editedCandidate, saveTitle, nextAction);
            setIsSaveOpen(false);
          }}
          onAppend={(ideaId) => {
            onAppend(editedCandidate, ideaId);
            setIsSaveOpen(false);
          }}
          onCopyMemo={(ideaId) => {
            onCopyMemo(editedCandidate, ideaId);
            setIsSaveOpen(false);
          }}
          copy={copy}
          language={language}
        />
      ) : null}
    </div>
  );
}

type SaveMode = "new" | "append" | "memo";

export function ProgressionSaveDialog({
  candidate,
  title,
  ideas,
  onTitleChange,
  onClose,
  onCreate,
  onAppend,
  onCopyMemo,
  copy,
  language,
  initialMode = "new",
}: {
  candidate: ProgressionBlockCandidate;
  title: string;
  ideas: SongIdea[];
  onTitleChange: (title: string) => void;
  onClose: () => void;
  onCreate: (title: string, nextAction: string) => void;
  onAppend: (ideaId: string) => void;
  onCopyMemo: (ideaId: string) => void;
  copy: AppCopy;
  language: AppLanguage;
  initialMode?: SaveMode;
}) {
  const [mode, setMode] = useState<SaveMode>(initialMode);
  const [ideaId, setIdeaId] = useState("");
  const [nextAction, setNextAction] = useState(
    language === "ja" ? "採集したコード進行からループを作る" : "Build a loop from the captured progression",
  );
  const needsIdea = mode !== "new";
  const canSave = mode === "new" ? title.trim().length > 0 : ideaId.length > 0;
  const chordText = candidate.chords.map((item) => item.chord.label).join(" | ");

  function save() {
    if (!canSave) return;
    if (mode === "new") {
      onCreate(title.trim(), nextAction.trim());
      return;
    }
    if (mode === "append") {
      onAppend(ideaId);
      return;
    }
    onCopyMemo(ideaId);
  }

  return (
    <div className="mt-4 border border-teal-400/40 bg-stone-900 p-4 shadow-[0_0_0_1px_rgba(45,212,191,0.18)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{language === "ja" ? "この進行を保存" : "Save this progression"}</h3>
          <p className="mt-1 text-sm text-stone-400">{chordText}</p>
        </div>
        <button className="rounded border border-stone-700 px-3 py-2 text-sm" onClick={onClose}>
          {copy.common.close}
        </button>
      </div>

      <fieldset className="mt-4 grid gap-2 sm:grid-cols-3">
        <legend className="sr-only">{language === "ja" ? "保存方法" : "Save method"}</legend>
        <SaveModeOption
          checked={mode === "new"}
          label={copy.capture.createIdea}
          onChange={() => setMode("new")}
        />
        <SaveModeOption
          checked={mode === "append"}
          label={copy.capture.appendIdea}
          onChange={() => setMode("append")}
        />
        <SaveModeOption
          checked={mode === "memo"}
          label={copy.capture.copyMemo}
          onChange={() => setMode("memo")}
        />
      </fieldset>

      {mode === "new" ? (
        <div className="mt-4 grid gap-3">
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            {language === "ja" ? "タイトル" : "Title"}
            <input className={`${inputClass} mt-2`} value={title} onChange={(event) => onTitleChange(event.target.value)} />
          </label>
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
            Next Action
            <input className={`${inputClass} mt-2`} value={nextAction} onChange={(event) => setNextAction(event.target.value)} />
          </label>
        </div>
      ) : null}

      {needsIdea ? (
        <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
          {language === "ja" ? "追加先Idea" : "Destination idea"}
          <select className={`${inputClass} mt-2`} value={ideaId} onChange={(event) => setIdeaId(event.target.value)}>
            <option value="">{language === "ja" ? "既存Ideaを選ぶ" : "Choose an existing idea"}</option>
            {ideas.map((idea) => (
              <option key={idea.id} value={idea.id}>{idea.title}</option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button className="rounded border border-stone-700 px-3 py-2 text-sm" onClick={onClose}>
          {language === "ja" ? "キャンセル" : "Cancel"}
        </button>
        <button
          className="rounded bg-teal-400 px-3 py-2 text-sm font-semibold text-stone-950 disabled:cursor-not-allowed disabled:bg-stone-700 disabled:text-stone-400"
          disabled={!canSave}
          onClick={save}
        >
          {language === "ja" ? "保存" : "Save"}
        </button>
      </div>
    </div>
  );
}

function SaveModeOption({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className={`flex cursor-pointer items-center gap-2 border px-3 py-2 text-sm ${checked ? "border-teal-400 bg-teal-400/10 text-teal-100" : "border-stone-800 bg-stone-950 text-stone-300"}`}>
      <input type="radio" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-stone-800 bg-stone-950 p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-stone-500">{label}</p>
      <p className="mt-1 font-semibold text-stone-100">{value}</p>
    </div>
  );
}

function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() || "midi.mid";
}

async function previewSingleChord(chord: ChordSymbol): Promise<void> {
  const { previewChord } = await import("../audio/chordPreview");
  await previewChord(chord);
}

async function previewTimeline(
  chords: readonly ChordTimelineItem[],
  bpm?: number,
): Promise<void> {
  const { previewChordTimeline } = await import("../audio/chordPreview");
  await previewChordTimeline(chords, bpm);
}

async function stopPreviewAudio(): Promise<void> {
  const { stopPreview } = await import("../audio/chordPreview");
  stopPreview();
}

function firstTimelineBeat(chords: readonly ChordTimelineItem[]): number {
  return chords.length === 0 ? 0 : Math.min(...chords.map(timelineStartBeat));
}
