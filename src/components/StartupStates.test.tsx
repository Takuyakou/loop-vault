// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { appCopy } from "../i18n";
import { PracticeRecoveryPanel } from "../features/bass-practice/ui/PracticeRecoveryPanel";
import { QuarantineNotice, StartupState } from "./StartupStates";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; document.body.replaceChildren(); });

async function mount(node: React.ReactElement): Promise<HTMLElement> {
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root?.render(node));
  return container;
}

const panel = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-testid='problem-panel']")!;
const rows = (container: HTMLElement) => [...container.querySelectorAll("[data-testid='problem-panel'] dt")].map((dt) => dt.textContent);
const values = (container: HTMLElement) => [...container.querySelectorAll("[data-testid='problem-panel'] dd")].map((dd) => dd.textContent);

describe("P23-30 P1-P8: the problem panels", () => {
  test("P1: one panel is a 40px mark, the title, one line, the three rows, the details folded away", async () => {
    const container = await mount(
      <StartupState loadStatus="error" recovery={undefined} readonly={undefined} error="ENOENT data.json" requestRestoreBackup={() => undefined} copy={appCopy.ja} />,
    );
    const element = panel(container);
    expect(element.dataset.tone).toBe("error");
    expect(element.querySelector(".problem-panel-title")?.textContent).toBe("Vault を読み込めませんでした");
    expect(element.querySelector(".problem-panel-desc")?.textContent).toBe("アプリを開き直すと直ることがあります。");
    expect(rows(container)).toEqual(["何が起きたか", "データは", "次にすること"]);
    expect(values(container)).toEqual([
      "保存したデータのファイルを開けませんでした。",
      "書き換えていません。",
      "アプリを開き直してください。直らなければ「詳しい情報」を控えておいてください。",
    ]);
    // The intact-data sentence takes the success colour; the details start folded.
    expect(element.querySelector<HTMLElement>("dd[data-safe='true']")?.textContent).toBe("書き換えていません。");
    const details = element.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")?.textContent).toBe("詳しい情報（問い合わせのとき用）");
    expect(details.querySelector("p")?.textContent).toBe("ENOENT data.json");
  });

  test("P2: the loading screen keeps the logo and the live region and adds the thin bar", async () => {
    const container = await mount(
      <StartupState loadStatus="loading" recovery={undefined} readonly={undefined} requestRestoreBackup={() => undefined} copy={appCopy.ja} />,
    );
    expect(container.querySelector("[data-testid='startup-loading']")).not.toBeNull();
    expect(container.querySelector("[role='status'][aria-live='polite']")?.textContent).toContain("Vault を読み込んでいます");
    expect(container.textContent).toContain("この PC に保存した進行を読んでいます。");
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/loop-vault-icon.svg");
    expect(container.querySelector(".lv-startup-loading-bar i")).not.toBeNull();
  });

  test("P3: the recovery screen names the file, keeps the backups below and shows the corrupt path in the details", async () => {
    const container = await mount(
      <StartupState
        loadStatus="recovery"
        recovery={{ kind: "invalid-json", corruptPath: "C:/vault/data.corrupt-20260928.json", backups: [] } as never}
        readonly={undefined}
        requestRestoreBackup={() => undefined}
        copy={appCopy.ja}
      />,
    );
    const element = panel(container);
    expect(element.dataset.tone).toBe("warning");
    expect(element.querySelector(".problem-panel-title")?.textContent).toBe("Vault のファイルが壊れていました");
    expect(values(container)).toEqual([
      "保存したデータのファイルを読めませんでした。",
      "消えていません。壊れたファイルは別の場所に移して残しました。",
      "利用できるバックアップはまだありません。設定の「データ」から読み込むこともできます。",
    ]);
    expect(element.querySelector("details p")?.textContent).toBe("C:/vault/data.corrupt-20260928.json");
  });

  test("P3: a migration recovery keeps its own sentence", async () => {
    const container = await mount(
      <StartupState
        loadStatus="recovery"
        recovery={{ kind: "migration-recovery", message: "古い形のファイルでした。", backups: [] } as never}
        readonly={undefined}
        requestRestoreBackup={() => undefined}
        copy={appCopy.ja}
      />,
    );
    expect(values(container)[0]).toBe("古い形のファイルでした。");
  });

  test("P4/C2: three backups come newest first, one filled button, and the unreadable name stays as it is", async () => {
    const requestRestoreBackup = vi.fn();
    const container = await mount(
      <StartupState
        loadStatus="recovery"
        recovery={{
          kind: "invalid-json",
          backups: [
            { name: "data-20261110-0800.json", path: "a", createdAt: "2026-11-10T00:00:00.000Z" },
            { name: "before-import.json", path: "b", createdAt: "2026-11-12T02:00:00.000Z" },
            { name: "data-20261111-0930.json", path: "c", createdAt: "2026-11-11T09:30:00.000Z" },
          ],
        } as never}
        readonly={undefined}
        requestRestoreBackup={requestRestoreBackup}
        copy={appCopy.ja}
      />,
    );
    const rowElements = [...container.querySelectorAll(".problem-backup")];
    expect(rowElements).toHaveLength(3);
    expect(rowElements.map((row) => row.querySelector(".problem-backup-date")?.textContent))
      .toEqual(["before-import.json", "11月11日 9:30", "11月10日 8:00"]);
    // The automatic rotating backup says so; a name somebody chose stays the name.
    expect(rowElements[1]!.querySelector(".problem-backup-sub")?.textContent).toBe("自動で作ったバックアップ");
    expect(rowElements[0]!.querySelector(".problem-backup-sub")?.textContent).toBe("before-import.json");
    // Exactly one filled button, and only the newest row carries the badge.
    expect(container.querySelectorAll(".lv-button-primary")).toHaveLength(1);
    expect(rowElements[0]!.getAttribute("data-newest")).toBe("true");
    expect(rowElements[1]!.hasAttribute("data-newest")).toBe(false);
    expect(rowElements[0]!.querySelector(".problem-backup-newest")?.textContent).toBe("いちばん新しい");
    expect(rowElements[1]!.querySelector(".problem-backup-newest")).toBeNull();
    const button = (index: number) => rowElements[index]!.querySelector("button")!;
    expect(button(1).getAttribute("aria-label")).toBe("11月11日 9:30 のバックアップに戻す");
    expect(button(1).textContent).toBe("これに戻す");
    await act(async () => button(1).click());
    expect(requestRestoreBackup).toHaveBeenCalledWith("data-20261111-0930.json");
    await act(async () => button(0).click());
    expect(requestRestoreBackup).toHaveBeenLastCalledWith("before-import.json");
  });

  test("P5: a newer file is an accent panel", async () => {
    const container = await mount(
      <StartupState
        loadStatus="readonly"
        recovery={undefined}
        readonly={{ fileVersion: 3, message: "readonly message" } as never}
        requestRestoreBackup={() => undefined}
        copy={appCopy.ja}
      />,
    );
    const element = panel(container);
    expect(element.dataset.tone).toBe("accent");
    expect(element.querySelector(".problem-panel-title")?.textContent).toBe("Loop Vault を新しくしてください");
    expect(values(container)).toEqual([
      "データの形が、このアプリの知らない新しい形（版 3）でした。",
      "そのままです。読むだけにして、書き換えていません。",
      "Loop Vault を最新の版にしてから、開き直してください。",
    ]);
  });

  test("P8: the quarantine notice is the small form with the same three rows", async () => {
    const container = await mount(<QuarantineNotice count={2} copy={appCopy.ja} />);
    const element = panel(container);
    expect(element.hasAttribute("data-compact")).toBe(true);
    expect(element.querySelector(".problem-panel-title")?.textContent).toBe("読み込めない記録を隔離しました");
    expect(values(container)).toEqual([
      "不正なレコード 2 件を隔離しました。正常な曲は読み込まれています。",
      "データは消していません。不完全な上書きを防ぐため、今は保存を止めています。",
      "設定の「データ」から、置き換えで読み込むか、正常なバックアップを復元してください。",
    ]);
    expect(element.querySelector(".problem-panel-desc")).toBeNull();
  });

  test("P7: the practice record screen keeps its own words and offers the backup rows", async () => {
    const restore = vi.fn(async () => undefined);
    const container = await mount(
      <PracticeRecoveryPanel
        backups={[{ name: "data-20261111-0930.json", revision: 7, token: `sha256-${"a".repeat(64)}` }]}
        error="Practice file is newer than this app supports."
        onRestore={restore}
        onRetry={async () => undefined}
        onStartFresh={async () => undefined}
      />,
    );
    const element = panel(container);
    expect(element.querySelector(".problem-panel-title")?.textContent).toBe("練習の記録を読み込めませんでした");
    expect(element.querySelector(".problem-panel-desc")?.textContent).toBe("Bass Practice の記録のファイルです。Vault の進行は無事です。");
    expect(values(container)).toEqual([
      "練習の記録のファイルを読めませんでした。",
      "消えていません。元のファイルは残してあります。バックアップは置き換える前にすべて検証します。",
      "バックアップに戻すか、記録を空にして新しく始めます。",
    ]);
    expect(element.querySelector("details p")?.textContent).toBe("Practice file is newer than this app supports.");
    expect(element.querySelector(".problem-backup-date")?.textContent).toBe("11月11日 9:30");
    await act(async () => element.querySelector<HTMLButtonElement>(".problem-backup button")!.click());
    expect(restore).toHaveBeenCalledWith("data-20261111-0930.json");
    const startFresh = [...element.querySelectorAll("button")].find((button) => button.textContent === "記録を空にして新しく始める")!;
    expect(startFresh.className).toContain("lv-button-danger");
  });

  test("P7: the read-only practice record points at the newer Loop Vault", async () => {
    const container = await mount(
      <PracticeRecoveryPanel backups={[]} error="Practice fileVersion 2 is newer." onRetry={async () => undefined} readOnly />,
    );
    expect(panel(container).dataset.tone).toBe("accent");
    expect(values(container)).toEqual([
      "練習の記録のファイルを読めませんでした。",
      "消えていません。元のファイルは置き換えも非表示もしません。",
      "Loop Vault を新しくしてください。",
    ]);
  });
});
