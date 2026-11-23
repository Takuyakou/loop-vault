import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loopVaultBuildInfo } from "./buildInfo";

const RELEASE_VERSION = "3.1.0";
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("release version (REL-03 B3)", () => {
  it("shows the release version in the settings 「アプリ版」 (loopVaultBuildInfo)", () => {
    expect(loopVaultBuildInfo.version).toBe(RELEASE_VERSION);
  });

  it("keeps package.json, package-lock.json, tauri.conf.json, Cargo.toml and Cargo.lock on the same version", () => {
    const lock = JSON.parse(read("package-lock.json")) as { version: string; packages: Record<string, { version: string }> };
    expect(JSON.parse(read("package.json")).version).toBe(RELEASE_VERSION);
    expect(lock.version).toBe(RELEASE_VERSION);
    expect(lock.packages[""].version).toBe(RELEASE_VERSION);
    expect(JSON.parse(read("src-tauri/tauri.conf.json")).version).toBe(RELEASE_VERSION);
    expect(read("src-tauri/Cargo.toml")).toMatch(new RegExp(`^version = "${RELEASE_VERSION}"`, "m"));
    expect(read("src-tauri/Cargo.lock")).toMatch(new RegExp(`name = "loop-vault"\\r?\\nversion = "${RELEASE_VERSION}"`));
  });
});
