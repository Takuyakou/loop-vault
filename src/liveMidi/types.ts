export interface LiveMidiDevice {
  backendId: string;
  name: string;
  index: number;
}

export interface RawLiveMidiEvent {
  timestampMs: number;
  status: number;
  channel: number;
  data1: number;
  data2: number;
}

export interface RawLiveMidiEventBatch {
  connectionId: string;
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
