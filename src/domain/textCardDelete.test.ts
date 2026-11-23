// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseUnifiedText } from "./textUnified";
import { deleteTextCard } from "./textCardDelete";

const options = { beat: "4/4" } as const;
const cardStart = (text: string, token: string, occurrence = 0) => {
  const parsed = parseUnifiedText(text, options);
  const slot = parsed.slots.filter((item) => item.raw === token)[occurrence];
  expect(slot, token).toBeDefined();
  return slot!.span.start;
};
const remove = (text: string, token: string, occurrence = 0) =>
  deleteTextCard(text, options, cardStart(text, token, occurrence)).text;

describe("P24-07 card deletion edits the typed text", () => {
  it("removes one chord bar and keeps the other bars", () => {
    expect(remove("| C | F | G |", "C")).toBe("| F | G |");
    expect(remove("| C | F | G |", "F")).toBe("| C | G |");
    expect(remove("| C | F | G |", "G")).toBe("| C | F |");
  });

  it("removes the holds and repeats that continue the card", () => {
    expect(remove("| C % = = | Dm |", "C")).toBe("| Dm |");
    expect(remove("| C % | G |", "C")).toBe("| G |");
    expect(remove("| C = |", "C")).toBe("");
  });

  it("removes only the repeat card when the repeat is the card", () => {
    expect(remove("| C % |", "%")).toBe("| C |");
  });

  it("keeps the rest of the bar and re-divides it", () => {
    expect(remove("| C Dm | G |", "Dm")).toBe("| C | G |");
    expect(remove("| C _ | G |", "_")).toBe("| C | G |");
  });

  it("drops an emptied line and keeps the lyrics and the other lines", () => {
    expect(remove("夜あけ\n| C |\n| Dm |", "C")).toBe("夜あけ\n| Dm |");
    expect(remove("| C |\n| Dm |", "C")).toBe("| Dm |");
  });

  it("removes an unreadable token", () => {
    const text = "| C Xm7 | G |";
    expect(deleteTextCard(text, options, text.indexOf("Xm7")).text).toBe("| C | G |");
  });
});
