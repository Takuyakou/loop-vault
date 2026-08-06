import {
  BrowserCaptureDeviceRepository,
  BrowserPracticeRecorder,
  BrowserRecordingCapability,
} from "./browserAdapters";
import { InMemoryRecordingStore } from "./recordingStore";
import { IndexedDbRecordingStore, isIndexedDbAvailable } from "./indexedDbRecordingStore";
import { PersistentRecordingTakeRepository } from "./recordingStore";
import { RecordingSessionController } from "./recordingSessionController";
import type { RecordingTakeRepository } from "./ports";

/**
 * Wires the production browser adapters into a controller. Kept takes persist in
 * IndexedDB (binary-safe, Vault-independent, survives restart in browsers and
 * WebView2); when IndexedDB is unavailable, an in-memory store keeps the feature
 * usable for the current session only.
 */

export function createPersistentTakeRepository(): PersistentRecordingTakeRepository {
  const store = isIndexedDbAvailable() ? new IndexedDbRecordingStore() : new InMemoryRecordingStore();
  return new PersistentRecordingTakeRepository(store);
}

export function createRecordingTakeRepository(): RecordingTakeRepository {
  return createPersistentTakeRepository();
}

export function createBrowserRecordingController(
  takeRepository: RecordingTakeRepository = createRecordingTakeRepository(),
): RecordingSessionController {
  return new RecordingSessionController({
    capability: new BrowserRecordingCapability(),
    devices: new BrowserCaptureDeviceRepository(),
    recorder: new BrowserPracticeRecorder(),
    takes: takeRepository,
  });
}
