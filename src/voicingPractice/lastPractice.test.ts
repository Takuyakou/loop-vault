import { describe, expect, it } from "vitest";
import {
  LAST_VOICING_PRACTICE_KEY,
  LAST_VOICING_PRACTICE_VERSION,
  readLastVoicingPractice,
  rememberLastVoicingPractice,
  type LastVoicingPractice,
  type LastPracticeStorage,
} from "./lastPractice";

const memoryStorage = (initial?: string): LastPracticeStorage & { value: string | null } => {
  const state = { value: initial ?? null };
  return {
    get value() { return state.value; },
    set value(next: string | null) { state.value = next; },
    getItem: (key) => (key === LAST_VOICING_PRACTICE_KEY ? state.value : null),
    setItem: (key, value) => { if (key === LAST_VOICING_PRACTICE_KEY) state.value = value; },
  };
};

const reference = { ideaId: "idea", blockId: "block" };

describe("the Voicing Loop's last practice (P22-03)", () => {
  it("writes and reads back the reference and the instant", () => {
    const storage = memoryStorage();
    rememberLastVoicingPractice(reference, "2026-11-10T12:00:00.000Z", storage);
    expect(readLastVoicingPractice(storage)).toEqual({ reference, at: "2026-11-10T12:00:00.000Z" });
    expect(JSON.parse(storage.value!)).toEqual({ version: LAST_VOICING_PRACTICE_VERSION, reference, at: "2026-11-10T12:00:00.000Z" });
  });

  it("treats a missing, broken or unknown value as none", () => {
    expect(readLastVoicingPractice(memoryStorage())).toBeUndefined();
    expect(readLastVoicingPractice(memoryStorage("{not json"))).toBeUndefined();
    expect(readLastVoicingPractice(memoryStorage(JSON.stringify({ version: 2, reference, at: "2026-11-10T12:00:00.000Z" })))).toBeUndefined();
    expect(readLastVoicingPractice(memoryStorage(JSON.stringify({ version: 1, reference: { ideaId: "", blockId: "b" }, at: "2026-11-10T12:00:00.000Z" })))).toBeUndefined();
    expect(readLastVoicingPractice(memoryStorage(JSON.stringify({ version: 1, reference, at: "not a date" })))).toBeUndefined();
    expect(readLastVoicingPractice(memoryStorage(JSON.stringify(["reference", "at"])))).toBeUndefined();
    expect(readLastVoicingPractice(undefined)).toBeUndefined();
  });

  it("does not throw when the storage refuses the write", () => {
    const storage: LastPracticeStorage = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    expect(() => rememberLastVoicingPractice(reference, "2026-11-10T12:00:00.000Z", storage)).not.toThrow();
  });

  it("writes one envelope, not a record of the practice", () => {
    const storage = memoryStorage();
    rememberLastVoicingPractice(reference, "2026-11-10T12:00:00.000Z", storage);
    const value = JSON.parse(storage.value!) as LastVoicingPractice;
    expect(Object.keys(value).sort()).toEqual(["at", "reference", "version"].sort());
    expect(Object.keys(value.reference as object).sort()).toEqual(["blockId", "ideaId"]);
  });
});
