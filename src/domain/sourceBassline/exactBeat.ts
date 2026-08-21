import type { ExactBeat } from "./types";

export function exactBeat(numerator: number, denominator: number): ExactBeat {
  assertSafeInteger(numerator, "numerator");
  assertSafeInteger(denominator, "denominator");
  if (denominator <= 0) throw new Error("Exact beat denominator must be positive.");
  if (numerator === 0) return { numerator: 0, denominator: 1 };
  const divisor = gcd(BigInt(Math.abs(numerator)), BigInt(denominator));
  return checkedBeat(BigInt(numerator) / divisor, BigInt(denominator) / divisor);
}

export function exactBeatFromTicks(ticks: number, ticksPerQuarter: number): ExactBeat {
  return exactBeat(ticks, ticksPerQuarter);
}

export function compareExactBeat(left: ExactBeat, right: ExactBeat): number {
  const difference = BigInt(left.numerator) * BigInt(right.denominator)
    - BigInt(right.numerator) * BigInt(left.denominator);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export function addExactBeat(left: ExactBeat, right: ExactBeat): ExactBeat {
  return checkedBeat(
    BigInt(left.numerator) * BigInt(right.denominator)
      + BigInt(right.numerator) * BigInt(left.denominator),
    BigInt(left.denominator) * BigInt(right.denominator),
  );
}

export function isCanonicalExactBeat(value: ExactBeat): boolean {
  if (!Number.isSafeInteger(value.numerator)
    || !Number.isSafeInteger(value.denominator)
    || value.denominator <= 0) return false;
  if (value.numerator === 0) return value.denominator === 1;
  return gcd(BigInt(Math.abs(value.numerator)), BigInt(value.denominator)) === 1n;
}

function checkedBeat(numerator: bigint, denominator: bigint): ExactBeat {
  if (denominator === 0n) throw new Error("Exact beat denominator must be positive.");
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const divisor = gcd(numerator < 0n ? -numerator : numerator, denominator);
  numerator /= divisor;
  denominator /= divisor;
  const asNumber = Number(numerator);
  const denominatorNumber = Number(denominator);
  if (!Number.isSafeInteger(asNumber) || !Number.isSafeInteger(denominatorNumber)) {
    throw new Error("Exact beat exceeds the supported integer range.");
  }
  return asNumber === 0
    ? { numerator: 0, denominator: 1 }
    : { numerator: asNumber, denominator: denominatorNumber };
}

function gcd(left: bigint, right: bigint): bigint {
  while (right !== 0n) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left || 1n;
}

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`Exact beat ${label} must be a safe integer.`);
}
