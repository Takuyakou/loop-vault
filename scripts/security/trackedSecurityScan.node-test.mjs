import assert from "node:assert/strict";
import test from "node:test";
import { scanText } from "./trackedSecurityScan.mjs";

test("detects personal paths without returning the matched value", () => {
  const source = ["C:", "Users", "actual-account", "project"].join("\\");
  const findings = scanText(source, "fixture.txt");
  assert.deepEqual(findings, [{ file: "fixture.txt", line: 1, kind: "windows-user-path" }]);
  assert.equal(JSON.stringify(findings).includes("actual-account"), false);
});

test("allows documented placeholders and negative-test usernames", () => {
  assert.deepEqual(scanText("C:\\Users\\<username>\\project\n/home/test-user/project/"), []);
});

test("detects high-signal credentials without returning their value", () => {
  const token = ["gh", "p_", "A".repeat(24)].join("");
  const findings = scanText(token, "fixture.txt");
  assert.deepEqual(findings, [{ file: "fixture.txt", line: 1, kind: "github-token" }]);
  assert.equal(JSON.stringify(findings).includes(token), false);
});
