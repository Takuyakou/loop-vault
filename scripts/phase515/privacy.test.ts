import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findPrivacyIssues,
  findPrivacyIssuesInText,
  scanPrivacyArtifacts,
} from "./privacy";

describe("Phase 5.15 recursive privacy gate", () => {
  it.each([
    ["/etc/secret.mid", "absolute-path"],
    ["/opt/data/song.mid", "absolute-path"],
    ["/mnt/c/private.mid", "absolute-path"],
    ["C:\\Users\\person\\song.mid", "absolute-path"],
    ["\\\\server\\share\\song.mid", "absolute-path"],
    ["file:///tmp/song.mid", "file-uri"],
    ["person@example.com", "email"],
    ["username=producer", "user-identifier"],
    ["prefix C:\\Users\\person\\song.mid suffix", "absolute-path"],
    ["prefix \\\\server\\share\\song.mid suffix", "absolute-path"],
    ["prefix file:///tmp/song.mid suffix", "file-uri"],
    ["prefix /opt/data/song.mid suffix", "absolute-path"],
  ])("rejects %s", (value, code) => {
    expect(findPrivacyIssues({ nested: [{ value }] })).toContainEqual(
      expect.objectContaining({ code }),
    );
  });

  it.each([
    "username",
    "user_id",
    "email",
    "memo",
    "sourceTitle",
    "personal_filename",
    "privateExtra",
  ])("rejects forbidden field %s", (key) => {
    expect(findPrivacyIssues({ nested: { [key]: "ordinary" } })).toContainEqual(
      expect.objectContaining({ code: "private-field" }),
    );
  });

  it("allows ordinary relative fixture names and approved privacy booleans", () => {
    expect(findPrivacyIssues({
      filename: "01_fixture.mid",
      path: "midi/validation/01_fixture.mid",
      privacy: {
        personalMidiIncluded: false,
        absolutePathsIncluded: false,
      },
    })).toEqual([]);
  });

  it("scans raw documentation text recursively for all absolute path forms", () => {
    expect(findPrivacyIssuesInText(
      "safe text\nexample /var/lib/private.mid\nmail: dev@example.com",
      "docs/report.md",
    ).map((item) => item.code)).toEqual(["absolute-path", "email"]);
  });

  it("rejects relative values in forbidden metadata fields", () => {
    expect(findPrivacyIssues({
      sourcePath: "midi/private-song.mid",
      personal_filename: "private-song.mid",
    }).filter((item) => item.code === "private-field")).toHaveLength(2);
  });

  it("detects forbidden raw JSON keys even when JSON is malformed", () => {
    expect(findPrivacyIssuesInText(
      "{\"memo\":\"ordinary\",",
      "docs/report.json",
    )).toContainEqual(expect.objectContaining({ code: "private-field" }));
  });

  it("fails closed on malformed JSON artifacts", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "loop-vault-p515-privacy-"));
    await mkdir(resolve(root, "docs/phase5.15"), { recursive: true });
    await writeFile(
      resolve(root, "docs/phase5.15/malformed.json"),
      "{\"safe\":true,",
    );
    try {
      await expect(scanPrivacyArtifacts(root)).resolves.toContainEqual(
        expect.objectContaining({ code: "malformed-json" }),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
