// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserPracticeRecorder } from "./browserAdapters";

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");

afterEach(() => {
  if (originalMediaDevices) Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
  else Reflect.deleteProperty(navigator, "mediaDevices");
});

describe("BrowserPracticeRecorder", () => {
  it("stops a late getUserMedia stream after disposal during start", async () => {
    let resolveStream: ((stream: MediaStream) => void) | undefined;
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((resolve) => { resolveStream = resolve; }));
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });

    const recorder = new BrowserPracticeRecorder();
    const pendingStart = recorder.start({
      mimeType: "audio/webm;codecs=opus",
      channelMode: "mono-sum",
      resolvedChannel: "mono-sum",
    });
    recorder.dispose();

    let stopped = 0;
    const stream = {
      getTracks: () => [{ stop: () => { stopped += 1; } }],
    } as unknown as MediaStream;
    resolveStream?.(stream);
    await pendingStart;

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(stopped).toBe(1);
  });
});
