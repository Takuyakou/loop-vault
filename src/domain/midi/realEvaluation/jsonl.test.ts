import { describe, expect, it } from "vitest";
import { parseJsonLines } from "./jsonl";

describe("parseJsonLines", () => {
  it("parses non-empty lines without hiding blank lines", () => {
    expect(parseJsonLines('{"id":1}\n\n{"id":2}\n', "cases.jsonl"))
      .toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("reports the source and physical line for malformed JSON", () => {
    expect(() => parseJsonLines('{"id":1}\n\n{broken}', "cases.jsonl"))
      .toThrow("cases.jsonl contains invalid JSON at line 3");
  });
});
