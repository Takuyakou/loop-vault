import { describe, expect, it, vi } from "vitest";
import { LiveMidiActivationLeaseManager, LiveMidiOpenGate } from "./activationLease";

describe("LiveMidiActivationLeaseManager", () => {
  it("does not deactivate a store that was already active before the first lease", async () => {
    const activate = vi.fn(async () => undefined);
    const deactivate = vi.fn(async () => undefined);
    const manager = new LiveMidiActivationLeaseManager({
      getState: () => ({ active: true, activate, deactivate }),
    });
    const lease = manager.acquire();
    await lease.ready;
    lease.release();
    await Promise.resolve();
    await Promise.resolve();
    expect(activate).not.toHaveBeenCalled();
    expect(deactivate).not.toHaveBeenCalled();
  });

  it("does not deactivate during a Dojo to Voicing Loop sibling handoff", async () => {
    let active = false;
    const activate = vi.fn(async () => { active = true; });
    const deactivate = vi.fn(async () => { active = false; });
    const manager = new LiveMidiActivationLeaseManager({
      getState: () => ({ active, activate, deactivate }),
    });
    const dojo = manager.acquire();
    await dojo.ready;
    dojo.release();
    const voicingLoop = manager.acquire();
    await voicingLoop.ready;
    await Promise.resolve();
    expect(deactivate).not.toHaveBeenCalled();
    expect(activate).toHaveBeenCalledTimes(1);
    voicingLoop.release();
    await Promise.resolve();
    await Promise.resolve();
    expect(deactivate).toHaveBeenCalledTimes(1);
  });

  it("keeps mini mode active when Practice acquired first and leaves first", async () => {
    let active = false;
    const activate = vi.fn(async () => { active = true; });
    const deactivate = vi.fn(async () => { active = false; });
    const manager = new LiveMidiActivationLeaseManager({
      getState: () => ({ active, activate, deactivate }),
    });
    const practice = manager.acquire();
    await practice.ready;
    const mini = manager.acquire();
    await mini.ready;
    practice.release();
    await Promise.resolve();
    expect(deactivate).not.toHaveBeenCalled();
    mini.release();
    await Promise.resolve();
    await Promise.resolve();
    expect(deactivate).toHaveBeenCalledTimes(1);
  });

  it("keeps Practice active when mini mode acquired first and closes first", async () => {
    let active = false;
    const activate = vi.fn(async () => { active = true; });
    const deactivate = vi.fn(async () => { active = false; });
    const manager = new LiveMidiActivationLeaseManager({
      getState: () => ({ active, activate, deactivate }),
    });
    const mini = manager.acquire();
    await mini.ready;
    const practice = manager.acquire();
    await practice.ready;
    mini.release();
    await Promise.resolve();
    expect(deactivate).not.toHaveBeenCalled();
    practice.release();
    await Promise.resolve();
    await Promise.resolve();
    expect(deactivate).toHaveBeenCalledTimes(1);
  });

  it("cleans up a manager-owned activation that becomes active before rejecting", async () => {
    let active = false;
    const activate = vi.fn(async () => {
      active = true;
      throw new Error("activation failed after opening");
    });
    const deactivate = vi.fn(async () => { active = false; });
    const manager = new LiveMidiActivationLeaseManager({
      getState: () => ({ active, activate, deactivate }),
    });
    const lease = manager.acquire();
    await expect(lease.ready).rejects.toThrow("activation failed after opening");
    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(active).toBe(false);
    lease.release();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(active).toBe(false);
  });

  it("rolls back partial active before a concurrent lease retries activation", async () => {
    let active = false;
    let finishRollback!: () => void;
    let activationAttempt = 0;
    const activate = vi.fn(async () => {
      activationAttempt += 1;
      active = true;
      if (activationAttempt === 1) throw new Error("first activation failed");
    });
    const deactivate = vi.fn(async () => {
      if (deactivate.mock.calls.length === 1) {
        await new Promise<void>((resolve) => { finishRollback = resolve; });
      }
      active = false;
    });
    const manager = new LiveMidiActivationLeaseManager({
      getState: () => ({ active, activate, deactivate }),
    });
    const first = manager.acquire();
    const second = manager.acquire();
    let secondReady = false;
    void second.ready.then(() => { secondReady = true; });
    await Promise.resolve();
    await Promise.resolve();
    expect(active).toBe(true);
    expect(deactivate).toHaveBeenCalledTimes(1);
    expect(secondReady).toBe(false);

    finishRollback();
    await expect(first.ready).rejects.toThrow("first activation failed");
    await second.ready;
    expect(activate).toHaveBeenCalledTimes(2);
    expect(secondReady).toBe(true);
    first.release();
    second.release();
    await Promise.resolve();
    await Promise.resolve();
    expect(deactivate).toHaveBeenCalledTimes(2);
  });

  it("serializes a new activation behind an already-started deferred deactivation", async () => {
    let active = false;
    let finishDeactivate!: () => void;
    const deactivate = vi.fn(async () => {
      active = false;
      await new Promise<void>((resolve) => { finishDeactivate = resolve; });
    });
    const activate = vi.fn(async () => { active = true; });
    const manager = new LiveMidiActivationLeaseManager({
      getState: () => ({ active, activate, deactivate }),
    });
    const first = manager.acquire();
    await first.ready;
    expect(activate).toHaveBeenCalledTimes(1);
    first.release();
    await Promise.resolve();
    await Promise.resolve();
    expect(deactivate).toHaveBeenCalledTimes(1);

    const second = manager.acquire();
    finishDeactivate();
    await second.ready;
    expect(activate).toHaveBeenCalledTimes(2);
    expect(active).toBe(true);
  });
});

describe("LiveMidiOpenGate", () => {
  it("deduplicates concurrent enter operations", async () => {
    const gate = new LiveMidiOpenGate();
    let finishOpen!: () => void;
    const open = vi.fn(async () => {
      await new Promise<void>((resolve) => { finishOpen = resolve; });
    });
    const first = gate.enter(async () => open());
    const second = gate.enter(async () => open());
    await Promise.resolve();
    expect(open).toHaveBeenCalledTimes(1);
    finishOpen();
    await Promise.all([first, second]);
  });

  it("invalidates a pending open before close so no late lease is acquired", async () => {
    const gate = new LiveMidiOpenGate();
    let finishOpen!: () => void;
    let leases = 0;
    const pending = gate.enter(async (isCurrent) => {
      await new Promise<void>((resolve) => { finishOpen = resolve; });
      if (isCurrent()) leases += 1;
    });
    await Promise.resolve();
    const close = vi.fn(async () => undefined);
    const closing = gate.close(close);
    finishOpen();
    await Promise.all([pending, closing]);
    expect(leases).toBe(0);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not start another enter while close is pending", async () => {
    const gate = new LiveMidiOpenGate();
    let finishClose!: () => void;
    const close = gate.close(async () => {
      await new Promise<void>((resolve) => { finishClose = resolve; });
    });
    const lateOpen = vi.fn(async () => undefined);
    const enterDuringClose = gate.enter(async () => lateOpen());
    await Promise.resolve();
    expect(lateOpen).not.toHaveBeenCalled();
    finishClose();
    await Promise.all([close, enterDuringClose]);
    expect(lateOpen).not.toHaveBeenCalled();
  });
});
