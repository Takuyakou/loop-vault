import { describe, expect, it } from "vitest";
import { analyzeScenario, p10Scenario } from "../../testing/p10SyntheticCapture";
import { parseChordLabel } from "../chords";
import { buildProgressionVoicingPracticeHandoffFromVault } from "../progressionVoicingPractice/handoff";
import { createEmptyVault, type VaultBackup, type VaultLoadResult, type VaultRepository } from "../repository";
import { vaultFileSchema } from "../schema";
import type { VaultFile } from "../types";
import { createVaultStore } from "../../store/vaultStore";
import { sourceCoverage } from "../../voicingPractice/sourcePreference";
import { chooseName } from "./cardEdits";
import { buildCorrectionModel } from "./correctionModel";
import { reviewThresholds } from "./reviewThresholds";
import { buildSaveCandidate } from "./saveCandidate";
import { wholeSongRange } from "./sectionSave";

/**
 * P10.3 §7: which chords of a long song saved whole have no 「保存した音」 in Voicing Loop, and why.
 * The song: 64 bars of chords with a melody track and hats (`long-64`), whose last bar holds only
 * the melody's last note; one card is given a typed name its notes do not make.
 */

class FakeRepository implements VaultRepository {
  saved: VaultFile[] = [];
  async load(): Promise<VaultLoadResult> { return { vault: createEmptyVault(), quarantine: [], created: false }; }
  async save(vault: VaultFile): Promise<void> { this.saved.push(vault); }
  async listBackups(): Promise<VaultBackup[]> { return []; }
  async restore(): Promise<VaultLoadResult> { return { vault: createEmptyVault(), quarantine: [], created: false }; }
  async exportTo(): Promise<void> {}
  async importFrom(): Promise<VaultLoadResult> { return { vault: createEmptyVault(), quarantine: [], created: false }; }
}

describe("「保存した音」 in Voicing Loop for a long song saved whole (P10.3 §7)", () => {
  it("is missing only where the card has no notes of its own to save", async () => {
    const input = analyzeScenario(p10Scenario("long-64"));
    let model = buildCorrectionModel(input, reviewThresholds);
    const mismatch = model.cards[10]!;
    model = chooseName(model, mismatch.id, parseChordLabel("Ebmaj7")!, "typed").model; // a name the notes do not make
    const result = buildSaveCandidate(model, wholeSongRange(model)!, input.result.fullTimeline);
    if (!result.ok) throw new Error(result.problems.map((problem) => problem.text).join());

    const repository = new FakeRepository();
    const store = createVaultStore({ repository });
    await store.getState().initialize();
    const ideaId = store.getState().createIdeaFromDraft({
      title: "長い進行", status: "idea", chordMemo: result.candidate.summaryText,
      progressionBlock: result.candidate, progressionAnalysis: input.result,
      progressionMetadata: { userEdited: result.userEdited, userVerified: false },
    })!;
    await store.getState().flush();
    const reread = vaultFileSchema.parse(JSON.parse(JSON.stringify(repository.saved[repository.saved.length - 1]!)));
    const idea = reread.ideas.find((entry) => entry.id === ideaId)!;
    const block = idea.progressionBlocks![0]!;
    const handoff = buildProgressionVoicingPracticeHandoffFromVault(reread.ideas, { ideaId, blockId: block.id });
    if (!handoff.ok) throw new Error(JSON.stringify(handoff.error));

    const coverage = sourceCoverage(handoff.handoff.snapshots, "saved");
    const saved = handoff.handoff.snapshots.saved!;
    const missing = saved.events
      .map((event, index) => ({ event, index, card: model.cards.find((card) => card.id === result.cardIds[index])! }))
      .filter(({ event }) => event.voicing?.kind !== "saved")
      .map(({ index, card }) => ({
        chord: index + 1,
        bar: card.bar,
        name: card.name.label,
        usedNotes: model.notes.filter((note) => note.cardId === card.id && note.used).length,
        notes: model.notes.filter((note) => note.cardId === card.id).map((note) => `${note.pitch}:${note.roleHint ?? "-"}:${note.used ? "used" : "off"}`),
        savedVoicing: Boolean(block.chords[index]!.voicingMemory?.sourceVoicing || block.chords[index]!.voicingMemory?.practiceVoicingOverride),
      }));
    console.log("P10.3 §7 audit", JSON.stringify({ coverage, missing }));

    expect(coverage).toEqual({ available: saved.events.length - 1, total: saved.events.length });
    // The one: bar 65's card, which holds only the melody's last note (a note not used), so it has nothing to save.
    expect(missing).toEqual([expect.objectContaining({ bar: 65, usedNotes: 0, savedVoicing: false })]);
    // A typed name the notes do not make still plays its saved notes.
    const renamedIndex = result.cardIds.indexOf(mismatch.id);
    expect(saved.events[renamedIndex]!.voicing?.kind).toBe("saved");
  });
});
