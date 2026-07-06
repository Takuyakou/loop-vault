import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createEmptyVault,
  type VaultBackup,
  type VaultLoadResult,
  type VaultRepository,
} from "../domain/repository";
import type { VaultFile } from "../domain/types";
import { makeIdea } from "../domain/testFactory";
import { createVaultStore } from "./vaultStore";

class FakeRepository implements VaultRepository {
  loadResult: VaultLoadResult = {
    vault: createEmptyVault(),
    quarantine: [],
    created: false,
  };
  saved: VaultFile[] = [];

  async load(): Promise<VaultLoadResult> {
    return this.loadResult;
  }

  async save(vault: VaultFile): Promise<void> {
    this.saved.push(structuredClone(vault));
  }

  async exportTo(): Promise<void> {
    throw new Error("Not implemented");
  }

  async importFrom(): Promise<VaultLoadResult> {
    throw new Error("Not implemented");
  }

  async listBackups(): Promise<VaultBackup[]> {
    return [];
  }

  async restore(): Promise<VaultLoadResult> {
    throw new Error("Not implemented");
  }
}

const now = new Date("2026-07-20T12:00:00.000Z");
const generatedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("vault store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads ideas and settings from the repository", async () => {
    const repository = new FakeRepository();
    const idea = makeIdea({ id: generatedId });
    repository.loadResult = {
      vault: {
        ...createEmptyVault(),
        ideas: [idea],
        settings: { monthlyGoal: 2 },
      },
      quarantine: [],
      created: false,
    };
    const store = createVaultStore({ repository });

    await store.getState().initialize();

    expect(store.getState().ideas).toEqual([idea]);
    expect(store.getState().settings.monthlyGoal).toBe(2);
    expect(store.getState().loadStatus).toBe("ready");
  });

  it("debounces autosave for edits", async () => {
    const repository = new FakeRepository();
    const store = createVaultStore({
      repository,
      idFactory: () => generatedId,
      now: () => now,
    });
    await store.getState().initialize();

    store.getState().createIdea("  Night Drive  ");

    expect(store.getState().unsaved).toBe(true);
    expect(repository.saved).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(499);
    expect(repository.saved).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(repository.saved).toHaveLength(1);
    expect(repository.saved[0]?.ideas[0]?.title).toBe("Night Drive");
    expect(store.getState().unsaved).toBe(false);
  });

  it("flushes pending changes immediately", async () => {
    const repository = new FakeRepository();
    const store = createVaultStore({
      repository,
      idFactory: () => generatedId,
      now: () => now,
    });
    await store.getState().initialize();

    store.getState().createIdea("Immediate");
    await store.getState().flush();
    await vi.advanceTimersByTimeAsync(500);

    expect(repository.saved).toHaveLength(1);
    expect(store.getState().unsaved).toBe(false);
  });

  it("updates Next Action as a single slot and touches updatedAt", async () => {
    const repository = new FakeRepository();
    const idea = makeIdea({
      id: generatedId,
      nextAction: { text: "", updatedAt: "2026-07-01T00:00:00.000Z" },
    });
    repository.loadResult = {
      vault: { ...createEmptyVault(), ideas: [idea] },
      quarantine: [],
      created: false,
    };
    const store = createVaultStore({ repository, now: () => now });
    await store.getState().initialize();

    store.getState().updateNextAction(generatedId, "Replace the bass", now);

    expect(store.getState().ideas[0]?.nextAction).toEqual({
      text: "Replace the bass",
      updatedAt: now.toISOString(),
    });
    expect(store.getState().ideas[0]?.updatedAt).toBe(now.toISOString());
  });

  it("uses transition domain logic and does not save invalid jumps", async () => {
    const repository = new FakeRepository();
    repository.loadResult = {
      vault: {
        ...createEmptyVault(),
        ideas: [makeIdea({ id: generatedId, status: "idea" })],
      },
      quarantine: [],
      created: false,
    };
    const store = createVaultStore({ repository, now: () => now });
    await store.getState().initialize();

    const result = store.getState().transitionIdea(generatedId, "mix", now);

    expect(result.ok).toBe(false);
    expect(store.getState().unsaved).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(repository.saved).toHaveLength(0);
  });
});
