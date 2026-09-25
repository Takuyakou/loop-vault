import { describe, expect, it } from "vitest";
import corpus from "../../docs/phase8.5-pre/extended-v1-canonical-v1.json";
import { parseExtendedTextProgression } from "./extendedTextProgression";

const semanticErratum = new Set([
  "EV1-070", "EV1-071", "EV1-072", "EV1-073",
  "EV1-074", "EV1-075", "EV1-076", "EV1-077",
]);

describe("P8.8 extended-v1 frozen corpus", () => {
  it.each(corpus.fixtures)("$fixtureId $category", fixture => {
    const result = parseExtendedTextProgression(fixture.rawText, fixture.inputMetadata);
    expect(result.source).toBe(fixture.rawText);
    expect(result.metadata).toEqual(fixture.expectedMetadata);
    expect(result.sections.map(section => ({ kind: section.kind, line: section.line })))
      .toEqual(fixture.expectedSections);
    for (const diagnostic of result.diagnostics) {
      expect(diagnostic.span.start).toBeGreaterThanOrEqual(0);
      expect(diagnostic.span.end).toBeLessThanOrEqual(fixture.rawText.length);
      expect(diagnostic.line).toBeGreaterThanOrEqual(1);
      expect(diagnostic.column).toBeGreaterThanOrEqual(1);
    }
    if (fixture.disposition === "positive" || semanticErratum.has(fixture.fixtureId)) {
      expect(result.state, JSON.stringify(result.diagnostics)).toBe("VALID");
      expect(result.canConvert).toBe(true);
      if (!semanticErratum.has(fixture.fixtureId)) {
        expect(result.bars).toEqual(fixture.expectedBars);
        expect(result.slots.map(slot => ({
          bar: slot.bar, slot: slot.slot, startBeat: slot.startBeat,
          durationBeats: slot.durationBeats, kind: slot.kind,
        }))).toEqual(fixture.expectedEvents.map(event => ({
          bar: event.bar, slot: event.slot, startBeat: event.startBeat,
          durationBeats: event.durationBeats, kind: event.kind,
        })));
      }
    } else if (fixture.disposition === "empty") {
      expect(result.state).toBe("EMPTY");
      expect(result.diagnostics).toEqual([]);
    } else {
      expect(result.canConvert).toBe(false);
      for (const code of fixture.expectedDiagnostics) {
        expect(result.diagnostics.map(diagnostic => diagnostic.code)).toContain(code);
      }
    }
  });

  it("keeps one harmonic span for percent reattacks and holds", () => {
    const result = parseExtendedTextProgression("Cm %|= =|_ Cm|Cm %");
    expect(result.state).toBe("VALID");
    const first = result.harmonicSpans[0];
    expect(first?.attacks.map(attack => attack.kind)).toEqual(["written", "repeat"]);
    expect(first?.durationBeats).toBe(8);
    expect(result.harmonicSpans[1]?.attacks.map(attack => attack.kind)).toEqual(["written", "written", "repeat"]);
  });
});
