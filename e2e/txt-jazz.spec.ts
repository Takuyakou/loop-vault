import { expect, test } from "@playwright/test";
import type { MidiControl } from "./helpers/p12";

// Independent pitch/octave expectation: G2 root, Eb4 b13, F4 b7, Bb4 #9, B4 third.
const altNotes = [43, 63, 65, 70, 71];
const chart = "| Cm(maj7) | G7alt | G7(b9,b13) | G7alt/D |";

for (const dialect of ["standard", "extended"] as const) {
  test(`TXT-JAZZ ${dialect} actual Capture/Vault/registered Dojo keeps alt exact pitches`, async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/?p12=midi");
    await expect(page.locator("#main-content")).toBeVisible();
    await page.locator('[data-nav="capture"]').click();
    await page.getByTestId("capture-input-mode").getByRole("button", { name: /テキスト/ }).click();
    const capture = page.getByTestId("text-progression-capture");
    if (dialect === "extended") await capture.getByTestId("text-mode-extended").click();
    const input = capture.getByTestId(dialect === "standard" ? "text-progression-input" : "extended-text-input");
    const save = capture.getByTestId(dialect === "standard" ? "text-progression-save" : "extended-text-save");
    await input.fill("| G7alt | Unknown |");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(save).toBeDisabled();
    await input.fill(chart);
    await expect(capture.getByTestId("text-voicing-availability")).toContainText("3 / 4コード");
    await expect(capture.getByTestId("text-voicing-unavailable")).toContainText("G7alt/D");
    // R-03: the storage split is unchanged, but its notice is no longer shown on the capture screen.
    await expect(capture.getByTestId("text-storage-compatibility")).toHaveCount(0);
    await expect(save).toBeEnabled();
    const title = `合成 TXT-JAZZ ${dialect}`;
    await capture.getByTestId(dialect === "standard" ? "text-progression-name" : "extended-text-name").fill(title);
    if (dialect === "standard") {
      await capture.getByTestId("standard-text-card-details").locator(":scope > summary").click();
      await capture.getByTestId("text-progression-card").filter({ hasText: /^G7alt/ }).first().click();
      const inspector = capture.getByTestId("text-progression-inspector");
      await inspector.locator(":scope > summary").click();
      await inspector.getByTestId("text-progression-detail-expander").locator(":scope > summary").click();
      const notes = await inspector.getByTestId("voicing-keyboard").locator("[data-active='true']")
        .evaluateAll(keys => keys.map(key => Number((key as HTMLElement).dataset.midiNote)).sort((a, b) => a - b));
      expect(notes).toEqual(altNotes);
      await inspector.getByTestId("text-progression-preview").click();
      await inspector.getByRole("button", { name: "停止", exact: true }).click();
    } else {
      // The preview card is an overlay button the page never lets Playwright treat as stable; the audition itself is what is exercised.
      await capture.getByTestId("extended-text-preview").getByRole("button", { name: "G7alt", exact: true }).evaluate(element => (element as HTMLElement).click());
    }
    await save.click();
    await page.locator('[data-nav="vault"]').click();
    await page.locator("#vault-search").fill(title);
    const row = page.locator(".lv-vault-row").filter({ hasText: title });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("G7alt");
    await page.locator('[data-nav="chord-dojo"]').click();
    await page.evaluate(async () => (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.connect());
    await page.getByRole("button", { name: "登録した音", exact: true }).click();
    const list = page.locator(".dojo-list");
    await expect(list.locator(".dojo-card")).toHaveCount(3);
    await expect(list.getByRole("heading", { name: "G7alt/D", exact: true })).toHaveCount(0);
    const card = list.locator(".dojo-card").filter({ has: page.getByRole("heading", { name: "G7alt", exact: true }) });
    await card.getByRole("button", { name: "これを練習する", exact: true }).click();
    await expect(page.locator(".dojo-practice")).toContainText("G7alt");
    // Same pitch classes in the wrong octave must fail exact registered practice.
    const moved = altNotes.map(note => note + 12);
    await page.evaluate(notes => (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.emit(notes), moved);
    await expect(page.locator(".dojo-result")).toContainText("音域");
    await page.evaluate(notes => (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.emit(notes, false), moved);
    await page.getByRole("button", { name: "もう一度（Enter）", exact: true }).click();
    await page.evaluate(notes => (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.emit(notes), altNotes);
    await expect(page.locator(".dojo-result")).toContainText("合いました");
    await page.evaluate(notes => (window as typeof window & { __p12Midi: MidiControl }).__p12Midi.emit(notes, false), altNotes);
    expect(errors).toEqual([]);
  });
}
