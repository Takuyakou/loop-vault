export interface SeededRandom {
  readonly next: () => number;
  readonly integer: (minimum: number, maximumInclusive: number) => number;
}

export function createSeededRandom(seed: string): SeededRandom {
  let state = hash32(seed);
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
  return Object.freeze({
    next,
    integer: (minimum: number, maximumInclusive: number): number => {
      if (
        !Number.isInteger(minimum)
        || !Number.isInteger(maximumInclusive)
        || maximumInclusive < minimum
      ) {
        throw new RangeError("Random integer bounds must be ordered integers.");
      }
      return minimum + Math.floor(next() * (maximumInclusive - minimum + 1));
    },
  });
}

export function stableHash(value: unknown): string {
  const input = stableStringify(value);
  const first = hash32(input);
  const second = hash32(`${input}\u0000${first.toString(16)}`);
  return `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
