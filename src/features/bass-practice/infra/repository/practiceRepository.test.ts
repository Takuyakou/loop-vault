import { describe, expect, it } from "vitest";
import { createCompletedAttempt } from "../../domain";
import { generatedExercise } from "../../domain/testFixtures";
import {
  addCompletedAttempt,
  createEmptyPracticeFile,
  JsonPracticeRepository,
  MemoryPracticeStorage,
  validatePracticeFile,
  type PracticeFileV1,
} from ".";

const NOW = new Date("2026-08-02T10:00:00.000Z");

function completed(overrides: Partial<Parameters<typeof createCompletedAttempt>[0]> = {}) {
  const exercise = overrides.exercise ?? generatedExercise({ seed: "persisted-degree" });
  return createCompletedAttempt({
    id: "attempt-1", sessionId: "session-1", startedAt: "2026-08-02T09:59:00.000Z",
    completedAt: "2026-08-02T10:00:00.000Z", listenCount: 1, hintLevel: 0,
    singSkipped: false, singGateCompleted: true, rating: "good", exercise, ...overrides,
  });
}

describe("JsonPracticeRepository", () => {
  it("keeps Practice in its own strict versioned envelope and commits temp/flush/rename", async () => {
    const storage = new MemoryPracticeStorage();
    const repository = new JsonPracticeRepository(storage, () => NOW);
    const initial = await repository.load();
    expect(initial.created).toBe(true);
    expect(storage.committed).toBeUndefined();

    await repository.save(addCompletedAttempt(initial.file, completed()));
    expect(storage.operations).toEqual(["read", "write-temp", "flush-close", "rename"]);
    expect(JSON.parse(storage.committed!)).toMatchObject({ app: "loopvault-practice", fileVersion: 1 });
    expect(storage.committed).toMatch(/\n$/);

    const reloaded = await repository.load();
    expect(reloaded.file.attempts).toHaveLength(1);
    expect(reloaded.file.attempts[0].independentSuccess).toBe(true);
  });

  it("rejects non-canonical success before write and preserves the last-good file", async () => {
    const storage = new MemoryPracticeStorage();
    const repository = new JsonPracticeRepository(storage, () => NOW);
    const good = addCompletedAttempt(createEmptyPracticeFile(NOW), completed());
    await repository.save(good);
    const lastGood = storage.committed;
    const corrupt: PracticeFileV1 = { ...good, attempts: [{ ...good.attempts[0], independentSuccess: false }] };
    await expect(repository.save(corrupt)).rejects.toThrow("independentSuccess");
    expect(storage.committed).toBe(lastGood);
  });

  it("quarantines a persisted success mismatch and excludes it from queue and summaries", async () => {
    const storage = new MemoryPracticeStorage();
    const valid = addCompletedAttempt(createEmptyPracticeFile(NOW), completed());
    storage.committed = `${JSON.stringify({ ...valid, revision: 1, attempts: [{ ...valid.attempts[0], independentSuccess: false }] })}\n`;
    const loaded = await new JsonPracticeRepository(storage, () => NOW).load();
    expect(loaded.quarantine).toEqual([{ collection: "attempts", index: 0, issue: "independent-success-mismatch" }]);
    expect(loaded.file.attempts).toEqual([]);
    expect(loaded.file.reviewQueue).toEqual([]);
  });

  it("isolates invalid JSON without touching any Vault namespace", async () => {
    const storage = new MemoryPracticeStorage(); storage.committed = "{broken";
    const result = await new JsonPracticeRepository(storage, () => NOW).load();
    expect(result.recovery?.kind).toBe("invalid-json");
    expect(result.recovery?.corruptPath).toMatch(/^loopvault\/practice-v1\.corrupt-/);
    expect(storage.corrupt.size).toBe(1);
    expect(storage.committed).toBeUndefined();

    const restarted = new JsonPracticeRepository(storage, () => NOW);
    const recovered = await restarted.load();
    expect(recovered).toMatchObject({ created: false, recovery: { kind: "retained-corrupt" } });
    await expect(restarted.save(createEmptyPracticeFile(NOW))).rejects.toThrow(/recovery/i);
    expect(storage.committed).toBeUndefined();
  });

  it("fails closed when recovery artifacts cannot be listed", async () => {
    const storage = new MemoryPracticeStorage(); storage.failListRecoveryArtifacts = true;
    const repository = new JsonPracticeRepository(storage, () => NOW);
    await expect(repository.load()).rejects.toThrow(/unavailable/i);
    await expect(repository.save(createEmptyPracticeFile(NOW))).rejects.toThrow(/unknown/i);
    expect(storage.committed).toBeUndefined();
    expect(storage.operations).not.toContain("write-temp");
  });

  it("keeps recovery required when backup discovery fails after quarantine and restart", async () => {
    const storage = new MemoryPracticeStorage(); storage.committed = "{broken"; storage.failListBackups = true;
    const repository = new JsonPracticeRepository(storage, () => NOW);
    await expect(repository.load()).resolves.toMatchObject({ recovery: { kind: "invalid-json", backups: [] } });
    await expect(repository.load()).resolves.toMatchObject({ recovery: { backups: [] }, created: false });
    const restarted = new JsonPracticeRepository(storage, () => NOW);
    await expect(restarted.load()).resolves.toMatchObject({ recovery: { kind: "retained-corrupt", backups: [] }, created: false });
    await expect(restarted.save(createEmptyPracticeFile(NOW))).rejects.toThrow(/recovery/i);
    expect(storage.committed).toBeUndefined();
    expect(storage.corrupt.size).toBe(1);
  });

  it("never overwrites future versions", async () => {
    const storage = new MemoryPracticeStorage(); storage.committed = '{"app":"loopvault-practice","fileVersion":2}';
    storage.corrupt.set("loopvault/practice-v1.corrupt-20260802-123456-000000.json", "{old-broken");
    const repository = new JsonPracticeRepository(storage, () => NOW);
    await expect(repository.load()).rejects.toThrow("newer");
    await expect(repository.save(createEmptyPracticeFile(NOW))).rejects.toThrow(/read-only/i);
    await expect(repository.restoreBackup("practice-20260802-123456-000000.json")).rejects.toThrow(/read-only/i);
    await expect(repository.startFresh()).rejects.toThrow(/read-only/i);
    expect(storage.committed).toContain('"fileVersion":2');
    expect(storage.corrupt.size).toBe(1);
  });

  it("keeps a newly loaded future version read-only when restore was queued concurrently", async () => {
    const storage = new MemoryPracticeStorage(); const repository = new JsonPracticeRepository(storage, () => NOW);
    const first = await repository.save(addCompletedAttempt(createEmptyPracticeFile(NOW), completed()));
    await repository.save(addCompletedAttempt(first, completed({ id: "second", completedAt: "2026-08-02T10:01:00.000Z", exercise: generatedExercise({ seed: "future-race" }) })));
    const [backup] = await storage.listBackups();
    storage.committed = "{broken";
    await repository.load();
    const futureBytes = '{"app":"loopvault-practice","fileVersion":2}';
    storage.committed = futureBytes;

    const load = repository.load();
    const restore = repository.restoreBackup(backup.name);
    await expect(load).rejects.toThrow("newer");
    await expect(restore).rejects.toThrow(/read-only/i);
    expect(storage.committed).toBe(futureBytes);
    expect(storage.corrupt.size).toBe(1);
  });

  it("serializes concurrent saves, keeps latest revision, and bounds backups to 20", async () => {
    const storage = new MemoryPracticeStorage(); const repository = new JsonPracticeRepository(storage, () => NOW);
    let file = { ...createEmptyPracticeFile(NOW), settings: { ...createEmptyPracticeFile(NOW).settings, sessionTargetCount: 100 } };
    const saves: Promise<PracticeFileV1>[] = [];
    for (let index = 0; index < 23; index += 1) {
      const attempt = completed({ id: `attempt-${index}`, completedAt: `2026-08-02T10:00:${String(index).padStart(2, "0")}.000Z`, exercise: generatedExercise({ seed: `seed-${index}` }) });
      file = addCompletedAttempt(file, attempt); saves.push(repository.save(file));
    }
    await Promise.all(saves);
    expect(JSON.parse(storage.committed!).attempts).toHaveLength(23);
    expect(storage.backups.size).toBe(20);
  });

  it("preserves the committed file when a write fails", async () => {
    const storage = new MemoryPracticeStorage(); const repository = new JsonPracticeRepository(storage, () => NOW);
    const first = addCompletedAttempt(createEmptyPracticeFile(NOW), completed()); await repository.save(first);
    const lastGood = storage.committed; storage.failCommit = true;
    const next = addCompletedAttempt(first, completed({ id: "attempt-2", completedAt: "2026-08-02T10:00:01.000Z", exercise: generatedExercise({ seed: "two" }) }));
    await expect(repository.save(next)).rejects.toThrow("current review remains available");
    expect(storage.committed).toBe(lastGood);
  });

  it("rejects unknown fields and private/raw payloads", () => {
    const file = addCompletedAttempt(createEmptyPracticeFile(NOW), completed());
    expect(() => validatePracticeFile({ ...file, absolutePath: "C:/Users/name/private.mid" } as PracticeFileV1)).toThrow("strict schema");
    expect(JSON.stringify(file)).not.toMatch(/rawMidi|audioData|sourceFileName|C:\\Users/i);
  });

  it("rejects duplicate/cross-session records instead of polluting History", () => {
    const file = addCompletedAttempt(createEmptyPracticeFile(NOW), completed());
    expect(() => validatePracticeFile({ ...file, attempts: [...file.attempts, file.attempts[0]] })).toThrow("unique");
    expect(() => validatePracticeFile({ ...file, sessions: [{ ...file.sessions[0], completedCount: 99 }] })).toThrow("session references");
    expect(() => validatePracticeFile({ ...file, sessions: [{ ...file.sessions[0], attemptIds: [file.attempts[0].id, file.attempts[0].id] }] })).toThrow("session references");
  });

  it("replays the exact queue leaf set and rejects missing, extra, or unclaimed acknowledgements", () => {
    const file = addCompletedAttempt(createEmptyPracticeFile(NOW), completed());
    expect(() => validatePracticeFile({ ...file, reviewQueue: [] })).toThrow("review queue");
    expect(() => validatePracticeFile({ ...file, reviewQueue: [...file.reviewQueue, { ...file.reviewQueue[0], sourceAttemptId: "extra" }] })).toThrow("review queue");
    expect(() => addCompletedAttempt(createEmptyPracticeFile(NOW), completed({ reviewQueueClaimId: "claim-v1:missing:good" }))).toThrow("claim");
  });

  it("rejects same-key transfer and literal unplayable/singing-reference corruption", () => {
    const source = completed({ id: "source" });
    const base = addCompletedAttempt(createEmptyPracticeFile(NOW), source);
    const sameKey = completed({ id: "same-key", transferOfAttemptId: source.id, completedAt: "2026-08-02T10:01:00.000Z", exercise: source.exerciseSnapshot });
    expect(() => addCompletedAttempt(base, sameKey)).toThrow("Transfer source");

    const exercise = generatedExercise({ seed: "unplayable" });
    const badEvent = { ...exercise.targetEvents[0], midiNote: 100 };
    const corruptExercise = { ...exercise, targetEvents: [badEvent, ...exercise.targetEvents.slice(1)], singingReference: { ...exercise.singingReference, events: [{ ...exercise.singingReference.events[0], midiNote: 100 + 12 * exercise.singingReference.resolvedOctaveShift }, ...exercise.singingReference.events.slice(1)] } };
    const corruptAttempt = completed({ id: "unplayable", exercise: corruptExercise });
    expect(() => addCompletedAttempt(createEmptyPracticeFile(NOW), corruptAttempt)).toThrow("semantic validation");
  });

  it("rejects playable pitch, forged identity/version, and singing-reference deviations from generator output", () => {
    const exercise = generatedExercise({ seed: "canonical-corruption", fretRange: { min: 0, max: 24 } });
    const shiftedEvent = { ...exercise.targetEvents[0], midiNote: exercise.targetEvents[0].midiNote + 12 };
    const shifted = { ...exercise, targetEvents: [shiftedEvent, ...exercise.targetEvents.slice(1)], singingReference: { ...exercise.singingReference, events: [{ ...exercise.singingReference.events[0], midiNote: shiftedEvent.midiNote + 12 * exercise.singingReference.resolvedOctaveShift }, ...exercise.singingReference.events.slice(1)] } };
    expect(() => addCompletedAttempt(createEmptyPracticeFile(NOW), completed({ id: "playable-wrong", exercise: shifted }))).toThrow("semantic validation");
    expect(() => addCompletedAttempt(createEmptyPracticeFile(NOW), completed({ id: "forged-id", exercise: { ...exercise, id: "degree-forged" } }))).toThrow("semantic validation");
    expect(() => addCompletedAttempt(createEmptyPracticeFile(NOW), completed({ id: "forged-version", exercise: { ...exercise, generatorVersion: "forged" } }))).toThrow("semantic validation");
    expect(() => addCompletedAttempt(createEmptyPracticeFile(NOW), completed({ id: "forged-reference", exercise: { ...exercise, singingReference: { ...exercise.singingReference, mode: "original" } } }))).toThrow("semantic validation");
  });

  it("isolates duplicate persisted attempt IDs as a whole-file corruption", async () => {
    const storage = new MemoryPracticeStorage();
    const file = addCompletedAttempt(createEmptyPracticeFile(NOW), completed());
    storage.committed = `${JSON.stringify({ ...file, revision: 1, attempts: [...file.attempts, file.attempts[0]] })}\n`;
    const loaded = await new JsonPracticeRepository(storage, () => NOW).load();
    expect(loaded.recovery?.kind).toBe("invalid-schema");
    expect(loaded.file.attempts).toEqual([]);
    expect(loaded.file.sessions).toEqual([]);
  });

  it("lists validated backups and restores a selected last-good snapshot through CAS", async () => {
    const storage = new MemoryPracticeStorage(); const repository = new JsonPracticeRepository(storage, () => NOW);
    const first = addCompletedAttempt(createEmptyPracticeFile(NOW), completed());
    const savedFirst = await repository.save(first);
    const second = addCompletedAttempt(savedFirst, completed({ id: "second", completedAt: "2026-08-02T10:01:00.000Z", exercise: generatedExercise({ seed: "second" }) }));
    await repository.save(second);
    const backups = await repository.listBackups();
    expect(backups).toHaveLength(1);
    storage.committed = "{broken";
    const recovery = await repository.load();
    expect(recovery.recovery).toMatchObject({ kind: "invalid-json", backups: [{ name: backups[0].name }] });
    const restored = await repository.restoreBackup(backups[0].name);
    expect(restored.file.attempts.map(({ id }) => id)).toEqual(["attempt-1"]);
    expect(restored.file.revision).toBe(1);
    expect(storage.corrupt.size).toBe(1);
    const afterRestart = await new JsonPracticeRepository(storage, () => NOW).load();
    expect(afterRestart).toMatchObject({ created: false, file: { revision: 1 } });
    expect(afterRestart.recovery).toBeUndefined();
  });

  it("resolves retained recovery with explicit Start Fresh without deleting corrupt artifacts", async () => {
    const storage = new MemoryPracticeStorage(); storage.committed = "{broken";
    await new JsonPracticeRepository(storage, () => NOW).load();
    const restarted = new JsonPracticeRepository(storage, () => NOW);
    await restarted.load();

    await expect(restarted.startFresh()).resolves.toMatchObject({ created: true, file: { revision: 1 } });
    expect(storage.corrupt.size).toBe(1);
    const afterRestart = await new JsonPracticeRepository(storage, () => NOW).load();
    expect(afterRestart).toMatchObject({ created: false, file: { revision: 1 } });
    expect(afterRestart.recovery).toBeUndefined();
  });

  it("rejects an envelope-valid but domain-invalid backup before changing canonical data", async () => {
    const storage = new MemoryPracticeStorage(); const repository = new JsonPracticeRepository(storage, () => NOW);
    const first = await repository.save(addCompletedAttempt(createEmptyPracticeFile(NOW), completed()));
    await repository.save(addCompletedAttempt(first, completed({ id: "second", completedAt: "2026-08-02T10:01:00.000Z", exercise: generatedExercise({ seed: "second-invalid-backup" }) })));
    const [backup] = await storage.listBackups(); const candidate = await storage.readBackup(backup.name);
    const parsed = JSON.parse(candidate.contents) as PracticeFileV1;
    storage.backups.set(backup.name, `${JSON.stringify({ ...parsed, reviewQueue: [] })}\n`);
    storage.committed = "{broken";
    const recovery = await repository.load();
    expect(recovery.recovery?.backups).toEqual([]);
    const retainedCorrupt = [...storage.corrupt.values()];

    await expect(repository.restoreBackup(backup.name)).rejects.toThrow("review queue");
    expect(storage.committed).toBeUndefined();
    expect([...storage.corrupt.values()]).toEqual(retainedCorrupt);
  });
});
