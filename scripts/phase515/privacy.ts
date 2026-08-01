import { readFile, readdir } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

export interface PrivacyIssue {
  path: string;
  code:
    | "absolute-path"
    | "file-uri"
    | "email"
    | "private-field"
    | "user-identifier"
    | "malformed-json";
}

const approvedPrivacyFields = new Set([
  "personalMidiIncluded",
  "absolutePathsIncluded",
  "userRealMidi",
  "do_not_commit_personal_midi",
]);
const privateFieldSnake = /(?:^|_)(?:private|personal(?:_?file(?:name)?)?|absolute_?path|source_?path|file_?path|user(?:name|_?id)?|email|memo|source_?title)(?:$|_)/i;
const privateFieldCamel = /(?:private|personalFilename|absolutePath|sourcePath|filePath|userName|userId|sourceTitle|email|memo)(?:$|[A-Z])/;
const windowsAbsolute = /(?:^|[\s"'`([{=:;,])(?:[A-Za-z]:[\\/]|\\\\[^\\/\s"'`]+[\\/][^\\/\s"'`]+)/;
const posixAbsolute = /(?:^|[\s"'`([{=:;,])\/(?!\/)(?:[^\s"'`)\]},;]|\/)+/;
const fileUri = /file:\/\//i;
const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const userIdentifier = /\b(?:user(?:name|_?id)?|account(?:_?id)?)\s*[:=]\s*["']?[A-Z0-9._-]+/i;

export function findPrivacyIssues(value: unknown, rootPath = "<root>"): PrivacyIssue[] {
  const issues: PrivacyIssue[] = [];
  const walk = (item: unknown, path: string) => {
    if (typeof item === "string") {
      if (windowsAbsolute.test(item) || posixAbsolute.test(item)) {
        issues.push({ path, code: "absolute-path" });
      }
      if (fileUri.test(item)) issues.push({ path, code: "file-uri" });
      if (email.test(item)) issues.push({ path, code: "email" });
      if (userIdentifier.test(item)) issues.push({ path, code: "user-identifier" });
      return;
    }
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) {
      item.forEach((child, index) => walk(child, `${path}.${index}`));
      return;
    }
    for (const [key, child] of Object.entries(item)) {
      const childPath = `${path}.${key}`;
      if (
        !approvedPrivacyFields.has(key)
        && (privateFieldSnake.test(key) || privateFieldCamel.test(key))
      ) {
        issues.push({ path: childPath, code: "private-field" });
      }
      walk(child, childPath);
    }
  };
  walk(value, rootPath);
  return issues;
}

export function findPrivacyIssuesInText(text: string, path: string): PrivacyIssue[] {
  const issues: PrivacyIssue[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const location = `${path}:${index + 1}`;
    if (windowsAbsolute.test(line) || posixAbsolute.test(line)) {
      issues.push({ path: location, code: "absolute-path" });
    }
    if (/file:\/\//i.test(line)) issues.push({ path: location, code: "file-uri" });
    if (email.test(line)) issues.push({ path: location, code: "email" });
    if (userIdentifier.test(line)) issues.push({ path: location, code: "user-identifier" });
    for (const match of line.matchAll(/["']([^"']+)["']\s*:/g)) {
      const key = match[1]!;
      if (
        !approvedPrivacyFields.has(key)
        && (privateFieldSnake.test(key) || privateFieldCamel.test(key))
      ) {
        issues.push({ path: `${location}.${key}`, code: "private-field" });
      }
    }
  });
  return issues;
}

export async function scanPrivacyArtifacts(
  repositoryRoot: string,
  roots = ["docs/phase5.15", "artifacts/phase5.15"],
): Promise<PrivacyIssue[]> {
  const issues: PrivacyIssue[] = [];
  const scan = async (path: string): Promise<void> => {
    const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const child = resolve(path, entry.name);
      if (entry.isDirectory()) {
        await scan(child);
      } else if ([".json", ".md", ".txt", ".jsonl"].includes(extname(entry.name))) {
        const display = relative(repositoryRoot, child).replaceAll("\\", "/");
        const text = await readFile(child, "utf8");
        if (extname(entry.name) === ".json") {
          try {
            issues.push(...findPrivacyIssues(JSON.parse(text), display));
          } catch {
            issues.push({ path: display, code: "malformed-json" });
          }
        }
        issues.push(...findPrivacyIssuesInText(text, display));
      }
    }
  };
  for (const root of roots) await scan(resolve(repositoryRoot, root));
  return issues;
}
