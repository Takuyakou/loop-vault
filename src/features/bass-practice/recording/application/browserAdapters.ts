import type {
  CaptureDevice,
  PermissionState,
  RecordingTakeMetadata,
  ResolvedChannel,
} from "../domain/types";
import type {
  CaptureDeviceRepository,
  PracticeRecorder,
  RecordingCapability,
  RecordingCapabilityReport,
  RecordingTake,
  StartRecordingOptions,
} from "./ports";
import { negotiateCodec } from "../domain/codecNegotiation";

/**
 * Browser / WebView2 implementations of the recording ports. These are the
 * production adapters; unit tests use the fakes instead, so this file is never
 * required to run against a real microphone in CI. The capture graph never
 * connects to the speakers (no app-side monitoring; contract 04).
 */

const REQUIRED_APIS: readonly { readonly name: string; readonly present: () => boolean }[] = [
  { name: "navigator.mediaDevices", present: () => typeof navigator !== "undefined" && !!navigator.mediaDevices },
  { name: "getUserMedia", present: () => !!navigator.mediaDevices?.getUserMedia },
  { name: "enumerateDevices", present: () => !!navigator.mediaDevices?.enumerateDevices },
  { name: "MediaRecorder", present: () => typeof MediaRecorder !== "undefined" },
  { name: "MediaRecorder.isTypeSupported", present: () => typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function" },
  { name: "AudioContext", present: () => typeof AudioContext !== "undefined" },
];

export class BrowserRecordingCapability implements RecordingCapability {
  probe(): RecordingCapabilityReport {
    const missing = REQUIRED_APIS.filter((api) => !safe(api.present)).map((api) => api.name);
    // No supported codec means recording is impossible even if the APIs exist;
    // fold it into the probe so the feature disables instead of failing later.
    if (missing.length === 0 && !negotiateCodec((mime) => MediaRecorder.isTypeSupported(mime))) {
      missing.push("supported audio codec");
    }
    return Object.freeze({ available: missing.length === 0, missing: Object.freeze(missing) });
  }
}

export class BrowserCaptureDeviceRepository implements CaptureDeviceRepository {
  async requestPermission(): Promise<PermissionState> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop()); // probe only; release immediately
      return "granted";
    } catch {
      return "denied";
    }
  }

  async currentPermission(): Promise<PermissionState> {
    try {
      const permissions = (navigator as Navigator & { permissions?: Permissions }).permissions;
      if (!permissions?.query) return "unknown";
      const status = await permissions.query({ name: "microphone" as PermissionName });
      return status.state === "granted" ? "granted" : status.state === "denied" ? "denied" : "prompt";
    } catch {
      return "unknown";
    }
  }

  async listDevices(): Promise<readonly CaptureDevice[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === "audioinput")
      .map((device, index) => ({
        id: device.deviceId,
        label: device.label || `Input ${index + 1}`,
      }));
  }

  onDeviceChange(listener: () => void): () => void {
    const target = navigator.mediaDevices;
    if (!target?.addEventListener) return () => {};
    target.addEventListener("devicechange", listener);
    return () => target.removeEventListener("devicechange", listener);
  }
}

export class BrowserPracticeRecorder implements PracticeRecorder {
  private context?: AudioContext;
  private stream?: MediaStream;
  private recorder?: MediaRecorder;
  private nodes: AudioNode[] = [];
  private chunks: Blob[] = [];
  private startedAt = 0;
  private options?: StartRecordingOptions;

  async start(options: StartRecordingOptions): Promise<void> {
    this.dispose(); // never stack graphs; start from a clean slate
    this.options = options;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
        channelCount: 2,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const context = new AudioContext();
    this.context = context;
    const source = context.createMediaStreamSource(this.stream);
    const splitter = context.createChannelSplitter(2);
    const merger = context.createChannelMerger(1);
    const destination = context.createMediaStreamDestination();
    source.connect(splitter);
    connectMono(splitter, merger, options.resolvedChannel);
    merger.connect(destination);
    this.nodes = [source, splitter, merger];

    const recorder = new MediaRecorder(destination.stream, { mimeType: options.mimeType });
    this.chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder = recorder;
    this.startedAt = Date.now();
    recorder.start();
  }

  async stop(): Promise<RecordingTake | undefined> {
    const recorder = this.recorder;
    const options = this.options;
    if (!recorder || !options) {
      this.dispose();
      return undefined;
    }
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(this.chunks, { type: options.mimeType }));
      if (recorder.state !== "inactive") recorder.stop();
      else resolve(new Blob(this.chunks, { type: options.mimeType }));
    });
    const durationMs = Math.max(0, Date.now() - this.startedAt);
    const metadata: RecordingTakeMetadata = {
      mimeType: options.mimeType,
      durationMs,
      byteSize: blob.size,
      channelMode: options.channelMode,
      resolvedChannel: options.resolvedChannel,
      startOffsetMs: 0,
    };
    this.dispose();
    return { metadata, data: blob };
  }

  dispose(): void {
    try {
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    } catch {
      /* recorder already torn down */
    }
    if (this.recorder) this.recorder.ondataavailable = null;
    this.recorder = undefined;
    this.nodes.forEach((node) => {
      try {
        node.disconnect();
      } catch {
        /* node already disconnected */
      }
    });
    this.nodes = [];
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    if (this.context && this.context.state !== "closed") void this.context.close();
    this.context = undefined;
    this.chunks = [];
    this.options = undefined;
  }
}

function connectMono(
  splitter: ChannelSplitterNode,
  merger: ChannelMergerNode,
  channel: ResolvedChannel,
): void {
  if (channel === "left") {
    splitter.connect(merger, 0, 0);
  } else if (channel === "right") {
    splitter.connect(merger, 1, 0);
  } else {
    splitter.connect(merger, 0, 0);
    splitter.connect(merger, 1, 0); // mono sum
  }
}

function safe(predicate: () => boolean): boolean {
  try {
    return predicate();
  } catch {
    return false;
  }
}
