import { describe, expect, it } from "vitest";
import { bankProgression } from "./bank";
import { EarSession } from "./earSession";
import { buildBankQuestion } from "./question";

const question = () => buildBankQuestion(bankProgression("L1-4-01")!, 0);

function playing() {
  const session = new EarSession({ question: question(), showFirstName: false });
  session.startPlaying();
  session.setMeasureStart(0);
  return session;
}

const shapes = (session: EarSession) => session.triedForms.map((form) => form.notes.join(","));

describe("the shapes that did not fit (P23-22 J2)", () => {
  it("C3 keeps the last three, newest first, with a repeat folded into one", () => {
    const session = playing();
    session.answer([1, 2], 100);
    session.answer([3, 4], 200);
    session.answer([3, 4], 300);
    session.answer([5, 6], 400);
    session.answer([7, 8], 500);
    expect(shapes(session)).toEqual(["7,8", "5,6", "3,4"]);
    expect(session.triedForms.map((form) => form.at)).toEqual([500, 400, 300]);
  });

  it("C3 keeps the words the judgement said at that moment", () => {
    const session = playing();
    session.answer([1, 2], 100);
    expect(session.triedForms[0]?.message).toBe("余分な音 D♭ があります");
  });

  it("C3 leaves a right answer out of the shapes", () => {
    const session = playing();
    session.answer([1, 2], 100);
    const right = [...question().chords[0]!.notes];
    const verdict = session.answer(right, 200);
    expect(verdict.ok).toBe(true);
    expect(shapes(session)).toEqual(["1,2"]);
  });

  it("C3 empties the shapes when the next card comes", () => {
    const session = playing();
    session.answer([1, 2], 100);
    session.answer([...question().chords[0]!.notes], 200);
    expect(session.triedForms).toHaveLength(1);
    session.next();
    expect(session.triedForms).toEqual([]);
  });

  it("C3 keeps nothing without a MIDI keyboard (the player judges)", () => {
    const session = playing();
    session.selfAnswer(false);
    expect(session.triedForms).toEqual([]);
  });
});
