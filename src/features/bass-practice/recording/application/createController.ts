import {
  BrowserCaptureDeviceRepository,
  BrowserPracticeRecorder,
  BrowserRecordingCapability,
} from "./browserAdapters";
import { InMemoryRecordingTakeRepository } from "./fakes";
import { RecordingSessionController } from "./recordingSessionController";
import type { RecordingTakeRepository } from "./ports";

/**
 * Wires the production browser adapters into a controller. Persistence is a
 * placeholder in-memory repository for P5.17-01 (the real Vault-independent
 * binary store lands in P5.17-03); everything else is the real capture stack.
 */
export function createBrowserRecordingController(
  takeRepository: RecordingTakeRepository = new InMemoryRecordingTakeRepository(),
): RecordingSessionController {
  return new RecordingSessionController({
    capability: new BrowserRecordingCapability(),
    devices: new BrowserCaptureDeviceRepository(),
    recorder: new BrowserPracticeRecorder(),
    takes: takeRepository,
  });
}
