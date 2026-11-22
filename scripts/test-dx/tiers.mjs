/**
 * E2E test tiering for `npm run test:full` vs `npm run test:e2e:extended` / `npm run test:full:all`.
 *
 * Design rules:
 * - Zero tests are deleted: every `e2e/*.spec.ts` belongs to exactly one bucket (`core`,
 *   `extendedLight`, or `extendedHeavy`).
 * - Every current product area (Home, Capture/Text/Correction, Vault/Progression, Voicing Loop,
 *   Bass Practice, Chord Dojo, Guided Course P23-40/42/44+, MIDI connection, Settings, Command
 *   Palette), visual baselines, accessibility, keyboard, responsive, reduced-motion, and all
 *   `criticalUiSpecs` remain in `core`.
 * - Guided-course specs (P23-42 and later) are excluded from `EXTENDED_ARCHIVE_SPECS` so every
 *   active guided-course screen is checked on every `test:full` run.
 * - `extendedHeavy` keeps the load-sensitive real-time audio/tempo/sweep specs that require
 *   `--workers=2`.
 * - `extendedLight` holds multi-minute sweeps and superseded intermediate milestone specs whose
 *   current product contracts are already guarded by `core` specs (and still run on demand via
 *   `npm run test:e2e:extended`, `npm run test:full:all`, or `npm run test:feature`).
 */

export const EXTENDED_HEAVY_SPECS = Object.freeze([
  "e2e/preview-fade.spec.ts",
  "e2e/dojo-display-judge.spec.ts",
  "e2e/p12-master251-register.spec.ts",
  "e2e/p12-master251-ui-scheduler.spec.ts",
  "e2e/vl-14-resume-smooth.spec.ts",
  "e2e/phase13-1-bass-ui.spec.ts",
  // P23-58 B7: 10/10 standalone pass (--workers=1); moved to heavy (--workers=2) to avoid parallel load flakes.
  "e2e/phase5.33-voicing-rule-ui.spec.ts",
  "e2e/jazz-progressions.spec.ts",
  "e2e/p12-4-long.spec.ts",
  "e2e/p23-23a-ear-stage.spec.ts",
  "e2e/p16-ear-keyboard.spec.ts",
  "e2e/voicing-loop-v2.spec.ts",
]);

export const EXTENDED_ARCHIVE_SPECS = Object.freeze([
  // Multi-minute sweeps & real-time audio/tempo suites (representative specs stay in core)
  "e2e/p12-chord-dojo.spec.ts",
  "e2e/p23-23b-ear-result.spec.ts",
  "e2e/correction-workspace.spec.ts",
  "e2e/p12-master251-fingering-profile.spec.ts",
  "e2e/dojo-single-advance.spec.ts",
  "e2e/dojo-list-scroll.spec.ts",
  "e2e/dojo-long-hardening.spec.ts",
  "e2e/txt-jazz.spec.ts",
  "e2e/preview-fade-probe.spec.ts",

  // Historical milestone & superseded intermediate specs (current behavior guarded in core)
  "e2e/p12-1-dojo-ui.spec.ts",
  "e2e/p12-2-master.spec.ts",
  "e2e/p12-3-dojo.spec.ts",
  "e2e/p12-4-back.spec.ts",
  "e2e/p12-4-progressions.spec.ts",
  "e2e/p12-5-no-restart.spec.ts",
  "e2e/p12-5-original.spec.ts",
  "e2e/p12-dojo-fingering.spec.ts",
  "e2e/p12-dojo-home-layout.spec.ts",
  "e2e/p12-master251-audition.spec.ts",
  "e2e/p12-master251-monitor-progression.spec.ts",
  "e2e/p12-theme-score.spec.ts",
  "e2e/p12-vertical-layout.spec.ts",
  "e2e/p15-import-check.spec.ts",
  "e2e/p15-split.spec.ts",
  "e2e/p16-ear-a11y.spec.ts",
  "e2e/p16-ear-degrees.spec.ts",
  "e2e/p16-ear-records.spec.ts",
  "e2e/p16-ear-score.spec.ts",
  "e2e/p16-ear-timing.spec.ts",
  "e2e/p17-01-screens.spec.ts",
  "e2e/p17-02-screens.spec.ts",
  "e2e/p18-01-stage2.spec.ts",
  "e2e/p18-02-jazz-recall.spec.ts",
  "e2e/p18-practice-frame.spec.ts",
  "e2e/p20-dojo-home.spec.ts",
  "e2e/p20-resume-kinds.spec.ts",
  "e2e/p22-01-back.spec.ts",
  "e2e/p22-01-function-colors.spec.ts",
  "e2e/p22-01-list.spec.ts",
  "e2e/p22-01-practice.spec.ts",
  "e2e/p22-02-vl-picker.spec.ts",
  "e2e/p22-03-home.spec.ts",
  "e2e/p89-home-continue.spec.ts",
  "e2e/phase8.8.5-text-workspace.spec.ts",
  "e2e/phase13-bass-practice.spec.ts",
  "e2e/vl-13-screens.spec.ts",
  "e2e/vl-13-voicing-loop.spec.ts",
  "e2e/vl-15-progression-picker.spec.ts",
  "e2e/voicing-loop-vl09.spec.ts",
  "e2e/voicing-loop-vl10.spec.ts",
  "e2e/voicing-loop-vl11.spec.ts",
  "e2e/voicing-loop-vl12.spec.ts",

  // Superseded intermediate P23 milestone checks (guided-course P23-42+ specs are excluded and remain in core)
  "e2e/p23-06b-bass-global-bpm.spec.ts",
  "e2e/p23-08-home-records.spec.ts",
  "e2e/p23-09-home.spec.ts",
  "e2e/p23-09b-home-loop-roll.spec.ts",
  "e2e/p23-11-capture-entry.spec.ts",
  "e2e/p23-12-pre-analysis.spec.ts",
  "e2e/p23-15b-header-narrow.spec.ts",
  "e2e/p23-20-voicing-loop-practice.spec.ts",
  "e2e/p23-21-ear.spec.ts",
  "e2e/p23-25-bass-practice.spec.ts",
  "e2e/p23-27-dojo-home.spec.ts",
  "e2e/p23-37-bass-home-motion-color.spec.ts",
  "e2e/p23-41-home-motion-resume.spec.ts",
  "e2e/p23-43-resume-width-and-hover.spec.ts",
]);

const EXTENDED_PREFIX_RE = /^e2e\/(phase5\.|phase11-|p5-26-)/;

const heavySet = new Set(EXTENDED_HEAVY_SPECS);
const archiveSet = new Set(EXTENDED_ARCHIVE_SPECS);

export function classifyE2eSpec(specPath) {
  if (heavySet.has(specPath)) return "extendedHeavy";
  if (archiveSet.has(specPath) || EXTENDED_PREFIX_RE.test(specPath)) return "extendedLight";
  return "core";
}

export function partitionE2eSpecs(allSpecs) {
  const core = [];
  const extendedLight = [];
  const extendedHeavy = [];
  for (const spec of [...allSpecs].sort()) {
    const bucket = classifyE2eSpec(spec);
    if (bucket === "extendedHeavy") extendedHeavy.push(spec);
    else if (bucket === "extendedLight") extendedLight.push(spec);
    else core.push(spec);
  }
  return { core, extendedLight, extendedHeavy };
}
