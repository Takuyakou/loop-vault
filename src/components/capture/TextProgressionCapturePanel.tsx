import { cloneElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { Presence } from "../motion/Presence";
import { NextChordPalette, paletteBounds, type SuggestionAnchor, type SuggestionLength } from "./NextChordPalette";
import { estimateKeyForSuggestions, keyContextFor } from "../../domain/nextChordSuggestions/estimateKey";
import { keyChordsFor, textureOfChords } from "../../domain/nextChordSuggestions/harmonyTables";
import { parseSuggestionKey, suggestNextChords } from "../../domain/nextChordSuggestions/suggestNextChords";
import { planAppendTokens } from "../../domain/nextChordSuggestions/appendPlan";
import { buildTasteProfile, tasteHintsFor, type TasteBlock } from "../../domain/nextChordSuggestions/tasteProfile";
import { useStore } from "zustand";
import { Check } from "lucide-react";
import { useSaveButtonState } from "../ui";
import { useOptionalNotify, useReserveBottomSpace } from "../notifications";
import { playbackController, type PlaybackController } from "../../audio/playbackController";
import { textPreviewNotes } from "../../domain/textVoicingAvailability";
import { CARD_EDIT_KEY_ROWS, KEYBOARD_ENTRY_KEY_ROWS, TextHelpKeyList, TextHelpWritingTable } from "./TextHelpKeyList";
import { useTextTransport } from "./useTextTransport";
import { TextTransportBar } from "./TextTransportBar";
import type { PreviewSound } from "../../audio/chordPreview";
import { displayChordLabel } from "../../ui/chordText";
import { displayKey } from "../../domain/displayLabels";
import { resolveImportKey, type ImportKeyChoice } from "../../domain/importKeyResolution";
import { detectLiveChord, heldNotes } from "../../domain/liveMidi";
import { createChordLatch } from "../../domain/liveMidi/chordLatch";
import {
  addKeyboardSlot,
  appendKeyboardBar,
  emptyKeyboardBar,
  flushKeyboardBar,
  followedSuggestionBeats,
  keyboardLengthInBeats,
  keyboardTextFits,
  pendingKeyboardBarText,
  previousBarItems,
  type KeyboardBar,
  type KeyboardSlot,
} from "../../domain/textKeyboardEntry";
import { createMidiInputPianoMonitor, type MidiInputPianoMonitor } from "../../audio/midiInputPianoMonitor";
import { defaultLiveMidiStore } from "../../liveMidi/defaultLiveMidiStore";
import { useMidiConnection } from "../../liveMidi/useMidiConnection";
import { openMidiPanel } from "../../liveMidi/midiPanel";
import { normalizedChordKey } from "../../domain/voicing";
import type { ChordSymbol, Tension, VoicingSnapshot } from "../../domain/types";
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
import { roleColor as roleColorOf, splitShownChord, TextUnifiedWorkspace } from "./TextUnifiedWorkspace";
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
  approachPrevious, CARD_MAX_NOTES, CARD_MIN_NOTES, cardKeyRoles, cardShapeMarkOf, cardSoundKindOf, createTextHandSnapshot,
  createTextShapeSnapshot, defaultCardNotes, invertDown, invertUp, shiftOctave, type CardSoundKind,
} from "../../domain/textCardSound";
import {
  buildShapeVoicing, DEFAULT_GENERATED_SHAPE_OPTIONS, GENERATED_SHAPE_CHOICES, pickShapeForm, placementNotes,
  type GeneratedShapeChoice, type GeneratedShapeOptions, type VoicingShapeOptions,
} from "../../domain/voicingShapes";
import { SEMI } from "../../domain/voicingShapes/recipe";
import { spellMidi } from "../../domain/chordDojo/targetSnapshot";
import { liveNoteStateOf, renameForNotes } from "../../domain/textCardRename";
import { TextCardDock, TextCardDockClosed, type DockChip, type DockScope, type DockShapeButton, type TextCardDockProps } from "./TextCardDock";
import {
  buildDockCards, dockPositionText, requestedShapeName, SHAPE_KEY, SHAPE_LABEL, SHAPE_TITLE, usedShapeName, type DockCard,
} from "./textCardDockModel";
import type { ChordVoicingMemory } from "../../domain/types";
import type { ManualCandidateDraft } from "../../domain/midi/manualDraft";
import { BpmScrubField } from "../BpmScrubField";
import { formatTextKeyLabel } from "./TextCaptureFields";
import { usePreviewSound } from "../PreviewSoundProvider";
import { cardHarmony } from "../correction-workspace/cardHarmony";
import { useMetronome } from "../MetronomeProvider";
import { useGlobalBpm } from "../GlobalBpmProvider";

/** P25-03 C10: the card dots' colour and title by where the sound comes from. */
const CARD_DOT_COLOR: Readonly<Record<CardSoundKind, string>> = { shape: "#42d8c6", hand: "#c9b7ff", live: "#8bd7ff" };
const CARD_DOT_TITLE: Readonly<Record<CardSoundKind, string>> = { shape: "おすすめの形", hand: "手で直した音", live: "鍵盤で弾いた音" };

/** P25-03 C8: one undo step of the band — the typed text and every card's own sound. P25 V23 adds the selection. */
interface DockHistoryEntry {
  readonly input: string;
  readonly attack: ReadonlyMap<number, VoicingSnapshot>;
  readonly overrides: TextProgressionVoicingOverrides;
  readonly selectedCardStart?: number;
  readonly selectedAttackBeat?: number;
  readonly selectedEventKey?: string;
}

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
  /** P25 V23 Stage 2: the Vault blocks the palette's taste profile learns from. */
  readonly vaultTasteBlocks?: readonly TasteBlock[];
  /** Once converted, the existing ManualCandidateDraft is authoritative. */
  readonly draftActive?: boolean;
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
 *//**
 * C7: where a card's typed chord ends. A degree-written chord (`IIm7`) is mapped to its first character only,
 * so the rewrite runs on to the end of that word.
 * ponytail: a character class, not the parser's own token end; replace it if the degree mapping learns the full span.
 */
function typedChordEnd(text: string, start: number, end: number): number {
  if (!/^[IViv♭♯b#]/.test(text.slice(start, end))) return end;
  let cursor = end;
  while (cursor < text.length && /[A-Za-z0-9#♭♯+°ø△Δ/]/.test(text[cursor]!)) cursor += 1;
  if (text[cursor] === "(") { const close = text.indexOf(")", cursor); if (close > 0) cursor = close + 1; }
  return cursor;
}

/** C4: the added tension's note, spelled from the root by its degree (Em7 + 9 → F♯). */
function addedTensionNoteName(chord: ChordSymbol, degree: string): string {
  const pitch = spellMidi(60 + ((chord.root + (SEMI[degree] ?? 0)) % 12), { ...chord, tensions: [...chord.tensions, degree as Tension] });
  return pitch.step + (pitch.alter > 0 ? "♯".repeat(pitch.alter) : "♭".repeat(-pitch.alter));
}


export function TextProgressionCapturePanel({
  showRomanNumerals,
  vaultTasteBlocks,
  draftActive = false,
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
  /** P25 V24-8: the face reaches 12px above the window's bottom; only its inside scrolls. */
  const [helpPlacement, setHelpPlacement] = useState<{ readonly top: number; readonly right: number; readonly height: number }>();
  useEffect(() => {
    if (!helpOpen) return undefined;
    const measure = () => {
      const anchor = helpRef.current?.getBoundingClientRect();
      if (anchor === undefined) return;
      const top = Math.round(anchor.bottom + 6);
      setHelpPlacement({ top, right: Math.max(8, window.innerWidth - anchor.right), height: Math.max(260, window.innerHeight - top - 12) });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [helpOpen]);
  const lastDock = useRef<ReactElement<TextCardDockProps>>();
  const helpRef = useRef<HTMLDivElement>(null);
  const [saveTitle, setSaveTitle] = useState(TEXT_CAPTURE_DEFAULT_NAME);
  const [saved, setSaved] = useState(false);
  const saveBtn = useSaveButtonState();
  const [saveFailed, setSaveFailed] = useState(false);
  const [selectedEventKey, setSelectedEventKey] = useState<string>();
  const [voicingOverrides, setVoicingOverrides] = useState<TextProgressionVoicingOverrides>(new Map());

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
  // P25-03 C: the selected card's band — its range, the MIDI entry, and the undo history (C8).
  const [dockScope, setDockScope] = useState<DockScope>("one");
  const [dockMidiOn, setDockMidiOn] = useState(false);
  /** P25-04 C7: the band's sentence about the card's name (shown while that card is chosen). */
  const [dockNotice, setDockNotice] = useState<{ readonly start: number; readonly text: string; readonly color: string }>();
  /** C7: the chosen card only moved because its name was rewritten; keep the range (C5) and the sentence. */
  const dockStartShifted = useRef(false);
  const dockHistory = useRef<DockHistoryEntry[]>([]);
  const [dockHistorySize, setDockHistorySize] = useState(0);
  const notify = useOptionalNotify();
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
  const keyChords = useMemo(() => result.events.map(event => event.chord), [result]);
  // P25 V32: the chord sheet's own `Key:` line is the sheet's key — used only while the field is 「自動」.
  const sheet = unified.normalized.settings;
  const sheetKey = useMemo(() => {
    const state = confirmedTextProgressionKeyState(sheet.key);
    return state.kind === "confirmed" ? state.key : undefined;
  }, [sheet.key]);
  const keyDecision = useMemo(() => resolveImportKey({
    mode: keyChoice.kind,
    ...(keyChoice.kind === "manual" ? { manualKey: keyChoice.key } : {}),
    ...(keyChoice.kind === "auto" && sheetKey !== undefined ? { existingKey: sheetKey } : {}),
    chords: keyChords,
  }), [keyChoice, keyChords, sheetKey]);
  // P25 V32: a `BPM:` line fills the field once (a hand edit stays until the line changes).
  useEffect(() => {
    const value = sheet.bpm;
    if (value === undefined) return;
    if (parseExplicitBpm(String(value)) === undefined) return;
    setMatchGlobalBpm(false);
    setBpmInput(String(value));
  }, [sheet.bpm]);
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
  const selectedEvent = useMemo(() => result.events.find(
    (event) => textProgressionEventKey(event) === selectedEventKey,
  ) ?? result.events[0], [result.events, selectedEventKey]);
  // P23-17 V7/V8/V9: the degree, role and voicing mark of the preview cards (the card list is gone).
  const harmony = useMemo(() => cardHarmony(
    result.events.map(event => ({ id: String(event.range.start), name: event.chord, start: event.range.start })),
    keyDecision.key,
  ), [result, keyDecision.key]);
  /**
   * P25 V37: a card whose chord carries `{C3 G3 …}` plays and saves those notes. The braces are the source
   * until they change; a note edited in the band afterwards wins, and the text is never rewritten.
   */
  const braceApplied = useRef(new Map<string, { sig: string; snapshot: VoicingSnapshot }>());
  const overridesRef = useRef(voicingOverrides);
  overridesRef.current = voicingOverrides;
  useEffect(() => {
    const notesAt = new Map<number, readonly number[]>();
    for (const voicing of unified.normalized.voicings) notesAt.set(voicing.rawStart, voicing.notes);
    const updates = new Map<string, ChordVoicingMemory | undefined>();
    for (const event of result.events) {
      const key = textProgressionEventKey(event);
      const notes = notesAt.get(event.range.start);
      if (notes === undefined) {
        const applied = braceApplied.current.get(key);
        if (applied === undefined) continue;
        braceApplied.current.delete(key);
        // Only the snapshot this rule wrote goes; a note the person edited since then stays.
        if (overridesRef.current.get(key)?.practiceVoicingOverride === applied.snapshot) updates.set(key, undefined);
        continue;
      }
      const sig = notes.join(",");
      if (braceApplied.current.get(key)?.sig === sig) continue;
      const snapshot = createTextHandSnapshot(event.chord, notes);
      if (snapshot === undefined) continue;
      updates.set(key, { ...overridesRef.current.get(key), practiceVoicingOverride: snapshot });
      braceApplied.current.set(key, { sig, snapshot });
    }
    if (updates.size === 0) return;
    setVoicingOverrides((current) => {
      const next = new Map(current);
      updates.forEach((memory, key) => {
        if (memory === undefined) next.delete(key);
        else next.set(key, memory);
      });
      return next;
    });
  }, [result.events, unified.normalized.voicings]);
  useEffect(() => () => onStop(), [onStop]);

  // P24-06: one piano monitor while the keyboard entry is on; turning it off (or leaving) tidies it up.
  const listening = keyboardOn || dockMidiOn;
  useEffect(() => {
    if (!listening) {
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
  }, [listening]);

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
      // P25-05 D: while 「鍵盤で入れる」 is on, Backspace is its 「1 つ戻す」, not the card's delete.
      if (keyboardOn && event.key === "Backspace") return;
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
  }, [cardMenu, hoveredCardStart, input, keyboardOn, selectedCardStart, draftActive]);

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

  /** 「自動」keeps the key automatic; 「未設定」is the explicit no-key choice; a key is a manual pick. */
  function chooseKeyChoice(choice: string | undefined) {
    if (draftActive) return;
    onStop();
    if (choice === "auto") { setKeyChoice({ kind: "auto" }); return; }
    if (choice === "unset" || !choice) { setKeyChoice({ kind: "unset" }); return; }
    const state = confirmedTextProgressionKeyState(choice);
    setKeyChoice(state.kind === "confirmed" ? { kind: "manual", key: state.key } : { kind: "auto" });
  }

  /** P24-06: the open bar is counted in the old meter, so a meter change starts its own bar again. */
  const chooseMeter = useCallback((value: string) => {
    if (transportState.status === "stopped") onStop();
    setKeyboardBar(emptyKeyboardBar()); setKeyboardStack([]); setSelectedPending(undefined);
    setMeter(value);
  }, [onStop, transportState.status]);

  // P25 V32: a `Time Signature:` line sets the meter when the screen offers that meter (`6/8` is ignored).
  useEffect(() => {
    const value = sheet.meter;
    if (value === undefined || !METER_OPTIONS.includes(value) || value === meter) return;
    chooseMeter(value);
  }, [chooseMeter, meter, sheet.meter]);

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

  function saveStandard() {
    if (draftActive || !saveTitle.trim()) return;
    try {
      // P24-06: an open bar is filled and saved with the rest (the save's text includes it).
      const flushed = keyboardOn && keyboardBar.slots.length > 0 ? flushKeyboard() : { text: input, entries: [] };
      const target = flushed.text === input ? unified : parseUnifiedText(flushed.text, parseOptions());
      if (!target.canConvert) return;
      const targetEvents = unifiedEvents(target);
      // P25 V32: the sheet's `Key:` line counts here too, so a save keeps the key the screen showed.
      const targetSheetState = confirmedTextProgressionKeyState(target.normalized.settings.key);
      const targetSheetKey = targetSheetState.kind === "confirmed" ? targetSheetState.key : undefined;
      const targetKey = target === unified ? keyDecision
        : resolveImportKey({
            mode: keyChoice.kind,
            ...(keyChoice.kind === "manual" ? { manualKey: keyChoice.key } : {}),
            ...(keyChoice.kind === "auto" && targetSheetKey !== undefined ? { existingKey: targetSheetKey } : {}),
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
    if (dockMidiOn) { commitDockMidi(notes); return; }
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
    // C6: the two never listen at the same time.
    setDockMidiOn(false);
    setKeyboardStack([]);
    setKeyboardBase(input);
    setSelectedPending(undefined);
    setFollowTick((tick) => tick + 1);
  }

  const keyboardLengths = useMemo<readonly KeyboardLengthChoice[]>(() => {
    const beatsPerBar = unified.beatsPerBar;
    const remaining = beatsPerBar - keyboardBar.filled;
    const choices: KeyboardLengthChoice[] = [
      { value: "bar", label: "1 小節", keyCap: "1", disabled: beatsPerBar > remaining },
      { value: 1, label: "1 拍", keyCap: "3", disabled: remaining < 1 },
    ];
    if (beatsPerBar % 2 === 0) choices.splice(1, 0, { value: 2, label: "2 拍", keyCap: "2", disabled: remaining < 2 });
    return choices;
  }, [keyboardBar.filled, unified.beatsPerBar]);

  /** V20 もう一度 (R): the chord before, written as `%` — the same as typing `%` after it. */
  const repeatSource = [...keyboardBar.slots].reverse().find((slot) => slot.kind === "chord" && slot.chord !== undefined)?.chord
    ?? result.events[result.events.length - 1]?.chord;
  function repeatKeyboard() {
    if (repeatSource === undefined) return;
    commitKeyboardSlot({ kind: "chord", beats: keyboardLengthInBeats(keyboardLength, unified.beatsPerBar), chord: { ...repeatSource, label: "%" } });
  }
  const pendingText = keyboardOn ? pendingKeyboardBarText(keyboardBar, unified.beatsPerBar) : undefined;
  const pendingCards = keyboardBar.slots.map((slot) => slot.kind === "rest"
    ? { label: "_", rest: true }
    : slot.chord?.label === "%" ? { label: "%" } : { label: slot.chord?.label ?? "", voicing: "弾いた音" });
  // P25 V23 Stage 1: the 「次のコード」 palette, its open bar and its undo step (shared with the band's history).
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [suggestionAnchor, setSuggestionAnchor] = useState<SuggestionAnchor>();
  const [suggestionBar, setSuggestionBar] = useState<KeyboardBar>(emptyKeyboardBar);
  const [suggestionLength, setSuggestionLength] = useState<SuggestionLength>("bar");
  const [suggestionRejected, setSuggestionRejected] = useState(false);
  // V26-3: until the person picks a length, it follows the bar before (beat by beat); a pick is kept while the palette is open.
  const [suggestionPinned, setSuggestionPinned] = useState(false);
  const suggestionLengthBeats = keyboardLengthInBeats(suggestionLength, unified.beatsPerBar);
  const previousItems = useMemo(() => previousBarItems(unified.slots), [unified.slots]);
  const previousItemsKey = previousItems.map((item) => `${item.start}:${item.beats}`).join(",");
  useLayoutEffect(() => {
    if (!suggestionOpen || suggestionPinned) return;
    const perBar = unified.beatsPerBar;
    setSuggestionLength((current) => {
      const beats = followedSuggestionBeats(previousItems, perBar, suggestionBar.filled, keyboardLengthInBeats(current, perBar));
      const next: SuggestionLength = beats === perBar ? "bar" : beats === 2 ? 2 : 1;
      return next === current ? current : next;
    });
  }, [suggestionOpen, suggestionPinned, suggestionBar.filled, previousItemsKey, unified.beatsPerBar]);
  const suggestionChords = useMemo(() => [
    ...unified.spans.map((span) => span.chord),
    ...suggestionBar.slots.filter((slot) => slot.kind === "chord" && slot.chord !== undefined).map((slot) => slot.chord!),
  ], [unified, suggestionBar]);
  // V25-4: the palette reads ONE key: the screen's key when it is decided, otherwise the estimate's first place.
  const screenSuggestionKey = useMemo(() => parseSuggestionKey(keyDecision.key), [keyDecision.key]);
  const suggestionKey = useMemo(() => screenSuggestionKey ?? estimateKeyForSuggestions(suggestionChords), [screenSuggestionKey, suggestionChords]);
  const suggestionTexture = useMemo(() => textureOfChords(suggestionChords), [suggestionChords]);
  const suggestionKeyChords = useMemo(() => suggestionKey === undefined ? [] : keyChordsFor(suggestionKey, suggestionTexture), [suggestionKey, suggestionTexture]);
  const suggestionCandidates = useMemo(() => {
    if (!suggestionOpen || suggestionChords.length === 0) return [];
    const tasteProfile = buildTasteProfile(vaultTasteBlocks ?? []);
    const hints = suggestionKey === undefined ? undefined : tasteHintsFor(tasteProfile, suggestionKey.mode);
    return suggestNextChords({
      chords: suggestionChords,
      ...(suggestionKey === undefined ? {} : { keySignature: `${["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"][suggestionKey.tonic]} ${suggestionKey.mode}` }),
      nextBarNumber: unified.bars.length + 1,
      beatsPerBar: unified.beatsPerBar,
      filledBeats: suggestionBar.filled,
      lengthBeats: suggestionLengthBeats,
      ...(hints === undefined ? {} : { taste: hints }),
    });
  }, [suggestionOpen, suggestionChords, suggestionKey, vaultTasteBlocks, unified.bars.length, unified.beatsPerBar, suggestionBar.filled, suggestionLengthBeats]);
  const suggestionVisible = unified.canConvert && unified.spans.length > 0 && !keyboardOn && !draftActive;

  function openSuggestions(rect: DOMRect) {
    // V24-5/V26-1: the palette's sides are the preview's frame; its height is the whole working area.
    const frame = paletteBounds();
    setSuggestionAnchor({
      left: rect.left, top: rect.top, bottom: rect.bottom,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
      ...(frame === undefined ? {} : { frame }),
    });
    setSuggestionPinned(false);
    setSuggestionLength("bar");
    setSuggestionOpen(true);
    setSuggestionRejected(false);
  }
  function closeSuggestions(flush = true) {
    if (flush && suggestionBar.slots.length > 0) flushSuggestionBar();
    setSuggestionOpen(false);
    setSuggestionBar(emptyKeyboardBar());
    setSuggestionRejected(false);
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-testid='text-suggestion-ghost']")?.focus());
  }
  /** Closes: the open bar (its remaining beats held with `=`) goes into the text through the same five checks. */
  function flushSuggestionBar() {
    const flushed = flushKeyboardBar(suggestionBar, unified.beatsPerBar);
    if (flushed === undefined) return;
    const plan = planAppendTokens(input, flushed.tokens, parseOptions());
    if (plan === null) return;
    pushDockHistory();
    appendSuggestionBarText(plan.nextText, flushed.chords);
  }
  function appendSuggestionBarText(nextText: string, chordNotes: readonly (readonly number[])[]) {
    const beforeLength = input.length;
    setSuggestionBar(emptyKeyboardBar());
    setInput(nextText);
    setSaved(false); saveBtn.reset(); setSaveFailed(false);
    assignKeyboardVoicings(nextText, beforeLength, chordNotes);
    setFollowTick((tick) => tick + 1);
  }
  function addSuggestion(entry: { readonly chord: ChordSymbol; readonly label: string }) {
    const slot: KeyboardSlot = { kind: "chord", beats: suggestionLengthBeats, chord: entry.chord, notes: defaultCardNotes(entry.chord) };
    const placed = addKeyboardSlot(suggestionBar, slot, unified.beatsPerBar);
    if (placed.bar === suggestionBar) { setSuggestionRejected(true); return; }
    setSuggestionRejected(false);
    if (placed.completed === undefined) {
      setSuggestionBar(placed.bar);
      const remaining = unified.beatsPerBar - placed.bar.filled;
      if (remaining > 0 && remaining < suggestionLengthBeats) setSuggestionLength(remaining >= 2 ? 2 : 1);
      return;
    }
    const plan = planAppendTokens(input, placed.completed.tokens, parseOptions());
    if (plan === null) { setSuggestionRejected(true); return; }
    pushDockHistory();
    appendSuggestionBarText(plan.nextText, placed.completed.chords);
  }
  function previewSuggestion(entry: { readonly chord: ChordSymbol }) {
    const template = result.events[result.events.length - 1];
    if (template === undefined || transportState.status === "playing") return;
    onStop();
    onPreview({ ...template, chord: entry.chord, canonical: entry.chord.label }, undefined, playbackBpm);
  }
  const suggestionKeyLabel = suggestionKey === undefined ? "このキーのコード"
    : `${["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"][suggestionKey.tonic]} ${suggestionKey.mode === "major" ? "メジャー" : "マイナー"}のコード`;
  const heldHarmony = heldChord?.chord === undefined ? undefined
    : cardHarmony([{ id: "held", name: heldChord.chord, start: 0 }], keyDecision.key).get("held");

  useEffect(() => {
    if (!keyboardOn) return undefined;
    const inTypingField = (node: EventTarget | null) => node instanceof HTMLElement
      && node.closest("textarea, input, select, [contenteditable='true']") !== null;
    const onKey = (event: KeyboardEvent) => {
      // P25-05 D: the keys work only while the caret is not in a field the person is typing in.
      if (inTypingField(event.target) || inTypingField(document.activeElement)) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoKeyboard();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Escape") {
        // 「?」 closes first (its own handler), then the entry stops.
        if (helpOpen) return;
        event.preventDefault();
        toggleKeyboard();
        return;
      }
      if (event.key === "Backspace") {
        event.preventDefault();
        undoKeyboard();
        return;
      }
      if (event.key === "0") {
        event.preventDefault();
        commitKeyboardSlot({ kind: "rest", beats: keyboardLengthInBeats(keyboardLength, unified.beatsPerBar) });
        return;
      }
      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        repeatKeyboard();
        return;
      }
      const choice = keyboardLengths.find((item) => item.keyCap === event.key);
      if (choice !== undefined && !choice.disabled) {
        event.preventDefault();
        setKeyboardLength(choice.value);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // ---- P25-03 C: the selected card's band ----
  const dockCards = useMemo(() => buildDockCards(unified, result.events), [unified, result.events]);
  const dockIndex = selectedCardStart === undefined ? -1 : dockCards.findIndex((card) => card.start === selectedCardStart);
  const dockCard = dockIndex < 0 ? undefined : dockCards[dockIndex];
  const chordCards = dockCards.filter((card) => !card.rest && card.event !== undefined);
  const sameCards = dockCard?.event === undefined ? []
    : chordCards.filter((card) => card.event!.canonical === dockCard.event!.canonical);
  const dockTargets: readonly DockCard[] = dockCard === undefined || dockCard.rest ? []
    : dockScope === "all" ? chordCards
    : dockScope === "same" && sameCards.length > 1 ? sameCards : [dockCard];

  // C5: another card means 「このカード」 again; C1: the chosen card is scrolled into view above the band.
  useEffect(() => {
    if (dockStartShifted.current) { dockStartShifted.current = false; return; }
    setDockScope("one");
    setDockNotice(undefined);
    if (dockCard === undefined) return;
    const node = document.querySelector<HTMLElement>(`[data-card-start="${dockCard.start}"]`);
    node?.scrollIntoView?.({ block: "nearest" });
  }, [dockCard?.start]);
  // C6: the entry stops when there is no card to enter into.
  useEffect(() => { if (dockCard === undefined || dockCard.rest) setDockMidiOn(false); }, [dockCard]);

  function dockSnapshotOf(card: DockCard): VoicingSnapshot | undefined {
    return card.event === undefined ? undefined : memoryForAttack(card.event, card.beat)?.practiceVoicingOverride;
  }
  function dockNotesOf(card: DockCard): number[] {
    return card.event === undefined ? [] : [...textPreviewNotes(card.event.chord, memoryForAttack(card.event, card.beat))];
  }
  function previousChordCard(card: DockCard): DockCard | undefined {
    const index = dockCards.indexOf(card);
    for (let i = index - 1; i >= 0; i -= 1) if (!dockCards[i]!.rest && dockCards[i]!.event !== undefined) return dockCards[i];
    return undefined;
  }
  /** The choice a card's buttons mark (C4); a card with no shape snapshot marks 基本. */
  function dockShapeOf(card: DockCard): GeneratedShapeOptions {
    if (card.event === undefined) return DEFAULT_GENERATED_SHAPE_OPTIONS;
    const snapshot = dockSnapshotOf(card);
    const kind = cardSoundKindOf(snapshot);
    if (kind === "hand" || kind === "live") return DEFAULT_GENERATED_SHAPE_OPTIONS;
    return cardShapeMarkOf(snapshot, card.event.chord).options;
  }
  /** C4 / N2「最初から」: the card holds a shape other than 基本, hand-edited notes or played notes. */
  function dockHasOwnSound(card: DockCard): boolean {
    const snapshot = dockSnapshotOf(card);
    if (snapshot === undefined || card.event === undefined) return false;
    if (cardSoundKindOf(snapshot) !== "shape") return true;
    return cardShapeMarkOf(snapshot, card.event.chord).options.shape !== "basic";
  }

  function selectDockCardStart(start: number | undefined) {
    setSelectedCardStart(start);
  }
  function chooseDockCard(card: DockCard, audition = true) {
    if (card.event !== undefined && audition) { selectEvent(card.event, card.beat, card.start); return; }
    setSelectedCardStart(card.start);
    if (card.event !== undefined) { setSelectedEventKey(textProgressionEventKey(card.event)); setSelectedAttackBeat(card.beat); }
  }
  function moveDock(step: 1 | -1) {
    if (dockIndex < 0) return;
    const next = dockCards[dockIndex + step];
    if (next !== undefined) chooseDockCard(next);
  }
  function closeDock() {
    setDockMidiOn(false);
    setSelectedCardStart(undefined);
  }

  function auditionDock(card: DockCard, snapshot: VoicingSnapshot | undefined) {
    if (card.event === undefined || transportState.status === "playing") return;
    const memory = snapshot === undefined ? undefined : { practiceVoicingOverride: snapshot };
    if (textPreviewNotes(card.event.chord, memory).length === 0) return;
    onStop();
    onPreview(card.event, memory, playbackBpm);
  }
  /** C8: one step of the band (the text and every card's sound). */
  function pushDockHistory() {
    dockHistory.current = [...dockHistory.current, {
      input, attack: attackVoicing, overrides: voicingOverrides,
      selectedCardStart, selectedAttackBeat, selectedEventKey,
    }].slice(-40);
    setDockHistorySize(dockHistory.current.length);
  }
  function undoDock() {
    const last = dockHistory.current[dockHistory.current.length - 1];
    if (last === undefined) return;
    dockHistory.current = dockHistory.current.slice(0, -1);
    setDockHistorySize(dockHistory.current.length);
    setInput(last.input);
    setAttackVoicing(last.attack);
    setVoicingOverrides(last.overrides);
    setSelectedCardStart(last.selectedCardStart);
    setSelectedAttackBeat(last.selectedAttackBeat);
    setSelectedEventKey(last.selectedEventKey);
    setSaved(false); saveBtn.reset(); setSaveFailed(false);
  }
  /** Writes the cards' own sounds (undefined = back to the recommendation) as one undo step. */
  function writeDockSounds(updates: ReadonlyMap<number, VoicingSnapshot | undefined>): boolean {
    if (updates.size === 0) return false;
    pushDockHistory();
    setAttackVoicing((current) => {
      const next = new Map(current);
      updates.forEach((snapshot, beat) => { if (snapshot === undefined) next.delete(beat); else next.set(beat, snapshot); });
      return next;
    });
    setSaved(false); saveBtn.reset(); setSaveFailed(false);
    return true;
  }

  /** C4 / C5: a shape (or its parts) on the range's cards. 基本 means the card keeps nothing of its own. */
  function applyDockShape(make: (card: DockCard, selected: GeneratedShapeOptions) => GeneratedShapeOptions) {
    if (dockCard?.event === undefined || dockMidiOn) return;
    const selected = dockShapeOf(dockCard);
    const updates = new Map<number, VoicingSnapshot | undefined>();
    let fellBack = 0;
    for (const card of dockTargets) {
      const options = make(card, selected);
      if (options.shape === "basic") {
        if (dockSnapshotOf(card) !== undefined) updates.set(card.beat, undefined);
        continue;
      }
      const shapeOptions = options as VoicingShapeOptions;
      const snapshot = createTextShapeSnapshot(card.event!.chord, shapeOptions);
      if (snapshot === undefined) continue;
      if (buildShapeVoicing(card.event!.chord, shapeOptions).fellBack) fellBack += 1;
      updates.set(card.beat, snapshot);
    }
    if (!writeDockSounds(updates)) return;
    auditionDock(dockCard, updates.has(dockCard.beat) ? updates.get(dockCard.beat) : dockSnapshotOf(dockCard));
    if (dockScope === "all" && fellBack > 0) notify?.({ message: `${fellBack} 枚は、この形にできないので近い形で鳴らしています` });
  }
  function chooseDockShape(shape: GeneratedShapeChoice) {
    applyDockShape((_card, selected) => shape === "basic" ? DEFAULT_GENERATED_SHAPE_OPTIONS
      : { shape, tension: selected.tension, spread: selected.spread, rootlessOrder: "auto" });
  }
  function toggleDockPart(part: "tension" | "spread") {
    if (dockCard?.event === undefined) return;
    const selected = dockShapeOf(dockCard);
    if (selected.shape === "basic") return;
    const value = !selected[part];
    applyDockShape((card) => {
      const own = dockShapeOf(card);
      const base = own.shape === "basic" ? selected : own;
      return { ...base, [part]: value };
    });
  }
  function chooseDockForm(form: "A" | "B") {
    if (dockCard?.event === undefined || dockMidiOn) return;
    const options: VoicingShapeOptions = { ...(dockShapeOf(dockCard) as VoicingShapeOptions), shape: "rootless", rootlessOrder: form };
    const targets = dockScope === "same" && sameCards.length > 1 ? sameCards : [dockCard];
    const updates = new Map<number, VoicingSnapshot | undefined>();
    for (const card of targets) {
      const snapshot = createTextShapeSnapshot(card.event!.chord, options);
      if (snapshot !== undefined) updates.set(card.beat, snapshot);
    }
    if (writeDockSounds(updates)) auditionDock(dockCard, updates.get(dockCard.beat));
  }

  /** C4: inversion / height / approach — notes moved from each card's own notes, kept as hand-edited notes. */
  function applyDockNotes(move: (notes: readonly number[], card: DockCard, previous: readonly number[]) => number[] | undefined) {
    if (dockCard?.event === undefined || dockMidiOn) return;
    const updates = new Map<number, VoicingSnapshot | undefined>();
    const moved = new Map<number, number[]>();
    const notesNow = (card: DockCard): number[] => moved.get(card.beat) ?? dockNotesOf(card);
    if (dockScope === "same" && sameCards.length > 1) {
      const previous = previousChordCard(dockCard);
      const result = move(dockNotesOf(dockCard), dockCard, previous === undefined ? [] : dockNotesOf(previous));
      if (result === undefined) return;
      for (const card of sameCards) {
        const snapshot = createTextHandSnapshot(card.event!.chord, result);
        if (snapshot !== undefined) updates.set(card.beat, snapshot);
      }
    } else {
      for (const card of dockTargets) {
        const previous = previousChordCard(card);
        const result = move(notesNow(card), card, previous === undefined ? [] : notesNow(previous));
        if (result === undefined) continue;
        moved.set(card.beat, result);
        const snapshot = createTextHandSnapshot(card.event!.chord, result);
        if (snapshot !== undefined) updates.set(card.beat, snapshot);
      }
    }
    if (writeDockSounds(updates)) auditionDock(dockCard, updates.get(dockCard.beat) ?? dockSnapshotOf(dockCard));
  }
  function invertDock(direction: 1 | -1) {
    applyDockNotes((notes, card) => direction === 1 ? invertUp(notes, card.event!.chord) : invertDown(notes, card.event!.chord));
  }
  function octaveDock(direction: 1 | -1) {
    applyDockNotes((notes) => shiftOctave(notes, direction));
  }
  function approachDock() {
    applyDockNotes((notes, card, previous) => approachPrevious(notes, previous, card.event!.chord));
  }
  function resetDock() {
    if (dockCard?.event === undefined || dockMidiOn) return;
    const updates = new Map<number, VoicingSnapshot | undefined>();
    for (const card of dockTargets) if (dockHasOwnSound(card)) updates.set(card.beat, undefined);
    if (writeDockSounds(updates)) auditionDock(dockCard, undefined);
  }

  /**
   * C3 / C6 / C7: new notes for the chosen card (and its same-name cards in 「同じ」). The name is read again
   * from the notes; a new name rewrites the typed text of those cards. Sounds and text are one undo step.
   * Returns how far a card that starts at `start` moved in the text.
   */
  function applyDockPlayedNotes(notes: readonly number[], make: (chord: ChordSymbol, notes: readonly number[]) => VoicingSnapshot | undefined): (start: number) => number {
    const card = dockCard!;
    const event = card.event!;
    const targets = dockScope === "same" && sameCards.length > 1 ? sameCards : [card];
    const rename = renameForNotes(event.chord, dockNotesOf(card), notes);
    const updates = new Map<number, VoicingSnapshot | undefined>();
    for (const target of targets) {
      const snapshot = make(rename.kind === "rename" ? rename.chord : target.event!.chord, notes);
      if (snapshot !== undefined) updates.set(target.beat, snapshot);
    }
    const unchanged = () => 0;
    if (updates.size === 0) return unchanged;
    pushDockHistory();
    setAttackVoicing((current) => {
      const next = new Map(current);
      updates.forEach((snapshot, beat) => { if (snapshot !== undefined) next.set(beat, snapshot); });
      return next;
    });
    setSaved(false); saveBtn.reset(); setSaveFailed(false);
    const oldName = displayChordLabel(event.canonical);
    if (rename.kind !== "rename") {
      setDockNotice(rename.kind === "unread"
        ? { start: card.start, text: `音から名前を決められません(${oldName} のまま)`, color: "#ffd166" }
        : undefined);
      return unchanged;
    }
    // Each typed place once (a repeat like `x2` shares its characters), rewritten from the end.
    const places = [...new Map(targets.map((target) => [target.start, typedChordEnd(input, target.start, target.end)])).entries()]
      .sort((left, right) => right[0] - left[0]);
    let text = input;
    for (const [start, end] of places) text = text.slice(0, start) + rename.label + text.slice(end);
    const shift = (start: number) => places.reduce((sum, [from, to]) => sum + (to <= start ? rename.label.length - (to - from) : 0), 0);
    setInput(text);
    setReplacedFrom(undefined);
    const movedStart = card.start + shift(card.start);
    if (movedStart !== card.start) { dockStartShifted.current = true; setSelectedCardStart(movedStart); }
    setSelectedEventKey(undefined);
    setDockNotice({ start: movedStart, text: `入力の ${oldName} を ${displayChordLabel(rename.label)} に書き換えました`, color: "#8bd7ff" });
    return shift;
  }

  /** C3: a key adds or removes one note on the chosen card (and its same-name cards in 「同じ」). */
  function toggleDockKey(note: number) {
    if (dockCard?.event === undefined || dockMidiOn) return;
    const notes = dockNotesOf(dockCard);
    const next = notes.includes(note) ? notes.filter((value) => value !== note) : [...notes, note].sort((a, b) => a - b);
    if (next.length < CARD_MIN_NOTES || next.length > CARD_MAX_NOTES) return;
    applyDockPlayedNotes(next, (chord, values) => createTextHandSnapshot(chord, values));
    auditionDock(dockCard, createTextHandSnapshot(dockCard.event.chord, next));
  }

  /** C6: a released chord of 2–10 notes enters the chosen card and the next card is chosen. */
  function commitDockMidi(notes: readonly number[]) {
    if (dockCard?.event === undefined || notes.length < CARD_MIN_NOTES || notes.length > CARD_MAX_NOTES) return;
    const sortedNotes = [...notes].sort((a, b) => a - b);
    const shift = applyDockPlayedNotes(sortedNotes, (chord, values) => livePlayedSnapshot(chord, values));
    const next = chordCards.find((card) => card.beat > dockCard.beat);
    if (next === undefined) { setDockMidiOn(false); return; }
    setSelectedCardStart(next.start + shift(next.start));
    setSelectedAttackBeat(next.beat);
    if (next.event !== undefined) setSelectedEventKey(textProgressionEventKey(next.event));
  }
  function toggleDockMidi() {
    if (dockCard?.event === undefined) return;
    keyboardLatch.current.reset();
    setDockMidiOn((on) => !on);
  }

  // C9: the band's keys, only outside text fields and while no dialog or menu is open. P25 V23: the panel's
  // history still answers Ctrl+Z outside the fields when the band is closed (the proposal's §6.3).
  useEffect(() => {
    if (keyboardOn || draftActive || suggestionOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("textarea, input, select, [contenteditable='true']")) return;
      if (event.key === "Escape") {
        if (dockCard === undefined || helpOpen || cardMenu !== undefined) return;
        event.preventDefault();
        if (dockMidiOn) setDockMidiOn(false); else closeDock();
        return;
      }
      if (helpOpen || cardMenu !== undefined || document.querySelector("[role='dialog'], [role='menu']")) return;
      const ctrl = event.ctrlKey || event.metaKey;
      if (ctrl) {
        if (!event.shiftKey && event.key.toLowerCase() === "z" && dockHistory.current.length > 0) { event.preventDefault(); undoDock(); }
        return;
      }
      const key = event.key;
      if (dockCard === undefined) return;
      if (key === "ArrowLeft" || key === "ArrowRight") { event.preventDefault(); moveDock(key === "ArrowLeft" ? -1 : 1); return; }
      if (dockCard.rest) return;
      if (key === "ArrowUp" || key === "ArrowDown") {
        event.preventDefault();
        const direction = key === "ArrowUp" ? 1 : -1;
        if (event.shiftKey) octaveDock(direction); else invertDock(direction);
        return;
      }
      if (/^[1-5]$/.test(key)) { event.preventDefault(); chooseDockShape(GENERATED_SHAPE_CHOICES[Number(key) - 1]!); return; }
      if (key === "s" || key === "S") { event.preventDefault(); approachDock(); return; }
      if (key === "m" || key === "M") { event.preventDefault(); toggleDockMidi(); return; }
      if (key === "Enter") {
        if (target?.closest("button, a, [role='button']")) return;
        event.preventDefault();
        auditionDock(dockCard, dockSnapshotOf(dockCard));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function renderDock(card: DockCard) {
    const event = card.event;
    if (card.rest || event === undefined) {
      return <TextCardDock {...dockBaseProps(card)} rest />;
    }
    const chord = event.chord;
    const snapshot = dockSnapshotOf(card);
    const kind = cardSoundKindOf(snapshot);
    const notes = dockNotesOf(card);
    const previous = previousChordCard(card);
    const shape = dockShapeOf(card);
    const ownShape = kind !== "hand" && kind !== "live";
    const basic = shape.shape === "basic";
    const result = basic ? undefined : buildShapeVoicing(chord, shape as VoicingShapeOptions);
    const form = (() => {
      if (result === undefined) return null;
      const parsed = snapshot?.extractorVersion?.match(/:(A|B)$/)?.[1] as "A" | "B" | undefined;
      return parsed ?? pickShapeForm(result, shape.rootlessOrder)?.form ?? null;
    })();
    const sourceText = kind === "live" ? "鍵盤で弾いた音" : kind === "hand" ? "手で直した音"
      : `おすすめの形 · ${result?.fellBack ? usedShapeName(result.used) : requestedShapeName(shape)}${result?.used.startsWith("rootless") && form ? ` ${form}` : ""}`;
    const sourceColor = kind === "live" ? "#8bd7ff" : kind === "hand" ? "#c9b7ff" : "#a5b2c6";
    // V15: the fallback reads 「代わり:<the shape it plays>」 on one line; the long words are its title.
    const notice = dockNotice !== undefined && dockNotice.start === card.start ? { text: dockNotice.text, color: dockNotice.color, title: dockNotice.text }
      : !ownShape || result === undefined ? undefined
      : result.used === "legacy" ? { text: `代わり:${usedShapeName(result.used)}`, color: "#a5b2c6", title: "このコードは形で作れないので、今までの作り方の音で鳴らしています" }
      : result.fellBack ? { text: `代わり:${usedShapeName(result.used)}`, color: "#a5b2c6", title: `${displayChordLabel(event.canonical)} は ${SHAPE_LABEL[shape.shape]} にできないので、${usedShapeName(result.used)} で鳴らしています` }
      : undefined;
    const shapes: DockShapeButton[] = GENERATED_SHAPE_CHOICES.map((id) => {
      const on = ownShape && shape.shape === id;
      if (id === "basic") {
        return { id, label: SHAPE_LABEL[id], key: SHAPE_KEY[id], on, direct: true, title: SHAPE_TITLE[id], notes: defaultCardNotes(chord) };
      }
      const built = buildShapeVoicing(chord, { tension: shape.tension, spread: shape.spread, rootlessOrder: shape.rootlessOrder, shape: id });
      const choice = pickShapeForm(built, shape.rootlessOrder);
      return {
        id, label: SHAPE_LABEL[id], key: SHAPE_KEY[id], on, direct: !built.fellBack,
        title: `${SHAPE_TITLE[id]}${built.fellBack ? `(このコードでは ${usedShapeName(built.used)} で鳴る)` : ""}`,
        notes: choice === undefined ? [] : placementNotes(choice.staticChoice),
      };
    });
    const added = shape.shape === "shell" ? buildShapeVoicing(chord, { ...(shape as VoicingShapeOptions), tension: true }).addedTension : undefined;
    const addedName = added === undefined ? undefined
      : `+${added.replace(/b/g, "♭").replace(/#/g, "♯")}(${addedTensionNoteName(chord, added)})`;
    const tension: DockChip = {
      on: ownShape && shape.tension && shape.shape === "shell" && added !== undefined,
      disabled: shape.shape !== "shell" || added === undefined,
      sub: basic ? "—" : shape.shape !== "shell" ? "入り済み" : addedName ?? "なし",
      title: basic ? "基本は今までどおりの音なので、部品は付けられません"
        : shape.shape !== "shell" ? `${SHAPE_LABEL[shape.shape]} は、はじめからテンションが入っています`
        : addedName !== undefined ? `このコードには ${addedName.slice(1)} を 1 音足します(9・11・13 のうち合う音)`
        : "コード名にもうテンションがあるので、足す音はありません",
    };
    const spreadOk = shape.shape === "shell" || shape.shape === "rootless";
    const spread: DockChip = {
      on: ownShape && shape.spread && spreadOk, disabled: !spreadOk, sub: "左 R・5",
      title: spreadOk ? "左手をルート+5 度に広げ、右手を上に離す" : "シェルとルートレスの時だけ使えます",
    };
    const forms = ownShape && result !== undefined && shape.shape === "rootless" && result.used.startsWith("rootless")
      ? (["A", "B"] as const).map((name) => {
          const placeable = result.forms.some((item) => item.form === name);
          return { form: name, on: form === name, disabled: !placeable, ...(placeable ? {} : { title: `このコードでは ${name} の並びは範囲に入りません` }) };
        })
      : undefined;
    const scopeTargets = dockScope === "all" ? chordCards : dockScope === "same" && sameCards.length > 1 ? sameCards : [card];
    return <TextCardDock {...dockBaseProps(card)} rest={false}
      notes={notes} heldNotes={held} previousNotes={previous === undefined ? [] : dockNotesOf(previous)}
      chord={chord}
      {...(previous?.event === undefined ? {} : { previousName: displayChordLabel(previous.event.canonical) })}
      roles={cardKeyRoles(chord)} sourceText={sourceText} sourceColor={sourceColor}
      {...(notice === undefined ? {} : { notice })}
      shapes={shapes} tension={tension} spread={spread} {...(forms === undefined ? {} : { forms })}
      approachDisabled={dockScope !== "all" && previous === undefined}
      resetEnabled={scopeTargets.some(dockHasOwnSound)} />;
  }

  function dockBaseProps(card: DockCard) {
    const event = card.event;
    const own = event !== undefined && confirmed && showRomanNumerals ? harmony.get(String(event.range.start)) : undefined;
    const label = event === undefined ? "" : displayChordLabel(event.canonical);
    const split = splitShownChord(label);
    const name = label;
    return {
      ...(own?.degree ? { degree: own.degree } : {}),
      degreeColor: roleColorOf(own?.role),
      root: split.root, quality: split.quality, position: dockPositionText(card),
      screenKey: keyDecision.key ?? "C major",
      scope: dockScope,
      scopes: [
        { id: "one" as const, label: "このカード", title: "このカードだけを直します" },
        ...(sameCards.length > 1 ? [{ id: "same" as const, label: `同じ ${name} · ${sameCards.length} 枚`, shortLabel: `同じ ${name}`, title: `同じ ${name} を、このカードの音にそろえて直します` }] : []),
        { id: "all" as const, label: `ぜんぶ · ${chordCards.length} 枚`, shortLabel: "ぜんぶ", title: `形・転回・高さが ${chordCards.length} 枚ぜんぶに効きます(1 枚ずつ、今の音から動きます)。鍵盤での足し引きは、このカードだけです` },
      ],
      undoEnabled: dockHistorySize > 0,
      midiOn: dockMidiOn, midiConnected: midiView.connected,
      notes: [] as number[], heldNotes: [] as number[], previousNotes: [] as number[],
      sourceText: "", sourceColor: "#a5b2c6",
      shapes: [] as DockShapeButton[],
      tension: { on: false, disabled: true, sub: "", title: "" }, spread: { on: false, disabled: true, sub: "", title: "" },
      approachDisabled: true, resetEnabled: false,
      onPrev: () => moveDock(-1), onNext: () => moveDock(1),
      onScope: (scope: DockScope) => setDockScope(scope),
      onUndo: undoDock, onToggleMidi: toggleDockMidi,
      onConnectMidi: () => openMidiPanel(),
      onPlay: () => auditionDock(card, dockSnapshotOf(card)),
      onClose: closeDock, onKey: toggleDockKey,
      onShape: chooseDockShape, onTension: () => toggleDockPart("tension"), onSpread: () => toggleDockPart("spread"),
      onForm: chooseDockForm, onInvert: invertDock, onOctave: octaveDock, onApproach: approachDock, onReset: resetDock,
    };
  }

  const visibleDiagnostics = input.trim() ? unified.diagnostics.filter((diagnostic) => diagnostic.severity === "ERROR") : [];
  /** P24-05: the one line that says what the normaliser did (the design's band). */
  const skippedCount = unified.normalized.skipped.length;
  // P25-06 E/E2: the lines the new readings took, named in the same band.
  const lyricChordCount = unified.normalized.lyricChordLines.length;
  const separatedCount = unified.normalized.separatedLines.length;
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
  ) : skippedCount > 0 || lyricChordCount > 0 || separatedCount > 0 ? (
    <div data-testid="text-normalize-band" data-state="normalized" style={{
      flex: "none", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, rowGap: 4, margin: "0 16px 8px",
      padding: "7px 8px 7px 12px", border: "1px solid #1f4a63", borderRadius: 10, background: "#102d40",
    }}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#78c8f5"
        strokeWidth="1.5" strokeLinecap="round" style={{ flex: "none" }}>
        <path d="M3 4h10M3 8h6M3 12h8" /><path d="M11.5 7.5l2 2-2 2" />
      </svg>
      <span style={{ fontSize: 13, color: "#f2f6fc" }}>{"コード譜として読みました。"}</span>
      {skippedCount > 0 ? (
        <span style={{ fontSize: 12, color: "#c4d6e6" }}>
          {`歌詞らしい ${skippedCount} 行を読み飛ばし${changeCount ? `、表記を ${changeCount} か所そろえています` : "ています"}。`}
        </span>
      ) : null}
      {lyricChordCount > 0 ? (
        <span data-testid="text-lyric-chord-notice" style={{ fontSize: 12, color: "#c4d6e6" }}>
          {`歌詞の中のコード([C] の形)を ${lyricChordCount} 行読みました。長さは 1 コード 1 小節にしています。`}
        </span>
      ) : null}
      {separatedCount > 0 ? (
        <span data-testid="text-separator-notice" style={{ fontSize: 12, color: "#c4d6e6" }}>
          {`カンマ・ダッシュの区切りを ${separatedCount} 行読みました。`}
        </span>
      ) : null}
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
  // P25 C12 (rev12): a progression of rests only is not saved; the button cannot be pressed and says why.
  const restOnly = chordCards.length === 0 && dockCards.length > 0;
  const saveBlocked = restOnly ? "コードのない進行です(休符だけ)" : textSaveBlockedReason(result.canConvert, saveReason, saveTitle);
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
  // P25 V32: the sheet's own key is named 「譜面: …」 (it comes before the automatic rule).
  const autoKeyLabel = keyDecision.key === undefined ? "自動: 未確定"
    : keyDecision.origin === "existing" ? `譜面: ${formatTextKeyLabel(keyDecision.key)}`
      : `自動: ${formatTextKeyLabel(keyDecision.key)}`;
  const disabled = draftActive;
  /** P23-17 V8/V9: what a preview card shows above and below its chord name. */
  const harmonyFor = (sourceStart: number, beat?: number) => {
    const own = confirmed && showRomanNumerals ? harmony.get(String(sourceStart)) : undefined;
    const event = result.events.find(item => item.range.start === sourceStart);
    if (!own && !event) return undefined;
    // P25-03 C10: the card's sounding notes as dots, coloured by where they come from.
    const memory = event === undefined ? undefined : memoryForAttack(event, beat);
    const kind = cardSoundKindOf(memory?.practiceVoicingOverride);
    const inScope = beat !== undefined && dockTargets.some((card) => card.beat === beat && card !== dockCard);
    // P25-16 review 3: a card whose shape had to fall back carries 「代わり」, with the band's notice words.
    let fallback: string | undefined;
    if (event !== undefined && kind === "shape") {
      const options = cardShapeMarkOf(memory?.practiceVoicingOverride, event.chord).options;
      const built = options.shape === "basic" ? undefined : buildShapeVoicing(event.chord, options as VoicingShapeOptions);
      if (built?.used === "legacy") fallback = "このコードは形で作れないので、今までの作り方の音で鳴らしています";
      else if (built?.fellBack) fallback = `${displayChordLabel(event.canonical)} は ${SHAPE_LABEL[options.shape]} にできないので、${usedShapeName(built.used)} で鳴らしています`;
    }
    return {
      ...(own?.degree ? { degree: own.degree } : {}),
      ...(own?.role ? { role: own.role } : {}),
      ...(event ? { name: displayChordLabel(event.canonical) } : {}),
      ...(event ? { dots: { notes: textPreviewNotes(event.chord, memory), color: CARD_DOT_COLOR[kind ?? "shape"], title: CARD_DOT_TITLE[kind ?? "shape"] } } : {}),
      ...(inScope ? { inScope: true } : {}),
      ...(fallback ? { fallback } : {}),
    };
  };
  /** P25-03 C1: the band under the two faces (or its one closed line). P25-16 N3: it rises in and sinks out; while
   *  it sinks it keeps the last card it showed, and the closed line comes back once it has gone. Choosing another
   *  card only changes what is inside. */
  const shownDock = dockCard === undefined ? undefined : renderDock(dockCard) as ReactElement<TextCardDockProps>;
  if (shownDock) lastDock.current = shownDock;
  const dockBand = draftActive || dockCards.length === 0 ? null
    // V14: while 「鍵盤で入れる」 is on the whole place folds away the same way, so the input does not jump first.
    : <Presence show={!keyboardOn} exitMs={140}>{(place) => (
      <div className="lv-text-rise-slot" data-presence={place.state} onTransitionEnd={place.onTransitionEnd} data-testid="text-card-dock-place">
        {/* The wrappers let a row fold below the part's own fixed height and padding (text-intake.css). */}
        <Presence show={shownDock !== undefined} exitMs={140} after={<div className="lv-text-rise-clip"><TextCardDockClosed /></div>}>
          {(presence) => (
            // V14: the row grows with the rise, so the faces above shrink at the same time (text-intake.css).
            <div className="lv-text-rise-slot" data-presence={presence.state} data-testid="text-card-dock-slot">
              <div className="lv-text-rise-floor" aria-hidden="true" />
              {cloneElement((shownDock ?? lastDock.current)!, { presence })}
            </div>
          )}
        </Presence>
      </div>
    )}</Presence>;
  return (
    <TextCaptureShell dialect={dialect} draftActive={draftActive}>
      <Presence show={suggestionOpen} exitMs={120}>{(presence) => suggestionAnchor === undefined ? null : (
        <NextChordPalette presence={presence} anchor={suggestionAnchor} suggestions={suggestionCandidates}
          keyLabel={suggestionKeyLabel} keyContext={suggestionKey === undefined ? "C major" : keyContextFor(suggestionKey)}
          keyChords={suggestionKeyChords} length={suggestionLength}
          onLength={(value) => { setSuggestionPinned(true); setSuggestionLength(value); }} canUndo={dockHistorySize > 0} onUndo={undoDock}
          onClose={() => closeSuggestions()} onPreview={previewSuggestion} onAdd={addSuggestion} rejected={suggestionRejected} />
      )}</Presence>
      <div className="lv-text-intake-shell overflow-hidden bg-[var(--lv-surface)]" data-testid="standard-text-intake">
      <div className="lv-text-capture-toolbar lv-text-topbar" data-testid="text-capture-toolbar">
        <section className="lv-text-topgroup" aria-label="読み方の設定">
          <span className="lv-text-toplabel">{"読み方の設定"}</span>
          <TextMeterSelect testId="text-progression-meter" value={meter} options={METER_OPTIONS} disabled={disabled}
            onChange={chooseMeter} />
          <TextKeySelect testId="text-progression-key" value={keySelectValue} disabled={disabled}
            allowAuto autoLabel={autoKeyLabel}
            onChange={chooseKeyChoice} />
          <div className="lv-text-toolbar-bpm">
            <BpmScrubField idPrefix="text-progression-bpm" inputTestId="text-progression-bpm"
              label="BPM" labelStyle={{ fontSize: 11, fontWeight: 400, color: "#7f90aa" }}
              disabled={disabled} emptyWhenUnset={explicitBpm === undefined}
              unsetPlaceholder={String(globalBpm)}
              dragLabel={"上下にドラッグしてBPMを変更"}
              value={explicitBpm ?? globalBpm}
              onChange={value => { if (transportState.status === "stopped") onStop();
                setMatchGlobalBpm(false); setBpmInput(String(value)); }}
              onExplicitInput={value => { if (transportState.status === "stopped") onStop();
                setMatchGlobalBpm(false); setBpmInput(String(value)); }} />
            {explicitBpm === undefined ? null : (
              <button type="button" className="lv-text-bpm-match" aria-pressed={matchGlobalBpm}
                aria-label={matchGlobalBpm ? "曲の BPM に戻す" : "共通の BPM に合わせる"}
                title={matchGlobalBpm ? `曲の BPM（${explicitBpm}）で鳴らす` : `上の帯の共通 BPM（${globalBpm}）で鳴らす。保存する BPM は変わりません`}
                data-testid="text-match-global-bpm" onClick={() => setMatchGlobalBpm(value => !value)}>
                {matchGlobalBpm ? "曲の BPM に戻す" : "共通の BPM に合わせる"}
              </button>
            )}
          </div>
        </section>
        <section className="lv-text-topgroup" aria-label="試聴">
          <span className="lv-text-toplabel">{"試聴"}</span>
          <TextTransportBar transport={transport} state={transportState}
            snapshot={playbackSnapshot} disabled={disabled || (transportState.status === "stopped" && !result.canConvert)}
            sourceMatches={transportState.snapshot?.sourceText === undefined || transportState.snapshot.sourceText === input} />
        </section>
        <div className="lv-text-top-help" ref={helpRef}>
          <button type="button" className="lv-text-help-button" data-testid="text-help" aria-expanded={helpOpen}
            aria-label="使い方とショートカット" title="使い方とショートカット" onClick={() => setHelpOpen(open => !open)}>{"?"}</button>
          <Presence show={helpOpen} exitMs={120}>{(presence) => createPortal(
            <div className="lv-text-help-face lv-motion-pop" role="dialog" aria-label="使い方とショートカット" data-testid="text-help-face"
              data-presence={presence.state} onTransitionEnd={presence.onTransitionEnd}
              style={{ transformOrigin: "top right", ...(helpPlacement === undefined ? {}
                : { position: "fixed", top: helpPlacement.top, right: helpPlacement.right, left: "auto", height: helpPlacement.height, maxHeight: helpPlacement.height }) }}>
              <div className="lv-text-help-section">
                <h3 className="lv-text-help-title">{"書き方"}</h3>
                <TextHelpWritingTable />
              </div>
              <div className="lv-text-help-section">
                <h3 className="lv-text-help-title">{"カードの音を直す"}</h3>
                <TextHelpKeyList rows={CARD_EDIT_KEY_ROWS} />
                <p className="lv-text-help-line lv-text-help-note">{"鍵盤を押すと、音を足す・外す。"}</p>
              </div>
              <div className="lv-text-help-section">
                <h3 className="lv-text-help-title">{"鍵盤で入れる"}</h3>
                <TextHelpKeyList rows={KEYBOARD_ENTRY_KEY_ROWS} />
              </div>
            </div>,
            document.body,
          )}</Presence>
        </div>
      </div>
      {normalizeBand}
      <TextUnifiedWorkspace input={input} result={result} unified={unified} disabled={disabled}
        editorSelection={editorSelection.current}
        onEditorSelection={(start, end) => { editorSelection.current = { start, end }; }}
        transport={transport} transportState={transportState}
        harmonyFor={harmonyFor}
        {...(dockCard?.event === undefined ? {} : { selectedSourceStart: dockCard.event.range.start })}
        selectedCardStart={dockCard?.start}
        onSelectCardStart={selectDockCardStart}
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
        keyboardBand={<Presence show={keyboardOn} exitMs={140}>{(presence) => (
          // V20: it rises in like the card band, while the input above shrinks (text-intake.css).
          <div className="lv-text-rise-slot" data-presence={presence.state} data-testid="keyboard-entry-slot">
            <div className="lv-text-rise-clip"><KeyboardEntryBand connected={midiView.connected}
              {...(midiView.deviceName === undefined ? {} : { deviceName: midiView.deviceName })}
              onConnect={(anchor) => openMidiPanel(anchor ?? undefined)}
              heldNotes={heldChord?.notes ?? held}
              {...(heldChord?.chord === undefined ? {} : { chordName: displayChordLabel(heldChord.chord.label) })}
              {...(heldHarmony?.degree === undefined ? {} : { degree: heldHarmony.degree })}
              {...(heldHarmony?.role === undefined ? {} : { roleColor: roleColorOf(heldHarmony.role) })}
              length={keyboardLength} lengths={keyboardLengths}
              onLength={(value) => { setKeyboardLength(value); }}
              onRepeat={repeatKeyboard} repeatEnabled={repeatSource !== undefined}
              onRest={() => commitKeyboardSlot({ kind: "rest", beats: keyboardLengthInBeats(keyboardLength, unified.beatsPerBar) })}
              onUndo={undoKeyboard} undoEnabled={keyboardUndoEnabled}
              onClose={() => { if (keyboardOn) toggleKeyboard(); }} presence={presence} /></div>
          </div>
        )}</Presence>}
        {...(pendingText === undefined ? {} : { pendingText })}
        pendingCards={pendingCards}
        {...(selectedPending === undefined ? {} : { selectedPendingIndex: selectedPending })}
        onSelectPending={(index) => { setSelectedPending(index); setSelectedEventKey(undefined); }}
        {...(suggestionVisible ? {
          suggestion: {
            number: unified.bars.length + 1,
            open: suggestionOpen,
            beatsPerBar: unified.beatsPerBar,
            pending: suggestionBar.slots.map((slot) => ({
              label: slot.kind === "rest" ? "_" : slot.chord?.label ?? "",
              beats: slot.beats,
              ...(slot.kind === "rest" ? { rest: true } : {}),
            })),
            onOpen: openSuggestions,
            onContextMenu: (event) => { const rect = event.currentTarget.getBoundingClientRect(); openSuggestions(rect); },
          },
        } : {})}
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
          dockHistory.current = []; setDockHistorySize(0);
          setSaved(false); saveBtn.reset(); setSaveFailed(false); setInput(value); }} onSelectEvent={selectEvent}
        onCardHover={setHoveredCardStart}
        onCardMenu={(start, x, y) => setCardMenu({ start, x, y })}
        onSeekBar={bar => transport.seek((bar - 1) * unified.beatsPerBar)} />
      {dockBand}
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
          {restOnly ? (
            <span data-testid="text-save-rest-only" style={{ fontSize: 12, color: "#a5b2c6", whiteSpace: "nowrap" }}>
              {"コードのない進行です(休符だけ)"}
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

/** P24-06: the state 「1 つ戻す」 restores (the text as it was, and the open bar as it was). */
interface KeyboardSnapshot {
  readonly text: string;
  readonly bar: KeyboardBar;
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
