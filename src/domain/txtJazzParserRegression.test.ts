import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { parseChordLabel, parseTextChordLabel } from "./chords";
import { parseTextProgression } from "./textProgression";
import { parseExtendedTextChordLabel, parseExtendedTextProgression } from "./extendedTextProgression";

interface BaselineRecord { sha256: string; fn: string; args: unknown[]; output: unknown; threw: boolean; calls: number }
interface ApprovedDifference { recordSha256: string; reason: "new-text-alias" | "approved-text-minor-major-display"; expectedOutputSha256: string }
const baselineUrl = new URL("../../docs/txt-jazz/evidence/parser-regression-before.json",import.meta.url);
const ledgerUrl = new URL("../../docs/txt-jazz/evidence/stage01/parser-approved-differences.json",import.meta.url);
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
function restore(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(restore);
  if (value && typeof value === "object") {
    const object = value as Record<string,unknown>;
    if (Object.keys(object).length === 1 && object.$undefined === true) return undefined;
    if (Object.keys(object).length === 1 && typeof object.$number === "string") return Number(object.$number);
    return Object.fromEntries(Object.entries(object).map(([key,child]) => [key,restore(child)]));
  }
  return value;
}
function snapshot(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value,(_key,child) => child === undefined ? { $undefined: true }
    : typeof child === "number" && !Number.isFinite(child) ? { $number: String(child) } : child));
}
const parsers: Record<string,(...args: unknown[]) => unknown> = {
  parseChordLabel: (...args) => parseChordLabel(args[0] as string),
  parseTextChordLabel: (...args) => parseTextChordLabel(args[0] as string),
  parseExtendedTextChordLabel: (...args) => parseExtendedTextChordLabel(args[0] as string),
  parseTextProgression: (...args) => parseTextProgression(args[0] as string,args[1] as Parameters<typeof parseTextProgression>[1]),
  parseExtendedTextProgression: (...args) => parseExtendedTextProgression(args[0] as string,args[1] as Parameters<typeof parseExtendedTextProgression>[1]),
};

describe("TXT-JAZZ frozen Stage 00 parser regression", () => {
  it("replays every captured input exactly, allowing only independently reviewed explicit differences", () => {
    const baselineText = readFileSync(baselineUrl,"utf8");
    const baseline = JSON.parse(baselineText);
    const decoded = inflateSync(Buffer.from(baseline.capture.data,"base64")).toString("utf8");
    // Git's Windows checkout may use CRLF; the frozen logical file uses LF.
    expect(sha256(baselineText.replace(/\r\n/g,"\n")).toUpperCase()).toBe("1DAA4AEE1D77028D75DBDF0AB5441166EDA02BF04E58AA80F481C1BA4329F043");
    expect(sha256(decoded)).toBe("d1d88963276d0118002e25af19a6ab99c8ea7012a2e6842f0bc2b6be37e7cb2d");
    expect(baseline.capture.decodedSha256).toBe("d1d88963276d0118002e25af19a6ab99c8ea7012a2e6842f0bc2b6be37e7cb2d");
    const records: BaselineRecord[] = JSON.parse(decoded);
    expect(records).toHaveLength(14537);
    expect(records.reduce((n,r) => n+r.calls,0)).toBe(217481);
    const ledger: { differences: ApprovedDifference[] } = JSON.parse(readFileSync(ledgerUrl,"utf8"));
    const approved = new Map(ledger.differences.map(entry => [entry.recordSha256,entry]));
    expect(approved.size).toBe(ledger.differences.length);
    const observed: { recordSha256: string; fn: string; args: unknown[]; before: unknown; after: unknown; expectedOutputSha256: string }[] = [];
    const unexpected: string[] = [];
    for (const record of records) {
      expect(record.threw).toBe(false);
      expect(parsers[record.fn],record.fn).toBeDefined();
      const output = snapshot(parsers[record.fn](...(restore(record.args) as unknown[])));
      if (JSON.stringify(output) === JSON.stringify(record.output)) {
        if (approved.has(record.sha256)) unexpected.push(`unused approval ${record.sha256}`);
        continue;
      }
      const expectedOutputSha256 = sha256(JSON.stringify(output));
      observed.push({ recordSha256:record.sha256, fn:record.fn,args:record.args,before:record.output,after:output,expectedOutputSha256 });
      const approval = approved.get(record.sha256);
      if (record.fn === "parseChordLabel" || !approval || approval.expectedOutputSha256 !== expectedOutputSha256) {
        unexpected.push(`${record.fn} ${record.sha256}`);
      }
    }
    if (process.env.TXT_JAZZ_INSPECT === "1") {
      const directory = new URL("../../p12-generated/TXT-JAZZ/stage01/",import.meta.url);
      mkdirSync(directory,{recursive:true});
      writeFileSync(new URL("parser-replay-observed.json",directory),JSON.stringify({unique:records.length,calls:217481,unchanged:records.length-observed.length,differences:observed},null,2)+"\n");
    }
    expect(observed).toHaveLength(approved.size);
    expect(unexpected).toEqual([]);
  },30_000);
});
