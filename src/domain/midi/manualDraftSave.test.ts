import { describe, expect, it } from "vitest";
import { labelFromSymbol, makeChordSymbol, parseChordLabel } from "../chords";
import {
  createEmptyVault,
  type VaultBackup,
  type VaultLoadResult,
  type VaultRepository,
} from "../repository";
import type { VaultFile } from "../types";
import { vaultFileSchema } from "../schema";
import { normalizedChordKey } from "../voicing/normalizeVoicing";
import { replaceEditableChord } from "../progressionEditing/chordReplacement";
import { createVaultStore } from "../../store/vaultStore";
import type { ChordTimelineItem } from "../types";
import { buildCandidateCatalog } from "./candidateCatalog";
import { recommendPatterns } from "./candidateRecommendation";
import { buildOccurrences, groupIntoPatterns } from "./occurrence";
import { createManualDraft, type ManualCandidateDraft } from "./manualDraft";
import { applyEditableToDraft, draftEditable, draftToCandidate } from "./manualDraftEditing";
import {
  draftHasMidiSourcePreview,
  draftPreviewTimeline,
  draftSourcePreviewTimeline,
  draftVoicingSummary,
} from "./manualDraftPlayback";

/**
 * Saving a manual draft.
 *
 * Everything here goes through the store the rest of the app saves through, so
 * what is being checked is that a hand-made block is an ordinary saved
 * progression once it lands — not a second kind of thing that every consumer
 * would have to learn about.
 */
function chord(root: number, quality: Parameters<typeof makeChordSymbol>[1] = "maj7") {
  const symbol = makeChordSymbol(root, quality, []);
  return { ...symbol, label: labelFromSymbol(symbol) };
}

const TOTAL_BARS = 108;
const timeline: ChordTimelineItem[] = Array.from({ length: TOTAL_BARS }, (_unused, index) => ({
  bar: index + 1,
  beat: 1,
  durationBeats: 4,
  chord: chord((index * 5) % 12),
  confidence: 0.9,
  alternatives: [],
  warnings: [],
}));

function draftOf(startBar: number, endBar: number): ManualCandidateDraft {
  return createManualDraft({
    timeline,
    range: { startBar, startBeat: 1, endBar, endBeat: 4 },
    now: "2026-07-26T00:00:00.000Z",
  });
}

class FakeRepository implements VaultRepository {
  saved: VaultFile[] = [];
  async load(): Promise<VaultLoadResult> {
    return { vault: createEmptyVault(), quarantine: [], created: false };
  }
  async save(vault: VaultFile): Promise<void> { this.saved.push(vault); }
  async listBackups(): Promise<VaultBackup[]> { return []; }
  async restore(): Promise<VaultLoadResult> {
    return { vault: createEmptyVault(), quarantine: [], created: false };
  }
  async exportTo(): Promise<void> {}
  async importFrom(): Promise<VaultLoadResult> {
    return { vault: createEmptyVault(), quarantine: [], created: false };
  }
}

async function storeWithDraft(draft: ManualCandidateDraft) {
  const repository = new FakeRepository();
  const store = createVaultStore({ repository });
  await store.getState().initialize();
  const candidate = draftToCandidate(draft);
  const id = store.getState().createIdeaFromDraft({
    title: "手動候補",
    status: "idea",
    bpm: 96,
    key: "F major",
    chordMemo: candidate.summaryText,
    progressionBlock: candidate,
    progressionMetadata: { userEdited: true, userVerified: false },
  });
  await store.getState().flush();
  return { repository, store, id, candidate };
}

describe("saving a draft through the normal path", () => {
  it("lands as an ordinary saved progression block", async () => {
    const draft = draftOf(14, 32);
    const { store, id } = await storeWithDraft(draft);

    expect(id).toBeTruthy();
    const idea = store.getState().ideas.find((entry) => entry.id === id)!;
    expect(idea.progressionBlocks).toHaveLength(1);
    expect(idea.progressionBlocks![0].chords).toHaveLength(19);
    expect(idea.progressionBlocks![0].startBar).toBe(14);
    expect(idea.progressionBlocks![0].endBar).toBe(32);
  });

  it("keeps the chords the user heard", async () => {
    const draft = draftOf(14, 32);
    const { store, id } = await storeWithDraft(draft);
    const block = store.getState().ideas.find((entry) => entry.id === id)!.progressionBlocks![0];

    // The preview plays this same list, so before and after saving agree by
    // construction rather than by two code paths happening to match.
    expect(block.chords.map((item) => item.chord.label))
      .toEqual(draftPreviewTimeline(draft).map((item) => item.chord.label));
  });

  it("survives a save and reload without changing", async () => {
    const draft = draftOf(87, 108);
    const { repository, store, id } = await storeWithDraft(draft);
    const before = store.getState().ideas.find((entry) => entry.id === id)!.progressionBlocks![0];

    const written = repository.saved[repository.saved.length - 1];
    const reparsed = vaultFileSchema.parse(JSON.parse(JSON.stringify(written)));
    const after = reparsed.ideas.find((entry) => entry.id === id)!.progressionBlocks![0];

    expect(after.chords.map((item) => item.chord.label))
      .toEqual(before.chords.map((item) => item.chord.label));
    expect(after.startBar).toBe(87);
    expect(after.endBar).toBe(108);
  });

  it("writes fileVersion 1 and nothing else", async () => {
    const { repository } = await storeWithDraft(draftOf(14, 32));
    const written = repository.saved[repository.saved.length - 1];

    expect(written.fileVersion).toBe(1);
    expect(() => vaultFileSchema.parse(JSON.parse(JSON.stringify(written)))).not.toThrow();
  });

  it("saves the edited chords rather than the detected ones", async () => {
    const draft = draftOf(14, 17);
    const editable = draftEditable(draft);
    const edited = applyEditableToDraft(
      draft,
      replaceEditableChord(editable, editable.slots[1].id, parseChordLabel("C#m7b5")!, "manual-label"),
    );
    const { store, id } = await storeWithDraft(edited);
    const block = store.getState().ideas.find((entry) => entry.id === id)!.progressionBlocks![0];

    expect(block.chords[1].chord.label).toBe("C#m7b5");
  });

  it("is reachable as a saved block for anything that consumes them", async () => {
    // Practice, Mix and the detail view all read `progressionBlocks`. A manual
    // block being an ordinary member of that array is what makes it reachable
    // from all of them without any of them knowing it was hand-made.
    const { store, id } = await storeWithDraft(draftOf(14, 32));
    const idea = store.getState().ideas.find((entry) => entry.id === id)!;
    const block = idea.progressionBlocks![0];

    expect(block.id).toBeTruthy();
    expect(block.chords.every((item) => parseChordLabel(item.chord.label) !== null)).toBe(true);
    expect(block.chords.every((item) => item.durationBeats > 0)).toBe(true);
    expect(idea.bpm).toBe(96);
    expect(idea.key).toBe("F major");
  });
});

describe("voicing", () => {
  it("uses the captured voicing when it still fits", () => {
    const withVoicing: ChordTimelineItem[] = timeline.map((item) => ({
      ...item,
      voicingMemory: {
        sourceVoicing: {
          midiNotes: [48, 52, 55, 59],
          source: "midi-extracted",
          representation: "simultaneous-voicing",
          confidence: 0.95,
          userVerified: true,
          capturedAt: "2026-07-26T00:00:00.000Z",
          capturedForChordKey: normalizedChordKey(item.chord),
          schemaVersion: 1 as const,
        },
      },
    }));
    const draft = createManualDraft({
      timeline: withVoicing,
      range: { startBar: 1, startBeat: 1, endBar: 1, endBeat: 4 },
      now: "2026-07-26T00:00:00.000Z",
    });

    expect(draftVoicingSummary(draft).allFromSource).toBe(true);
  });

  it("falls back to a generated voicing once a chord is replaced", () => {
    const withVoicing: ChordTimelineItem[] = timeline.map((item) => ({
      ...item,
      voicingMemory: {
        sourceVoicing: {
          midiNotes: [48, 52, 55, 59],
          source: "midi-extracted",
          representation: "simultaneous-voicing",
          confidence: 0.95,
          userVerified: true,
          capturedAt: "2026-07-26T00:00:00.000Z",
          capturedForChordKey: normalizedChordKey(item.chord),
          schemaVersion: 1 as const,
        },
      },
    }));
    const draft = createManualDraft({
      timeline: withVoicing,
      range: { startBar: 1, startBeat: 1, endBar: 4, endBeat: 4 },
      now: "2026-07-26T00:00:00.000Z",
    });
    const editable = draftEditable(draft);
    const edited = applyEditableToDraft(
      draft,
      replaceEditableChord(editable, editable.slots[1].id, parseChordLabel("C#m7b5")!, "manual-label"),
    );

    // Replaying the old voicing under a new chord would have the user auditioning
    // a chord they no longer have.
    expect(draftVoicingSummary(edited).anyGenerated).toBe(true);
    expect(edited.events[1]?.source.voicingMemory).toBeUndefined();
  });

  it("keeps A as the MIDI source and B as the edited save timeline", () => {
    const withVoicing: ChordTimelineItem[] = timeline.map((item) => ({
      ...item,
      voicingMemory: {
        sourceVoicing: {
          midiNotes: [48, 52, 55, 59],
          source: "midi-extracted",
          representation: "simultaneous-voicing",
          capturedForChordKey: normalizedChordKey(item.chord),
          schemaVersion: 1 as const,
        },
      },
    }));
    const draft = createManualDraft({
      timeline: withVoicing,
      range: { startBar: 1, startBeat: 1, endBar: 4, endBeat: 4 },
      now: "2026-07-26T00:00:00.000Z",
    });
    const editable = draftEditable(draft);
    const edited = applyEditableToDraft(
      draft,
      replaceEditableChord(
        editable,
        editable.slots[1]!.id,
        parseChordLabel("C#m7b5")!,
        "manual-label",
      ),
    );

    expect(draftHasMidiSourcePreview(edited)).toBe(true);
    expect(draftSourcePreviewTimeline(edited)[1]?.chord.label)
      .toBe(draft.originalEvents[1]?.source.chord.label);
    expect(draftPreviewTimeline(edited)[1]?.chord.label).toBe("C#m7b5");
  });
});

describe("the automatic catalog is left alone", () => {
  it("does not gain the draft as a pattern", async () => {
    const occurrences = buildOccurrences(timeline, TOTAL_BARS, { beatsPerBar: 4 })
      .map((occurrence) => ({ ...occurrence, score: 0.7 }));
    const build = () => {
      const catalog = buildCandidateCatalog({
        patterns: groupIntoPatterns(occurrences),
        harmonicActiveBars: Array.from({ length: TOTAL_BARS }, (_u, index) => index + 1),
        qualityFloor: 0.35,
        rawWindowCount: occurrences.length,
      });
      return { catalog, recommendation: recommendPatterns(catalog) };
    };

    const before = build();
    await storeWithDraft(draftOf(14, 32));
    const after = build();

    expect(after.catalog.patterns.length).toBe(before.catalog.patterns.length);
    expect(JSON.stringify(after.recommendation)).toBe(JSON.stringify(before.recommendation));
  });

  it("is never subjected to the quality floor", () => {
    // The draft carries score 0, so putting it through the catalog would drop it.
    // The reason it survives is that it never goes there, not that the floor was
    // loosened for everything else.
    const draft = draftOf(14, 32);
    const catalog = buildCandidateCatalog({
      patterns: groupIntoPatterns([]),
      harmonicActiveBars: [],
      qualityFloor: 0.35,
      rawWindowCount: 0,
    });

    expect(catalog.patterns).toHaveLength(0);
    expect(draftToCandidate(draft).selectionScore).toBe(0);
    expect(draftToCandidate(draft).chords).toHaveLength(19);
  });
});
