export interface LiveMidiDevice {
  backendId: string;
  name: string;
  index: number;
}

export interface RawLiveMidiEvent {
  timestampMs: number;
  receivedAtMs?: number;
  status: number;
  channel: number;
  data1: number;
  data2: number;
}

export interface RawLiveMidiEventBatch {
  connectionId: string;
  emittedAtMs?: number;
  frontendReceivedAtMs?: number;
  events: RawLiveMidiEvent[];
}

export type LiveMidiConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface PreferredMidiInput {
  backendId?: string;
  name: string;
  previousIndex?: number;
}
