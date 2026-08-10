import { describe, expect, test } from "vitest";
import {
  TEXT_PROGRESSION_MAX_BARS,
  TEXT_PROGRESSION_MAX_INPUT_CODE_UNITS,
  TEXT_PROGRESSION_MAX_TOKENS,
  confirmedTextProgressionKeyState,
  evaluateTextProgressionCapabilities,
  inferTextProgressionKeyCandidates,
  inferTextProgressionKeyState,
  parseTextProgression,
  textProgressionCapability,
} from "./textProgression";

describe("Text Progression Entry grammar v1", () => {
  test("canonicalizes existing aliases and keeps slash forms as one token", () => {
    const result = parseTextProgression("| CM7 C-7 C6/9 C/E |");

    expect(result.canConvert).toBe(true);
    expect(result.events.map((event) => event.canonical)).toEqual(["Cmaj7", "Cm7", "C6/9", "C/E"]);
    expect(result.events.map((event) => event.startBeat)).toEqual([1, 2, 3, 4]);
    expect(result.events.map((event) => event.durationBeats)).toEqual([1, 1, 1, 1]);
    expect(result.tokens.map((token) => token.raw)).toEqual(["CM7", "C-7", "C6/9", "C/E"]);
  });

  test("allocates exact one, two, and four chord bar timing", () => {
    const result = parseTextProgression("| Dm7 | G7 Cmaj9 | Am7 D7 G7 Cmaj7 |");

    expect(result.canConvert).toBe(true);
    expect(result.events.map((event) => [event.bar, event.startBeat, event.durationBeats])).toEqual([
      [1, 1, 4],
      [2, 1, 2], [2, 3, 2],
      [3, 1, 1], [3, 2, 1], [3, 3, 1], [3, 4, 1],
    ]);
  });

  test("treats simple whitespace notation as one four-beat bar per chord", () => {
    const result = parseTextProgression("Dm7 G7 Cmaj9 Am7");

    expect(result.notation).toBe("simple");
    expect(result.bars).toBe(4);
    expect(result.events.map((event) => [event.bar, event.startBeat, event.durationBeats])).toEqual([
      [1, 1, 4], [2, 1, 4], [3, 1, 4], [4, 1, 4],
    ]);
  });

  test("requires a user-confirmed key before parsing Roman or numeric tokens", () => {
    const unconfirmed = parseTextProgression("| ii7 V7 | Imaj7 |");
    const confirmed = parseTextProgression("| ii7 V7 | Imaj7 |", { confirmedKey: "C major" });

    expect(unconfirmed.canConvert).toBe(false);
    expect(unconfirmed.diagnostics.map((issue) => issue.code)).toContain("degree-requires-confirmed-key");
    expect(unconfirmed.keyState.kind).toBe("unknown");
    expect(confirmed.canConvert).toBe(true);
    expect(confirmed.keyState).toMatchObject({ kind: "confirmed", key: "C major" });
    expect(confirmed.events.map((event) => event.canonical)).toEqual(["Dm7", "G7", "Cmaj7"]);
  });

  test("retains diagnostics and refuses partial conversion", () => {
    const result = parseTextProgression("| C D E | N.C. |");

    expect(result.canConvert).toBe(false);
    // Invalid bar cardinality has no exact timing, so its otherwise-valid
    // chord identities remain token diagnostics rather than convertible events.
    expect(result.tokens.map((token) => token.canonical)).toEqual(["C", "D", "E", undefined]);
    expect(result.diagnostics.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "three-chord-bar",
      "no-chord-not-supported",
    ]));
  });

  test("diagnoses malformed bars, repeats, comments, section headers, and lyric-mixed text", () => {
    const malformed = parseTextProgression("C | D |");
    const empty = parseTextProgression("|");
    const unsupported = parseTextProgression("| C % | // note | Verse: | hello |");

    expect(malformed.canConvert).toBe(false);
    expect(malformed.diagnostics.map((issue) => issue.code)).toContain("malformed-bar-notation");
    expect(empty.diagnostics.map((issue) => issue.code)).toContain("empty-bar");
    expect(unsupported.canConvert).toBe(false);
    expect(unsupported.diagnostics.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "unsupported-repeat",
      "unsupported-comment",
      "unsupported-section-header",
      "lyric-mixed-text",
    ]));
  });

  test("enforces text, bar, and token bounds without parsing oversized input", () => {
    const tooManyBars = parseTextProgression(Array.from({ length: 13 }, () => "C").join(" "));
    const tooLong = parseTextProgression("C".repeat(TEXT_PROGRESSION_MAX_INPUT_CODE_UNITS + 1));

    expect(tooManyBars.canConvert).toBe(false);
    expect(tooManyBars.diagnostics.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "too-many-bars",
    ]));
    expect(tooLong.tokens).toHaveLength(0);
    expect(tooLong.diagnostics.map((issue) => issue.code)).toEqual(["input-too-long"]);
  });

  test("fails closed for parser bounds, unsupported meter, and unconfirmed degree input", () => {
    const overflow = parseTextProgression(`| ${[...Array(11).fill("C C C C"), "C C C C C"].join(" | ")} |`);
    const threeFour = parseTextProgression("C", { meter: { numerator: 3, denominator: 4 } });
    const blank = parseTextProgression(" \t\n ");
    const noChordPhrase = parseTextProgression("| no chord |");
    const inferred = parseTextProgression("C F G").keyState;
    const inferredDegree = parseTextProgression("ii7 V7", { keyState: inferred });
    const malformedConfirmedDegree = parseTextProgression("Ihello", { confirmedKey: "C major" });

    expect(overflow.bars).toBe(TEXT_PROGRESSION_MAX_BARS);
    expect(overflow.tokens.length).toBeLessThanOrEqual(TEXT_PROGRESSION_MAX_TOKENS);
    expect(overflow.canConvert).toBe(false);
    expect(overflow.diagnostics.map((issue) => issue.code)).toContain("too-many-tokens");
    expect(threeFour.canConvert).toBe(false);
    expect(threeFour.diagnostics.map((issue) => issue.code)).toContain("unsupported-meter");
    expect(blank.diagnostics.map((issue) => issue.code)).toEqual(["empty-input"]);
    expect(noChordPhrase.diagnostics.map((issue) => issue.code)).toContain("no-chord-not-supported");
    expect(inferred.kind).toBe("inferred");
    expect(inferredDegree.canConvert).toBe(false);
    expect(inferredDegree.diagnostics.map((issue) => issue.code)).toContain("degree-requires-confirmed-key");
    expect(malformedConfirmedDegree.diagnostics.map((issue) => issue.code)).toContain("lyric-mixed-text");
    expect(malformedConfirmedDegree.diagnostics.map((issue) => issue.code)).not.toContain("degree-requires-confirmed-key");
  });

  test("marks only actually resolvable Fast Label tokens as requiring a confirmed key", () => {
    const result = parseTextProgression("| invalid Ihello Voodoo V7 |");

    expect(result.canConvert).toBe(false);
    expect(result.diagnostics.filter((issue) => issue.code === "degree-requires-confirmed-key")).toHaveLength(1);
    expect(result.tokens.find((token) => token.raw === "V7")?.diagnostics.map((issue) => issue.code)).toContain("degree-requires-confirmed-key");
    for (const raw of ["invalid", "Ihello", "Voodoo"]) {
      const codes = result.tokens.find((token) => token.raw === raw)?.diagnostics.map((issue) => issue.code);
      expect(codes).toContain("lyric-mixed-text");
      expect(codes).not.toContain("degree-requires-confirmed-key");
    }
  });
  test("diagnoses whole multi-token headers and non-ASCII or uppercase lyric text", () => {
    const nonAsciiLyric = "\u6B4C\u8A5E";
    const result = parseTextProgression(`| [Verse 1] | Verse 1: | HELLO | ${nonAsciiLyric} |`);

    expect(result.tokens.map((token) => token.raw)).toEqual(["[Verse 1]", "Verse 1:", "HELLO", nonAsciiLyric]);
    expect(result.diagnostics.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "unsupported-section-header",
      "lyric-mixed-text",
    ]));
    expect(result.diagnostics.filter((issue) => issue.code === "unsupported-section-header")).toHaveLength(2);
    expect(result.diagnostics.filter((issue) => issue.code === "lyric-mixed-text")).toHaveLength(2);
  });
  test("reports source ranges in UTF-16 offsets", () => {
    const result = parseTextProgression("|  Dm7  G7 |");

    expect(result.events[0]?.range).toEqual({ start: 3, end: 6 });
    expect(result.events[1]?.range).toEqual({ start: 8, end: 10 });
  });

  test("never throws or exceeds parser output bounds for deterministic malformed fuzz inputs", () => {
    for (let seed = 1; seed <= 128; seed += 1) {
      const input = deterministicFuzzInput(seed);
      const options = {
        meter: seed % 9 === 0 ? { numerator: 3, denominator: 4 } : undefined,
        confirmedKey: seed % 5 === 0 ? "C major" : undefined,
      };
      const result = parseTextProgression(input, options);
      const repeated = parseTextProgression(input, options);

      // Covers keyState, events, diagnostics, and every nested UTF-16 range.
      expect(repeated).toEqual(result);
      expect(result.input).toBe(input);
      expect(result.bars).toBeLessThanOrEqual(TEXT_PROGRESSION_MAX_BARS);
      expect(result.tokens.length).toBeLessThanOrEqual(TEXT_PROGRESSION_MAX_TOKENS);
      expect(result.events.length).toBeLessThanOrEqual(TEXT_PROGRESSION_MAX_TOKENS);
      for (const token of result.tokens) {
        expect(token.range.start).toBeGreaterThanOrEqual(0);
        expect(token.range.end).toBeGreaterThanOrEqual(token.range.start);
        expect(token.range.end).toBeLessThanOrEqual(input.length);
      }
      if (input.length > TEXT_PROGRESSION_MAX_INPUT_CODE_UNITS) {
        expect(result.tokens).toHaveLength(0);
        expect(result.events).toHaveLength(0);
      }
    }
  });
});

describe("text-only key suggestions", () => {
  test("uses a stable tie-break without MIDI analyzer confidence", () => {
    const progression = parseTextProgression("C F G C");
    const first = inferTextProgressionKeyCandidates(progression.events.map((event) => event.chord));
    const second = inferTextProgressionKeyCandidates(progression.events.map((event) => event.chord));

    expect(first).toEqual(second);
    expect(first[0]).toMatchObject({ key: "C major", tonicPitchClass: 0, mode: "major", support: 4, conflicts: 0 });
    expect(first[0]).not.toHaveProperty("confidence");
    expect(inferTextProgressionKeyState([])).toEqual({ kind: "unknown" });
    expect(confirmedTextProgressionKeyState("A minor")).toMatchObject({ kind: "confirmed", key: "A minor" });
  });
});

describe("Text Progression capability evaluator", () => {
  test("finds an existing safe one-bar section inside a valid three-bar progression", () => {
    const result = parseTextProgression("C F G", { confirmedKey: "C major" });
    const capabilities = evaluateTextProgressionCapabilities({ result, bpm: 120 });

    expect(textProgressionCapability(capabilities, "vault-save")).toMatchObject({ status: "supported" });
    expect(textProgressionCapability(capabilities, "chord-dojo")).toMatchObject({ status: "supported" });
    expect(textProgressionCapability(capabilities, "chord-context")).toMatchObject({ status: "supported" });
    expect(textProgressionCapability(capabilities, "bass-practice")).toMatchObject({ status: "supported" });
    expect(textProgressionCapability(capabilities, "root-motion")).toMatchObject({ status: "unknown" });
    expect(textProgressionCapability(capabilities, "voicing-memory")).toMatchObject({ status: "supported" });
  });

  test("keeps Root Motion unknown until note count is selected and checks the selected safe section root count", () => {
    const result = parseTextProgression("C F G", { confirmedKey: "C major" });
    const unspecified = evaluateTextProgressionCapabilities({ result, bpm: 120 });
    const insufficient = evaluateTextProgressionCapabilities({ result, bpm: 120, rootMotionNoteCount: 3 });
    const sufficient = evaluateTextProgressionCapabilities({ result, bpm: 120, rootMotionNoteCount: 2 });

    expect(textProgressionCapability(unspecified, "root-motion")).toMatchObject({ status: "unknown" });
    expect(textProgressionCapability(insufficient, "root-motion")).toMatchObject({ status: "unsupported" });
    expect(textProgressionCapability(sufficient, "root-motion")).toMatchObject({ status: "supported" });
  });

  test("reports all practice consumers supported for a selected eligible confirmed section", () => {
    const result = parseTextProgression("C F G C", { confirmedKey: "C major" });
    const capabilities = evaluateTextProgressionCapabilities({ result, bpm: 120, rootMotionNoteCount: 4 });

    expect(capabilities).toHaveLength(6);
    expect(textProgressionCapability(capabilities, "chord-context")).toMatchObject({ status: "supported" });
    expect(textProgressionCapability(capabilities, "bass-practice")).toMatchObject({ status: "supported" });
    expect(textProgressionCapability(capabilities, "root-motion")).toMatchObject({ status: "supported" });
  });

  test("does not pretend an inferred key meets Chord Context requirements", () => {
    const result = parseTextProgression("C F G C");
    const capabilities = evaluateTextProgressionCapabilities({ result, bpm: 120, rootMotionNoteCount: 2 });

    expect(result.keyState.kind).toBe("inferred");
    expect(textProgressionCapability(capabilities, "vault-save")).toMatchObject({ status: "supported" });
    expect(textProgressionCapability(capabilities, "chord-context")).toMatchObject({ status: "unsupported" });
    expect(textProgressionCapability(capabilities, "root-motion")).toMatchObject({ status: "unsupported" });
  });
});

function deterministicFuzzInput(seed: number): string {
  const fragments = ["C", "Dm7", "C6/9", "V7", "|", "%", "N.C.", "//", "Verse:", "hello", "\\u{1F63A}", " ", "\\n", ":2", "[A]"];
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
  const targetLength = seed % 16 === 0
    ? TEXT_PROGRESSION_MAX_INPUT_CODE_UNITS + 16
    : 1 + (next() % 512);
  let output = "";
  while (output.length < targetLength) output += fragments[next() % fragments.length]!;
  return output;
}