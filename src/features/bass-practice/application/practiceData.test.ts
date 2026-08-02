import { describe, expect, it } from "vitest";
import { createCompletedAttempt } from "../domain";
import { generatedExercise } from "../domain/testFixtures";
import { addCompletedAttempt, createEmptyPracticeFile, JsonPracticeRepository, MemoryPracticeStorage, validatePracticeFile } from "../infra/repository";
import { createPracticeControllerIfEnabled, derivePracticeHistory, derivePracticeHomeSummary, PracticeDataController, restoreClaimedExercise } from "./practiceData";

const now = new Date("2026-08-02T10:00:00.000Z");
function attempt(id: string, rating: "again" | "hard" | "good" | "easy", mainIssue?: "recall") {
  return createCompletedAttempt({ id, sessionId: "session", startedAt: "2026-08-02T09:59:00.000Z", completedAt: "2026-08-02T10:00:00.000Z", listenCount: 2, hintLevel: rating === "good" ? 0 : 3, singSkipped: false, singGateCompleted: true, rating, mainIssue, exercise: generatedExercise({ seed: id }) });
}
class RawStaleOnceStorage extends MemoryPracticeStorage {
  private rejectNext = true;
  override commit(contents: string, timestampToken: string, expectedRevision?: number, expectedToken?: string): Promise<number> {
    if (this.rejectNext) {
      this.rejectNext = false;
      return Promise.reject("Practice storage could not save stale revision.");
    }
    return super.commit(contents, timestampToken, expectedRevision, expectedToken);
  }
}

describe("Practice derived views", () => {
  it("performs zero Practice storage operations while the external feature flag is OFF", () => {
    const storageFactory = () => { throw new Error("storage must not be created"); };
    expect(createPracticeControllerIfEnabled(false, storageFactory)).toBeUndefined();
  });
  it("derives honest Home and History summaries from saved attempts", () => {
    let file = createEmptyPracticeFile(now);
    file = addCompletedAttempt(file, attempt("good", "good", "recall"));
    file = addCompletedAttempt(file, attempt("hard", "hard", "recall"));
    const home = derivePracticeHomeSummary(file, now);
    expect(home).toEqual({ firstRun: false, dueCount: 1, completedToday: 2, nextFocus: "recall" });
    const history = derivePracticeHistory(file);
    expect(history[0]).toMatchObject({ completedCount: 2, goodOrEasyCount: 1, independentSuccessCount: 1, averageListenCount: 2, nextFocus: "recall" });
    expect(JSON.stringify(history)).not.toMatch(/accuracy|score|confidence/i);
  });

  it("does not publish a failed save and can retry without reconstructing the session", async () => {
    const storage = new MemoryPracticeStorage();
    const controller = new PracticeDataController(new JsonPracticeRepository(storage, () => now));
    await controller.initialize(); storage.failCommit = true;
    await expect(controller.recordAttempt(attempt("retry", "good"))).rejects.toThrow();
    expect(controller.getSnapshot().file?.attempts).toHaveLength(0);
    storage.failCommit = false; await controller.recordAttempt(attempt("retry", "good"));
    expect(controller.getSnapshot().file?.attempts).toHaveLength(1);
  });

  it("does not retry or duplicate a review when post-commit cleanup reports only a warning", async () => {
    const storage = new MemoryPracticeStorage(); storage.failPostCommitCleanup = true;
    const controller = new PracticeDataController(new JsonPracticeRepository(storage, () => now));
    await controller.initialize(); await controller.recordAttempt(attempt("postcommit-once", "good"));
    expect(controller.getSnapshot().file?.attempts.map(({ id }) => id)).toEqual(["postcommit-once"]);
    const reloaded = await new JsonPracticeRepository(storage, () => now).load();
    expect(reloaded.file.attempts.map(({ id }) => id)).toEqual(["postcommit-once"]);
    expect(storage.operations).toContain("post-commit-cleanup-warning");
  });

  it("persists reproducibility settings independently from the feature flag", async () => {
    const storage = new MemoryPracticeStorage();
    const controller = new PracticeDataController(new JsonPracticeRepository(storage, () => now));
    await controller.initialize();
    await controller.updateSettings({ version: 1, singEnabled: false, singingReferenceMode: "octave-1", stringCount: 5, handedness: "left", fretRange: { min: 3, max: 15 }, sessionTargetCount: 8 });
    const reloaded = await new JsonPracticeRepository(storage, () => now).load();
    expect(reloaded.file.settings).toMatchObject({ stringCount: 5, handedness: "left", singingReferenceMode: "octave-1" });
    expect(JSON.stringify(reloaded.file)).not.toContain("enableBassPracticeDegreeEcho");
  });

  it("keeps an unsupported future-version canonical byte-for-byte read-only across every mutation path", async () => {
    const storage = new MemoryPracticeStorage(); storage.committed = '{"app":"loopvault-practice","fileVersion":2,"revision":99,"future":"keep"}\n';
    const repository = new JsonPracticeRepository(storage, () => now); const controller = new PracticeDataController(repository);
    const before = await storage.readCommitted(); await controller.initialize();
    expect(controller.getSnapshot()).toMatchObject({ status: "future-version", error: expect.stringMatching(/read-only/i) });
    const mutations = [
      () => controller.recordAttempt(attempt("future-record", "good")),
      () => controller.claimNextExercise("future-session", now),
      () => controller.ensureSession("future-session", now),
      () => controller.abandonSession("future-session", now),
      () => controller.updateSettings(createEmptyPracticeFile(now).settings),
      () => controller.restoreBackup("practice-20260802-123456-000000.json"),
      () => controller.startFresh(),
      () => repository.save(createEmptyPracticeFile(now)),
    ];
    for (const mutation of mutations) await expect(mutation()).rejects.toThrow();
    await controller.retryLoad();
    expect(controller.getSnapshot().status).toBe("future-version");
    expect(await storage.readCommitted()).toEqual(before);
    expect(storage.corrupt.size).toBe(0);
  });

  it("requires an explicit validated backup choice after invalid JSON quarantine", async () => {
    const storage = new MemoryPracticeStorage(); const repository = new JsonPracticeRepository(storage, () => now);
    const first = await repository.save(addCompletedAttempt(createEmptyPracticeFile(now), attempt("recovery-first", "good")));
    await repository.save(addCompletedAttempt(first, attempt("recovery-second", "good")));
    storage.committed = "{broken";
    const controller = new PracticeDataController(new JsonPracticeRepository(storage, () => now));
    await controller.initialize();
    const failed = controller.getSnapshot();
    expect(failed).toMatchObject({ status: "recovery-required", backups: [{ revision: 1 }], recovery: { kind: "invalid-json" } });
    expect(storage.committed).toBeUndefined();
    const writesBeforeChoice = storage.operations.filter((operation) => operation === "write-temp").length;
    await controller.retryLoad();
    expect(controller.getSnapshot().status).toBe("recovery-required");
    expect(storage.operations.filter((operation) => operation === "write-temp")).toHaveLength(writesBeforeChoice);
    const restarted = new PracticeDataController(new JsonPracticeRepository(storage, () => now));
    await restarted.initialize();
    expect(restarted.getSnapshot()).toMatchObject({ status: "recovery-required", backups: [{ revision: 1 }], recovery: { kind: "retained-corrupt" } });
    expect(storage.operations.filter((operation) => operation === "write-temp")).toHaveLength(writesBeforeChoice);
    if (failed.status !== "recovery-required" || !failed.backups[0]) throw new Error("Expected one validated recovery backup.");
    const backupName = failed.backups[0].name;
    await controller.restoreBackup(backupName);
    expect(storage.operations.filter((operation) => operation === "write-temp")).toHaveLength(writesBeforeChoice + 1);
    expect(controller.getSnapshot()).toMatchObject({ status: "ready", file: { revision: 1, attempts: [{ id: "recovery-first" }] } });
  });

  it("creates a new canonical file only after explicit Start Fresh and retains the corrupt original", async () => {
    const storage = new MemoryPracticeStorage(); storage.committed = "{broken";
    const controller = new PracticeDataController(new JsonPracticeRepository(storage, () => now));
    await controller.initialize();
    expect(controller.getSnapshot().status).toBe("recovery-required");
    expect(storage.committed).toBeUndefined(); expect(storage.corrupt.size).toBe(1);
    await controller.startFresh();
    expect(controller.getSnapshot()).toMatchObject({ status: "ready", file: { revision: 1, attempts: [] } });
    expect(storage.committed).toContain('"revision": 1'); expect(storage.corrupt.size).toBe(1);
    const restarted = new PracticeDataController(new JsonPracticeRepository(storage, () => now));
    await restarted.initialize();
    expect(restarted.getSnapshot()).toMatchObject({ status: "ready", file: { revision: 1 } });
  });

  it("fails closed when recovery artifact discovery is unavailable", async () => {
    const storage = new MemoryPracticeStorage(); storage.failListRecoveryArtifacts = true;
    const controller = new PracticeDataController(new JsonPracticeRepository(storage, () => now));
    await controller.initialize();
    expect(controller.getSnapshot()).toMatchObject({ status: "error", error: expect.stringMatching(/unavailable/i) });
    await expect(controller.recordAttempt(attempt("blocked", "good"))).rejects.toThrow(/not ready/i);
    expect(storage.committed).toBeUndefined();
  });

  it("claims Again only after its deterministic offset, restores the claim, and acknowledges it", async () => {
    const storage = new MemoryPracticeStorage();
    const controller = new PracticeDataController(new JsonPracticeRepository(storage, () => now));
    await controller.initialize();
    await controller.recordAttempt(attempt("again-source", "again", "recall"));
    expect(await controller.claimNextExercise("session", now)).toBeUndefined();
    await controller.recordAttempt(attempt("intervening-1", "good"));
    expect(await controller.claimNextExercise("session", now)).toBeUndefined();
    await controller.recordAttempt(attempt("intervening-2", "good"));
    const queued = await controller.claimNextExercise("session", now);
    expect(queued?.exercise.seed).toBe("review-v1:again-source:again");
    expect(controller.getSnapshot().file?.reviewQueue.find(({ sourceAttemptId }) => sourceAttemptId === "again-source")?.claim?.sessionId).toBe("session");
    const claimedFile = controller.getSnapshot().file!;
    expect(() => validatePracticeFile({ ...claimedFile, sessions: claimedFile.sessions.map((session) => ({ ...session, abandoned: true, completedAt: now.toISOString() })) })).toThrow();

    const restarted = new PracticeDataController(new JsonPracticeRepository(storage, () => now));
    await restarted.initialize();
    const restored = restoreClaimedExercise(restarted.getSnapshot().file!, "session");
    expect(restored).toEqual(queued);
    expect((await restarted.claimNextExercise("session", now))?.exercise.id).toBe(queued?.exercise.id);

    await restarted.recordAttempt(attempt("unrelated-normal", "good"));
    expect(restarted.getSnapshot().file?.reviewQueue.some(({ sourceAttemptId }) => sourceAttemptId === "again-source")).toBe(true);
    await restarted.recordAttempt(createCompletedAttempt({
      id: "again-retry", sessionId: "session", startedAt: "2026-08-02T10:01:00.000Z", completedAt: "2026-08-02T10:02:00.000Z",
      listenCount: 1, hintLevel: 0, singSkipped: false, singGateCompleted: true, rating: "good",
      reviewQueueClaimId: queued!.claimId, exercise: queued!.exercise,
    }));
    expect(restarted.getSnapshot().file?.reviewQueue.some(({ sourceAttemptId }) => sourceAttemptId === "again-source")).toBe(false);
    expect(derivePracticeHomeSummary(restarted.getSnapshot().file!, now).dueCount).toBe(0);
  });

  it("quarantines a corrupt claimed descendant and restores its source leaf as unclaimed pending", async () => {
    const storage = new MemoryPracticeStorage(); const controller = new PracticeDataController(new JsonPracticeRepository(storage, () => now));
    await controller.initialize(); await controller.recordAttempt(attempt("repair-source", "again", "recall"));
    await controller.recordAttempt(attempt("repair-valid-1", "good")); await controller.recordAttempt(attempt("repair-valid-2", "good"));
    const claim = await controller.claimNextExercise("session", now);
    await controller.recordAttempt(createCompletedAttempt({
      id: "corrupt-claimed-descendant", sessionId: "session", startedAt: "2026-08-02T10:01:00.000Z", completedAt: "2026-08-02T10:02:00.000Z",
      listenCount: 1, hintLevel: 0, singSkipped: false, singGateCompleted: true, rating: "good",
      reviewQueueClaimId: claim!.claimId, exercise: claim!.exercise,
    }));
    const persisted = JSON.parse(storage.committed!) as { attempts: Array<Record<string, unknown>> };
    persisted.attempts = persisted.attempts.map((entry) => entry.id === "corrupt-claimed-descendant" ? { ...entry, independentSuccess: false } : entry);
    storage.committed = `${JSON.stringify(persisted)}\n`;

    const repaired = await new JsonPracticeRepository(storage, () => now).load();
    expect(repaired.recovery).toBeUndefined();
    expect(repaired.quarantine).toEqual([{ collection: "attempts", index: 3, issue: "independent-success-mismatch" }]);
    expect(repaired.file.attempts.map(({ id }) => id)).toEqual(["repair-source", "repair-valid-1", "repair-valid-2"]);
    expect(repaired.file.sessions[0]).toMatchObject({ completedCount: 3, completedAt: undefined, abandoned: false, attemptIds: ["repair-source", "repair-valid-1", "repair-valid-2"] });
    expect(repaired.file.reviewQueue.find(({ sourceAttemptId }) => sourceAttemptId === "repair-source")?.claim).toBeUndefined();
  });

  it("reconciles a stale controller so concurrent attempts are not lost", async () => {
    const storage = new MemoryPracticeStorage();
    const left = new PracticeDataController(new JsonPracticeRepository(storage, () => now));
    const right = new PracticeDataController(new JsonPracticeRepository(storage, () => now));
    await left.initialize(); await left.recordAttempt(attempt("left", "good"));
    await right.initialize();
    await left.recordAttempt(attempt("left-next", "good"));
    await right.recordAttempt(attempt("right", "good"));
    const final = await new JsonPracticeRepository(storage, () => now).load();
    expect(final.file.attempts.map(({ id }) => id)).toEqual(["left", "left-next", "right"]);
  });

  it("reloads and rebases when a native adapter exposes stale revision as a raw string", async () => {
    const storage = new RawStaleOnceStorage();
    const controller = new PracticeDataController(new JsonPracticeRepository(storage, () => now));
    await controller.initialize();
    await controller.recordAttempt(attempt("string-stale", "good"));
    expect(controller.getSnapshot().file?.attempts.map(({ id }) => id)).toEqual(["string-stale"]);
    expect(storage.operations.filter((operation) => operation === "read")).toHaveLength(2);
  });

  it("restores one active eight-exercise session and completes it without changing sessionId", async () => {
    const storage = new MemoryPracticeStorage();
    let controller = new PracticeDataController(new JsonPracticeRepository(storage, () => now)); await controller.initialize();
    for (let index = 0; index < 3; index += 1) await controller.recordAttempt(attempt(`before-${index}`, "good"));
    controller = new PracticeDataController(new JsonPracticeRepository(storage, () => now)); await controller.initialize();
    expect(controller.getSnapshot().file?.sessions[0]).toMatchObject({ id: "session", targetCount: 8, completedCount: 3, completedAt: undefined, abandoned: false });
    for (let index = 3; index < 8; index += 1) await controller.recordAttempt(attempt(`after-${index}`, "good"));
    expect(controller.getSnapshot().file?.sessions[0]).toMatchObject({ id: "session", completedCount: 8, completedAt: "2026-08-02T10:00:00.000Z" });
    expect(derivePracticeHistory(controller.getSnapshot().file!)[0].completedCount).toBe(8);
  });

  it("claims Hard at the session boundary and Good/Easy only at their due dates", async () => {
    const hardStorage = new MemoryPracticeStorage(); const hard = new PracticeDataController(new JsonPracticeRepository(hardStorage, () => now)); await hard.initialize();
    await hard.recordAttempt(attempt("hard-source", "hard"));
    for (let index = 0; index < 5; index += 1) await hard.recordAttempt(attempt(`hard-fill-${index}`, "good"));
    expect(await hard.claimNextExercise("session", now)).toBeUndefined();
    await hard.recordAttempt(attempt("hard-fill-5", "good"));
    const hardExercise = await hard.claimNextExercise("session", now);
    expect(hardExercise?.exercise.tempo).toBe(Math.round(attempt("hard-source", "hard").exerciseSnapshot.tempo * 0.9));

    const goodStorage = new MemoryPracticeStorage(); const good = new PracticeDataController(new JsonPracticeRepository(goodStorage, () => now)); await good.initialize();
    const goodSource = attempt("good-source", "good"); await good.recordAttempt(goodSource);
    expect(await good.claimNextExercise("session", now)).toBeUndefined();
    const variation = await good.claimNextExercise("session", new Date("2026-08-03T10:00:00.000Z"));
    expect(variation?.exercise.tonalContext.key).not.toBe(goodSource.exerciseSnapshot.tonalContext.key);

    const easyStorage = new MemoryPracticeStorage(); const easy = new PracticeDataController(new JsonPracticeRepository(easyStorage, () => now)); await easy.initialize();
    const easySource = attempt("easy-source", "easy"); await easy.recordAttempt(easySource);
    expect(await easy.claimNextExercise("session", new Date("2026-08-04T10:00:00.000Z"))).toBeUndefined();
    const easyClaim = await easy.claimNextExercise("session", new Date("2026-08-05T10:00:00.000Z"));
    expect(easyClaim?.transferOfAttemptId).toBe(easySource.id);
    await easy.recordAttempt(createCompletedAttempt({
      id: "easy-transfer", sessionId: "session", startedAt: "2026-08-05T10:01:00.000Z", completedAt: "2026-08-05T10:02:00.000Z",
      listenCount: 1, hintLevel: 0, singSkipped: false, singGateCompleted: true, rating: "good",
      reviewQueueClaimId: easyClaim!.claimId, transferOfAttemptId: easyClaim!.transferOfAttemptId, exercise: easyClaim!.exercise,
    }));
    expect(derivePracticeHistory(easy.getSnapshot().file!)[0].transferCount).toBe(1);
    expect(easy.getSnapshot().file?.reviewQueue.some(({ sourceAttemptId }) => sourceAttemptId === easySource.id)).toBe(false);
  });

  it("marks an incomplete route-leave session abandoned and releases its queue claim", async () => {
    const storage = new MemoryPracticeStorage(); const controller = new PracticeDataController(new JsonPracticeRepository(storage, () => now)); await controller.initialize();
    await controller.recordAttempt(attempt("abandon", "again", "recall"));
    await controller.abandonSession("session", new Date("2026-08-02T10:05:00.000Z"));
    const reloaded = await new JsonPracticeRepository(storage, () => now).load();
    expect(reloaded.file.sessions[0]).toMatchObject({ abandoned: true, completedAt: "2026-08-02T10:05:00.000Z" });
    expect(reloaded.file.reviewQueue.every(({ claim }) => claim === undefined)).toBe(true);
  });
});
