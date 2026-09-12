import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const failures = [];

await checkIconContracts();
await checkAdvisorBoundary();
await checkWindowsReleaseSubsystem();

if (failures.length > 0) {
  process.stderr.write("Source contracts failed:\n");
  for (const failure of failures) {
    process.stderr.write(`  ${failure}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write("Source contracts are valid.\n");
}

async function checkIconContracts() {
  const sourceRoots = ["src/components", "src/views"];
  const files = (await Promise.all(sourceRoots.map(sourceFiles))).flat();
  const glyphs = [0x2605, 0x2606, 0x203a, 0x21b6, 0x21b7, 0x2699]
    .map((codePoint) => String.fromCodePoint(codePoint));

  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const glyph of glyphs) {
      if (source.includes(glyph)) {
        failures.push(`${file} still contains the legacy ${glyph} glyph`);
      }
    }

    if (/>\s*C\s*<\/button>/.test(source)) {
      failures.push(`${file} still uses the letter C as a copy icon`);
    }

    if (!source.includes('from "lucide-react"')) continue;

    const sizes = [...source.matchAll(/size=\{(\d+)\}/g)]
      .map((match) => Number(match[1]));
    if (sizes.length === 0) {
      failures.push(`${file} must set every Lucide icon size explicitly`);
    } else if (sizes.some((size) => size !== 16 && size !== 20)) {
      failures.push(`${file} uses a Lucide icon size other than 16px or 20px`);
    }
  }
}

async function checkAdvisorBoundary() {
  const files = [
    "src/components/progression-advisor/ProgressionAdvisorDrawer.tsx",
    "src/components/progression-advisor/AdvisorSuggestionCard.tsx",
  ];
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8"))))
    .join("\n");

  for (const forbidden of ["playbackController", "PlayToggle", "onPreview"]) {
    if (source.includes(forbidden)) {
      failures.push(`Progression Advisor UI imports or references ${forbidden}`);
    }
  }
}

async function checkWindowsReleaseSubsystem() {
  const mainSource = await readFile("src-tauri/src/main.rs", "utf8");
  const releaseAttribute =
    '#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]';

  if (!mainSource.includes(releaseAttribute)) {
    failures.push("src-tauri/src/main.rs does not hide the console only in non-debug builds");
  }
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(entryPath));
    } else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
      files.push(entryPath);
    }
  }

  return files;
}
