import { describe, expect, test, vi } from "vitest";
import type { ProgressionMidiExportResult } from "../domain/midiExport";
import { startProgressionMidiDrag } from "./nativeDrag";

const result = {
  bytes: new Uint8Array([0x4d, 0x54, 0x68, 0x64]),
} as ProgressionMidiExportResult;

function preparedArtifact(dragToken: string) {
  return {
    dragToken,
    fileName: "clip.mid",
    tempPath: "private",
    bytesLength: 4,
    preparedAt: 1,
    expiresAt: 2,
    contentHash: "hash",
    reused: false,
  };
}

describe("startProgressionMidiDrag", () => {
  test("starts native drag only after preparation and passes only its token", async () => {
    const order: string[] = [];
    const prepare = vi.fn(async () => {
      order.push("prepare");
      return preparedArtifact("prepared-token");
    });
    const invoke = vi.fn(async () => {
      order.push("drag");
      return { status: "dropped" as const, effect: 1 };
    });

    await expect(
      startProgressionMidiDrag(result, { prepare, invoke }),
    ).resolves.toEqual({ status: "dropped", effect: 1 });

    expect(order).toEqual(["prepare", "drag"]);
    expect(invoke).toHaveBeenCalledWith("start_progression_midi_drag", {
      dragToken: "prepared-token",
    });
  });

  test("does not invoke native drag when preparation fails", async () => {
    const invoke = vi.fn();
    await expect(
      startProgressionMidiDrag(result, {
        prepare: vi.fn().mockRejectedValue(new Error("prepare failed")),
        invoke,
      }),
    ).rejects.toThrow("prepare failed");
    expect(invoke).not.toHaveBeenCalled();
  });

  test("treats user cancellation as a normal result", async () => {
    const prepare = vi.fn().mockResolvedValue(preparedArtifact("prepared-token"));
    const invoke = vi
      .fn()
      .mockResolvedValue({ status: "cancelled", effect: 0 });
    await expect(
      startProgressionMidiDrag(result, { prepare, invoke }),
    ).resolves.toEqual({ status: "cancelled", effect: 0 });
  });

  test("prepares every sequential drag and keeps calls deterministic", async () => {
    let sequence = 0;
    const prepare = vi.fn(async () => preparedArtifact(`token-${++sequence}`));
    const invoke = vi
      .fn()
      .mockResolvedValue({ status: "dropped", effect: 1 });

    await startProgressionMidiDrag(result, { prepare, invoke });
    await startProgressionMidiDrag(result, { prepare, invoke });

    expect(invoke.mock.calls).toEqual([
      ["start_progression_midi_drag", { dragToken: "token-1" }],
      ["start_progression_midi_drag", { dragToken: "token-2" }],
    ]);
  });
});
