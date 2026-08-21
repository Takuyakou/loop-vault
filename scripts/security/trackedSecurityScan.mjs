import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const genericUserNames = new Set([
  "<name>", "<user>", "<username>", "alice", "example", "private", "test-user", "user", "username",
]);

const personalPathPatterns = [
  { kind: "windows-user-path", regex: /[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/]([^\\/\s"'`]+)[\\/]/giu },
  { kind: "unix-user-path", regex: /\/(?:home|Users)\/([^/\s"'`]+)\//gu },
];

const secretPatterns = [
  { kind: "private-key", regex: new RegExp("-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE" + " KEY-----", "g") },
  { kind: "github-token", regex: new RegExp("\\bgh" + "[pousr]_[A-Za-z0-9]{20,}\\b", "g") },
  { kind: "aws-access-key", regex: new RegExp("\\bAK" + "IA[0-9A-Z]{16}\\b", "g") },
  { kind: "npm-token", regex: new RegExp("\\bnpm" + "_[A-Za-z0-9]{36,}\\b", "g") },
  { kind: "credential-url", regex: /https?:\/\/[^/\s:@]+:[^/\s@]+@/gu },
];

export function scanText(text, file = "<memory>") {
  const findings = [];
  for (const { kind, regex } of personalPathPatterns) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      const userName = match[1]?.toLowerCase();
      if (userName && !genericUserNames.has(userName)) {
        findings.push(finding(file, text, match.index ?? 0, kind));
      }
    }
  }
  for (const { kind, regex } of secretPatterns) {
    regex.lastIndex = 0;
    for (const match of text.matchAll(regex)) {
      findings.push(finding(file, text, match.index ?? 0, kind));
    }
  }
  return findings;
}

export function scanRepository(root = process.cwd()) {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" },
  );
  const findings = [];
  for (const file of output.split("\0").filter(Boolean)) {
    const bytes = readFileSync(resolve(root, file));
    if (bytes.includes(0)) continue;
    findings.push(...scanText(bytes.toString("utf8"), file));
  }
  return findings;
}

function finding(file, text, index, kind) {
  return {
    file,
    line: text.slice(0, index).split("\n").length,
    kind,
  };
}

function runCli() {
  const findings = scanRepository();
  for (const { file, line, kind } of findings) {
    process.stderr.write(`${file}:${line}: ${kind} detected ([REDACTED])\n`);
  }
  if (findings.length > 0) process.exitCode = 1;
  else process.stdout.write("Tracked security scan PASS (redacted output).\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCli();
}
