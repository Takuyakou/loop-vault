import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const packageMetadata = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
  define: {
    __LOOP_VAULT_VERSION__: JSON.stringify(packageMetadata.version),
    __LOOP_VAULT_BUILD_COMMIT__: JSON.stringify(buildCommit()),
    __LOOP_VAULT_BUILD_DATE__: JSON.stringify(
      process.env.VITE_BUILD_DATE ?? new Date().toISOString(),
    ),
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target:
      process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: Boolean(process.env.TAURI_ENV_DEBUG),
  },
  test: {
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
});

function buildCommit(): string {
  if (process.env.VITE_BUILD_COMMIT) {
    return process.env.VITE_BUILD_COMMIT.slice(0, 8);
  }
  try {
    return execFileSync("git", ["rev-parse", "--short=8", "HEAD"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "unknown";
  }
}
