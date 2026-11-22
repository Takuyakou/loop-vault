import { describe, expect, it } from "vitest";
import {
  COURSE_STORE_BROWSER_KEY,
  COURSE_STORE_DIR,
  COURSE_STORE_ENVELOPE_APP,
  COURSE_STORE_FILE,
  COURSE_STORE_FILE_VERSION,
  applyTrial,
  createStore,
  validateStore,
  type TrialRecord,
} from "./storeContract";
import { PAIR_ID, POLICY_VERSION, BANK_VERSION } from "./bank";

const pair = { bankVersion: BANK_VERSION, policyVersion: POLICY_VERSION, pairId: PAIR_ID };
const trial = (overrides: Partial<TrialRecord> = {}): TrialRecord => ({
  trialId: "t-1", itemId: "lv1-01", level: 1, quality: "maj", root: 0, result: "correct",
  sealedNotes: [48, 52, 55], hintUsed: false, selfConfirmed: false, midiConfirmed: true,
  startedAt: "2026-11-17T00:00:00.000Z", sealedAt: "2026-11-17T00:00:12.000Z", ...overrides,
});

describe("P23-39 §4 the course store contract", () => {
  it("applies an explicit trial and keeps the version pair", () => {
    const store = createStore(pair);
    const applied = applyTrial(store, trial());
    expect(applied.ok && applied.applied).toBe(true);
    if (!applied.ok) throw new Error("apply failed");
    expect(applied.store.trials).toHaveLength(1);
    expect(applied.store).toMatchObject({ schema: "loopvault-guided-course", version: 1, ...pair });
  });

  it("is idempotent by trial id; a conflicting body is rejected", () => {
    const store = createStore(pair);
    const once = applyTrial(store, trial());
    if (!once.ok) throw new Error("apply failed");
    const again = applyTrial(once.store, trial());
    expect(again.ok && again.applied === false).toBe(true);
    const conflict = applyTrial(once.store, trial({ result: "wrong" }));
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.reason).toContain("同じ試行 id");
  });

  it("rejects unknown schema/version pairs without migrating old data", () => {
    const store = createStore(pair);
    expect(validateStore({ ...store, version: 2 }).ok).toBe(false);
    expect(validateStore({ ...store, schema: "loopvault-chord-dojo" }).ok).toBe(false);
    expect(validateStore({ ...store, policyVersion: "" }).ok).toBe(false);
  });

  it("keeps self and MIDI confirmation separate and never stores raw audio or device data", () => {
    const self = trial({ selfConfirmed: true, midiConfirmed: false, result: "correct" });
    expect(applyTrial(createStore(pair), self).ok).toBe(true);
    const withAudio = { ...trial(), audio: "base64...", deviceId: "abc" } as unknown as TrialRecord;
    const rejected = applyTrial(createStore(pair), withAudio);
    expect(rejected.ok).toBe(false);
    // The invalid reason is mandatory, and a normal trial cannot carry one.
    expect(applyTrial(createStore(pair), trial({ result: "invalid" })).ok).toBe(false);
    expect(applyTrial(createStore(pair), trial({ result: "wrong", invalidReason: "disconnected" })).ok).toBe(false);
  });

  it("does not accept a hint-assisted trial as an independent MIDI confirmation", () => {
    const hinted = trial({ hintUsed: true, midiConfirmed: true });
    const rejected = applyTrial(createStore(pair), hinted);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.reason).toContain("独立合格");
  });

  it("rejects corrupted data and duplicate ids on reload", () => {
    const store = createStore(pair);
    expect(validateStore(null).ok).toBe(false);
    expect(validateStore({ ...store, trials: "nope" }).ok).toBe(false);
    const duplicated = { ...store, trials: [trial(), trial()] };
    expect(validateStore(duplicated).ok).toBe(false);
    const storeWithTrial = applyTrial(store, trial());
    if (!storeWithTrial.ok) throw new Error("apply failed");
    expect(validateStore(storeWithTrial.store).ok).toBe(true);
  });

  it("freezes the physical storage key, file and envelope in P23-39 (not deferred to P23-40)", () => {
    expect(COURSE_STORE_BROWSER_KEY).toBe("loop-vault:guided-course-v1:data");
    expect(COURSE_STORE_BROWSER_KEY).toMatch(/^loop-vault:[a-z0-9-]+-v1:data$/);
    expect(COURSE_STORE_DIR).toBe("loopvault");
    expect(COURSE_STORE_FILE).toBe("guided-course-v1.json");
    expect(COURSE_STORE_ENVELOPE_APP).toBe("loopvault-guided-course");
    expect(COURSE_STORE_FILE_VERSION).toBe(1);
    // The pair the store must match is the v2 freeze, and an old v1 pair is not silently accepted.
    expect(pair.pairId).toBe(`${BANK_VERSION}+${POLICY_VERSION}`);
    // An internally inconsistent pair is rejected by both the applier and the reload validator.
    const brokenPair = createStore({ bankVersion: BANK_VERSION, policyVersion: POLICY_VERSION, pairId: "p23-39.bank.lv1-3.v1+p23-39.policy.lv1-3.v1" });
    expect(applyTrial(brokenPair, trial()).ok).toBe(false);
    expect(validateStore(brokenPair).ok).toBe(false);
    // A well-formed v1 store is readable, but the loader must still reject it against the v2 freeze
    // (no silent migration of old passes); that comparison is the caller's, documented in store-contract.md.
    const v1Store = createStore({ bankVersion: "p23-39.bank.lv1-3.v1", policyVersion: "p23-39.policy.lv1-3.v1", pairId: "p23-39.bank.lv1-3.v1+p23-39.policy.lv1-3.v1" });
    expect(validateStore(v1Store).ok).toBe(true);
    expect(v1Store.pairId).not.toBe(pair.pairId);
  });
});
