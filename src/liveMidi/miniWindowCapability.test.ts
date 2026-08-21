import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface Capability {
  permissions: unknown[];
  windows: string[];
}

function readCapability(name: string): Capability {
  return JSON.parse(readFileSync(
    resolve(process.cwd(), `src-tauri/capabilities/${name}.json`),
    "utf8",
  )) as Capability;
}

describe("window capability isolation", () => {
  it("keeps the Live MIDI window out of the privileged main capability", () => {
    const main = readCapability("default");
    const liveMidi = readCapability("live-midi");

    expect(main.windows).toEqual(["main"]);
    expect(liveMidi.windows).toEqual(["live-midi"]);
    expect(liveMidi.permissions).toContain("core:default");
    expect(liveMidi.permissions).not.toEqual(expect.arrayContaining([
      "fs:default",
      "dialog:default",
      "opener:default",
      "fs:allow-read-file",
      "opener:allow-open-path",
    ]));
  });

  it("keeps mini-window lifecycle commands on the main window only", () => {
    const main = readCapability("default");
    expect(main.permissions).toEqual(expect.arrayContaining([
      "core:webview:allow-create-webview-window",
      "core:window:allow-destroy",
      "core:window:allow-show",
      "core:window:allow-unminimize",
    ]));
  });
});
