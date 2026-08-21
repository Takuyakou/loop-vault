import { beforeEach, describe, expect, it, vi } from "vitest";
import { MIDI_INTAKE_LIMITS } from "../security/intakeBudgets";
import { readBoundedMidiPath, readBoundedMidiPaths } from "./boundedMidiReader";

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  stat: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => mocks);

describe("bounded MIDI reader", () => {
  beforeEach(() => {
    mocks.readFile.mockReset();
    mocks.stat.mockReset();
  });

  it("checks metadata before reading and rechecks returned bytes", async () => {
    mocks.stat.mockResolvedValue({ size: 3 });
    mocks.readFile.mockResolvedValue(Uint8Array.from([1, 2, 3]));

    await expect(readBoundedMidiPath("selected.mid")).resolves.toEqual(
      Uint8Array.from([1, 2, 3]),
    );
    expect(mocks.stat.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.readFile.mock.invocationCallOrder[0],
    );
  });

  it("rejects oversized metadata without reading file contents", async () => {
    mocks.stat.mockResolvedValue({ size: MIDI_INTAKE_LIMITS.maxBytesPerFile + 1 });

    await expect(readBoundedMidiPath("oversized.mid")).rejects.toMatchObject({
      code: "midi-file-bytes",
    });
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("rejects a file that grows beyond the post-read budget", async () => {
    mocks.stat.mockResolvedValue({ size: 1 });
    mocks.readFile.mockResolvedValue({
      byteLength: MIDI_INTAKE_LIMITS.maxBytesPerFile + 1,
    });
    await expect(readBoundedMidiPath("changed.mid")).rejects.toMatchObject({
      code: "midi-file-bytes",
    });
  });

  it("rejects too many files before invoking filesystem APIs", async () => {
    const paths = Array.from(
      { length: MIDI_INTAKE_LIMITS.maxFiles + 1 },
      (_, index) => `${index}.mid`,
    );
    await expect(readBoundedMidiPaths(paths)).rejects.toMatchObject({
      code: "midi-file-count",
    });
    expect(mocks.stat).not.toHaveBeenCalled();
  });
});
