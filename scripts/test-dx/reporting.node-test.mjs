import assert from "node:assert/strict";
import { test } from "node:test";
import { diagnostics, summaryCounts } from "./reporting.mjs";

test("PASS summaries preserve exact test totals", () => {
  assert.equal(summaryCounts("Tests  3751 passed (3751)", "vitest"), "3751/3751");
  assert.equal(summaryCounts("  129 passed (2.0m)", "browser"), "129/129");
  assert.equal(summaryCounts("ℹ pass 16", "node"), "16/16");
});

test("failure summary retains spec, assertion, location and trace but drops success noise", () => {
  const output = [
    "  ok 1 a successful test", "  ok 2 another successful test",
    "  1) [chromium-desktop] › e2e/example.spec.ts:35:1 › candidate header",
    "    Error: expect(locator).toHaveAttribute(expected) failed",
    "    Expected: true", "    Received: false",
    "        at e2e/example.spec.ts:35:1",
    "    attachment: test-results/example/trace.zip",
    "  1 failed",
  ].join("\n");
  const short = diagnostics(output);
  assert.match(short, /example\.spec\.ts:35:1/);
  assert.match(short, /Expected: true/);
  assert.match(short, /Received: false/);
  assert.match(short, /trace\.zip/);
  assert.doesNotMatch(short, /another successful/);
});
