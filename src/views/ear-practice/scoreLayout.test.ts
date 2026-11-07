import { describe, expect, it } from "vitest";
import { parseTextChordLabel } from "../../domain/chords";
import type { SnapshotNote } from "../../domain/chordDojo/targetSnapshot";
import { ALL_BANK, bankProgression } from "../../domain/earPractice/bank";
import { chordFromDegreeToken, keySignatureOf, type EarMode } from "../../domain/earPractice";
import { buildBankQuestion } from "../../domain/earPractice/question";
import { voiceForEar } from "../../domain/earPractice/voicing";
import { chordSnapshot } from "./earStaff";
import { GAP, STAFF_GAP, barsPerRow, layoutScore, noteValueOf, rhythmWritable, scoreBars, signatureAlters, type PlacedChord, type ScoreChordInput } from "./scoreLayout";

/** The chords of a bank progression as the score takes them (spelled from the chord, in the key). */
function inputsOf(id: string, tonic: number) {
  const question = buildBankQuestion(bankProgression(id)!, tonic);
  const chords: ScoreChordInput[] = question.chords.map((chord, index) => ({
    index, label: chord.label, bar: chord.bar, startBeat: chord.startBeat, durationBeats: chord.durationBeats,
    notes: chordSnapshot(`t:${index}`, chord.symbol, chord.notes, question.tonic, question.mode)!.notes,
  }));
  return { question, chords, signature: keySignatureOf(question.tonic, question.mode) };
}

/** One chord by name, voiced as the practice voices it, as the only chord of a 4/4 bar in a key. */
function single(label: string, tonic: number, mode: EarMode = "major", token?: string) {
  const symbol = token ? chordFromDegreeToken(token, tonic, mode) : parseTextChordLabel(label)!;
  const notes = voiceForEar(symbol);
  const chord: ScoreChordInput = {
    index: 0, label, bar: 1, startBeat: 0, durationBeats: 4,
    notes: chordSnapshot("t", symbol, notes, tonic, mode)!.notes,
  };
  const layout = layoutScore({ chords: [chord], beatsPerBar: 4, signature: keySignatureOf(tonic, mode), width: 700, windowWidth: 768 });
  return layout.rows[0]!.bars[0]!.chords[0]!;
}
const note = (chord: PlacedChord, step: string, octave?: number) => chord.notes.find((n) => n.step === step && (octave === undefined || n.octave === octave));

describe("進行の譜面: 行と小節の数(Stage 04 §3)", () => {
  const sizes = [
    { name: "1440", width: 1130, windowWidth: 1440 },
    { name: "768", width: 700, windowWidth: 768 },
  ];
  for (const bars of [4, 8, 16] as const) {
    for (const size of sizes) {
      it(`${bars}小節・窓 ${size.name}px: 1行の小節の数と、小節の幅の下限`, () => {
        const entry = ALL_BANK.find((candidate) => candidate.length === bars)!;
        const { chords, signature } = inputsOf(entry.id, 0);
        const layout = layoutScore({ chords, beatsPerBar: 4, signature, width: size.width, windowWidth: size.windowWidth });
        const wanted = size.windowWidth >= 1200 ? 8 : 4;
        expect(layout.perRow).toBeLessThanOrEqual(wanted);
        expect(layout.perRow).toBeGreaterThanOrEqual(2);
        expect(layout.rows).toHaveLength(Math.ceil(bars / layout.perRow));
        for (const row of layout.rows) {
          expect(row.bars.length).toBeLessThanOrEqual(layout.perRow);
          for (const bar of row.bars) {
            const min = bar.chords.length >= 2 ? 160 : 110;
            expect(bar.width, `bar ${bar.bar}`).toBeGreaterThanOrEqual(min - 0.01);
          }
          // nothing runs off the right edge
          expect(row.right).toBeLessThanOrEqual(size.width + 0.5);
        }
      });
    }
  }

  it("768px では 4小節 ×(小節数 ÷ 4)段。1200px 以上で 1小節1コードなら 8小節が1行", () => {
    const eight = ALL_BANK.find((entry) => entry.length === 8 && entry.bars.every((bar) => bar.length === 1));
    expect(eight).toBeDefined();
    const { chords, signature } = inputsOf(eight!.id, 0);
    expect(layoutScore({ chords, beatsPerBar: 4, signature, width: 1130, windowWidth: 1440 }).rows).toHaveLength(1);
    expect(layoutScore({ chords, beatsPerBar: 4, signature, width: 700, windowWidth: 768 }).rows).toHaveLength(2);
    expect(layoutScore({ chords, beatsPerBar: 4, signature, width: 700, windowWidth: 768 }).perRow).toBe(4);
  });

  it("下限に収まらないときは行の小節を減らす(2小節まで)", () => {
    const bars = Array.from({ length: 8 }, (_, bar) => scoreBars([{ index: bar, label: "C", bar: bar + 1, startBeat: bar * 4, durationBeats: 4, notes: [] }], true)[0]!);
    expect(barsPerRow(bars, 1000, 1440)).toBe(8);
    expect(barsPerRow(bars, 700, 1440)).toBe(6);
    expect(barsPerRow(bars, 300, 1440)).toBe(2);
    expect(barsPerRow(bars, 700, 768)).toBe(4);
    expect(barsPerRow(bars, 300, 768)).toBe(2);
  });
});

describe("進行の譜面: 音の多い進行でも重ならない(1a)", () => {
  // The width of a text, as a generous estimate: the names are 15 px bold, the marks line 11.5 px.
  const nameWidth = (label: string) => label.length * 9.2;
  for (const id of ["L5-16-01", "L5-16-02"]) {
    for (const size of [{ name: "1440×900", width: 1130, windowWidth: 1440 }, { name: "768×640", width: 700, windowWidth: 768 }]) {
      it(`${id} を ${size.name} で描く: コード名・音符・臨時記号が、自分の枠の中に収まり、重ならない`, () => {
        const { chords, signature } = inputsOf(id, 3);
        const layout = layoutScore({ chords, beatsPerBar: 4, signature, width: size.width, windowWidth: size.windowWidth });
        for (const row of layout.rows) {
          for (const bar of row.bars) {
            const placed = bar.chords;
            placed.forEach((chord, i) => {
              // the name fits the box (both names and marks are drawn centred on it)
              expect(nameWidth(chord.label), `${chord.label} in ${bar.width}`).toBeLessThanOrEqual(chord.width + 20);
              // heads and accidentals stay inside the box
              for (const n of chord.notes) {
                expect(n.x - 7, `${chord.label} head`).toBeGreaterThanOrEqual(chord.x - 1);
                expect(n.x + 7, `${chord.label} head`).toBeLessThanOrEqual(chord.x + chord.width + 1);
                if (n.accidental) expect(n.accidentalX - 5, `${chord.label} ${n.step}${n.accidental}`).toBeGreaterThanOrEqual(chord.x - 4);
              }
              // no two heads of one chord sit on the same spot; accidentals of one staff do not sit on each other
              const heads = chord.notes.map((n) => `${n.staff}:${Math.round(n.x)}:${Math.round(n.y)}`);
              expect(new Set(heads).size).toBe(heads.length);
              const accidentals = chord.notes.filter((n) => n.accidental);
              accidentals.forEach((a, j) => accidentals.slice(j + 1).forEach((b) => {
                if (a.staff !== b.staff) return;
                expect(Math.abs(a.accidentalX - b.accidentalX) >= 9 || Math.abs(a.y - b.y) >= 2 * GAP, `${chord.label} ${a.step}/${b.step}`).toBe(true);
              }));
              // the neighbour's box starts where this one ends
              const next = placed[i + 1];
              if (next) expect(chord.x + chord.width).toBeLessThanOrEqual(next.x + 0.01);
            });
          }
          // the two staves keep four line-spacings apart; the notes of the treble staff stay clear of the names
          expect(row.bassTop - (row.trebleTop + 4 * GAP)).toBeGreaterThanOrEqual(4 * GAP);
          const highest = Math.min(...row.bars.flatMap((bar) => bar.chords.flatMap((chord) => chord.notes.map((n) => n.y - 5))));
          expect(highest).toBeGreaterThanOrEqual(36);
        }
      });
    }
  }
});

describe("進行の譜面: 調号(2)", () => {
  const MAJOR: Array<[string, number, "flat" | "sharp", number]> = [
    ["C", 0, "flat", 0], ["D♭", 1, "flat", 5], ["D", 2, "sharp", 2], ["E♭", 3, "flat", 3], ["E", 4, "sharp", 4], ["F", 5, "flat", 1],
    ["F♯", 6, "sharp", 6], ["G", 7, "sharp", 1], ["A♭", 8, "flat", 4], ["A", 9, "sharp", 3], ["B♭", 10, "flat", 2], ["B", 11, "sharp", 5],
  ];
  const MINOR: Array<[string, number, "flat" | "sharp", number]> = [
    ["Cm", 0, "flat", 3], ["C♯m", 1, "sharp", 4], ["Dm", 2, "flat", 1], ["E♭m", 3, "flat", 6], ["Em", 4, "sharp", 1], ["Fm", 5, "flat", 4],
    ["F♯m", 6, "sharp", 3], ["Gm", 7, "flat", 2], ["G♯m", 8, "sharp", 5], ["Am", 9, "flat", 0], ["B♭m", 10, "flat", 5], ["Bm", 11, "sharp", 2],
  ];
  it("12のメジャーキーと12のマイナーキーで、♯/♭ の数が正しく、並びが決まりのとおり", () => {
    for (const [name, tonic, accidental, count] of MAJOR) {
      const signature = keySignatureOf(tonic, "major");
      expect(signature.count, name).toBe(count);
      if (count) expect(signature.accidental, name).toBe(accidental);
    }
    for (const [name, tonic, accidental, count] of MINOR) {
      const signature = keySignatureOf(tonic, "minor");
      expect(signature.count, name).toBe(count);
      if (count) expect(signature.accidental, name).toBe(accidental);
    }
  });
  it("調号が各文字に与える変化: B♭ は B と E が ♭、A は F・C・G が ♯", () => {
    expect(signatureAlters(keySignatureOf(10, "major"))).toEqual({ B: -1, E: -1 });
    expect(signatureAlters(keySignatureOf(9, "major"))).toEqual({ F: 1, C: 1, G: 1 });
    expect(signatureAlters(keySignatureOf(0, "major"))).toEqual({});
    // flats in the order B E A D G C F; sharps F C G D A E B
    expect(Object.keys(signatureAlters(keySignatureOf(1, "major")))).toEqual(["B", "E", "A", "D", "G"]);
    expect(Object.keys(signatureAlters(keySignatureOf(11, "major")))).toEqual(["F", "C", "G", "D", "A"]);
  });
});

describe("進行の譜面: 綴りと臨時記号(3・4)", () => {
  it("B♭7(B♭ の調): A♭ は ♭ 付き(G♯ ではない)。調号の B♭・D・F には付かない", () => {
    const chord = single("Bb7", 10);
    expect(note(chord, "A")).toMatchObject({ alter: -1, accidental: "♭" });
    expect(chord.notes.some((n) => n.step === "G" && n.alter === 1)).toBe(false);
    expect(note(chord, "B")).toMatchObject({ alter: -1, accidental: "" });
    expect(note(chord, "D")?.accidental).toBe("");
  });
  it("G7(#9)(C の調): A♯ は ♯ 付き(B♭ ではない)", () => {
    const chord = single("G7(#9)", 0);
    expect(note(chord, "A")).toMatchObject({ alter: 1, accidental: "♯" });
    expect(chord.notes.some((n) => n.step === "B" && n.alter === -1)).toBe(false);
  });
  it("E♭ の調の C7: E は ♮ 付き(調号は E♭)", () => {
    const chord = single("C7", 3);
    expect(note(chord, "E")).toMatchObject({ alter: 0, accidental: "♮" });
    expect(note(chord, "B")).toMatchObject({ alter: -1, accidental: "" });
  });
  it("F♯m7♭5(F♯m の調): F♯ A C E。C は ♮(調号は F♯・C♯・G♯)", () => {
    const chord = single("F#m7b5", 6, "minor");
    expect(note(chord, "F")).toMatchObject({ alter: 1, accidental: "" });
    expect(note(chord, "C")).toMatchObject({ alter: 0, accidental: "♮" });
    expect(note(chord, "A")).toMatchObject({ alter: 0 });
    expect(note(chord, "E")).toMatchObject({ alter: 0, accidental: "" });
  });
  it("D♭7(#11)(D♭ の調): #11 は G(♮)で、G♭ ではない。調号が G♭ なので ♮ が付く", () => {
    const chord = single("D♭7(#11)", 1, "major", "I7(#11)");
    expect(note(chord, "G")).toMatchObject({ alter: 0, accidental: "♮" });
    expect(chord.notes.some((n) => n.step === "G" && n.alter === -1)).toBe(false);
    // the same chord as a ♭II of C: G is G, and in C nothing needs to be written
    const flatTwo = single("D♭7(#11)", 0, "major", "bII7(#11)");
    expect(note(flatTwo, "G")).toMatchObject({ alter: 0, accidental: "" });
    expect(flatTwo.notes.some((n) => n.alter > 1 || n.alter < -1)).toBe(false);
  });

  const n = (id: string, midi: number, step: string, alter: number, octave: number): SnapshotNote => ({ id, midi, hand: "right", spelling: { step: step as "A", alter, octave } });
  it("同じ小節の中で同じ音が続くときは、2つ目に付けない。次の小節ではもう一度付く。元に戻すときは ♮", () => {
    const chords: ScoreChordInput[] = [
      { index: 0, label: "Fm", bar: 1, startBeat: 0, durationBeats: 2, notes: [n("a", 56, "A", -1, 3), n("b", 60, "C", 0, 4)] },
      { index: 1, label: "Db", bar: 1, startBeat: 2, durationBeats: 2, notes: [n("c", 56, "A", -1, 3), n("d", 61, "D", -1, 4)] },
      { index: 2, label: "F", bar: 2, startBeat: 4, durationBeats: 2, notes: [n("e", 56, "A", -1, 3), n("f", 60, "C", 0, 4)] },
      { index: 3, label: "F", bar: 2, startBeat: 6, durationBeats: 2, notes: [n("g", 57, "A", 0, 3), n("h", 60, "C", 0, 4)] },
    ];
    const layout = layoutScore({ chords, beatsPerBar: 4, signature: keySignatureOf(0, "major"), width: 700, windowWidth: 768 });
    const [first, second] = layout.rows[0]!.bars;
    expect(note(first!.chords[0]!, "A")?.accidental).toBe("♭");
    expect(note(first!.chords[1]!, "A")?.accidental).toBe("");
    // D♭ is a different note: it needs its own
    expect(note(first!.chords[1]!, "D")?.accidental).toBe("♭");
    expect(note(second!.chords[0]!, "A")?.accidental).toBe("♭");
    expect(note(second!.chords[1]!, "A")?.accidental).toBe("♮");
  });
});

describe("進行の譜面: リズム(5・7a)", () => {
  it("2コードの小節は、2分音符が2つ並ぶ(前半・後半の枠が小節をちょうど分ける)", () => {
    const entry = ALL_BANK.find((candidate) => candidate.length === 4 && candidate.bars.some((bar) => bar.length === 2))!;
    const { chords, signature } = inputsOf(entry.id, 0);
    const layout = layoutScore({ chords, beatsPerBar: 4, signature, width: 1130, windowWidth: 1440 });
    const bar = layout.rows.flatMap((row) => row.bars).find((candidate) => candidate.chords.length === 2)!;
    const [a, b] = bar.chords as [PlacedChord, PlacedChord];
    expect(a.value).toBe("half");
    expect(b.value).toBe("half");
    expect(a.cx).toBeLessThan(b.cx);
    expect(a.x + a.width).toBeLessThanOrEqual(b.x + 0.01);
    expect(b.x + b.width).toBeLessThanOrEqual(bar.x + bar.width);
    expect(a.stems.length).toBeGreaterThan(0);
    // a one-chord bar is a whole note with no stem
    const whole = layout.rows.flatMap((row) => row.bars).find((candidate) => candidate.chords.length === 1);
    if (whole) { expect(whole.chords[0]!.value).toBe("whole"); expect(whole.chords[0]!.stems).toHaveLength(0); }
  });

  const spelled = (midi: number): SnapshotNote => ({ id: String(midi), midi, hand: "right", spelling: { step: "C", alter: 0, octave: Math.floor(midi / 12) - 1 } });
  const chord = (index: number, bar: number, startBeat: number, durationBeats: number): ScoreChordInput =>
    ({ index, label: `C${index}`, bar, startBeat, durationBeats, notes: [spelled(60)] });

  it("3/4 の小節は付点2分音符(点が付く)", () => {
    const chords = [chord(0, 1, 0, 3), chord(1, 2, 3, 3)];
    expect(rhythmWritable(chords, 3)).toBe(true);
    const layout = layoutScore({ chords, beatsPerBar: 3, signature: undefined, width: 700, windowWidth: 768 });
    expect(layout.writable).toBe(true);
    const placed = layout.rows[0]!.bars.flatMap((bar) => bar.chords);
    expect(placed.map((c) => c.value)).toEqual(["dotted-half", "dotted-half"]);
    expect(placed.every((c) => c.dots.length > 0 && c.stems.length > 0)).toBe(true);
    expect(noteValueOf(3)).toBe("dotted-half");
  });

  it("書けない長さ(2.5拍・小節をまたぐ・小節を埋めない)の進行は、リズムを書かない表示(1コード1つの枠・符尾なし)", () => {
    for (const chords of [
      [chord(0, 1, 0, 2.5), chord(1, 1, 2.5, 1.5)],
      [chord(0, 1, 0, 6), chord(1, 2, 6, 2)],
      [chord(0, 1, 0, 2)],
    ]) {
      expect(rhythmWritable(chords, 4)).toBe(false);
      const layout = layoutScore({ chords, beatsPerBar: 4, signature: undefined, width: 700, windowWidth: 768 });
      expect(layout.writable).toBe(false);
      const placed = layout.rows.flatMap((row) => row.bars);
      expect(placed.every((bar) => bar.chords.length === 1)).toBe(true);
      expect(placed.flatMap((bar) => bar.chords).every((c) => c.value === "none" && c.stems.length === 0 && c.dots.length === 0)).toBe(true);
    }
  });

  it("音符の種類: 4=全音符・3=付点2分・2=2分・1.5=付点4分・1=4分・0.5=8分。それ以外は書けない", () => {
    expect([4, 3, 2, 1.5, 1, 0.5].map(noteValueOf)).toEqual(["whole", "dotted-half", "half", "dotted-quarter", "quarter", "eighth"]);
    expect([2.5, 3.5, 4.5, 6, 7, 11, 0.25].map(noteValueOf)).toEqual(Array(7).fill(undefined));
  });
});

describe("進行の譜面: 段の取り方・二度・加線", () => {
  it("ベースは常にヘ音記号の段、上の音は C4 以上がト音記号", () => {
    const chord = single("Cmaj7", 0);
    const lowest = [...chord.notes].sort((a, b) => a.midi - b.midi)[0]!;
    expect(lowest.staff).toBe("bass");
    for (const n of chord.notes) expect(n.staff, `midi ${n.midi}`).toBe(n.midi === lowest.midi ? "bass" : n.midi >= 60 ? "treble" : "bass");
  });
  it("2つの段の間は、線の間隔の4倍以上", () => {
    expect(STAFF_GAP).toBeGreaterThanOrEqual(4 * GAP);
  });
  it("2度でぶつかる音は、片方を右にずらす", () => {
    const sec = (id: string, midi: number, step: string): SnapshotNote => ({ id, midi, hand: "right", spelling: { step: step as "C", alter: 0, octave: 4 } });
    const chords: ScoreChordInput[] = [{ index: 0, label: "Csus2/D", bar: 1, startBeat: 0, durationBeats: 4, notes: [sec("a", 60, "C"), sec("b", 62, "D"), sec("c", 64, "E")] }];
    const layout = layoutScore({ chords, beatsPerBar: 4, signature: undefined, width: 700, windowWidth: 768 });
    const placed = layout.rows[0]!.bars[0]!.chords[0]!.notes;
    expect(placed.map((p) => p.shifted)).toEqual([false, true, false]);
    expect(placed[1]!.x).toBeGreaterThan(placed[0]!.x);
  });
  it("C2 のベースには、下の加線が付く", () => {
    const low = single("C", 0);
    const bass = [...low.notes].sort((a, b) => a.midi - b.midi)[0]!;
    expect(bass.staff).toBe("bass");
    expect(bass.ledgers.length).toBeGreaterThan(0);
  });
});

describe("進行の譜面: 行の分け方", () => {
  it("入るだけ入れたあと、必要な行数に均等に分ける(7+1 は 4+4)", () => {
    const entry = ALL_BANK.find((candidate) => candidate.length === 8 && candidate.bars.filter((bar) => bar.length === 2).length >= 4)!;
    const { chords, signature } = inputsOf(entry.id, 0);
    const layout = layoutScore({ chords, beatsPerBar: 4, signature, width: 1130, windowWidth: 1440 });
    const counts = layout.rows.map((row) => row.bars.length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(8);
    expect(layout.perRow).toBeLessThanOrEqual(8);
  });
});

describe("進行の譜面: 重なる変化記号(♭♭ と 𝄪)と、mMaj7・7alt の綴り", () => {
  it("A♭7(♭9) の ♭9 は B𝄫: ♭♭ を付ける(B♭ と読めない)。同じ小節で後から B♭ が来れば ♭、もう一度 B𝄫 なら付けない", () => {
    const chord = single("A♭7(♭9)", 8, "major", "I7(b9)");
    expect(note(chord, "B")).toMatchObject({ alter: -2, accidental: "♭♭" });
    const double = (id: string, alter: number): SnapshotNote => ({ id, midi: 57 + alter + 2 - 2, hand: "right", spelling: { step: "B", alter, octave: 3 } });
    const chords: ScoreChordInput[] = [
      { index: 0, label: "A", bar: 1, startBeat: 0, durationBeats: 1, notes: [{ id: "a", midi: 57, hand: "right", spelling: { step: "B", alter: -2, octave: 3 } }] },
      { index: 1, label: "B", bar: 1, startBeat: 1, durationBeats: 1, notes: [{ id: "b", midi: 57, hand: "right", spelling: { step: "B", alter: -2, octave: 3 } }] },
      { index: 2, label: "C", bar: 1, startBeat: 2, durationBeats: 1, notes: [double("c", -1)].map((n) => ({ ...n, midi: 58 })) },
      { index: 3, label: "D", bar: 1, startBeat: 3, durationBeats: 1, notes: [{ id: "d", midi: 57, hand: "right", spelling: { step: "B", alter: -2, octave: 3 } }] },
      { index: 4, label: "E", bar: 2, startBeat: 4, durationBeats: 4, notes: [{ id: "e", midi: 57, hand: "right", spelling: { step: "B", alter: -2, octave: 3 } }] },
    ];
    const layout = layoutScore({ chords, beatsPerBar: 4, signature: keySignatureOf(8, "major"), width: 700, windowWidth: 768 });
    const [bar1, bar2] = layout.rows[0]!.bars;
    const marks = bar1!.chords.map((c) => c.notes[0]!.accidental);
    // the key signature has B♭: B𝄫 needs a mark; the second one in a row does not; B♭ after it needs one; B𝄫 again after that needs one
    expect(marks).toEqual(["♭♭", "", "♭", "♭♭"]);
    expect(bar2!.chords[0]!.notes[0]!.accidental).toBe("♭♭");
  });
  it("+2 は 𝄪: C♯7(♯11) の ♯11 は F𝄪 ではなく、キーの綴りで G ♮ に近い読みにならないよう度数で書く", () => {
    const chord = single("C♯7(♯11)", 6, "major", "V7(#11)");
    expect(chord.notes.some((n) => n.alter === 2 && n.accidental === "𝄪")).toBe(true);
  });
  it("mMaj7 と 7alt を度数で綴る: GmMaj7 は B♭ と F♯、G7alt は A♭ と E♭、A♭7alt は B𝄫 と F♭、B7alt は D♯", () => {
    const g = single("GmMaj7", 7, "minor", "ImMaj7");
    expect(g.notes.map((n) => `${n.step}${n.alter}`).sort()).toEqual(["B-1", "D0", "F1", "G0"].sort());
    const alt = single("G7alt", 7, "major", "I7alt");
    expect(alt.notes.map((n) => `${n.step}${n.alter}`).sort()).toEqual(["A-1", "B0", "E-1", "F0", "G0"].sort());
    const flat = single("A♭7alt", 8, "major", "I7alt");
    expect(flat.notes.map((n) => `${n.step}${n.alter}`).sort()).toEqual(["A-1", "B-2", "C0", "F-1", "G-1"].sort());
    expect(note(flat, "B")?.accidental).toBe("♭♭");
    const b = single("B7alt", 11, "major", "I7alt");
    expect(b.notes.map((n) => `${n.step}${n.alter}`).sort()).toEqual(["A0", "B0", "C0", "D1", "G0"].sort());
  });
  it("12のキー × mMaj7・7alt: 譜面に置かれた音の高さが、鳴らす音と一致する", () => {
    for (let tonic = 0; tonic < 12; tonic += 1) {
      for (const token of ["ImMaj7", "I7alt"]) {
        const symbol = chordFromDegreeToken(token, tonic, "major");
        const sounded = [...voiceForEar(symbol)].sort((a, b) => a - b);
        const chord = single(symbol.label, tonic, "major", token);
        expect(chord.notes.map((n) => n.midi).sort((a, b) => a - b)).toEqual(sounded);
        for (const n of chord.notes) {
          const natural = [0, 2, 4, 5, 7, 9, 11]["CDEFGAB".indexOf(n.step)]!;
          expect((n.octave + 1) * 12 + natural + n.alter, `${symbol.label} ${n.step}${n.alter}`).toBe(n.midi);
        }
      }
    }
  });
});
