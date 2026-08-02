import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import mapping from "../assets/freepats-bass-yr/mapping.json";
import manifest from "../assets/freepats-bass-yr/asset-manifest.json";
import { lowBassPitchOffsetSemitones, resolveFreepatsRegion } from "./freepatsBass";

const assetRoot = join(process.cwd(), "src", "features", "bass-practice", "assets", "freepats-bass-yr");
const cache = new Map<string, Float64Array>();

function sha256(buffer: Buffer): string { return createHash("sha256").update(buffer).digest("hex"); }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function wavSamples(path: string): Float64Array {
  const existing = cache.get(path); if (existing) return existing;
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
  expect(bytes.subarray(8, 12).toString("ascii")).toBe("WAVE");
  let offset = 12; let data: Buffer | undefined; let sampleRate = 0; let channels = 0; let bitDepth = 0;
  while (offset + 8 <= bytes.length) {
    const id = bytes.subarray(offset, offset + 4).toString("ascii"); const length = bytes.readUInt32LE(offset + 4); const body = offset + 8;
    if (id === "fmt ") { sampleRate = bytes.readUInt32LE(body + 4); channels = bytes.readUInt16LE(body + 2); bitDepth = bytes.readUInt16LE(body + 14); }
    if (id === "data") data = bytes.subarray(body, body + length);
    offset = body + length + (length % 2);
  }
  expect(sampleRate).toBe(44100); expect(channels).toBe(1); expect(bitDepth).toBe(16); expect(data).toBeDefined();
  const samples = new Float64Array(data!.length / 2);
  for (let index = 0; index < samples.length; index += 1) samples[index] = data!.readInt16LE(index * 2) / 32768;
  cache.set(path, samples); return samples;
}
function renderOffline(timbre: "finger" | "pick", midiKey: number): Float64Array {
  const region = resolveFreepatsRegion(timbre, midiKey);
  const source = wavSamples(join(assetRoot, region.samplePath));
  const rate = 2 ** ((midiKey - region.rootKey) / 12);
  const result = new Float64Array(11_025);
  for (let index = 0; index < result.length; index += 1) {
    const sourceIndex = Math.min(source.length - 1, Math.floor(index * rate));
    const release = index > result.length - 2_205 ? (result.length - index) / 2_205 : 1;
    result[index] = source[sourceIndex] * 0.8 * Math.max(0, Math.min(1, release));
  }
  return result;
}
function rms(samples: Float64Array): number { return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length); }
function peak(samples: Float64Array): number { return samples.reduce((value, sample) => Math.max(value, Math.abs(sample)), 0); }
function allSamplePaths(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? allSamplePaths(join(directory, entry.name)) : [relative(assetRoot, join(directory, entry.name)).split("\\").join("/")]);
}

describe("FreePats Bass Guitar YR asset gate", () => {
  it("pins the CC0 upstream commit and only maps existing bundled WAV assets", () => {
    expect(mapping.upstream.commit).toBe("8dcb7ea9116f417273ef8c030d15e7b3aa654301");
    expect(mapping.upstream.license).toBe("CC0-1.0");
    for (const instrument of Object.values(mapping.instruments)) for (const region of instrument.regions) expect(() => wavSamples(join(assetRoot, region.samplePath))).not.toThrow();
  });

  it("decodes every sample and verifies the manifest hashes with no unregistered audio", () => {
    const manifestBody = { version: manifest.version, upstreamCommit: manifest.upstreamCommit, assets: manifest.assets };
    expect(sha256(Buffer.from(stableJson(manifestBody)))).toBe(manifest.manifestSha256);
    expect(allSamplePaths(join(assetRoot, "samples")).sort()).toEqual(manifest.assets.map((asset) => asset.path).sort());
    for (const asset of manifest.assets) {
      const bytes = readFileSync(join(assetRoot, asset.path));
      expect(bytes.length).toBe(asset.bytes); expect(sha256(bytes)).toBe(asset.sha256);
      const samples = wavSamples(join(assetRoot, asset.path));
      expect(samples.some((value) => !Number.isFinite(value))).toBe(false);
      expect(peak(samples)).toBeGreaterThan(0.001);
    }
  });

  it("uses the official E1 root for B0 through C#1 and has deterministic nearest-root selection", () => {
    for (const note of [23, 24, 25]) { expect(resolveFreepatsRegion("finger", note).rootKey).toBe(28); expect(lowBassPitchOffsetSemitones(note)).toBe(note - 28); }
    expect(mapping.officialMapping.lowestMidiKey).toBe(26);
    expect(resolveFreepatsRegion("pick", 38)).toEqual(resolveFreepatsRegion("pick", 38));
  });

  it("offline-renders B0 through G3 without silence, NaN, clipping, or missing release", () => {
    for (const timbre of ["finger", "pick"] as const) for (let midiKey = 23; midiKey <= 55; midiKey += 1) {
      const rendered = renderOffline(timbre, midiKey);
      expect(rendered.some((value) => !Number.isFinite(value))).toBe(false);
      expect(peak(rendered)).toBeLessThan(1);
      expect(rms(rendered)).toBeGreaterThan(0.0001);
      expect(rms(rendered.subarray(rendered.length - 1_024))).toBeLessThan(rms(rendered.subarray(0, 1_024)));
    }
  });

  it("applies the low-B peak, RMS, spectral-presence, and clipping gate to B0/C1/C#1/D1/E1", () => {
    for (const midiKey of [23, 24, 25, 26, 28]) {
      const rendered = renderOffline("finger", midiKey);
      const zeroCrossings = rendered.slice(0, 8_820).reduce((count, sample, index) => index > 0 && Math.sign(sample) !== Math.sign(rendered[index - 1]) ? count + 1 : count, 0);
      expect(peak(rendered)).toBeGreaterThan(0.005);
      expect(peak(rendered)).toBeLessThan(1);
      expect(rms(rendered)).toBeGreaterThan(0.0005);
      expect(zeroCrossings).toBeGreaterThan(3);
    }
  });
});