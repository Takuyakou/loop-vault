/** The store's capture pipeline over the P10 synthetic songs, for unit tests. */
import { analyzeMidi, annotateVoiceRolesV2, buildVoices, normalizeNotes, parseMidi } from "../domain/midi";
import { attachSourceVoicings } from "../domain/voicing";
import { getAnalysisProfileAnalyzeOptions } from "../storage/accuracyFirstSettings";
import { buildScenarioMidi, type Scenario } from "./p10SyntheticSongs";

export { buildScenarioMidi, p10Scenario, p10Scenarios, type Scenario } from "./p10SyntheticSongs";

/** The store's own capture pipeline (vaultStore.analyzeMidiBytes), for tests. */
export function analyzeScenario(scenario: Scenario) {
  const bytes = buildScenarioMidi(scenario);
  const options = getAnalysisProfileAnalyzeOptions();
  const result = analyzeMidi(bytes, options);
  const sourceData = parseMidi(bytes);
  const sourceVoices = annotateVoiceRolesV2(buildVoices(sourceData), normalizeNotes(sourceData));
  const fullTimeline = attachSourceVoicings(result.fullTimeline, { analysis: result, sourceData, sourceVoices, accuracyFirst: options.accuracyFirst });
  return { result: { ...result, fullTimeline }, sourceData, sourceVoices };
}
