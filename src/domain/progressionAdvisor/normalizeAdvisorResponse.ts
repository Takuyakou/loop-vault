import type { AdvisorResponse } from "./types";

export function normalizeAdvisorResponse(response: AdvisorResponse): AdvisorResponse {
  return {
    ...response,
    analysis: response.analysis.trim(),
    suggestedTagIds: unique(response.suggestedTagIds),
    suggestions: response.suggestions.map(({ key, mode, ...suggestion }) => ({
      ...suggestion,
      id: suggestion.id.trim(),
      label: suggestion.label.trim(),
      intent: suggestion.intent.trim(),
      ...(key ? { key: key.trim() } : {}),
      ...(mode ? { mode: mode.trim() } : {}),
      events: [...suggestion.events]
        .map((event) => ({ ...event, chord: event.chord.trim() }))
        .sort((left, right) => left.bar - right.bar || left.startBeat - right.startBeat || left.chord.localeCompare(right.chord)),
      suggestedTagIds: unique(suggestion.suggestedTagIds),
    })),
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
