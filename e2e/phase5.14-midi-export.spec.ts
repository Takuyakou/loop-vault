import { expect, test, type Page } from "@playwright/test";
import {
  createSavedProgression,
  openApp,
  openVault,
} from "./helpers/app";

const featureKey = "loop-vault:progression-midi-export-enabled:v1";

test("Progression Detail keeps cards first and exposes accessible click, keyboard, and drag MIDI flows", async ({ page }) => {
  await openApp(page);
  await createSavedProgression(page, "Phase 5.14 MIDI Export");
  await openVault(page);
  await openFirstProgression(page);
  await expect(page.locator("[data-midi-export-control]")).toHaveCount(0);

  await page.getByRole("button", { name: /Vault/ }).first().click();
  await page.evaluate(
    ({ key }) => localStorage.setItem(key, "true"),
    { key: featureKey },
  );
  await openFirstProgression(page);
  const detail = page.locator("[data-progression-detail-view]");
  const cardStage = detail.locator("[data-progression-card-stage]");
  const midiControl = detail.locator("[data-midi-export-control]");
  const midiButton = midiControl.getByRole("button", { name: /MIDI/ });

  await expect(cardStage).toBeVisible();
  await expect(midiControl).toBeVisible();
  expect(await cardStage.evaluate(
    (stage, control) =>
      Boolean(stage.compareDocumentPosition(control as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
    await midiControl.elementHandle(),
  )).toBe(true);
  await expect(midiButton).toHaveAttribute("title", /DAW|MIDI file/);
  await expect(midiControl).toContainText(/ボイシング|voicing/i);

  await installMidiBridgeMock(page);
  await midiButton.click();
  await expect.poll(() => midiCommands(page)).toContain("save_progression_midi");

  await midiButton.focus();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (
    (await midiCommands(page)).filter((command) => command === "save_progression_midi").length
  )).toBe(2);

  const box = await midiButton.boundingBox();
  if (!box) throw new Error("MIDI control has no bounding box");
  await page.mouse.move(box.x + 8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 24, box.y + box.height / 2, { steps: 3 });
  await expect.poll(() => midiCommands(page)).toContain("start_progression_midi_drag");
  await page.mouse.up();

  for (const viewport of [
    { width: 1024, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(cardStage).toBeVisible();
    await expect(midiControl).toBeVisible();
  }
});

async function openFirstProgression(page: Page) {
  const row = page.locator(".lv-vault-row").first();
  await row.getByRole("button", {
    name: /^(Open progression|進行を開く)$/,
  }).click();
  await expect(page.locator("[data-progression-detail-view]")).toBeVisible();
}

async function installMidiBridgeMock(page: Page) {
  await page.evaluate(() => {
    type MockWindow = Window & {
      __TAURI_INTERNALS__?: {
        invoke(
          command: string,
          args?: Record<string, unknown>,
        ): Promise<unknown>;
      };
      __p514MidiCommands?: string[];
    };
    const target = window as MockWindow;
    target.__p514MidiCommands = [];
    target.__TAURI_INTERNALS__ = {
      async invoke(command, args) {
        target.__p514MidiCommands?.push(command);
        if (command === "plugin:dialog|save") return "C:\\Exports\\progression.mid";
        if (command === "save_progression_midi") {
          return { bytesLength: (args?.bytes as number[] | undefined)?.length ?? 0 };
        }
        if (command === "prepare_progression_midi_drag") {
          return {
            dragToken: "playwright-token",
            fileName: "loop-vault-progression.mid",
            tempPath: "private",
            bytesLength: (args?.bytes as number[] | undefined)?.length ?? 0,
            preparedAt: 1,
            expiresAt: 2,
            contentHash: "hash",
            reused: false,
          };
        }
        if (command === "start_progression_midi_drag") {
          return { status: "dropped", effect: 1 };
        }
        throw new Error(`Unexpected Tauri command: ${command}`);
      },
    };
  });
}

async function midiCommands(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (
      window as Window & { __p514MidiCommands?: string[] }
    ).__p514MidiCommands ?? [],
  );
}
