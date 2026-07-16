import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const sourceRoot = path.resolve("src");
const sourceExtensions = new Set([".html", ".js", ".jsx", ".ts", ".tsx"]);
const invalidVariableUtility = /\b(?:[a-z0-9_-]+:)*[a-z][a-z0-9_-]*-\[var\(--[a-z0-9_-]+\)\][a-z0-9_-]+/gi;
const failures = [];

for (const filePath of await sourceFiles(sourceRoot)) {
  const source = await readFile(filePath, "utf8");
  for (const match of source.matchAll(invalidVariableUtility)) {
    const line = source.slice(0, match.index).split("\n").length;
    failures.push({
      file: path.relative(process.cwd(), filePath),
      line,
      value: match[0],
    });
  }
}

if (failures.length > 0) {
  process.stderr.write("Invalid Tailwind CSS-variable utilities found:\n");
  for (const failure of failures) {
    process.stderr.write(`  ${failure.file}:${failure.line} ${failure.value}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write("Tailwind CSS-variable utilities are valid.\n");
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(entryPath));
    } else if (sourceExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}
