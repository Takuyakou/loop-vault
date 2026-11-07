/**
 * One clock for the seconds (P16-00 decisions §8).
 *
 * Three clocks are in play: the audio context's (`currentTime`, seconds, started when the context was made),
 * `performance.now()` (milliseconds, started when the page was opened) and the time stamps of MIDI events.
 * They are never subtracted from each other as they are. The audio times are turned into `performance.now()`
 * times through `getOutputTimestamp()` (taken several times, the median used: one reading can be off by a
 * lot when the screen is busy), and the output latency is added. `onended` is not used: it comes before the
 * sound has left the speakers and is as late as the main thread is busy.
 */

export interface OutputTimestampSource {
  getOutputTimestamp?: () => { contextTime?: number; performanceTime?: number };
  /** Seconds. */
  outputLatency?: number;
  /** Seconds. */
  currentTime: number;
}

export interface AudioToPerformance {
  /** A time of the audio context (seconds) as a `performance.now()` time (milliseconds), output latency included. */
  toPerformanceMs(contextSeconds: number): number;
  /** The spread of the offset readings (max − min), milliseconds. A large spread means the readings cannot be trusted. */
  spreadMs: number;
  outputLatencyMs: number;
  samples: number;
}

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export interface SampleOptions {
  /** How many readings (default 5). */
  samples?: number;
  /** Wait between readings, milliseconds (default 20). */
  intervalMs?: number;
  wait?: (ms: number) => Promise<void>;
  /** `performance.now()` (injected in tests). */
  performanceNow?: () => number;
}

const realWait = (ms: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms));

/** The offset `performance time − context time × 1000`, read `samples` times; its median and spread. */
export async function createAudioToPerformance(
  source: OutputTimestampSource,
  options: SampleOptions = {},
): Promise<AudioToPerformance> {
  const count = options.samples ?? 5;
  const wait = options.wait ?? realWait;
  const now = options.performanceNow ?? (() => globalThis.performance.now());
  const offsets: number[] = [];
  for (let index = 0; index < count; index += 1) {
    if (index > 0) await wait(options.intervalMs ?? 20);
    const stamp = source.getOutputTimestamp?.();
    if (stamp && stamp.performanceTime && stamp.contextTime !== undefined && stamp.performanceTime > 0) {
      offsets.push(stamp.performanceTime - stamp.contextTime * 1000);
    } else {
      // The browser gave no usable pair: the clocks are compared right now instead.
      offsets.push(now() - source.currentTime * 1000);
    }
  }
  const offset = median(offsets);
  const outputLatencyMs = Math.max(0, (source.outputLatency ?? 0) * 1000);
  return {
    toPerformanceMs: (contextSeconds) => contextSeconds * 1000 + offset + outputLatencyMs,
    spreadMs: Math.max(...offsets) - Math.min(...offsets),
    outputLatencyMs,
    samples: offsets.length,
  };
}
