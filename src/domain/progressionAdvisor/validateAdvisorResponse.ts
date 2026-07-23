import { parseChordLabel } from "../chords";
import { advisorResponseSchema } from "./schema";
import { normalizeAdvisorResponse } from "./normalizeAdvisorResponse";
import type { AdvisorChordEvent, AdvisorResponse, AdvisorValidationIssue, AdvisorValidationResult } from "./types";

const expectedStrategies = new Set(["close_development", "contrast", "experimental"]);
const epsilon = 0.001;

export function validateAdvisorResponse(input: unknown, sourceEvents: readonly AdvisorChordEvent[] = []): AdvisorValidationResult {
  const parsed = advisorResponseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), code: schemaCode(issue.message), message: issue.message })),
    };
  }

  const response = normalizeAdvisorResponse(parsed.data as AdvisorResponse);
  const issues: AdvisorValidationIssue[] = [];
  const strategies = new Set(response.suggestions.map((suggestion) => suggestion.strategy));
  if (strategies.size !== expectedStrategies.size || [...expectedStrategies].some((strategy) => !strategies.has(strategy as never))) {
    issues.push({ path: "suggestions", code: "strategy", message: "Each advisor strategy must appear exactly once." });
  }

  response.suggestions.forEach((suggestion, suggestionIndex) => {
    suggestion.events.forEach((event, eventIndex) => {
      if (!parseChordLabel(event.chord)) {
        issues.push({ path: `suggestions.${suggestionIndex}.events.${eventIndex}.chord`, code: "chord", message: `Unsupported chord: ${event.chord}` });
      }
      if (event.startBeat + event.durationBeats > 5 + epsilon) {
        issues.push({ path: `suggestions.${suggestionIndex}.events.${eventIndex}`, code: "timing", message: "A chord event must not cross a bar boundary." });
      }
    });

    for (let bar = 1; bar <= 8; bar += 1) {
      const events = suggestion.events.filter((event) => event.bar === bar).sort((left, right) => left.startBeat - right.startBeat);
      let cursor = 1;
      for (const event of events) {
        if (event.startBeat < cursor - epsilon) {
          issues.push({ path: `suggestions.${suggestionIndex}.events`, code: "timing", message: `Events overlap in bar ${bar}.` });
          break;
        }
        if (Math.abs(event.startBeat - cursor) > epsilon) {
          issues.push({ path: `suggestions.${suggestionIndex}.events`, code: "coverage", message: `Bar ${bar} contains an uncovered beat range.` });
          break;
        }
        cursor = event.startBeat + event.durationBeats;
      }
      if (Math.abs(cursor - 5) > epsilon) {
        issues.push({ path: `suggestions.${suggestionIndex}.events`, code: "coverage", message: `Bar ${bar} is not fully covered.` });
      }
    }
  });

  const canonical = response.suggestions.map((suggestion) => suggestion.events.map((event) => `${event.bar}:${event.startBeat}:${event.durationBeats}:${event.chord.toLowerCase()}`).join("|"));
  if (new Set(canonical).size !== canonical.length) {
    issues.push({ path: "suggestions", code: "duplicate", message: "Advisor suggestions must contain distinct progressions." });
  }
  if (sourceEvents.length) {
    const sourceCanonical = canonicalEvents(sourceEvents);
    response.suggestions.forEach((suggestion, suggestionIndex) => {
      if (canonicalEvents(suggestion.events) === sourceCanonical) {
        issues.push({ path: `suggestions.${suggestionIndex}`, code: "duplicate", message: "An advisor suggestion must not be a complete copy of the source progression." });
      }
    });
  }

  return issues.length ? { success: false, issues } : { success: true, response };
}

function canonicalEvents(events: readonly AdvisorChordEvent[]): string {
  return [...events]
    .sort((left, right) => left.bar - right.bar || left.startBeat - right.startBeat || left.durationBeats - right.durationBeats || left.chord.localeCompare(right.chord))
    .map((event) => `${event.bar}:${event.startBeat}:${event.durationBeats}:${event.chord.trim().toLowerCase()}`)
    .join("|");
}

function schemaCode(message: string): AdvisorValidationIssue["code"] {
  if (message.includes("taxonomy")) return "taxonomy";
  return "schema";
}
