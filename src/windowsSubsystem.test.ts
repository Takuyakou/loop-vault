import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Windows release subsystem", () => {
  it("hides the console only in non-debug builds", () => {
    const mainSource = readFileSync(
      resolve(process.cwd(), "src-tauri/src/main.rs"),
      "utf8",
    );

    expect(mainSource).toContain(
      '#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]',
    );
  });
});
