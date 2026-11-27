import { describe, expect, it } from "vitest";
import { cleanedText, mergeNormalizeChanges, normalizeTextScore, rawRangeOfNormalized } from "./textNormalize";

describe("P24-05 the normalising layer", () => {
  it("makes full-width spelling half-width and says where it changed", () => {
    const result = normalizeTextScore("Ｃｍ７｜Ｆ７");
    expect(result.text).toBe("Cm7|F7");
    expect(result.changes.length).toBeGreaterThan(0);
    for (const change of result.changes) {
      expect(result.lines[change.line - 1]!.raw.slice(change.start, change.end)).toBe(change.from);
      expect(change.to.length).toBeGreaterThan(0);
    }
  });

  it("spells the same chord the same way", () => {
    const result = normalizeTextScore("| CM7 | C△7 | C-7 | ConG |");
    expect(result.text).toBe("| Cmaj7 | Cmaj7 | Cm7 | C/G |");
  });

  it("leaves a lone hyphen alone", () => {
    const result = normalizeTextScore("| C - | Dm |");
    expect(result.text).toBe("| C - | Dm |");
    expect(result.changes).toEqual([]);
  });

  it("collapses runs of spaces", () => {
    expect(normalizeTextScore("Am   G  F").text).toBe("Am G F");
  });

  it("skips lyric lines and reads chord lines, including the repeat note", () => {
    const result = normalizeTextScore(["A day in the life", "日本語の歌詞です", "Am  G  F  (x2)", "| Cmaj7 | Dm7 |"].join("\n"));
    expect(result.lines.map((line) => line.kind)).toEqual(["skipped", "skipped", "code", "code"]);
    expect(result.skipped).toHaveLength(2);
    expect(result.restructured).toBe(true);
    expect(result.text).toBe("Am G F (x2)\n| Cmaj7 | Dm7 |");
  });

  it("treats a line that is only a bracketed name as a heading", () => {
    const result = normalizeTextScore("[Intro]\n| C | G7 |\n[サビ]\n| F |");
    expect(result.lines.map((line) => line.kind)).toEqual(["heading", "code", "heading", "code"]);
    expect(result.headings.map((heading) => heading.heading)).toEqual(["Intro", "サビ"]);
    expect(result.text).toBe("| C | G7 |\n| F |");
  });

  it("does not take a lowercase root as a chord name", () => {
    expect(normalizeTextScore("am G").lines[0]!.kind).toBe("skipped");
  });

  it("reads a line the user asked to read as code", () => {
    const plain = normalizeTextScore("hello world");
    expect(plain.lines[0]!.kind).toBe("skipped");
    const forced = normalizeTextScore("hello world", { readAsCode: ["hello world"] });
    expect(forced.lines[0]!.kind).toBe("code");
  });

  it("keeps a comment line for the parser", () => {
    const result = normalizeTextScore("# Key: C\n| C | G7 |");
    expect(result.lines[0]!.kind).toBe("comment");
    expect(result.text).toBe("# Key: C\n| C | G7 |");
  });
});

describe("P25-06 E 歌詞の中のコード", () => {
  const LYRICS = "[C]きょうも[G]あるく[Am]みちを[F]";

  it("reads one chord per bar and keeps every chord on its own brackets", () => {
    const result = normalizeTextScore(LYRICS);
    expect(result.text).toBe("| C | G | Am | F |");
    expect(result.lines[0]!.kind).toBe("code");
    expect(result.lyricChordLines).toHaveLength(1);
    // The C token points at the C inside the first brackets in the typed line.
    const span = rawRangeOfNormalized(result, { start: 2, end: 3 });
    expect(result.lines[0]!.raw.slice(span.start, span.end)).toBe("C");
    // The G token points at the second brackets' G.
    const g = rawRangeOfNormalized(result, { start: 6, end: 7 });
    expect(result.lines[0]!.raw.slice(g.start, g.end)).toBe("G");
    // 「整えたテキストに置き換える」 writes the bar form.
    expect(cleanedText(result)).toBe("| C | G | Am | F |");
  });

  it("keeps a lone bracket as a heading and skips a line with a non-chord bracket", () => {
    const result = normalizeTextScore("[Aメロ]\n[C]hello [Dm7?]world\n| C |");
    expect(result.lines.map((line) => line.kind)).toEqual(["heading", "skipped", "code"]);
    expect(result.lyricChordLines).toHaveLength(0);
    expect(result.headings.map((heading) => heading.heading)).toEqual(["Aメロ"]);
  });

  it("counts the lines it read so the band can say how many", () => {
    const result = normalizeTextScore(`${LYRICS}\n[C]また[G]あるく`);
    expect(result.lyricChordLines).toHaveLength(2);
    expect(result.text).toBe("| C | G | Am | F |\n| C | G |");
  });
});

describe("P25-06 E2 カンマ・ダッシュの区切りと .", () => {
  const text = (input: string) => normalizeTextScore(input).text;

  it("reads the separators as spaces (E2's table)", () => {
    expect(text("C, G, Am, F")).toBe("C G Am F");
    expect(text("C,G,Am,F")).toBe("C G Am F");
    expect(text("C、G、Am、F")).toBe("C G Am F");
    expect(text("C-G-Am-F")).toBe("C G Am F");
    expect(text("C - G - Am - F")).toBe("C G Am F");
    expect(text("Cmaj7, Am7, Dm7, G7")).toBe("Cmaj7 Am7 Dm7 G7");
    expect(text("C7(b9,#11), F")).toBe("C7(b9,#11) F");
    expect(text("C-7-F-7")).toBe("Cm7 Fm7");
    expect(text("Bb-Eb")).toBe("Bb Eb");
    expect(text("| C, G | Am, F |")).toBe("| C G | Am F |");
  });

  it("keeps the readings it does not separate", () => {
    // The minor forms, a trailing dash and a dash with no chord beside it keep today's reading.
    expect(text("C-")).toBe("C-");
    expect(text("| C - | Dm |")).toBe("| C - | Dm |");
    expect(text("Hello, world")).toBe("");
    expect(normalizeTextScore("Hello, world").lines[0]!.kind).toBe("skipped");
    // A bar with a lone dash stays as it is.
    expect(text("| C | - |")).toBe("| C | - |");
  });

  it("repeats the chord before the dot, on this line and the one above", () => {
    expect(text("C, ., G")).toBe("C C G");
    const across = normalizeTextScore("| Cmaj7 |\n., G");
    expect(across.text).toBe("| Cmaj7 |\nCmaj7 G");
  });

  it("names a dot with no chord before it and still reads the line", () => {
    const result = normalizeTextScore("., C");
    expect(result.text).toBe(". C");
    expect(result.notices.map((notice) => notice.kind)).toEqual(["dot-without-chord"]);
    expect(result.notices[0]!.message).toBe("「.」の前にコードがありません。");
    expect(result.lines[0]!.kind).toBe("code");
  });

  it("keeps = as the hold and names a question mark", () => {
    expect(text("C, =, G")).toBe("C = G");
    const question = normalizeTextScore("C, ?, G");
    expect(question.text).toBe("C ? G");
    expect(question.notices.map((notice) => notice.kind)).toEqual(["question-mark"]);
    expect(question.notices[0]!.message).toBe("「?」は読めません。");
    // A line of only a question mark or dots is left alone.
    expect(normalizeTextScore("?").lines[0]!.kind).toBe("skipped");
    expect(normalizeTextScore("...").lines[0]!.kind).toBe("skipped");
  });

  it("does not treat the commas of a lyric chord line as separators", () => {
    const result = normalizeTextScore("[C]Hello, [G]world");
    expect(result.text).toBe("| C | G |");
    expect(result.lyricChordLines).toHaveLength(1);
    expect(result.separatedLines).toHaveLength(0);
  });
});

describe("P24-fix-2 the tidied-change count", () => {
  it("counts a tidied chord or bar line as one place, not one per character", () => {
    const result = normalizeTextScore("｜　Ｆmaj7　　G7 ｜\n| C△7 C7 |");
    const runs = mergeNormalizeChanges(result.changes)
      .filter(run => run.from.trim() !== "" || run.to.trim() !== "");
    // ｜ (start), Ｆmaj7, ｜ (end), C△7 — the full-width spaces are not places and do not join groups.
    expect(runs).toHaveLength(4);
    expect(runs.map(run => run.from)).toEqual(["｜", "Ｆ", "｜", "C△7"]);
  });

  it("merges neighbouring tidied characters into one underline", () => {
    const result = normalizeTextScore("１２３");
    const runs = mergeNormalizeChanges(result.changes);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ from: "１２３", to: "123" });
  });
});

describe("P25 V32 コード譜の設定の行と --- の見出し", () => {
  // The sheet the user pasted (the design's V32): three setting lines, two `---` headings, a blank line between.
  const SHEET = [
    "Key: D minor",
    "BPM: 108",
    "Time Signature: 4/4",
    "",
    "--- A Section ---",
    "",
    "| Dm11           | Em11           |",
    "| Dm11           | Bbmaj9(#11)    |",
    "| Gm9            | Abm9           |",
    "| Am11           | A7(#9,b13)     |",
    "",
    "--- B Section ---",
    "",
    "| Dm9            | Fmaj9/E        |",
    "| Ebmaj9(#11)    | D13(#11)       |",
    "| Gm11           | C13            |",
    "| Fmaj9          | Em11 Eb13(#11) |",
  ].join("\n");

  it("reads the setting lines and the --- headings", () => {
    const result = normalizeTextScore(SHEET);
    expect([1, 2, 3].map((line) => result.lines[line - 1]!.kind)).toEqual(["setting", "setting", "setting"]);
    expect(result.lines[4]!.kind).toBe("heading");
    expect(result.lines[11]!.kind).toBe("heading");
    expect(result.headings.map((heading) => heading.heading)).toEqual(["A Section", "B Section"]);
    expect(result.settings).toEqual({ key: "D minor", bpm: 108, meter: "4/4" });
    // The setting and heading lines never reach the parser.
    expect(result.text.split("\n")).toHaveLength(8);
    expect(result.restructured).toBe(true);
  });

  it("reads the six key spellings and does not read H", () => {
    const keyOf = (value: string) => normalizeTextScore(`Key: ${value}\n| C |`).settings.key;
    expect(keyOf("D minor")).toBe("D minor");
    expect(keyOf("Dm")).toBe("D minor");
    expect(keyOf("Bb")).toBe("Bb major");
    expect(keyOf("F#m")).toBe("F# minor");
    expect(keyOf("E♭ major")).toBe("Eb major");
    expect(keyOf("Aマイナー")).toBe("A minor");
    expect(normalizeTextScore("Key: H\n| C |").settings.key).toBeUndefined();
    expect(normalizeTextScore("Key: H\n| C |").lines[0]!.kind).toBe("skipped");
  });

  it("reads BPM and meter the ways a sheet writes them", () => {
    expect(normalizeTextScore("Tempo: 92 bpm\n| C |").settings.bpm).toBe(92);
    expect(normalizeTextScore("BPM=120\n| C |").settings.bpm).toBe(120);
    expect(normalizeTextScore("Time: 3/4\n| C |").settings.meter).toBe("3/4");
    expect(normalizeTextScore("拍子: 6/8\n| C |").settings.meter).toBe("6/8");
  });

  it("takes an equals-sign heading and leaves a line of signs alone", () => {
    const chorus = normalizeTextScore("=== Chorus ===\n| C |");
    expect(chorus.lines[0]!.kind).toBe("heading");
    expect(chorus.headings[0]!.heading).toBe("Chorus");
    expect(normalizeTextScore("-----\n| C |").lines[0]!.kind).not.toBe("heading");
    expect(normalizeTextScore("---\n| C |").lines[0]!.kind).not.toBe("heading");
  });

  it("keeps the first value when the same setting appears twice", () => {
    const result = normalizeTextScore("Key: C major\nBPM: 100\nKey: G major\nBPM: 140\n| C |");
    expect(result.settings).toEqual({ key: "C major", bpm: 100 });
  });

  it("keeps a setting line when the lyrics are cleaned away", () => {
    const result = normalizeTextScore("Key: D minor\n日本語の歌詞\n| Dm |");
    expect(cleanedText(result)).toBe("Key: D minor\n| Dm |");
  });
});

describe("P25 V37 コードの音を { } で書く", () => {
  it("reads the notes of the chord right before the braces and takes them out of the text", () => {
    const input = "| Cmaj7{C3 G3 E4 B4 D5} | Dm7 |";
    const result = normalizeTextScore(input);
    expect(result.voicings).toHaveLength(1);
    expect(result.voicings[0]!.notes).toEqual([48, 55, 64, 71, 74]);
    expect(result.voicings[0]!.rawStart).toBe(2);
    expect(input.slice(result.voicings[0]!.rawStart, result.voicings[0]!.rawStart + 5)).toBe("Cmaj7");
    expect(result.text).toBe("| Cmaj7 | Dm7 |");
    expect(result.text).not.toContain("{");
    expect(result.notices).toHaveLength(0);
    expect(result.lines[0]!.kind).toBe("code");
  });

  it("reads commas, flats, sharps and a semicolon as separators", () => {
    const notes = (line: string) => normalizeTextScore(line).voicings[0]?.notes;
    expect(notes("| G7{F3,B3,E4,A4} |")).toEqual([53, 59, 64, 69]);
    expect(notes("| Bb7{Ab3 D4 G4} |")).toEqual([56, 62, 67]);
    expect(notes("| F#m7{E3 A3 C#4} |")).toEqual([52, 57, 61]);
    expect(notes("| C{E♭4 G4 C5} |")).toEqual([63, 67, 72]);
    const semicolon = normalizeTextScore("| G#m9{G#2; F#3 A#3 B3 D#4} |");
    expect(semicolon.notices).toHaveLength(0);
    expect(semicolon.voicings[0]?.notes).toEqual([44, 54, 58, 59, 63]);
  });

  it("names what does not read and still reads the chord", () => {
    for (const [line, message] of [
      ["| C{C3} |", "{ } の中の音は 2〜10 個にしてください。"],
      ["| C{C3 C3} |", "{ } の中の音は 2〜10 個にしてください。"],
      ["| C{H3 E4} |", "「H3」は音として読めません(例:C3・F#3・Bb4)。"],
      ["| C{C9 E9} |", "音は A0〜C8 の中にしてください。"],
    ] as const) {
      const result = normalizeTextScore(line);
      expect(result.notices.map((notice) => notice.kind)).toEqual(["voicing-notes"]);
      expect(result.notices[0]!.message).toBe(message);
      expect(result.voicings).toHaveLength(0);
      expect(result.text).toBe(line.replace(/\{[^}]*\}/, "").replace(/ {2,}/g, " "));
      expect(result.lines[0]!.kind).toBe("code");
    }
  });

  it("leaves the other braces alone", () => {
    const title = normalizeTextScore("{title: Song}\n| C |");
    expect(title.voicings).toHaveLength(0);
    expect(title.lines[0]!.kind).toBe("skipped");
    const lyrics = normalizeTextScore("[C]hello [G]world {x}");
    expect(lyrics.voicings).toHaveLength(0);
    expect(lyrics.lyricChordLines).toHaveLength(1);
    expect(lyrics.text).toBe("| C | G |");
  });
});
