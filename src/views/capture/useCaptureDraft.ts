import { useEffect, useMemo, useRef, useState } from "react";
import { beatsPerBar as beatsPerBarFor, type AnalysisSession } from "../../domain/midi";
import {
  createDraftFromCandidate,
  fingerprintTimeline,
  type ManualCandidateDraft,
} from "../../domain/midi/manualDraft";
import { draftToCandidate } from "../../domain/midi/manualDraftEditing";
import {
  assessManualSourceBasslineCapture,
  sourceBasslineAuthorizationKey,
  sourceBasslineCandidateVoices,
  type SourceBasslineSnapshotV1,
} from "../../domain/sourceBassline";
import { selectInitialTimelineCandidate } from "../../domain/timelineCandidateGrouping";
import type { AnalysisState } from "../../store/vaultStore";
import { captureAnalysisIdentity, type CaptureAnalysisProgressStage } from "./captureRuntime";

/**
 * The capture Draft: the active draft, its first value after each analysis, and
 * the manual-range source-bassline choice that belongs to it. Moved out of
 * CaptureView unchanged (P10.0-02). Undo/redo stay the Draft's own functions.
 */
export function useCaptureDraft({
  analysis,
  analysisProgress,
  analysisRunGeneration,
  preAnalysisSession,
}: {
  analysis: AnalysisState;
  analysisProgress: CaptureAnalysisProgressStage | undefined;
  analysisRunGeneration: number;
  preAnalysisSession: AnalysisSession | undefined;
}) {
  const result = analysis.result;
  const [activeDraft, setActiveDraft] = useState<ManualCandidateDraft | null>(null);
  const [manualSourceBasslineVoiceId, setManualSourceBasslineVoiceId] = useState("");
  const [manualSourceBasslineRangeKey, setManualSourceBasslineRangeKey] = useState("");
  const [manualSourceBasslineAuthorization, setManualSourceBasslineAuthorization] = useState("");
  const manualSourceBasslineDraftKeyRef = useRef("");
  const manualSourceBasslineSessionRef = useRef(preAnalysisSession);
  const analysisDatasetKey = result
    ? `${captureAnalysisIdentity(result)}:${analysisRunGeneration}`
    : undefined;
  const initializedAnalysisDatasetKeyRef = useRef<string>();
  const activeDraftDatasetKeyRef = useRef<string>();
  useEffect(() => {
    if (analysisProgress === "reading" || analysisProgress === "analyzing") return;
    if (analysis.status !== "done" || !result || analysisDatasetKey === undefined) {
      initializedAnalysisDatasetKeyRef.current = undefined;
      setActiveDraft(null);
      activeDraftDatasetKeyRef.current = undefined;
      return;
    }
    if (initializedAnalysisDatasetKeyRef.current === analysisDatasetKey) return;
    initializedAnalysisDatasetKeyRef.current = analysisDatasetKey;

    const initialCandidate = selectInitialTimelineCandidate(result.blockCandidates);
    const initialMeter = beatsPerBarFor(result.timeSignature);
    const initialDraft = initialCandidate === undefined
      ? null
      : createDraftFromCandidate({
          candidate: initialCandidate,
          timelineFingerprint: fingerprintTimeline(result.fullTimeline, initialMeter),
          beatsPerBar: initialMeter,
        });
    const previousDatasetKey = activeDraftDatasetKeyRef.current;
    activeDraftDatasetKeyRef.current = analysisDatasetKey;
    setActiveDraft((current) => (
      previousDatasetKey === analysisDatasetKey ? current : initialDraft
    ));
  }, [analysis.status, analysisDatasetKey, analysisProgress, result]);
  const manualSourceBasslineCandidate = useMemo(() => (
    activeDraft?.source.type === "manual-range" ? draftToCandidate(activeDraft) : undefined
  ), [activeDraft]);
  const manualSourceBasslineVoices = useMemo(
    () => sourceBasslineCandidateVoices(preAnalysisSession),
    [preAnalysisSession],
  );
  const manualSourceBasslineAssessment = useMemo(() => {
    if (!manualSourceBasslineCandidate || activeDraft?.source.type !== "manual-range") return undefined;
    return assessManualSourceBasslineCapture(
      preAnalysisSession,
      manualSourceBasslineCandidate,
      activeDraft.selectedRange,
      activeDraft.beatsPerBar,
      manualSourceBasslineVoiceId,
      result?.sourceFingerprint,
    );
  }, [
    activeDraft,
    manualSourceBasslineCandidate,
    manualSourceBasslineVoiceId,
    preAnalysisSession,
    result?.sourceFingerprint,
  ]);
  const manualSourceBasslineCurrentAuthorization = manualSourceBasslineCandidate
    ? sourceBasslineAuthorizationKey(
        manualSourceBasslineCandidate,
        manualSourceBasslineVoiceId,
        result?.sourceFingerprint,
      )
    : "";
  const manualSourceBasslineRangeSelected = manualSourceBasslineAssessment !== undefined
    && manualSourceBasslineRangeKey === manualSourceBasslineAssessment.rangeKey;
  const manualSourceBasslineOptedIn = manualSourceBasslineAuthorization !== ""
    && manualSourceBasslineAuthorization === manualSourceBasslineCurrentAuthorization;
  const manualSourceBasslineContextKey = manualSourceBasslineCandidate
    ? `${sourceBasslineAuthorizationKey(
        manualSourceBasslineCandidate,
        "",
        result?.sourceFingerprint,
      )}:${analysisRunGeneration}`
    : `none:${analysisRunGeneration}`;
  const manualSourceBasslineContextKeyRef = useRef(manualSourceBasslineContextKey);
  useEffect(() => {
    if (manualSourceBasslineContextKeyRef.current === manualSourceBasslineContextKey) return;
    manualSourceBasslineContextKeyRef.current = manualSourceBasslineContextKey;
    setManualSourceBasslineVoiceId("");
    setManualSourceBasslineRangeKey("");
    setManualSourceBasslineAuthorization("");
  }, [manualSourceBasslineContextKey]);
  useEffect(() => {
    if (manualSourceBasslineSessionRef.current === preAnalysisSession) return;
    manualSourceBasslineSessionRef.current = preAnalysisSession;
    setManualSourceBasslineVoiceId("");
    setManualSourceBasslineRangeKey("");
    setManualSourceBasslineAuthorization("");
  }, [preAnalysisSession]);

  useEffect(() => {
    const nextDraftKey = activeDraft?.source.type === "manual-range"
      ? `${activeDraft.draftId}:${manualSourceBasslineAssessment?.rangeKey ?? ""}`
      : "";
    if (manualSourceBasslineDraftKeyRef.current === nextDraftKey) return;
    manualSourceBasslineDraftKeyRef.current = nextDraftKey;
    setManualSourceBasslineVoiceId("");
    setManualSourceBasslineRangeKey("");
    setManualSourceBasslineAuthorization("");
  }, [activeDraft, manualSourceBasslineAssessment?.rangeKey]);


  function resetManualSourceBassline() {
    setManualSourceBasslineVoiceId("");
    setManualSourceBasslineRangeKey("");
    setManualSourceBasslineAuthorization("");
  }

  function manualSourceBasslineForSave(): SourceBasslineSnapshotV1 | undefined | null {
    if (!manualSourceBasslineOptedIn) return undefined;
    if (manualSourceBasslineRangeSelected && manualSourceBasslineAssessment?.snapshot) {
      return manualSourceBasslineAssessment.snapshot;
    }
    return globalThis.confirm("元ベースラインを付けられません。コード進行だけを保存しますか？")
      ? undefined
      : null;
  }

  return {
    activeDraft,
    setActiveDraft,
    manualSourceBasslineVoiceId,
    setManualSourceBasslineVoiceId,
    setManualSourceBasslineRangeKey,
    setManualSourceBasslineAuthorization,
    manualSourceBasslineVoices,
    manualSourceBasslineAssessment,
    manualSourceBasslineCurrentAuthorization,
    manualSourceBasslineRangeSelected,
    manualSourceBasslineOptedIn,
    resetManualSourceBassline,
    manualSourceBasslineForSave,
  };
}
