import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("mini window capability", () => {
  it("allows the minimum-size command used while entering Mini Mode", () => {
    const capability = JSON.parse(readFileSync(
      resolve(process.cwd(), "src-tauri/capabilities/default.json"),
      "utf8",
    )) as { permissions: unknown[] };

    expect(capability.permissions).toContain("core:window:allow-set-min-size");
  });
});
