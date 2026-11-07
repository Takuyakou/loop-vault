import { writeMidi } from "midi-file";
import { describe, expect, it } from "vitest";
import {
  applyAnalysisSessionPreset,
  buildSessionAnalysisRequest,
  isBackwardEquivalentSession,
  resetAnalysisSessionAuto,
  createAnalysisSession,
  updateAnalysisSessionVoice,
  type AnalysisSession,
} from "../../domain/midi/preAnalysis";
import {
  analyzedVoiceCount,
  isAnalyzedVoice,
  isAutoVoice,
  partName,
  roleValue,
  sessionSummary,
  voiceRoleView,
} from "./sessionView";

function session(): AnalysisSession {
  const events = [0, 1, 2, 9].flatMap((channel, index) => [
    { deltaTime: 0, type: "programChange" as const, channel, programNumber: [0, 32, 80, 0][index]! },
    { deltaTime: 0, type: "noteOn" as const, channel, noteNumber: channel === 9 ? 36 : 48 + index * 7, velocity: 100 },
    { deltaTime: 480, type: "noteOff" as const, channel, noteNumber: channel === 9 ? 36 : 48 + index * 7, velocity: 0 },
  ]);
  const bytes = Uint8Array.from(writeMidi({
    header: { format: 0, numTracks: 1, ticksPerBeat: 480 },
    tracks: [[...events, { deltaTime: 0, meta: true as const, type: "endOfTrack" as const }]],
  }));
  return createAnalysisSession([{ sourceId: "s", displayName: "s.mid", bytes }]).session!;
}

describe("sessionView", () => {
  it("picks the same parts as the analysis input does, in every preset and after manual edits", () => {
    const base = session();
    const variants: AnalysisSession[] = [
      base,
      ...(["harmony-bass", "accompaniment-only", "all-pitched", "custom"] as const)
        .map((preset) => applyAnalysisSessionPreset(base, preset)),
      updateAnalysisSessionVoice(base, base.voices[0]!.id, { assignedRole: "exclude", included: true }),
      updateAnalysisSessionVoice(base, base.voices[1]!.id, { assignedRole: "melody-weak", included: true }),
      updateAnalysisSessionVoice(base, base.voices[2]!.id, { included: false }),
    ];
    for (const variant of variants) {
      const forced = { ...variant, voiceContributionPreset: "harmonic-core" as const };
      const expected = analyzedVoiceCount(variant) === 0
        ? []
        : buildSessionAnalysisRequest(forced).selectedVoiceIds;
      expect(variant.voices.filter(isAnalyzedVoice).map((voice) => voice.id)).toEqual(expected);
    }
  });

  it("maps the four buttons to the old role values and back", () => {
    expect(roleValue("chord")).toBe("harmony");
    expect(roleValue("bass")).toBe("bass");
    expect(roleValue("melody")).toBe("melody-weak");
    expect(roleValue("off")).toBe("exclude");
    const base = session();
    const voice = base.voices.find((entry) => !entry.isDrum)!;
    expect(voiceRoleView({ ...voice, assignedRole: "harmony", included: true })).toBe("chord");
    expect(voiceRoleView({ ...voice, assignedRole: "bass", included: true })).toBe("bass");
    expect(voiceRoleView({ ...voice, assignedRole: "melody-weak", included: true })).toBe("melody");
    expect(voiceRoleView({ ...voice, assignedRole: "harmony", included: false })).toBe("off");
    expect(voiceRoleView(base.voices.find((entry) => entry.isDrum)!)).toBe("off");
  });

  it("calls a part 「自動」 only while it is the app's own proposal", () => {
    const base = session();
    expect(base.voices.every(isAutoVoice)).toBe(true);
    const voice = base.voices.find((entry) => !entry.isDrum)!;
    const changed = updateAnalysisSessionVoice(base, voice.id, { included: false });
    expect(isAutoVoice(changed.voices.find((entry) => entry.id === voice.id)!)).toBe(false);
    expect(base.voices.every(isAutoVoice)).toBe(true);
  });

  it("summarises by role and names parts track name → instrument → パート n", () => {
    const base = session();
    const groups = sessionSummary(base);
    expect(groups.flatMap((group) => group.names)).toHaveLength(base.voices.length);
    expect(groups.find((group) => group.role === "off")?.names).toContain("ドラム");
    const voice = base.voices[0]!;
    expect(partName({ ...voice, trackName: " Keys " }, 3)).toBe("Keys");
    expect(partName({ ...voice, trackName: undefined, gmProgramName: "Piano" }, 3)).toBe("Piano");
    expect(partName({ ...voice, trackName: undefined, gmProgramName: undefined }, 3)).toBe("パート 3");
  });
  it("leaves the request exactly as before when nothing about the analysis is changed", () => {
    const base = session();
    const before = buildSessionAnalysisRequest(base);
    expect(before.backwardEquivalent).toBe(true);
    expect(before.options).toEqual({});
    // Listening, hiding and looking do not change what is analysed.
    let touched = updateAnalysisSessionVoice(base, base.voices[0]!.id, { solo: true, muted: true, visible: false });
    touched = updateAnalysisSessionVoice(touched, base.voices[1]!.id, { visible: false });
    expect(isBackwardEquivalentSession(touched)).toBe(true);
    expect(buildSessionAnalysisRequest(touched)).toEqual(before);
    // A role change, and the way back with 「自動の見立てに戻す」.
    const first = base.voices[0]!;
    const changed = updateAnalysisSessionVoice(base, first.id, {
      assignedRole: first.autoRole === "bass" ? "harmony" : "bass",
      included: true,
    });
    expect(isBackwardEquivalentSession(changed)).toBe(false);
    expect(buildSessionAnalysisRequest(resetAnalysisSessionAuto(changed))).toEqual(before);
  });
});
