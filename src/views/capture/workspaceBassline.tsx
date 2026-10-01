import { useMemo, useState } from "react";
import { SourceBasslineCapturePanel } from "../../components/capture/SourceBasslineCapturePanel";
import type { AnalysisSession } from "../../domain/midi";
import {
  assessManualSourceBasslineCapture,
  sourceBasslineAuthorizationKey,
  sourceBasslineCandidateVoices,
  type SourceBasslineSnapshotV1,
} from "../../domain/sourceBassline";
import type { ProgressionBlockCandidate } from "../../domain/types";

/**
 * 元ベースライン for a workspace range (spec v2.4 §10.2): the same assessment and
 * opt-in as the manual range on the old screen, keyed to the range's candidate so
 * a choice made for one range never rides along with another.
 */
export function useWorkspaceBassline(session: AnalysisSession | undefined, fingerprint: string | undefined, beatsPerBar: number) {
  const voices = useMemo(() => sourceBasslineCandidateVoices(session), [session]);
  const [voiceId, setVoiceId] = useState("");
  const [rangeKey, setRangeKey] = useState("");
  const [authorization, setAuthorization] = useState("");

  const state = (candidate: ProgressionBlockCandidate) => {
    const assessment = assessManualSourceBasslineCapture(session, candidate, { startBeat: 1, endBeat: beatsPerBar }, beatsPerBar, voiceId, fingerprint);
    const authorizationKey = sourceBasslineAuthorizationKey(candidate, voiceId, fingerprint);
    return {
      assessment,
      authorizationKey,
      rangeSelected: rangeKey === assessment.rangeKey,
      optedIn: authorization !== "" && authorization === authorizationKey,
    };
  };

  function panel(candidate: ProgressionBlockCandidate) {
    if (!voices.length) return null;
    const current = state(candidate);
    return (
      <SourceBasslineCapturePanel
        voices={voices}
        selectedVoiceId={voiceId}
        assessment={current.assessment}
        rangeSelected={current.rangeSelected}
        optedIn={current.optedIn}
        onVoiceChange={(next) => { setVoiceId(next); setRangeKey(""); setAuthorization(""); }}
        onRangeChange={(selected) => { setRangeKey(selected ? current.assessment.rangeKey : ""); setAuthorization(""); }}
        onOptInChange={(enabled) => setAuthorization(enabled ? current.authorizationKey : "")}
      />
    );
  }

  /** undefined = save without it; null = the person cancelled. */
  function forSave(candidate: ProgressionBlockCandidate): SourceBasslineSnapshotV1 | undefined | null {
    const current = state(candidate);
    if (!current.optedIn) return undefined;
    if (current.rangeSelected && current.assessment.snapshot) return current.assessment.snapshot;
    return globalThis.confirm("元ベースラインを付けられません。コード進行だけを保存しますか？") ? undefined : null;
  }

  return { panel, forSave };
}
