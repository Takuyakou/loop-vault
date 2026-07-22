import type { AdvisorResponse, AdvisorStrategy } from "./types";

export interface AdvisorEvaluationCase {
  id: string;
  expectedValid: boolean;
  response: unknown;
}

export function advisorEvaluationCases(): AdvisorEvaluationCase[] {
  const valid = Array.from({ length: 12 }, (_, index) => ({
    id: `valid-${String(index + 1).padStart(2, "0")}`,
    expectedValid: true,
    response: validResponse(index),
  }));
  const invalidMutations: Array<(value: AdvisorResponse) => unknown> = [
    (value) => ({ ...value, suggestions: value.suggestions.slice(0, 2) }),
    (value) => ({ ...value, suggestions: [...value.suggestions, value.suggestions[0]] }),
    (value) => ({ ...value, suggestions: value.suggestions.map((suggestion) => ({ ...suggestion, strategy: "contrast" })) }),
    (value) => ({ ...value, unexpected: true }),
    (value) => ({ ...value, analysis: "x".repeat(2001) }),
    (value) => ({ ...value, suggestedTagIds: ["mood.unknown"] }),
    (value) => mutateEvent(value, 0, { chord: "not-a-chord" }),
    (value) => mutateEvent(value, 0, { bar: 9 }),
    (value) => mutateEvent(value, 0, { durationBeats: 0 }),
    (value) => ({ ...value, suggestions: value.suggestions.map((suggestion, index) => index ? suggestion : { ...suggestion, events: [...suggestion.events, { bar: 1, startBeat: 3, durationBeats: 1, chord: "Dm7" }] }) }),
    (value) => ({ ...value, suggestions: value.suggestions.map((suggestion, index) => index ? suggestion : { ...suggestion, events: suggestion.events.slice(0, 7) }) }),
    (value) => ({ ...value, suggestions: value.suggestions.map((suggestion, index) => index === 1 ? { ...suggestion, events: value.suggestions[0]!.events.map((event) => ({ ...event })) } : suggestion) }),
  ];
  const invalid = invalidMutations.map((mutate, index) => ({
    id: `invalid-${String(index + 1).padStart(2, "0")}`,
    expectedValid: false,
    response: mutate(validResponse(index)),
  }));
  return [...valid, ...invalid];
}

function validResponse(index: number): AdvisorResponse {
  const chordSets = [
    ["Cmaj7", "Fm9", "G7"], ["Dmaj7", "Gm9", "A7"], ["Emaj7", "Am9", "B7"], ["Fmaj7", "Bbm9", "C7"],
  ];
  const chords = chordSets[index % chordSets.length]!;
  return {
    schemaVersion: 1,
    analysis: `Fixture analysis ${index + 1}`,
    suggestions: [
      suggestion(`close-${index}`, "close_development", chords[0]!),
      suggestion(`contrast-${index}`, "contrast", chords[1]!),
      suggestion(`experimental-${index}`, "experimental", chords[2]!),
    ],
    suggestedTagIds: ["use.variation"],
  };
}

function suggestion(id: string, strategy: AdvisorStrategy, chord: string) {
  return {
    id, strategy, label: id, intent: `${strategy} fixture`, bars: 8 as const, timeSignature: "4/4" as const,
    events: Array.from({ length: 8 }, (_, bar) => ({ bar: bar + 1, startBeat: 1, durationBeats: 4, chord })),
    suggestedTagIds: ["mood.dreamy"],
  };
}

function mutateEvent(value: AdvisorResponse, suggestionIndex: number, patch: Record<string, unknown>): unknown {
  return {
    ...value,
    suggestions: value.suggestions.map((suggestion, index) => index !== suggestionIndex ? suggestion : {
      ...suggestion,
      events: suggestion.events.map((event, eventIndex) => eventIndex ? event : { ...event, ...patch }),
    }),
  };
}
