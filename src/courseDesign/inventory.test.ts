import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEVEL_QUALITIES, buildInventory } from "./inventory";

/**
 * P23-39 §1: the inventory must be buildable from the public tables and must match the frozen copy.
 * The test also states the coverage/gap facts the Lv1–3 bank relies on.
 */
const FROZEN = "docs/contracts/p23-39/inventory.json";

describe("P23-39 §1 the material inventory", () => {
  it("is built from the public tables only and freezes one machine-readable copy", () => {
    const inventory = buildInventory();
    expect(inventory.version).toBe(1);
    expect(inventory.generatedFrom.privateData).toBe(false);
    expect(inventory.level1to3Vocab).toEqual([...LEVEL_QUALITIES]);
    expect(inventory.builtins.length).toBeGreaterThan(40);
    expect(inventory.shapes.length).toBeGreaterThan(20);
    expect(inventory.ears.length).toBeGreaterThan(0);
    const frozen = JSON.parse(readFileSync(FROZEN, "utf8"));
    expect(frozen).toEqual(inventory);
  });

  it("records the stable identity, voicing and judge policy of every built-in", () => {
    const inventory = buildInventory();
    for (const builtin of inventory.builtins) {
      expect(builtin.id).toMatch(/^[a-z0-9-]+$/);
      expect(builtin.cards.length).toBeGreaterThan(0);
      for (const card of builtin.cards) {
        expect(card.notes.length).toBeGreaterThan(0);
        expect(card.beats).toBeGreaterThan(0);
        expect(card.label.length).toBeGreaterThan(0);
      }
      expect(["compatible", "adapter-needed", "unsuitable"]).toContain(builtin.scorerCompatibility);
      expect(typeof builtin.transformable).toBe("boolean");
    }
    // The default Lv1–3 vocabulary is fully represented as recipe qualities.
    for (const quality of LEVEL_QUALITIES) expect(inventory.shapes.some((shape) => shape.quality === quality)).toBe(true);
  });

  it("publishes the Lv1–3 coverage and the gaps instead of assuming full coverage", () => {
    const inventory = buildInventory();
    let covered = 0;
    let gaps = 0;
    for (const quality of LEVEL_QUALITIES) {
      for (let root = 0; root < 12; root += 1) {
        const sources = inventory.coverage[quality]![String(root)]!;
        if (sources.length) covered += 1; else gaps += 1;
      }
    }
    expect(gaps).toBe(inventory.gaps.cells.length);
    expect(covered + gaps).toBe(72);
    // The built-ins alone do not cover every quality at every root: that is an explicit gap for P23-40,
    // not a silent claim of full coverage.
    expect(gaps).toBeGreaterThan(0);
    for (const cell of inventory.gaps.cells) {
      expect(cell.rootIndex).toBeGreaterThanOrEqual(0);
      expect(cell.rootIndex).toBeLessThan(12);
      expect(inventory.coverage[cell.quality]![String(cell.rootIndex)]).toEqual([]);
    }
    expect(inventory.classification.available + inventory.classification.adapterNeeded + inventory.classification.unsuitable)
      .toBeGreaterThan(0);
  });

  it("does not embed private paths, Vault data or device ids", () => {
    const json = JSON.stringify(buildInventory());
    expect(json).not.toContain("C:\\\\");
    expect(json).not.toContain("Users");
    expect(json).not.toContain("deviceId");
    expect(json).not.toMatch(/vault:[a-z0-9]/i);
  });
});
