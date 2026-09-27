import { existsSync } from "node:fs";

const ownerContracts = Object.freeze({
  "test-infrastructure": {
    smoke: [], vitest: [], browser: [],
    node: ["scripts/test-dx/selection.node-test.mjs", "scripts/test-dx/cache.node-test.mjs", "scripts/test-dx/reporting.node-test.mjs", "scripts/run-playwright-visual-tests.node-test.mjs"],
  },
  "text-capture": {
    smoke: ["src/components/capture/textCaptureStatus.test.ts"],
    vitest: ["src/components/capture/textCaptureStatus.test.ts", "src/components/capture/TextProgressionCapturePanel.test.tsx", "src/views/CaptureView.textProgression.test.tsx"],
    browser: ["e2e/phase8.8.6-capture-closure.spec.ts", "e2e/phase8.8.5-final-ui.spec.ts"],
  },
  transport: {
    smoke: ["src/audio/textTransport.test.ts"],
    vitest: ["src/audio/textTransport.test.ts", "src/components/capture/TextCaptureTransport.test.tsx"],
    browser: ["e2e/phase8.8.4-text-transport.spec.ts"],
  },
  "harmony/parser": {
    smoke: ["src/domain/textProgression.test.ts"],
    vitest: ["src/domain/textProgression.test.ts", "src/domain/textProgressionDraft.test.ts", "src/domain/textProgressionVoicing.test.ts", "src/domain/textProgressionDownstream.test.ts"],
    browser: ["e2e/phase8.8-extended-text.spec.ts"],
  },
  vault: {
    smoke: ["src/store/vaultStore.test.ts"],
    vitest: ["src/store/vaultStore.test.ts", "src/views/VaultView.test.tsx"],
    browser: ["e2e/vault-flow.spec.ts"],
  },
  "voicing-loop": {
    smoke: ["src/voicingPractice/timelineFollow.test.ts"],
    vitest: ["src/voicingPractice/timelineFollow.test.ts", "src/views/ProgressionVoicingPracticeView.test.tsx"],
    browser: ["e2e/voicing-loop-v2.spec.ts"],
  },
  "dojo/practice": {
    smoke: ["src/views/PracticeView.test.tsx"],
    vitest: ["src/views/PracticeView.test.tsx", "src/practice/PracticeClock.test.ts"],
    browser: ["e2e/phase5.18-chord-context.spec.ts"],
  },
  settings: {
    smoke: ["src/views/SettingsDialog.test.tsx"],
    vitest: ["src/views/SettingsDialog.test.tsx"],
    browser: ["e2e/visual.spec.ts", "e2e/keyboard.spec.ts"],
  },
  home: {
    smoke: ["src/views/HomeView.test.tsx"],
    vitest: ["src/views/HomeView.test.tsx"],
    browser: ["e2e/visual.spec.ts"],
  },
  "shared-ui": {
    smoke: ["src/views/CaptureView.test.tsx"],
    vitest: ["src/views/CaptureView.test.tsx", "src/views/PracticeView.test.tsx", "src/views/HomeView.test.tsx"],
    browser: ["e2e/responsive.spec.ts", "e2e/accessibility.spec.ts", "e2e/visual.spec.ts"],
  },
  persistence: {
    smoke: ["src/storage/tauriVaultStorage.test.ts"],
    vitest: ["src/storage/tauriVaultStorage.test.ts", "src/store/vaultStore.test.ts"],
    browser: ["e2e/vault-flow.spec.ts"],
  },
  "privacy/security": {
    smoke: ["src/security/intakeBudgets.test.ts"],
    vitest: ["src/security/intakeBudgets.test.ts", "src/security/tauriSecurityConfig.test.ts"],
    browser: ["e2e/accessibility.spec.ts"],
  },
});

export const criticalUiSpecs = Object.freeze([
  "e2e/capture-flow.spec.ts", "e2e/vault-flow.spec.ts", "e2e/keyboard.spec.ts",
  "e2e/accessibility.spec.ts", "e2e/phase8.8.4-text-transport.spec.ts",
  "e2e/phase8.8.5-capture-geometry.spec.ts", "e2e/phase8.8.5-final-ui.spec.ts",
  "e2e/phase8.8.6-capture-closure.spec.ts", "e2e/visual.spec.ts",
]);

export function normalizePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

export function ownerForFile(input) {
  const file = normalizePath(input);
  if (file.startsWith("docs/") || file.endsWith(".md")) return { areas: [], reason: "documentation" };
  if (/^scripts\/test-dx\//.test(file) || /^scripts\/run-playwright-visual-tests\./.test(file)) {
    return { areas: ["test-infrastructure"], reason: "test runner contract" };
  }
  if (/^(package(-lock)?\.json|tsconfig.*\.json|vite\.config\.|vitest\.config\.|playwright\.config\.)/.test(file)) {
    return { areas: ["shared-ui"], reason: "test/build infrastructure", broad: true };
  }
  if (/^e2e\//.test(file)) {
    if (/phase8\.8\.6|phase8\.8\.5|capture|phase5\.23/i.test(file)) return { areas: ["text-capture"], reason: "Capture browser contract" };
    if (/phase8\.8\.4|transport/i.test(file)) return { areas: ["transport"], reason: "transport browser contract" };
    if (/voicing-loop|phase5\.(27|28|29|30|31|32|33)/i.test(file)) return { areas: ["voicing-loop"], reason: "Voicing Loop browser contract" };
    if (/vault/i.test(file)) return { areas: ["vault"], reason: "Vault browser contract" };
    if (/practice|dojo|phase5\.18/i.test(file)) return { areas: ["dojo/practice"], reason: "practice browser contract" };
    if (/visual|responsive|accessibility|keyboard|reduced-motion/i.test(file)) return { areas: ["shared-ui"], reason: "shared browser contract", broad: true };
    return { areas: ["shared-ui"], reason: "unmapped browser test", broad: true };
  }
  if (/^src\/security\//.test(file) || /^scripts\/security\//.test(file)) return { areas: ["privacy/security"], reason: "security boundary" };
  if (/^src\/audio\/textTransport/.test(file) || /TextCaptureTransport/.test(file) || /transport-button\.css/.test(file)) return { areas: ["transport"], reason: "transport owner" };
  if (/^src\/domain\/(textProgression|midi|harmony|chord)/i.test(file)) return { areas: ["harmony/parser"], reason: "parser/harmony owner" };
  if (/^src\/components\/capture\//.test(file) || /text-intake\.css/.test(file) || /CaptureView\.textProgression/.test(file)) return { areas: ["text-capture"], reason: "Text Capture owner" };
  if (/^src\/(voicingPractice\/|views\/ProgressionVoicingPracticeView)/.test(file)) return { areas: ["voicing-loop"], reason: "Voicing Loop owner" };
  if (/^src\/(store\/vault|views\/VaultView)/.test(file)) return { areas: ["vault"], reason: "Vault owner" };
  if (/^src\/storage\//.test(file) || /^src-tauri\//.test(file)) return { areas: ["persistence"], reason: "persistence owner" };
  if (/^src\/(practice\/|features\/bass-practice\/|views\/PracticeView)/.test(file)) return { areas: ["dojo/practice"], reason: "practice owner" };
  if (/^src\/views\/SettingsDialog/.test(file)) return { areas: ["settings"], reason: "Settings owner" };
  if (/^src\/views\/HomeView/.test(file)) return { areas: ["home"], reason: "Home owner" };
  if (/^src\/views\/CaptureView/.test(file)) return { areas: ["text-capture", "harmony/parser"], reason: "Capture shared seam" };
  if (/^src\/(styles\/|components\/ui\/|App\.)/.test(file)) return { areas: ["shared-ui"], reason: "shared UI", broad: true };
  if (/^src\//.test(file) || /^scripts\//.test(file)) return { areas: ["shared-ui"], reason: "unknown source owner; expand safely", broad: true };
  return { areas: [], reason: "outside test selection" };
}

function isVitestTest(file) {
  return !file.startsWith("e2e/") && /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) && !file.endsWith(".node-test.mjs");
}

export function selectForFiles(files, level, exists = existsSync) {
  const changed = [...new Set(files.map(normalizePath))].sort();
  const areas = new Set();
  const vitest = new Set();
  const browser = new Set();
  const nodeTests = new Set();
  const reasons = [];
  let broad = false;
  let browserChanged = false;
  for (const file of changed) {
    const owner = ownerForFile(file);
    owner.areas.forEach((area) => areas.add(area));
    broad ||= Boolean(owner.broad);
    browserChanged ||= /^e2e\//.test(file) || /\.(tsx|css)$/.test(file);
    reasons.push(`${file}: ${owner.areas.join(" + ") || "no test owner"} (${owner.reason})`);
    if (isVitestTest(file)) vitest.add(file);
    else if (file.endsWith(".node-test.mjs")) nodeTests.add(file);
    else if (/^src\//.test(file)) vitest.add(file);
    if (/^e2e\/.*\.spec\.ts$/.test(file)) browser.add(file);
  }
  for (const area of areas) {
    const contract = ownerContracts[area];
    for (const file of level === "fast" ? contract.smoke : contract.vitest) vitest.add(file);
    (contract.node ?? []).forEach((file) => nodeTests.add(file));
    if (level === "ui" || (level === "feature" && browserChanged)) {
      const specs = level === "feature" ? contract.browser.slice(0, 1) : contract.browser;
      specs.forEach((file) => browser.add(file));
    }
  }
  if (level === "ui" && changed.length === 0) criticalUiSpecs.forEach((file) => browser.add(file));
  for (const file of [...vitest, ...browser, ...nodeTests]) {
    if (!exists(file)) throw new Error(`Selected contract file is missing: ${file}`);
  }
  return {
    changed,
    areas: [...areas].sort(),
    reasons,
    vitest: [...vitest].sort(),
    browser: [...browser].sort(),
    nodeTests: [...nodeTests].sort(),
    broad,
    browserChanged,
    documentation: changed.some((file) => file.startsWith("docs/") || file.endsWith(".md")),
  };
}
