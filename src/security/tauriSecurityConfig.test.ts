import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as Record<string, unknown>;
}

describe("Tauri security configuration", () => {
  it("enables a restrictive CSP without remote wildcard sources", () => {
    const config = readJson("src-tauri/tauri.conf.json") as {
      app: { security: { csp: string } };
    };
    const csp = config.app.security.csp;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).not.toContain("https:");
    expect(csp).not.toContain("*;");
  });

  it("removes default plugin grants and broad personal-folder scopes", () => {
    const capability = readJson("src-tauri/capabilities/default.json") as {
      permissions: Array<string | { identifier: string; allow: Array<{ path: string }> }>;
    };
    const stringPermissions = capability.permissions.filter(
      (permission): permission is string => typeof permission === "string",
    );
    expect(stringPermissions).not.toEqual(expect.arrayContaining([
      "fs:default",
      "dialog:default",
      "opener:default",
    ]));
    const scopes = capability.permissions
      .filter((permission): permission is { identifier: string; allow: Array<{ path: string }> } => (
        typeof permission === "object" && permission.identifier === "fs:scope"
      ))
      .flatMap(({ allow }) => allow.map(({ path }) => path));
    expect(scopes.every((path) => path.startsWith("$APPDATA/"))).toBe(true);
    expect(scopes.join("\n")).not.toMatch(/\$(AUDIO|DESKTOP|DOCUMENT|DOWNLOAD)/);
  });
});
