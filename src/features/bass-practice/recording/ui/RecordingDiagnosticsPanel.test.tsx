// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, test } from "vitest";
import { RecordingDiagnosticsPanel } from "./RecordingDiagnosticsPanel";
import { RecordingSessionController } from "../application/recordingSessionController";
import {
  FakeCaptureDeviceRepository,
  FakePracticeRecorder,
  FakeRecordingCapability,
  InMemoryRecordingTakeRepository,
} from "../application/fakes";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function fakeController() {
  return new RecordingSessionController(
    {
      capability: FakeRecordingCapability.available(),
      devices: new FakeCaptureDeviceRepository(),
      recorder: new FakePracticeRecorder(),
      takes: new InMemoryRecordingTakeRepository(),
    },
    // Explicit channel: with no live input metering in the harness, Auto cannot
    // resolve a channel (that decision needs Record Setup, wired in P5.17-02).
    "mono-sum",
  );
}

describe("RecordingDiagnosticsPanel", () => {
  test("renders nothing when the feature flag is off", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<RecordingDiagnosticsPanel enabledOverride={false} />));
    expect(container.textContent).toBe("");
    await act(async () => root.unmount());
    document.body.replaceChildren();
  });

  test("probes on mount and drives the capture flow without scoring language", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const controller = fakeController();

    await act(async () => root.render(
      <RecordingDiagnosticsPanel controller={controller} enabledOverride />,
    ));
    const status = () => container.querySelector("[data-testid=recorder-status]")?.textContent ?? "";
    expect(status()).toContain("idle");
    expect(container.textContent).not.toContain("Accuracy");
    expect(container.textContent).not.toContain("Score");

    const click = async (label: string) => {
      const button = [...container.querySelectorAll("button")].find((b) => b.textContent === label);
      // Flush the controller's async chain (permission, recorder, storage) so
      // the resulting state update is applied inside act before we assert.
      await act(async () => {
        button?.click();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    };

    await click("Enable recording");
    expect(status()).toContain("ready");
    await click("Start count-in");
    await click("Begin recording");
    expect(status()).toContain("recording");
    await click("Stop");
    expect(status()).toContain("recorded");
    await click("Keep Take");
    expect(status()).toContain("saved");

    await act(async () => root.unmount());
    expect(controller.getState().status).toBe("idle"); // disposed on unmount
    document.body.replaceChildren();
  });
});
