// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { AnalysisSession } from "../../domain/midi/preAnalysis/types";
import type { ProgressionBlockCandidate } from "../../domain/types";
import { sourceBasslineAnalysisAuthority } from "../../domain/sourceBassline";
import { useWorkspaceBassline } from "./workspaceBassline";

/**
 * P10.0-07: the source-bassline save integration, rewritten for the correction
 * workspace (it was the old candidate card's). Same synthetic session, same rule:
 * a snapshot only after an explicit Voice, range and opt-in, reset for another range.
 */

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
afterEach(() => host?.remove());

const candidate = (id: string, label = "Cmaj7"): ProgressionBlockCandidate => ({
  id,
  startBar: 1,
  endBar: 2,
  lengthBars: 2,
  chords: [{
    bar: 1,
    beat: 1,
    durationBeats: 4,
    chord: { root: 0, quality: "maj7", tensions: [], label },
    confidence: 1,
    alternatives: [],
    warnings: [],
  }],
  summaryText: "Synthetic",
  confidence: 1,
  labels: [],
  warnings: [],
});

function session(withBass = true): AnalysisSession {
  return {
    id: "session",
    masterSourceId: "source",
    sources: [{ id: "source", displayName: "Synthetic", smfType: 1, ppq: 480, durationBeats: 8, durationTick: 3840, tempoMap: [{ beat: 0, bpm: 120 }], timeSignatures: [{ beat: 0, numerator: 4, denominator: 4 }], bytes: new Uint8Array(), visible: true, muted: false }],
    voices: withBass ? [{ id: "bass", sourceId: "source", trackIndex: 0, channel: 0, programNumbers: [33], displayName: "Bass candidate", hasProgramChanges: false, isDrum: false, noteCount: 2, autoRole: "bass", autoRoleConfidence: 1, assignedRole: "bass", included: true, visible: true, muted: false, solo: false }] : [],
    notes: withBass ? [
      { sourceId: "source", voiceId: "bass", trackIndex: 0, channel: 0, pitch: 36, velocity: 0.8, startBeat: 0, durationBeats: 1, startTick: 0, durationTick: 480, ticksPerQuarter: 480 },
      { sourceId: "source", voiceId: "bass", trackIndex: 0, channel: 0, pitch: 38, velocity: 0.8, startBeat: 7, durationBeats: 1, startTick: 3360, durationTick: 480, ticksPerQuarter: 480 },
    ] : [],
    controlChanges: [],
    preset: "custom",
    warnings: [],
  };
}

type Bassline = ReturnType<typeof useWorkspaceBassline>;

describe("workspace source bassline (P10.0-07, was the capture card integration)", () => {
  it("gives a snapshot only after explicit Voice, range and opt-in, and resets it for another range", async () => {
    host = document.createElement("div");
    document.body.append(host);
    const analysisSession = session();
    const fingerprint = sourceBasslineAnalysisAuthority(analysisSession);
    if (!fingerprint) throw new Error("Synthetic analysis authority is required.");
    let latest: Bassline | undefined;
    function Harness({ range }: { range: ProgressionBlockCandidate }) {
      const bassline = useWorkspaceBassline(analysisSession, fingerprint, 4);
      latest = bassline;
      return <div>{bassline.panel(range)}</div>;
    }
    const root = createRoot(host);
    const first = candidate("range-1");
    await act(async () => root.render(<Harness range={first} />));
    const panel = () => host.querySelector('[data-testid="source-bassline-capture-panel"]')!;
    const selects = () => panel().querySelectorAll<HTMLSelectElement>("select");
    const optIn = () => panel().querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(selects()[0]!.value).toBe("");
    expect(optIn().checked).toBe(false);
    expect(latest!.forSave(first)).toBeUndefined();

    await act(async () => {
      selects()[0]!.value = "bass";
      selects()[0]!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const rangeOption = [...selects()[1]!.options].find((option) => option.value !== "")!;
    await act(async () => {
      selects()[1]!.value = rangeOption.value;
      selects()[1]!.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => optIn().click());
    expect(optIn().checked).toBe(true);
    const stored = latest!.forSave(first);
    expect(stored?.sourceKind).toBe("selected-bass-voice");
    expect(stored?.notes).toHaveLength(2);
    expect(JSON.stringify(stored)).not.toMatch(/voiceId|sourceId|displayName|path|filename|device|bytes/i);

    // Another range (other chords): the opt-in does not carry over.
    const second = candidate("range-2", "Am7");
    await act(async () => root.render(<Harness range={second} />));
    expect(optIn().checked).toBe(false);
    expect(latest!.forSave(second)).toBeUndefined();
    await act(async () => root.unmount());
  });

  it("shows nothing when the song has no bass part to keep", async () => {
    host = document.createElement("div");
    document.body.append(host);
    function Harness() {
      const bassline = useWorkspaceBassline(session(false), "fingerprint", 4);
      return <div>{bassline.panel(candidate("range-1"))}</div>;
    }
    const root = createRoot(host);
    await act(async () => root.render(<Harness />));
    expect(host.querySelector('[data-testid="source-bassline-capture-panel"]')).toBeNull();
    await act(async () => root.unmount());
  });
});
