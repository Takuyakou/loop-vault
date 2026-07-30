import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("mini window capability", () => {
  it("allows the Live MIDI label and its lifecycle commands", () => {
    const capability = JSON.parse(readFileSync(
      resolve(process.cwd(), "src-tauri/capabilities/default.json"),
      "utf8",
    )) as { permissions: unknown[]; windows: string[] };

    expect(capability.windows).toContain("live-midi");
    expect(capability.permissions).toEqual(expect.arrayContaining([
      "core:webview:allow-create-webview-window",
      "core:window:allow-destroy",
      "core:window:allow-show",
      "core:window:allow-unminimize",
    ]));
  });
});
