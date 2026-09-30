import type { PreviewSound } from "../../audio/chordPreview";
import type { PlaybackController } from "../../audio/playbackController";
import type { ToastFn } from "../../components/notifications";
import { beatsPerBar as beatsPerBarFor } from "../../domain/midi";
import type { ManualCandidateDraft } from "../../domain/midi/manualDraft";
import {
  draftHasMidiSourcePreview,
  draftPreviewTimeline,
  draftSourcePreviewTimeline,
} from "../../domain/midi/manualDraftPlayback";
import type { CandidateOccurrence } from "../../domain/midi/occurrence";
import type { MidiProgressionAnalysis, ProgressionBlockCandidate } from "../../domain/types";
import { usePlaybackState } from "../../hooks/usePlaybackState";
import type { AppCopy } from "../../i18n";
import { captureCandidateSource, singleChordVoicing } from "./captureRuntime";

/**
 * Capture auditions: a draft (edited or from the source MIDI), a candidate, one
 * occurrence, one chord, and the playback state they share. Moved out of
 * CaptureView unchanged (P10.0-02). Text-capture previews stay in CaptureView.
 */
export function useCapturePlayback({
  controller,
  result,
  previewSound,
  setToast,
  copy,
}: {
  controller: PlaybackController;
  result: MidiProgressionAnalysis | undefined;
  previewSound: PreviewSound;
  setToast: ToastFn;
  copy: AppCopy;
}) {
  const capturePlayback = usePlaybackState(controller);

  /**
   * Auditions a manual draft.
   *
   * Plays the same event list the save path stores, so what the user hears
   * before saving is what they get afterwards. Voicings resolve by the product's
   * existing rule: the captured one where it still fits the chord, a generated
   * one where an edit made it no longer fit.
   */
  async function previewManualDraft(draft: ManualCandidateDraft) {
    try {
      await controller.toggle(
        { kind: "capture", id: `capture-manual-draft:${draft.draftId}` },
        {
          type: "timeline",
          timeline: draftPreviewTimeline(draft),
          bpm: result?.bpm ?? 96,
          sound: previewSound,
          beatsPerBar: beatsPerBarFor(result?.timeSignature),
        },
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed, "error");
    }
  }

  async function previewCandidate(candidate: ProgressionBlockCandidate) {
    try {
      await controller.toggle(
        captureCandidateSource(result, candidate.id),
        {
          type: "timeline",
          timeline: candidate.chords,
          bpm: result?.bpm,
          sound: previewSound,
          beatsPerBar: beatsPerBarFor(result?.timeSignature),
        },
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed, "error");
    }
  }

  /**
   * Auditions one appearance of a progression.
   *
   * Plays that occurrence's own events, so the second chorus sounds like the
   * second chorus rather than replaying the one the card happens to show.
   */
  async function previewOccurrence(occurrence: CandidateOccurrence) {
    try {
      await controller.toggle(
        { kind: "capture", id: `capture-occurrence:${occurrence.id}` },
        {
          type: "timeline",
          timeline: occurrence.events.map((event) => event.source),
          bpm: result?.bpm ?? 96,
          sound: previewSound,
          beatsPerBar: beatsPerBarFor(result?.timeSignature),
        },
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed, "error");
    }
  }

  async function previewCandidateChord(candidate: ProgressionBlockCandidate, chordIndex: number) {
    try {
      const event = candidate.chords[chordIndex];
      const chord = event?.chord;
      if (chord) {
        await controller.toggle(
          {
            kind: "capture",
            id: `${captureCandidateSource(result, candidate.id).id}:chord:${chordIndex}:${chord.label}`,
          },
          {
            type: "chord",
            chord,
            sound: previewSound,
            explicitMidiNotes: singleChordVoicing(event),
          },
        );
      }
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed, "error");
    }
  }

  async function previewSourceDraft(draft: ManualCandidateDraft) {
    if (!draftHasMidiSourcePreview(draft)) return;
    try {
      await controller.toggle(
        { kind: "capture", id: `capture-draft-source:${draft.draftId}` },
        {
          type: "timeline",
          timeline: draftSourcePreviewTimeline(draft),
          bpm: result?.bpm ?? 96,
          sound: previewSound,
          beatsPerBar: beatsPerBarFor(result?.timeSignature),
        },
      );
    } catch (error) {
      setToast(error instanceof Error ? error.message : copy.toast.chordPreviewFailed, "error");
    }
  }

  return {
    capturePlayback,
    previewManualDraft,
    previewCandidate,
    previewOccurrence,
    previewCandidateChord,
    previewSourceDraft,
  };
}
