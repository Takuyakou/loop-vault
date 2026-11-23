import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useStore } from "zustand";
import { Check } from "lucide-react";
import { useSaveButtonState } from "../ui";
import { useReserveBottomSpace } from "../notifications";
import { playbackController, type PlaybackController } from "../../audio/playbackController";
import { textPreviewNotes, textVoicingAvailability } from "../../domain/textVoicingAvailability";
import { TextVoicingAvailability } from "./TextVoicingAvailability";
import { useTextTransport } from "./useTextTransport";
import { TextTransportBar } from "./TextTransportBar";
import type { PreviewSound } from "../../audio/chordPreview";
import { formatMidiNoteForDisplay } from "../music-keyboard";
import { displayChordLabel } from "../../ui/chordText";
import { displayKey } from "../../domain/displayLabels";
import { resolveImportKey, type ImportKeyChoice } from "../../domain/importKeyResolution";
import { detectLiveChord, heldNotes, type LiveNoteState } from "../../domain/liveMidi";
import { createChordLatch } from "../../domain/liveMidi/chordLatch";
import {
  addKeyboardSlot,
  appendKeyboardBar,
  emptyKeyboardBar,
  flushKeyboardBar,
  keyboardLengthInBeats,
  keyboardTextFits,
  pendingKeyboardBarText,
  type KeyboardBar,
  type KeyboardSlot,
} from "../../domain/textKeyboardEntry";
import { createMidiInputPianoMonitor, type MidiInputPianoMonitor } from "../../audio/midiInputPianoMonitor";
import { defaultLiveMidiStore } from "../../liveMidi/defaultLiveMidiStore";
import { useMidiConnection } from "../../liveMidi/useMidiConnection";
import { openMidiPanel } from "../../liveMidi/midiPanel";
import { normalizedChordKey } from "../../domain/voicing";
import type { ChordSymbol, VoicingSnapshot } from "../../domain/types";
import { KeyboardEntryBand, type KeyboardLengthChoice } from "./KeyboardEntryBand";
import { evaluateExtendedTextPractice } from "../../domain/extendedTextPractice";
import { textMetronomeNotes } from "../../domain/textMetronomeNotes";
import type { ExtendedTextResult } from "../../domain/extendedTextProgression";
import { asExtendedTextResult, parseUnifiedText, UNIFIED_TEXT_LIMITS, type UnifiedDiagnostic, type UnifiedTextResult } from "../../domain/textUnified";
import type { TextSaveVoicings } from "../../domain/extendedTextSave";
import { cleanedText, mergeNormalizeChanges } from "../../domain/textNormalize";
import { parseExtendedTextChordLabel } from "../../domain/extendedTextProgression";
import { barAt, unifiedAsPreviewResult, unifiedEvents } from "./textUnifiedView";
import { detectTextMetadataHints } from "./textMetadataHints";
import { TextCaptureShell } from "./TextCaptureShell";
import { TEXT_CAPTURE_DEFAULT_NAME, TextKeySelect, TextMeterSelect, textSaveBlockedReason } from "./TextCaptureFields";

/** P24-05: the one grammar reads 1/4 through 12/4. */
const METER_OPTIONS = Array.from({ length: 12 }, (_value, index) => `${index + 1}/4`);
import { roleColor as roleColorOf, TextUnifiedWorkspace } from "./TextUnifiedWorkspace";
import { textCaptureStatus, textCaptureSaveReason } from "./textCaptureStatus";
import { deleteTextCard } from "../../domain/textCardDelete";
import {
  confirmedTextProgressionKeyState,
  parseTextProgression,
  type TextProgressionEvent,
} from "../../domain/textProgression";
import {
  createTextProgressionDraft,
  textProgressionDraftTitle,
  textProgressionEventKey,
  type TextProgressionVoicingOverrides,
} from "../../domain/textProgressionDraft";
import {
  createTextProgressionStyleSnapshot,
  isTextProgressionVoicingStyleId,
  TEXT_PROGRESSION_VOICING_STYLES,
  textProgressionStyleFromSnapshot,
  textProgressionVoicingNotes,
  type TextProgressionVoicingStyleId,
} from "../../domain/textProgressionVoicing";
import type { ChordVoicingMemory } from "../../domain/types";
import type { ManualCandidateDraft } from "../../domain/midi/manualDraft";
import { VoicingPanel } from "../voicing/VoicingPanel";
import { BpmScrubField } from "../BpmScrubField";
import { formatTextKeyLabel } from "./TextCaptureFields";
import { usePreviewSound } from "../PreviewSoundProvider";
import { cardHarmony } from "../correction-workspace/cardHarmony";
import { useMetronome } from "../MetronomeProvider";
import { useGlobalBpm } from "../GlobalBpmProvider";

/** The input's hidden-line set is empty now (fix-1 removed 「読み飛ばした行を隠す」). */
const HIDDEN_NONE: ReadonlySet<number> = new Set();

/** P24-05: the band's quiet button (the design's 28px bordered one). */
const BAND_SECONDARY: CSSProperties = {
  flex: "none", height: 28, padding: "0 10px", border: "1px solid rgb(150 170 195 / 34%)", borderRadius: 8,
  background: "transparent", color: "#c4d6e6", fontSize: 12, whiteSpace: "nowrap",
};

export interface TextProgressionConvertedDraft {
  readonly draft: ManualCandidateDraft;
  readonly title: string;
  readonly bpm?: number;
  readonly confirmedKey?: string;
  /** P23-33: the effective key (manual, inherited or inferred) for the save and the display. */
  readonly resolvedKey?: string;
}

interface TextProgressionCapturePanelProps {
  readonly showRomanNumerals: boolean;
  /** Once converted, the existing ManualCandidateDraft is authoritative. */
  readonly draftActive?: boolean;
  readonly onConvert: (converted: TextProgressionConvertedDraft) => void;
  readonly onSaveStandard?: (converted: TextProgressionConvertedDraft, title: string) => boolean;
  /** P23-33: the third argument is the effective (auto/inherited/manual) key for save and reload. */
  /** P24-06: the fourth argument carries each card's own sound (the keys played for it). */
  readonly onSaveExtended?: (
    result: ExtendedTextResult,
    title: string,
    resolvedKey?: string,
    voicings?: TextSaveVoicings,
  ) => boolean;
  readonly onPreview: (
    event: TextProgressionEvent,
    memory: ChordVoicingMemory | undefined,
    bpm: number,
  ) => void;
  readonly onStop: () => void;
  readonly controller?: PlaybackController;
  readonly previewSound?: PreviewSound;
}

/**
 * A bounded, text-only Capture intake. Parsing is transient until the person
 * explicitly converts a fully valid result into the existing session Draft.
 */
export function TextProgressionCapturePanel({
  showRomanNumerals,
  draftActive = false,
  onConvert,
  onSaveStandard,
  onSaveExtended,
  onPreview,
  onStop,
  controller,
  previewSound,
}: TextProgressionCapturePanelProps) {
  const { sound: globalSound } = usePreviewSound();
  const { enabled: metronomeEnabled } = useMetronome();
  const { bpm: globalBpm } = useGlobalBpm();
  const selectedSound = previewSound ?? globalSound;
  const [input, setInput] = useState("");
  const editorSelection = useRef({ start: 0, end: 0 });
  const statusBarRef = useRef<HTMLElement>(null);
  useReserveBottomSpace(statusBarRef);
  const [dialect] = useState<"standard" | "extended">("standard");
  const [meter, setMeter] = useState("4/4");
  /** P24-05: lines the user chose to read as code again (remembered by their trimmed text). */
  const [readAsCode, setReadAsCode] = useState<readonly string[]>([]);
  /** P24-05: the text before 「整えたテキストに置き換える」, so it can be put back. */
  const [replacedFrom, setReplacedFrom] = useState<string | undefined>(undefined);
  const [keyChoice, setKeyChoice] = useState<ImportKeyChoice>({ kind: "auto" });
  const [bpmInput, setBpmInput] = useState("");
  const [matchGlobalBpm, setMatchGlobalBpm] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDivElement>(null);
  const [saveTitle, setSaveTitle] = useState(TEXT_CAPTURE_DEFAULT_NAME);
  const [saved, setSaved] = useState(false);
  const saveBtn = useSaveButtonState();
  const [saveFailed, setSaveFailed] = useState(false);
  const [selectedEventKey, setSelectedEventKey] = useState<string>();
  const [voicingOverrides, setVoicingOverrides] = useState<TextProgressionVoicingOverrides>(new Map());
  const [voicingStyles, setVoicingStyles] = useState<ReadonlyMap<string, TextProgressionVoicingStyleId>>(new Map());

  // P24-06: 「鍵盤で入れる」 — the latch, the open bar, the history of its additions and the held chord.
  const liveNotes = useStore(defaultLiveMidiStore, (state) => state.notes);
  const held = useMemo(() => heldNotes(liveNotes), [liveNotes]);
  const keyboardLatch = useRef(createChordLatch());
  const monitorRef = useRef<MidiInputPianoMonitor>();
  const [keyboardOn, setKeyboardOn] = useState(false);
  const [keyboardLength, setKeyboardLength] = useState<1 | 2 | "bar">("bar");
  const [keyboardBar, setKeyboardBar] = useState<KeyboardBar>(emptyKeyboardBar);
  const [keyboardBase, setKeyboardBase] = useState("");
  const [keyboardStack, setKeyboardStack] = useState<readonly KeyboardSnapshot[]>([]);
  const [selectedPending, setSelectedPending] = useState<number>();
  /** P24-07 item 3: the card under the pointer, the chosen card (raw start) and its small menu. */
  const [hoveredCardStart, setHoveredCardStart] = useState<number>();
  const [selectedCardStart, setSelectedCardStart] = useState<number>();
  const [cardMenu, setCardMenu] = useState<{ start: number; x: number; y: number }>();
  const deleteUndoRef = useRef<{ before: string; after: string }>();
  const [heldChord, setHeldChord] = useState<{ readonly notes: readonly number[]; readonly chord?: ChordSymbol; readonly label?: string }>();
  const [followTick, setFollowTick] = useState(0);
  /** P24-fix-1: the keys played for one written attack (absolute beat). A repeated chord keeps each press. */
  const [attackVoicing, setAttackVoicing] = useState<ReadonlyMap<number, VoicingSnapshot>>(new Map());
  const [selectedAttackBeat, setSelectedAttackBeat] = useState<number>();
  const midiView = useMidiConnection();
  const addChordRef = useRef<(notes: readonly number[]) => void>(() => undefined);

  const manualKey = keyChoice.kind === "manual" ? keyChoice.key : undefined;
  const explicitBpm = parseExplicitBpm(bpmInput);
  // P24-05: one grammar for the whole screen. The old standard parser is only used for 「音を細かく直す」,
  // which needs the standard draft shape (and is offered only when that parser reads the same answers).
  const unified = useMemo(() => parseUnifiedText(input, {
    beat: meter,
    ...(manualKey === undefined ? {} : { key: manualKey, confirmed: true }),
    ...(explicitBpm === undefined ? {} : { bpm: explicitBpm }),
    ...(readAsCode.length === 0 ? {} : { readAsCode }),
  }), [explicitBpm, input, manualKey, meter, readAsCode]);
  const keyStateForView = useMemo(() => manualKey === undefined
    ? ({ kind: "inferred", candidates: [] } as const)
    : confirmedTextProgressionKeyState(manualKey), [manualKey]);
  const result = useMemo(() => unifiedAsPreviewResult(unified, keyStateForView), [keyStateForView, unified]);
  /** 「音を細かく直す」 works only when the standard draft shape can hold the same answers (4/4, 1/2/4 cells). */
  const standardForConvert = useMemo(
    () => parseTextProgression(unified.text, { keyState: confirmedTextProgressionKeyState(manualKey) }),
    [unified.text, manualKey],
  );
  // P24-05: the standard draft shape can take the answers only when both readings play the same attacks at
  // the same positions. The one grammar merges a repeat into one span (`| C % = |`), so its attacks are
  // expanded first; enharmonic spellings (`Db7(#9)` / `C#7(#9)`) are the same answer.
  const convertAvailable = useMemo(() => {
    if (meter !== "4/4" || !standardForConvert.canConvert) return false;
    const spans = unified.spans;
    const attacks = spans.flatMap((span) => {
      const beats = [...new Set(span.attacks.map((attack) => attack.beat))].sort((left, right) => left - right);
      return beats.map((beat, index) => ({
        chord: span.chord,
        beat,
        duration: (index + 1 < beats.length ? beats[index + 1]! : span.startBeat + span.durationBeats) - beat,
      }));
    }).sort((left, right) => left.beat - right.beat);
    if (attacks.length !== standardForConvert.events.length) return false;
    return standardForConvert.events.every((event, index) => {
      const attack = attacks[index];
      if (attack === undefined) return false;
      const beat = (event.bar - 1) * 4 + event.startBeat - 1;
      return normalizedChordKey(event.chord) === normalizedChordKey(attack.chord)
        && Math.abs(beat - attack.beat) < 1e-6
        && Math.abs(event.durationBeats - attack.duration) < 1e-6;
    });
  }, [meter, standardForConvert, unified.spans]);
  const keyChords = useMemo(() => result.events.map(event => event.chord), [result]);
  const keyDecision = useMemo(() => resolveImportKey({
    mode: keyChoice.kind,
    ...(keyChoice.kind === "manual" ? { manualKey: keyChoice.key } : {}),
    chords: keyChords,
  }), [keyChoice, keyChords]);
  /** V6: the field's value when it has one, the common BPM while 「共通の BPM に合わせる」 is on, and the common BPM when the field is empty. */
  const playbackBpm = explicitBpm === undefined || matchGlobalBpm ? globalBpm : explicitBpm;
  const { transport, state: transportState } = useTextTransport(
    controller ?? playbackController, selectedSound, "standard-text-whole");
  useEffect(() => {
    if (!helpOpen) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setHelpOpen(false); } };
    const onDown = (event: MouseEvent) => {
      if (helpRef.current && event.target instanceof Node && !helpRef.current.contains(event.target)) setHelpOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [helpOpen]);
  useEffect(() => { transport.setBpm(playbackBpm); }, [playbackBpm, transport]);
  const playbackSnapshot = useMemo(() => {
    // P24-fix-1: one sounding note set per attack, so a written repeat plays again with its own sound.
    const notes = unified.spans.flatMap((span, index) => {
      const event = result.events[index];
      const beats = [...new Set(span.attacks.map((attack) => attack.beat))].sort((left, right) => left - right);
      return beats.flatMap((beat, attackIndex) => {
        const end = attackIndex + 1 < beats.length ? beats[attackIndex + 1]! : span.startBeat + span.durationBeats;
        const memory = memoryForAttack(event, beat);
        return textPreviewNotes(span.chord, memory).map(pitch => ({
          pitch, startBeat: beat, durationBeats: end - beat, velocity: 88,
        }));
      });
    });
    return {
      notes: metronomeEnabled ? [...notes, ...textMetronomeNotes(unified.scoreLengthBeats, unified.beatsPerBar)] : notes,
      lengthBeats: unified.scoreLengthBeats,
      beatsPerBar: unified.beatsPerBar,
      sourceText: input,
    };
  }, [input, metronomeEnabled, result.events, unified, voicingOverrides]);
  const registration = useMemo(() => textVoicingAvailability(result.events.map(event => ({
    chord: event.chord, memory: voicingOverrides.get(textProgressionEventKey(event)),
  }))), [result, voicingOverrides]);
  const selectedEvent = useMemo(() => result.events.find(
    (event) => textProgressionEventKey(event) === selectedEventKey,
  ) ?? result.events[0], [result.events, selectedEventKey]);
  const selectedKey = selectedEvent ? textProgressionEventKey(selectedEvent) : undefined;
  const selectedMemory = memoryForAttack(selectedEvent, selectedAttackBeat);
  const storedStyle = selectedEvent
    ? textProgressionStyleFromSnapshot(selectedMemory?.practiceVoicingOverride, selectedEvent.chord)
    : undefined;
  // P23-17 V7/V8/V9: the degree, role and voicing mark of the preview cards (the card list is gone).
  const harmony = useMemo(() => cardHarmony(
    result.events.map(event => ({ id: String(event.range.start), name: event.chord, start: event.range.start })),
    keyDecision.key,
  ), [result, keyDecision.key]);
  // fix-2 item 1: the card's small sound mark is shown only when it differs from the rest of the progression.
  const commonVoicingLabel = useMemo(() => {
    const counts = new Map<string, number>();
    result.events.forEach((event) => {
      const span = unified.spans.find(item => item.sourceSpan.start === event.range.start);
      const label = voicingLabelFor(event, span?.attacks[0]?.beat);
      if (label !== undefined) counts.set(label, (counts.get(label) ?? 0) + 1);
    });
    let common: string | undefined;
    let top = 0;
    counts.forEach((count, label) => {
      // On a tie the default sound is the baseline, so the one changed card is the one that gets the mark.
      if (count > top || (count === top && label === "標準 / 自動生成")) { top = count; common = label; }
    });
    return common;
  }, [result, unified, attackVoicing, voicingOverrides]);
  const selectedStyle = storedStyle
    ?? (selectedKey === undefined ? undefined : voicingStyles.get(selectedKey))
    ?? "generated-close";
  const selectedGeneratedNotes = useMemo(
    () => selectedEvent
      ? textProgressionVoicingNotes(selectedEvent.chord, selectedStyle) ?? []
      : [],
    [selectedEvent, selectedStyle],
  );
  const styleOptions = useMemo(
    () => TEXT_PROGRESSION_VOICING_STYLES.map((styleId) => ({
      value: styleId,
      label: voicingStyleLabel(styleId),
      disabled: selectedEvent === undefined
        || textProgressionVoicingNotes(selectedEvent.chord, styleId) === undefined,
    })),
    [selectedEvent],
  );
  const selectedStyleValue = selectedMemory?.practiceVoicingOverride?.source === "live-played"
    ? "live-custom"
    : selectedStyle;
  const selectedStyleOptions = useMemo(
    () => selectedStyleValue === "live-custom"
      ? [
          ...styleOptions,
          {
            value: "live-custom",
            label: "鍵盤で記録",
            disabled: true,
          },
        ]
      : styleOptions,
    [selectedStyleValue, styleOptions],
  );

  useEffect(() => () => onStop(), [onStop]);

  // P24-06: one piano monitor while the keyboard entry is on; turning it off (or leaving) tidies it up.
  useEffect(() => {
    if (!keyboardOn) {
      monitorRef.current?.dispose();
      monitorRef.current = undefined;
      keyboardLatch.current.reset();
      return undefined;
    }
    let cancelled = false;
    void createMidiInputPianoMonitor().then((monitor) => {
      if (cancelled) { monitor.dispose(); return; }
      monitorRef.current?.dispose();
      monitorRef.current = monitor;
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      monitorRef.current?.dispose();
      monitorRef.current = undefined;
    };
  }, [keyboardOn]);

  useEffect(() => { monitorRef.current?.updateNotes(held); }, [held]);

  /** The latch: the largest held set is the candidate, and the release commits it (one chord). */
  useEffect(() => {
    const update = keyboardLatch.current.update(held);
    if (held.length > 0) {
      const detection = detectLiveChord(liveNoteStateOf(held));
      setHeldChord({
        notes: [...update.candidate],
        ...(detection.kind === "chord" && detection.chord !== undefined
          ? { chord: detection.chord, label: detection.chord.label }
          : { label: detection.noteNames.join(" ") }),
      });
      return;
    }
    setHeldChord(undefined);
    if (update.committed !== undefined) addChordRef.current(update.committed);
  }, [held]);

  useEffect(() => {
    if (!selectedEvent) {
      setSelectedEventKey(undefined);
      return;
    }
    if (selectedEventKey !== textProgressionEventKey(selectedEvent)) {
      setSelectedEventKey(textProgressionEventKey(selectedEvent));
    }
  }, [selectedEvent, selectedEventKey]);

  function selectEvent(event: TextProgressionEvent, beat?: number, cardStart?: number) {
    if (draftActive) return;
    setSelectedPending(undefined);
    const key = textProgressionEventKey(event);
    transport.seek((event.bar - 1) * 4 + event.startBeat - 1);
    setSelectedEventKey(key);
    setSelectedAttackBeat(beat);
    setSelectedCardStart(cardStart);
    if (transportState.status !== "playing") {
      if (transportState.status === "stopped") onStop();
      const memory = memoryForAttack(event, beat);
      if (textPreviewNotes(event.chord, memory).length) onPreview(event, memory, playbackBpm);
    }
  }

  /** An explicit style or Live-MIDI capture on the chosen card wins over the keys played for that attack. */
  function forgetSelectedAttack() {
    if (selectedAttackBeat === undefined) return;
    setAttackVoicing((current) => {
      if (!current.has(selectedAttackBeat)) return current;
      const next = new Map(current);
      next.delete(selectedAttackBeat);
      return next;
    });
  }

  /** P24-07 item 3: the keys/overrides saved for the card are forgotten with it. */
  function forgetCardSound(cardStart: number) {
    const before = parseUnifiedText(input, parseOptions());
    const slot = before.slots.find((item) => cardStart >= item.span.start && cardStart < item.span.end);
    if (slot === undefined) return;
    const span = before.spans.find((item) => item.attacks.some((attack) => attack.span.start === slot.span.start));
    if (span === undefined) return;
    const beats = new Set(span.attacks.map((attack) => attack.beat));
    setAttackVoicing((current) => {
      if (beats.size === 0) return current;
      const map = new Map(current);
      beats.forEach((beat) => map.delete(beat));
      return map;
    });
    const event = unifiedEvents(before)[before.spans.indexOf(span)];
    if (event !== undefined) {
      const key = textProgressionEventKey(event);
      setVoicingOverrides((current) => {
        if (!current.has(key)) return current;
        const map = new Map(current);
        map.delete(key);
        return map;
      });
    }
  }

  /** P24-07 item 3: delete = edit the typed text; Ctrl+Z in the input restores it. */
  function removeCard(cardStart: number) {
    if (draftActive) return;
    const next = deleteTextCard(input, parseOptions(), cardStart);
    if (!next.removed) return;
    deleteUndoRef.current = { before: input, after: next.text };
    forgetCardSound(cardStart);
    setCardMenu(undefined);
    setHoveredCardStart(undefined);
    setSelectedPending(undefined);
    setKeyboardStack([]);
    setSaved(false); saveBtn.reset(); setSaveFailed(false);
    setInput(next.text);
    setFollowTick((tick) => tick + 1);
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const undo = deleteUndoRef.current;
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
        if (undo !== undefined && input === undo.after) {
          event.preventDefault();
          event.stopPropagation();
          deleteUndoRef.current = undefined;
          setInput(undo.before);
        }
        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (cardMenu !== undefined) return;
      // P24-07 item 3: the card under the pointer goes even while the caret is in the input; the chosen
      // card goes only when the caret is not in an input.
      // The pointer's card is read from the DOM (`:hover`), so the state cannot go stale after a re-render.
      const hovered = document.querySelector<HTMLElement>("[data-card-start]:hover");
      const hoveredStart = hovered === null ? undefined : Number(hovered.dataset.cardStart);
      const start = hoveredStart ?? (() => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        if (target?.closest("textarea, input, select, [contenteditable='true']")) return undefined;
        return selectedCardStart;
      })();
      if (start === undefined) return;
      event.preventDefault();
      removeCard(start);
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [cardMenu, hoveredCardStart, input, selectedCardStart, draftActive]);

  /** P24-fix-1: the sound of one attack — the keys played for it, else the span's chosen style. */
  function memoryForAttack(
    event: TextProgressionEvent | undefined,
    beat: number | undefined,
  ): ChordVoicingMemory | undefined {
    if (beat !== undefined) {
      const played = attackVoicing.get(beat);
      if (played !== undefined) return { practiceVoicingOverride: played };
    }
    if (event === undefined) return undefined;
    return voicingOverrides.get(textProgressionEventKey(event));
  }

  /** fix-2 item 1: the small 「標準 / 自動生成」-style mark a card would show. */
  function voicingLabelFor(event: TextProgressionEvent | undefined, beat: number | undefined): string | undefined {
    if (event === undefined) return undefined;
    const practice = memoryForAttack(event, beat)?.practiceVoicingOverride;
    const styleId = textProgressionStyleFromSnapshot(practice, event.chord);
    return practice?.source === "live-played" ? "弾いた音"
      : styleId ? voicingStyleLabel(styleId) : "標準 / 自動生成";
  }

  /** 「自動」keeps the key automatic; 「未設定」is the explicit no-key choice; a key is a manual pick. */
  function chooseKeyChoice(choice: string | undefined) {
    if (draftActive) return;
    onStop();
    if (choice === "auto") { setKeyChoice({ kind: "auto" }); return; }
    if (choice === "unset" || !choice) { setKeyChoice({ kind: "unset" }); return; }
    const state = confirmedTextProgressionKeyState(choice);
    setKeyChoice(state.kind === "confirmed" ? { kind: "manual", key: state.key } : { kind: "auto" });
  }

  function updateVoicing(memory: ChordVoicingMemory | undefined) {
    if (draftActive || selectedKey === undefined) return;
    forgetSelectedAttack();
    const practice = memory?.practiceVoicingOverride;
    setVoicingStyles((current) => {
      const next = new Map(current);
      next.delete(selectedKey);
      return next;
    });
    setVoicingOverrides((current) => {
      const next = new Map(current);
      if (!practice) {
        next.delete(selectedKey);
      } else {
        next.set(selectedKey, {
          practiceVoicingOverride: {
            ...practice,
            midiNotes: [...practice.midiNotes],
          },
        });
      }
      return next;
    });
  }

  function selectVoicingStyle(value: string) {
    if (
      draftActive
      || selectedKey === undefined
      || selectedEvent === undefined
      || !isTextProgressionVoicingStyleId(value)
    ) return;
    const snapshot = value === "generated-close"
      ? undefined
      : createTextProgressionStyleSnapshot(selectedEvent.chord, value);
    if (value !== "generated-close" && snapshot === undefined) return;
    forgetSelectedAttack();
    onStop();
    setVoicingStyles((current) => {
      const next = new Map(current);
      if (value === "generated-close") next.delete(selectedKey);
      else next.set(selectedKey, value);
      return next;
    });
    setVoicingOverrides((current) => {
      const next = new Map(current);
      if (snapshot === undefined) next.delete(selectedKey);
      else next.set(selectedKey, { practiceVoicingOverride: snapshot });
      return next;
    });
  }

  function convertedDraft(): TextProgressionConvertedDraft {
    // P24-05: the standard draft shape (and its exact 1/2/4-cell rule) is what 「音を細かく直す」 edits.
    const draft = createTextProgressionDraft({ result: standardForConvert, voicingOverrides });
    return {
      draft, title: textProgressionDraftTitle(standardForConvert),
      ...(explicitBpm === undefined ? {} : { bpm: explicitBpm }),
      // P23-33: the human's parse key and the effective (auto/inherited/manual) save key are separate.
      ...(manualKey === undefined ? {} : { confirmedKey: manualKey }),
      ...(keyDecision.key === undefined ? {} : { resolvedKey: keyDecision.key }),
    };
  }

  function convert() {
    if (draftActive || !convertAvailable) return;
    try { onConvert(convertedDraft()); } catch {
      // Keep the source text available if a future Draft invariant rejects it.
    }
  }

  function saveStandard() {
    if (draftActive || !saveTitle.trim()) return;
    try {
      // P24-06: an open bar is filled and saved with the rest (the save's text includes it).
      const flushed = keyboardOn && keyboardBar.slots.length > 0 ? flushKeyboard() : { text: input, entries: [] };
      const target = flushed.text === input ? unified : parseUnifiedText(flushed.text, parseOptions());
      if (!target.canConvert) return;
      const targetEvents = unifiedEvents(target);
      const targetKey = target === unified ? keyDecision
        : resolveImportKey({
            mode: keyChoice.kind,
            ...(keyChoice.kind === "manual" ? { manualKey: keyChoice.key } : {}),
            chords: targetEvents.map((event) => event.chord),
          });
      // P24-fix-1: the just-closed bar's keys are added to the per-attack map for this save.
      const attackMap = new Map(attackVoicing);
      for (const entry of flushed.entries) {
        attackMap.set(entry.beat, livePlayedSnapshot(entry.chord, entry.notes));
      }
      // P24-05: the one save path. `onSaveStandard` stays as the fallback for callers that still pass it.
      const success = onSaveExtended !== undefined
        ? onSaveExtended(asExtendedTextResult(target), saveTitle.trim(), targetKey.key,
            { byAttackBeat: attackMap, bySpanStart: voicingBySpanStartFor(target, voicingOverrides) })
        : onSaveStandard?.(convertedDraft(), saveTitle.trim()) ?? false;
      setSaved(success);
      if (success) saveBtn.succeed();
      else saveBtn.reset();
      setSaveFailed(!success);
    } catch { setSaved(false); saveBtn.reset(); setSaveFailed(true); }
  }

  /** P24-05: where a diagnostic is, in the words the list uses (the line of the typed text and its bar). */
  function diagnosticLocationOf(diagnostic: UnifiedDiagnostic): string {
    return `${diagnostic.line} 行目 · ${barAt(unified, diagnostic.rawSpan.start)} 小節目`;
  }

  /** The two spellings that can be fixed without guessing: `H` → `B`, and a lowercase root. */
  function diagnosticFixOf(diagnostic: UnifiedDiagnostic): string | undefined {
    const token = diagnostic.token.trim();
    if (/^H/.test(token)) {
      const candidate = `B${token.slice(1)}`;
      if (parseExtendedTextChordLabel(candidate) !== undefined) return candidate;
    }
    if (/^[a-g]/.test(token)) {
      const candidate = `${token[0]!.toUpperCase()}${token.slice(1)}`;
      if (parseExtendedTextChordLabel(candidate) !== undefined) return candidate;
    }
    return undefined;
  }

  function moveToDiagnostic(diagnostic: UnifiedDiagnostic) {
    const editor = document.querySelector<HTMLTextAreaElement>("[data-testid='text-progression-input']");
    if (!editor) return;
    editor.focus({ preventScroll: true });
    editor.setSelectionRange(diagnostic.rawSpan.start, diagnostic.rawSpan.end);
    editorSelection.current = { start: diagnostic.rawSpan.start, end: diagnostic.rawSpan.end };
    const line = input.slice(0, diagnostic.rawSpan.start).split("\n").length - 1;
    editor.scrollTop = Math.max(0, line * 28 - editor.clientHeight / 3);
    editor.dispatchEvent(new Event("scroll"));
  }

  function fixDiagnostic(diagnostic: UnifiedDiagnostic, replacement: string) {
    const { start, end } = diagnostic.rawSpan;
    setInput(`${input.slice(0, start)}${replacement}${input.slice(Math.max(end, start + 1))}`);
    setSaved(false);
    saveBtn.reset();
    setSaveFailed(false);
  }

  /** The options the one grammar reads with; the keyboard's appended text is parsed with the same ones. */
  function parseOptions() {
    return {
      beat: meter,
      ...(manualKey === undefined ? {} : { key: manualKey, confirmed: true }),
      ...(explicitBpm === undefined ? {} : { bpm: explicitBpm }),
      ...(readAsCode.length === 0 ? {} : { readAsCode }),
    };
  }

  /** P24-06: a released chord becomes one slot of the open bar (and the bar joins the text when full). */
  function addKeyboardChord(notes: readonly number[]) {
    if (!keyboardOn || draftActive) return;
    const detection = detectLiveChord(liveNoteStateOf(notes));
    if (detection.kind !== "chord") return;
    const beatsPerBar = unified.beatsPerBar;
    commitKeyboardSlot({
      kind: "chord",
      beats: keyboardLengthInBeats(keyboardLength, beatsPerBar),
      chord: detection.chord,
      notes: [...notes],
    });
  }
  addChordRef.current = addKeyboardChord;

  function commitKeyboardSlot(slot: KeyboardSlot) {
    const beatsPerBar = unified.beatsPerBar;
    const placed = addKeyboardSlot(keyboardBar, slot, beatsPerBar);
    if (placed.bar === keyboardBar) return;
    if (keyboardStack.length === 0) setKeyboardBase(input);
    if (placed.completed === undefined) {
      setKeyboardBar(placed.bar);
      setKeyboardStack((current) => [...current, { text: input, bar: placed.bar }]);
      setSelectedPending(placed.bar.slots.length - 1);
      setFollowTick((tick) => tick + 1);
      return;
    }
    if (!keyboardTextFits(input, placed.completed.tokens)) return;
    const nextText = appendKeyboardBar(input, placed.completed.tokens);
    appendKeyboardBarText(nextText, placed.completed.chords);
  }

  /** Applies a finished bar: the text grows, the bar empties, and the last new card is chosen. */
  function appendKeyboardBarText(nextText: string, chordNotes: readonly (readonly number[])[]) {
    const beforeLength = input.length;
    setKeyboardBar(emptyKeyboardBar());
    setSelectedPending(undefined);
    setKeyboardStack((current) => [...current, { text: nextText, bar: emptyKeyboardBar() }]);
    setInput(nextText);
    setSaved(false); saveBtn.reset(); setSaveFailed(false);
    assignKeyboardVoicings(nextText, beforeLength, chordNotes);
    setFollowTick((tick) => tick + 1);
  }

  /**
   * P24-fix-1: gives each appended attack the keys that were played for it. The sound is kept per attack
   * (absolute beat), so two presses of the same chord keep their own notes in the save.
   */
  function assignKeyboardVoicings(nextText: string, beforeLength: number, chordNotes: readonly (readonly number[])[]) {
    const next = parseUnifiedText(nextText, parseOptions());
    const nextEvents = unifiedEvents(next);
    const appended = next.slots.filter((slot) => (slot.kind === "attack" || slot.kind === "reattack")
      && slot.span.start >= beforeLength);
    const entries: Array<{ beat: number; event: TextProgressionEvent; chord: ChordSymbol; notes: readonly number[] }> = [];
    appended.forEach((slot, index) => {
      const span = next.spans.find((item) => slot.span.start >= item.sourceSpan.start
        && slot.span.start < Math.max(item.sourceSpan.end, item.sourceSpan.start + 1));
      const attack = span?.attacks.find((item) => item.span.start === slot.span.start);
      const event = nextEvents.find((item) => slot.span.start >= item.range.start
        && slot.span.start < Math.max(item.range.end, item.range.start + 1));
      const notes = chordNotes[index];
      if (span === undefined || attack === undefined || event === undefined
        || notes === undefined || notes.length < 2) return;
      entries.push({ beat: attack.beat, event, chord: span.chord, notes });
    });
    if (entries.length > 0) {
      setAttackVoicing((current) => {
        const map = new Map(current);
        for (const entry of entries) map.set(entry.beat, livePlayedSnapshot(entry.chord, entry.notes));
        return map;
      });
    }
    const last = entries[entries.length - 1];
    if (last !== undefined) {
      setSelectedEventKey(textProgressionEventKey(last.event));
      setSelectedAttackBeat(last.beat);
    }
    return entries;
  }

  /** The overrides keyed by each span's start (the save shape), including the bar just closed. */
  function voicingBySpanStartFor(
    target: UnifiedTextResult,
    overrides: ReadonlyMap<string, ChordVoicingMemory | undefined>,
  ): ReadonlyMap<number, VoicingSnapshot | undefined> {
    const events = unifiedEvents(target);
    const map = new Map<number, VoicingSnapshot | undefined>();
    target.spans.forEach((span, index) => {
      const event = events[index];
      const snapshot = event === undefined ? undefined : overrides.get(textProgressionEventKey(event))?.practiceVoicingOverride;
      if (snapshot !== undefined) map.set(span.sourceSpan.start, snapshot);
    });
    return map;
  }

  /** Fills the open bar (the entry is closing or the Vault is being saved) and returns its new text. */
  function flushKeyboard(): { text: string; entries: readonly { beat: number; event: TextProgressionEvent; chord: ChordSymbol; notes: readonly number[] }[] } {
    const flushed = flushKeyboardBar(keyboardBar, unified.beatsPerBar);
    if (flushed === undefined || !keyboardTextFits(input, flushed.tokens)) return { text: input, entries: [] };
    const nextText = appendKeyboardBar(input, flushed.tokens);
    const beforeLength = input.length;
    setKeyboardBar(emptyKeyboardBar());
    setSelectedPending(undefined);
    setInput(nextText);
    setKeyboardStack((current) => [...current, { text: nextText, bar: emptyKeyboardBar() }]);
    const entries = assignKeyboardVoicings(nextText, beforeLength, flushed.chords);
    setFollowTick((tick) => tick + 1);
    return { text: nextText, entries };
  }

  /** P24-06: 「1 つ戻す」 — only while the input is still exactly what the keyboard wrote. */
  function undoKeyboard() {
    if (keyboardStack.length === 0) return;
    const current = keyboardStack[keyboardStack.length - 1]!;
    if (input !== current.text) return;
    const rest = keyboardStack.slice(0, -1);
    setKeyboardStack(rest);
    const previous = rest[rest.length - 1];
    if (previous === undefined) {
      setInput(keyboardBase);
      setKeyboardBar(emptyKeyboardBar());
      setSelectedPending(undefined);
    } else {
      setInput(previous.text);
      setKeyboardBar(previous.bar);
      setSelectedPending(previous.bar.slots.length > 0 ? previous.bar.slots.length - 1 : undefined);
    }
    setFollowTick((tick) => tick + 1);
  }

  const keyboardUndoEnabled = keyboardStack.length > 0
    && input === keyboardStack[keyboardStack.length - 1]!.text;

  function toggleKeyboard() {
    if (keyboardOn) {
      flushKeyboard();
      setKeyboardOn(false);
      setSelectedPending(undefined);
      setKeyboardStack([]);
      setKeyboardBase("");
      return;
    }
    setKeyboardOn(true);
    setKeyboardStack([]);
    setKeyboardBase(input);
    setSelectedPending(undefined);
    setFollowTick((tick) => tick + 1);
  }

  const keyboardLengths = useMemo<readonly KeyboardLengthChoice[]>(() => {
    const beatsPerBar = unified.beatsPerBar;
    const remaining = beatsPerBar - keyboardBar.filled;
    const choices: KeyboardLengthChoice[] = [
      { value: "bar", label: "1 小節", disabled: beatsPerBar > remaining },
      { value: 1, label: "1 拍", disabled: remaining < 1 },
    ];
    if (beatsPerBar % 2 === 0) choices.splice(1, 0, { value: 2, label: "2 拍", disabled: remaining < 2 });
    return choices;
  }, [keyboardBar.filled, unified.beatsPerBar]);

  const pendingText = keyboardOn ? pendingKeyboardBarText(keyboardBar, unified.beatsPerBar) : undefined;
  const pendingCards = keyboardBar.slots.map((slot) => slot.kind === "rest"
    ? { label: "_", rest: true }
    : { label: slot.chord?.label ?? "", voicing: "弾いた音" });
  const heldHarmony = heldChord?.chord === undefined ? undefined
    : cardHarmony([{ id: "held", name: heldChord.chord, start: 0 }], keyDecision.key).get("held");
  const pendingSlot = selectedPending === undefined ? undefined : keyboardBar.slots[selectedPending];

  useEffect(() => {
    if (!keyboardOn) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest("textarea, input, select, [contenteditable='true']")) return;
      event.preventDefault();
      undoKeyboard();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function previewSelected() {
    if (draftActive || !selectedEvent || !textPreviewNotes(selectedEvent.chord, selectedMemory).length) return;
    onPreview(selectedEvent, selectedMemory, playbackBpm);
  }

  const visibleDiagnostics = input.trim() ? unified.diagnostics.filter((diagnostic) => diagnostic.severity === "ERROR") : [];
  /** P24-05: the one line that says what the normaliser did (the design's band). */
  const skippedCount = unified.normalized.skipped.length;
  // fix-2 item 3: one tidied chord/bar-line group is one place (the same grouping the dotted underlines use).
  const changeCount = mergeNormalizeChanges(unified.normalized.changes)
    .filter(run => run.from.trim() !== "" || run.to.trim() !== "").length;
  const beforeLines = input.split("\n").length;
  const replacedBeforeLines = replacedFrom === undefined ? beforeLines : replacedFrom.split("\n").length;
  const cleaned = cleanedText(unified.normalized);
  const cleanedLines = cleaned.split("\n").length;
  const hints = useMemo(() => detectTextMetadataHints(input), [input]);
  const practiceStatus = useMemo(
    () => (unified.canConvert ? evaluateExtendedTextPractice(asExtendedTextResult(unified), playbackBpm) : undefined),
    [playbackBpm, unified],
  );
  function replaceWithCleaned() {
    setReplacedFrom(input);
    setInput(cleaned);
    onStop();
    setSaved(false);
    saveBtn.reset();
    setSaveFailed(false);
  }
  function undoReplace() {
    if (replacedFrom === undefined) return;
    setInput(replacedFrom);
    setReplacedFrom(undefined);
    onStop();
  }
  /** The design's one-line band; B's change (skipped lyric lines) is the reason it appears. */
  const normalizeBand = replacedFrom !== undefined ? (
    <div data-testid="text-normalize-band" data-state="replaced" style={{
      flex: "none", display: "flex", alignItems: "center", gap: 10, margin: "0 16px 8px",
      padding: "7px 8px 7px 12px", border: "1px solid rgb(150 170 195 / 14%)", borderRadius: 10, background: "#0d1522",
    }}>
      <Check aria-hidden="true" size={16} style={{ flex: "none", color: "#36c990" }} />
      <span style={{ fontSize: 13, color: "#f2f6fc" }}>{"整えたテキストに置き換えました。"}</span>
      <span style={{ fontSize: 12, color: "#a5b2c6" }}>{`${replacedBeforeLines} 行 → ${cleanedLines} 行。音は変わっていません。`}</span>
      <span style={{ flex: 1 }} />
      <button type="button" data-testid="text-normalize-undo" onClick={undoReplace} style={BAND_SECONDARY}>{"元に戻す"}</button>
    </div>
  ) : skippedCount > 0 ? (
    <div data-testid="text-normalize-band" data-state="normalized" style={{
      flex: "none", display: "flex", alignItems: "center", gap: 10, margin: "0 16px 8px",
      padding: "7px 8px 7px 12px", border: "1px solid #1f4a63", borderRadius: 10, background: "#102d40",
    }}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#78c8f5"
        strokeWidth="1.5" strokeLinecap="round" style={{ flex: "none" }}>
        <path d="M3 4h10M3 8h6M3 12h8" /><path d="M11.5 7.5l2 2-2 2" />
      </svg>
      <span style={{ fontSize: 13, color: "#f2f6fc" }}>{"コード譜として読みました。"}</span>
      <span style={{ fontSize: 12, color: "#c4d6e6" }}>
        {`歌詞らしい ${skippedCount} 行を読み飛ばし${changeCount ? `、表記を ${changeCount} か所そろえています` : "ています"}。`}
      </span>
      <span style={{ flex: 1 }} />
      <button type="button" data-testid="text-normalize-replace" onClick={replaceWithCleaned} style={{
        flex: "none", height: 28, padding: "0 12px", border: "1px solid #78c8f5", borderRadius: 8,
        background: "#17425c", color: "#f2f6fc", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
      }}>{"整えたテキストに置き換える"}</button>
    </div>
  ) : null;
  const statusModel = textCaptureStatus({
    bars: result.bars, annotations: 0, meterLabel: meter, bpm: explicitBpm ?? null,
    keyLabel: keyDecision.key === undefined ? null : displayKey(keyDecision.key) ?? keyDecision.key,
    errors: visibleDiagnostics.length, warnings: 0,
    practiceLimits: 0, hasSource: Boolean(input.trim()),
  });
  const saveReason = textCaptureSaveReason(statusModel);
  const saveBlocked = textSaveBlockedReason(result.canConvert, saveReason, saveTitle);
  // item 3 of fix-1: the summary says the bar count, the written chords, the key; BPM only when the field
  // has a value, the meter only when it is not 4/4. The annotation count and 「保存できます」 are gone.
  const writtenChords = unified.spans.reduce((total, span) => total
    + new Set(span.attacks.map((attack) => attack.beat)).size, 0);
  const saveSummary = [
    `${result.bars} 小節`,
    `${writtenChords} コード`,
    `キー ${keyDecision.key === undefined ? "未確定" : formatTextKeyLabel(keyDecision.key)}`,
    ...(explicitBpm === undefined ? [] : [`BPM ${explicitBpm}`]),
    ...(meter === "4/4" ? [] : [meter]),
  ].join(" · ");
  const confirmed = keyDecision.key !== undefined;
  const keySelectValue = keyChoice.kind === "manual" ? keyChoice.key : keyChoice.kind;
  const disabled = draftActive;
  /** P23-17 V8/V9: what a preview card shows above and below its chord name. */
  const harmonyFor = (sourceStart: number, beat?: number) => {
    const own = confirmed && showRomanNumerals ? harmony.get(String(sourceStart)) : undefined;
    const event = result.events.find(item => item.range.start === sourceStart);
    const label = voicingLabelFor(event, beat);
    const voicing = label !== undefined && label !== commonVoicingLabel ? label : undefined;
    if (!own && !event) return undefined;
    return {
      ...(own?.degree ? { degree: own.degree } : {}),
      ...(own?.role ? { role: own.role } : {}),
      ...(voicing ? { voicing } : {}),
      ...(event ? { name: displayChordLabel(event.canonical) } : {}),
    };
  };
  /** P23-17 V11: the chosen card's row under the preview; a rest-only score keeps 「音を細かく直す」 here. */
  const inspectorRow = !draftActive && (selectedEvent || pendingSlot || (result.canConvert && result.events.length === 0)) ? (
    <div className="lv-text-selected-row" data-testid="text-progression-inspector-row">
      {pendingSlot !== undefined ? (
        <span className="lv-text-selected-notes" data-testid="text-pending-selected">
          <span className="font-semibold">{"選んだカード: "}
            <span className="font-mono">{pendingSlot.chord?.label ?? "休符"}</span>
          </span>
          <span className="lv-text-selected-notes">
            {pendingSlot.kind === "chord"
              ? `鳴らす音 ${(pendingSlot.notes ?? []).map(note => formatMidiNoteForDisplay(note, "fl-studio", "flat")).join("・")}(鍵盤で弾いた音)`
              : "休符"}
          </span>
        </span>
      ) : selectedEvent ? (
        <details name="capture-details" className="lv-text-selected-details" data-testid="text-progression-inspector">
          <summary className="cursor-pointer text-xs">
            <span className="font-semibold">{"選んだカード: "}<span className="font-mono">{selectedEvent.canonical}</span></span>
            <span className="lv-text-selected-notes">
              {`鳴らす音 ${textPreviewNotes(selectedEvent.chord, selectedMemory).map(note => formatMidiNoteForDisplay(note, "fl-studio", "flat")).join("・")}${
                selectedMemory?.practiceVoicingOverride?.source === "live-played"
                  ? "(鍵盤で弾いた音)"
                  : "(アプリのおすすめの音)"}`}
            </span>
          </summary>
          <div className="lv-text-inspector-content border border-[var(--lv-border)] bg-[var(--lv-surface)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--lv-accent)]">
                  {"選択中のコード"}
                </p>
                <h3 className="mt-1 font-mono text-xl font-semibold">{selectedEvent.canonical}</h3>
                <p className="mt-1 text-sm text-[var(--lv-text-muted)]">
                  {timingLabel(selectedEvent)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="lv-button-primary px-3 py-2 text-sm"
                  data-testid="text-progression-preview"
                  disabled={disabled || !textPreviewNotes(selectedEvent.chord, selectedMemory).length}
                  onClick={previewSelected}
                >
                  {"保存予定音を再生"}
                </button>
                <button
                  type="button"
                  className="lv-button-ghost px-3 py-2 text-sm"
                  disabled={disabled}
                  onClick={onStop}
                >
                  {"停止"}
                </button>
              </div>
            </div>
            <p className="mt-3 text-xs text-[var(--lv-text-muted)]" data-testid="text-progression-auto-generated">
              {`生成スタイル: ${voicingStyleLabel(selectedStyle)}。元MIDIではありません。`}
            </p>
            <details className="mt-3" data-testid="text-progression-detail-expander">
              <summary className="cursor-pointer text-sm">{"コード詳細"}</summary>
              <VoicingPanel
                key={selectedKey}
                chord={selectedEvent.chord}
                memory={selectedMemory}
                generatedNotes={selectedGeneratedNotes}
                sourceAvailable={false}
                sourceApplicable={false}
                onMemoryChange={updateVoicing}
                onReextract={() => undefined}
                styleSelector={{
                  value: selectedStyleValue,
                  label: "生成スタイル",
                  options: selectedStyleOptions,
                  onChange: selectVoicingStyle,
                }}
              />
            </details>
          </div>
        </details>
      ) : <span className="lv-text-selected-notes">{"コードのない進行です(休符だけ)"}</span>}
      <button type="button" className="lv-button-ghost whitespace-nowrap text-xs" data-testid="text-progression-convert"
        title={convertAvailable ? "コードと長さを1つずつ直してから保存します" : "この書き方では使えません(4/4 で 1 小節に 1・2・4 個の時に使えます)"}
        disabled={disabled || !convertAvailable} onClick={convert}>{"音を細かく直す"}</button>
    </div>
  ) : undefined;
  return (
    <TextCaptureShell dialect={dialect} draftActive={draftActive}>
      <div className="lv-text-intake-shell overflow-hidden bg-[var(--lv-surface)]" data-testid="standard-text-intake">
      <div className="lv-text-capture-toolbar lv-text-topbar" data-testid="text-capture-toolbar">
        <section className="lv-text-topgroup" aria-label="読み方の設定">
          <span className="lv-text-toplabel">{"読み方の設定"}</span>
          <TextMeterSelect testId="text-progression-meter" value={meter} options={METER_OPTIONS} disabled={disabled}
            onChange={(value) => { if (transportState.status === "stopped") onStop();
              // P24-06: the open bar is counted in the old meter; a meter change starts it again.
              setKeyboardBar(emptyKeyboardBar()); setKeyboardStack([]); setSelectedPending(undefined);
              setMeter(value); }} />
          <TextKeySelect testId="text-progression-key" value={keySelectValue} disabled={disabled}
            allowAuto autoLabel={keyDecision.key === undefined ? "自動: 未確定" : `自動: ${formatTextKeyLabel(keyDecision.key)}`}
            onChange={chooseKeyChoice} />
          <div className="lv-text-toolbar-bpm">
            <BpmScrubField idPrefix="text-progression-bpm" inputTestId="text-progression-bpm"
              label="BPM" labelStyle={{ fontSize: 11, fontWeight: 400, color: "#7f90aa" }}
              disabled={disabled} emptyWhenUnset={explicitBpm === undefined}
              dragLabel={"上下にドラッグしてBPMを変更"}
              value={explicitBpm ?? globalBpm}
              onChange={value => { if (transportState.status === "stopped") onStop();
                setMatchGlobalBpm(false); setBpmInput(String(value)); }}
              onExplicitInput={value => { if (transportState.status === "stopped") onStop();
                setMatchGlobalBpm(false); setBpmInput(String(value)); }} />
            {explicitBpm === undefined ? <small className="whitespace-nowrap text-[var(--lv-text-muted)]">{`試聴 ${globalBpm}`}</small> : (
              <button type="button" className="lv-text-bpm-match" aria-pressed={matchGlobalBpm}
                aria-label={matchGlobalBpm ? "曲の BPM に戻す" : "共通の BPM に合わせる"}
                title={matchGlobalBpm ? `曲の BPM（${explicitBpm}）で鳴らす` : `上の帯の共通 BPM（${globalBpm}）で鳴らす。保存する BPM は変わりません`}
                data-testid="text-match-global-bpm" onClick={() => setMatchGlobalBpm(value => !value)}>
                {matchGlobalBpm ? "曲の BPM に戻す" : "共通の BPM に合わせる"}
              </button>
            )}
          </div>
          <div className="lv-text-top-help" ref={helpRef}>
            <button type="button" className="lv-text-help-button" data-testid="text-help" aria-expanded={helpOpen}
              aria-label="説明" title="説明" onClick={() => setHelpOpen(open => !open)}>{"?"}</button>
            {helpOpen ? (
              <div className="lv-text-help-face" role="dialog" aria-label="説明" data-testid="text-help-face">
                {result.canConvert ? <TextVoicingAvailability availability={registration} /> : null}
                <p className="lv-text-help-line">{"小節は | で区切ります。1 小節に書いたコードは、小節を等しく分けて鳴ります。"}</p>
                <p className="lv-text-help-line">{"% は前のコードをもう一度鳴らす、= は鳴らし直さずにのばす、_ は休符です。"}</p>
                <p className="lv-text-help-line">{"キーを選ぶと、度数(IIm7 など)でも書けます。"}</p>
                <p className="lv-text-help-line">{"# で始まる行はメモになります。# Key: C や # BPM: 120 の行は、押すまで使わない案として出ます。"}</p>
                <p className="lv-text-help-line">{"コード譜をそのまま貼ると、歌詞の行は読み飛ばし、全角の記号などはそろえて読みます。"}</p>
                <p className="lv-text-help-line">{"キーは自動で決まり、手で選ぶと固定されます。「自動」に戻すと選び直します。「未設定」にすると自動でも付けません。"}</p>
                <p className="lv-text-help-line">{"自動のキーは、3つ以上の異なる和音があり、その全部が同じキーに合い、候補が1つに絞れた時だけ付きます。ローマ数字・数字の入力には、これまでどおり手で選んだキーが必要です。"}</p>
              </div>
            ) : null}
          </div>
        </section>
        <section className="lv-text-topgroup" aria-label="試聴">
          <span className="lv-text-toplabel">{"試聴"}</span>
          <TextTransportBar transport={transport} state={transportState}
            positionBars={unified.spans.length > 0 ? result.bars : 0}
            snapshot={playbackSnapshot} disabled={disabled || (transportState.status === "stopped" && !result.canConvert)}
            sourceMatches={transportState.snapshot?.sourceText === undefined || transportState.snapshot.sourceText === input} />
        </section>
      </div>
      {normalizeBand}
      <TextUnifiedWorkspace input={input} result={result} unified={unified} disabled={disabled}
        editorSelection={editorSelection.current}
        onEditorSelection={(start, end) => { editorSelection.current = { start, end }; }}
        transport={transport} transportState={transportState}
        harmonyFor={harmonyFor}
        {...(selectedEvent === undefined ? {} : { selectedSourceStart: selectedEvent.range.start })}
        hints={hints}
        {...(manualKey === undefined ? {} : { appliedKey: manualKey })}
        {...(explicitBpm === undefined ? {} : { appliedBpm: explicitBpm })}
        onApplyKey={(key) => chooseKeyChoice(key)}
        onApplyBpm={(value) => { if (transportState.status === "stopped") onStop(); setMatchGlobalBpm(false); setBpmInput(String(value)); }}
        onReadAsCode={(line) => { setReadAsCode((current) => [...new Set([...current, line.trim()])]); }}
        hiddenLines={HIDDEN_NONE}
        onMoveDiagnostic={moveToDiagnostic} onFixDiagnostic={fixDiagnostic}
        fixOf={diagnosticFixOf} locationOf={diagnosticLocationOf}
        keyboardOn={keyboardOn} onToggleKeyboard={toggleKeyboard} followTick={followTick}
        keyboardBand={keyboardOn ? (
          <KeyboardEntryBand connected={midiView.connected}
            {...(midiView.deviceName === undefined ? {} : { deviceName: midiView.deviceName })}
            onConnect={(anchor) => openMidiPanel(anchor ?? undefined)}
            heldNotes={heldChord?.notes ?? held}
            {...(heldChord?.chord === undefined ? {} : { chord: heldChord.chord })}
            {...(heldChord?.label === undefined ? {} : { detectionLabel: heldChord.label })}
            {...(heldHarmony?.degree === undefined ? {} : { degree: heldHarmony.degree })}
            {...(heldHarmony?.role === undefined ? {} : { roleColor: roleColorOf(heldHarmony.role) })}
            length={keyboardLength} lengths={keyboardLengths}
            onLength={(value) => { setKeyboardLength(value); }}
            onRest={() => commitKeyboardSlot({ kind: "rest", beats: keyboardLengthInBeats(keyboardLength, unified.beatsPerBar) })}
            onUndo={undoKeyboard} undoEnabled={keyboardUndoEnabled} />
        ) : undefined}
        {...(pendingText === undefined ? {} : { pendingText })}
        pendingCards={pendingCards}
        {...(selectedPending === undefined ? {} : { selectedPendingIndex: selectedPending })}
        onSelectPending={(index) => { setSelectedPending(index); setSelectedEventKey(undefined); }}
        {...(keyboardOn && heldChord?.chord !== undefined ? { heldCard: {
          label: heldChord.chord.label,
          ...(heldHarmony?.degree === undefined ? {} : { degree: heldHarmony.degree }),
          ...(heldHarmony?.role === undefined ? {} : { role: heldHarmony.role }),
        } } : {})}

        onInput={value => { if (transportState.status === "stopped") onStop();
          // P23-17 V14: after a save, clearing the whole input starts the next progression from the first values.
          if (saved && value.trim() === "") {
            setKeyChoice({ kind: "auto" }); setBpmInput(""); setSaveTitle(TEXT_CAPTURE_DEFAULT_NAME);
          }
          // P24-05: a manual edit after 「置き換える」 ends the band's undo offer.
          setReplacedFrom(undefined);
          // P24-06: after a manual edit the keyboard's 「1 つ戻す」 can no longer trust the text.
          setKeyboardStack([]); setKeyboardBase(value); setSelectedPending(undefined);
          deleteUndoRef.current = undefined;
          setSaved(false); saveBtn.reset(); setSaveFailed(false); setInput(value); }} onSelectEvent={selectEvent}
        onCardHover={setHoveredCardStart}
        onCardMenu={(start, x, y) => setCardMenu({ start, x, y })}
        onSeekBar={bar => transport.seek((bar - 1) * unified.beatsPerBar)} />
      {inspectorRow}
      {cardMenu === undefined ? null : (
        <TextCardMenu x={cardMenu.x} y={cardMenu.y} cardStart={cardMenu.start}
          onDelete={() => removeCard(cardMenu.start)} onClose={() => setCardMenu(undefined)} />
      )}
      <p id="text-progression-format" className="sr-only text-[var(--lv-text-muted)]">
        {`拍子は1/4〜12/4。各小節は1・2・3・4・6・8・12のどれかで区切り、最大${UNIFIED_TEXT_LIMITS.maxBars}小節・${UNIFIED_TEXT_LIMITS.maxScoreTokens}セルです。% は再発音、_ は休符、= は再発音せず保持します。`}
      </p>

      <span className="sr-only" data-testid="text-progression-key-state">
        {keyDecision.key
          ? `${keyChoice.kind === "auto" ? "自動" : "確定"}: ${keyDecision.key}`
          : "キーは未確定です。ローマ数字・数字の表記には、キーを選んでください。"}
      </span>

      <footer ref={statusBarRef} className="lv-text-intake-savebar lv-text-status-bar flex flex-wrap items-center gap-3 border-t border-[var(--lv-border)] pl-2 pr-4 py-1 text-xs">
        <label className="lv-text-footer-name flex items-center gap-1.5">{"名前"}
          <input className="lv-field-control min-h-8 w-28 px-2" maxLength={80} data-testid="text-progression-name"
            value={saveTitle} onChange={event => { setSaveTitle(event.target.value); setSaved(false); saveBtn.reset(); setSaveFailed(false); }} />
        </label>
        {practiceStatus?.ready === false && input.trim() !== "" ? (
          <span data-testid="text-practice-limit" title={practiceStatus.reason} style={{ fontSize: 12, color: "var(--lv-warning)" }}>
            {"保存できますが、Voicing Loop ではこのタイミングを練習できません"}
          </span>
        ) : null}
        <span className="min-w-0 font-mono text-[var(--lv-text-muted)]" data-testid="text-progression-capability-summary" data-text-status-summary>
          {saveSummary}
        </span>
        {saveFailed ? <span role="alert" className="text-[var(--lv-danger)]">
          {"保存できませんでした。入力内容は保持されています。"}</span> : null}
        {saveBlocked !== undefined && input.trim() !== "" ? (
          <span tabIndex={0} role="note" title={saveBlocked}
            className="cursor-help text-[var(--lv-text-secondary)]" data-testid="text-save-blocked-hint">{"ⓘ"}</span>
        ) : null}
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {visibleDiagnostics.length > 0 ? (
            <span data-testid="text-save-error-count" style={{ fontSize: 12, color: "#ffb3b8", whiteSpace: "nowrap" }}>
              {`直す所が ${visibleDiagnostics.length} か所あります`}
            </span>
          ) : null}
          {(onSaveStandard !== undefined || onSaveExtended !== undefined) ? <button type="button" className="lv-button-primary min-h-9 whitespace-nowrap px-3 text-xs" data-testid="text-progression-save"
            data-save-state={saveBtn.state}
            disabled={disabled || saveBlocked !== undefined} title={saveBlocked} onClick={saveStandard}>
            {saveBtn.state === "busy" ? <><span className="lv-save-spin" aria-hidden="true" /><span>保存中…</span></>
              : saveBtn.state === "done" ? <><Check aria-hidden="true" size={16} /><span>保存しました</span></>
              : "Vault に保存"}
          </button> : null}
        </div>
      </footer>
      </div>
    </TextCaptureShell>
  );
}

function TextCardMenu({ x, y, cardStart, onDelete, onClose }: {
  readonly x: number;
  readonly y: number;
  readonly cardStart: number;
  readonly onDelete: () => void;
  readonly onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);
  const left = Math.max(8, Math.min(x, window.innerWidth - 180));
  const top = Math.max(8, Math.min(y, window.innerHeight - 80));
  return <div ref={ref} role="menu" aria-label="カードの操作" className="lv-cw-card-menu" data-testid="text-card-menu"
    style={{ left, top, minWidth: 140, maxWidth: 180 }}>
    <button type="button" role="menuitem" className="lv-cw-menu-item" data-danger
      style={{ color: "#ee6b73" }} onClick={() => { onDelete(); onClose(); }}>
      <span>削除</span>
    </button>
    <span className="sr-only">{`card ${cardStart}`}</span>
  </div>;
}

function voicingStyleLabel(styleId: TextProgressionVoicingStyleId): string {
  const labels: Record<TextProgressionVoicingStyleId, string> = {
    "generated-close": "標準クローズ",
    "shell-17": "シェル 1–7",
    "open-17": "オープン 1–7",
    "rootless-ab": "ルートレス A/B",
  };
  return labels[styleId];
}

/** P24-06: the state 「1 つ戻す」 restores (the text as it was, and the open bar as it was). */
interface KeyboardSnapshot {
  readonly text: string;
  readonly bar: KeyboardBar;
}

/** A note state built from the keys that were held (the detector reads the same shape as the live store). */
function liveNoteStateOf(notes: readonly number[]): LiveNoteState {
  return {
    held: new Map(notes.map((note) => [`0:${note}`, { count: 1, velocity: 100, sinceMs: 0, lastEventMs: 0 }])),
    sustained: new Set(),
    pedalByChannel: new Map(),
  };
}

/** The keys that were played for a card, in the same snapshot shape the 「コード詳細」's Live MIDI capture uses. */
function livePlayedSnapshot(chord: ChordSymbol, notes: readonly number[]): VoicingSnapshot {
  return {
    schemaVersion: 1,
    source: "live-played",
    representation: "simultaneous-voicing",
    midiNotes: [...notes],
    bassNote: notes[0],
    capturedForChordKey: normalizedChordKey(chord),
    capturedForChordLabel: chord.label,
    confidence: 1,
    userVerified: true,
  };
}

function parseExplicitBpm(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 30 && parsed <= 240 ? parsed : undefined;
}

function timingLabel(event: TextProgressionEvent): string {
  return `${event.bar}\u5c0f\u7bc0\u76ee\u30fb${event.startBeat}\u62cd\u76ee\u30fb${event.durationBeats}\u62cd`;
}
