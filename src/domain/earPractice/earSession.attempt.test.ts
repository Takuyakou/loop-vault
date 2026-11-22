import { describe, expect, it } from "vitest";
import { bankProgression } from "./bank";
import { EarSession } from "./earSession";
import { buildBankQuestion } from "./question";

/** P23-23a S16/C5: which answer of the card a tried shape was (1 from the start; a folded repeat keeps the newer one). */
const question = () => buildBankQuestion(bankProgression("L1-4-01")!, 0);

function playing() {
  const session = new EarSession({ question: question(), showFirstName: false });
  session.startPlaying();
  session.setMeasureStart(0);
  return session;
}

describe("the attempt number of a tried shape (P23-23a S16)", () => {
  it("counts the answers of the card from 1 and keeps the newer number when a repeat is folded", () => {
    const session = playing();
    session.answer([1, 2], 100);
    session.answer([3, 4], 200);
    session.answer([3, 4], 300);
    session.answer([5, 6], 400);
    expect(session.triedForms.map((form) => form.notes.join(","))).toEqual(["5,6", "3,4", "1,2"]);
    expect(session.triedForms.map((form) => form.attempt)).toEqual([4, 3, 1]);
  });

  it("starts again from 1 on the next card", () => {
    const session = playing();
    session.answer([1, 2], 100);
    expect(session.triedForms[0]!.attempt).toBe(1);
    session.answer([...question().chords[0]!.notes], 200);
    session.next();
    session.answer([1, 2], 300);
    expect(session.triedForms.map((form) => form.attempt)).toEqual([1]);
  });

  it("does not count a right answer or a self-judged card as a tried shape", () => {
    const session = playing();
    session.answer([...question().chords[0]!.notes], 100);
    expect(session.triedForms).toEqual([]);
    session.next();
    session.selfAnswer(false);
    expect(session.triedForms).toEqual([]);
  });
});
