import type { Page, PageScreenshotOptions } from "@playwright/test";

/**
 * R-01 (test hygiene): a spec's review screenshots go to the ignored `p89-generated/report-screenshots/` folder, so a
 * FULL run never changes or adds a PNG under the tracked `docs/archive/reports/`. Run a spec with UPDATE_REPORT_SCREENSHOTS=1
 * to write the tracked copy for a report (the same switch as p17-01, p17-02 and vl-13).
 * `path` is relative to docs/archive/reports, e.g. "p23-41-assets/cd-home-1440.png" or a folder such as "p23-45-assets".
 */
export function reportShot(path: string): string {
  return process.env.UPDATE_REPORT_SCREENSHOTS === "1" ? `docs/archive/reports/${path}` : `p89-generated/report-screenshots/${path}`;
}

/**
 * Capture a report screenshot only when `UPDATE_REPORT_SCREENSHOTS=1` is set; skipped during normal
 * test runs so FULL does not spend browser time rendering and discarding dozens of report PNGs.
 */
export async function captureReportShot(
  page: Page,
  path: string,
  options?: Omit<PageScreenshotOptions, "path">,
): Promise<void> {
  if (process.env.UPDATE_REPORT_SCREENSHOTS !== "1") return;
  await page.screenshot({ ...options, path: reportShot(path) });
}
