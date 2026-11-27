/** P25-01: key rows shown in the text-intake "?" face (B) and the key caps reused by the bands. V19: tables only. */
export interface TextHelpKeyRow { readonly keys: readonly string[]; readonly label: string }

export const CARD_EDIT_KEY_ROWS: readonly TextHelpKeyRow[] = [
  { keys: ["←", "→"], label: "前後のカード" },
  { keys: ["↑", "↓"], label: "転回" },
  { keys: ["Shift", "↑", "↓"], label: "高さ" },
  { keys: ["1", "–", "5"], label: "形(1 = 基本)" },
  { keys: ["S"], label: "前のコードに近づける" },
  { keys: ["M"], label: "MIDI 鍵盤で弾いて入れる" },
  { keys: ["Enter"], label: "鳴らす" },
  { keys: ["Ctrl", "Z"], label: "元に戻す(入力欄の外でも)" },
  { keys: ["Esc"], label: "閉じる" },
];

export const KEYBOARD_ENTRY_KEY_ROWS: readonly TextHelpKeyRow[] = [
  { keys: ["1", "2", "3"], label: "長さ" },
  { keys: ["R"], label: "もう一度" },
  { keys: ["0"], label: "休符" },
  { keys: ["Backspace"], label: "戻す" },
  { keys: ["Esc"], label: "やめる" },
];

/** V19 「書き方」: what to write, and what it means. */
export const WRITING_ROWS: readonly { readonly write: readonly string[]; readonly or?: string; readonly meaning: string }[] = [
  { write: ["| C | Am |"], meaning: "小節の区切り" },
  { write: ["C G"], meaning: "1 小節に 2 つ(等分)" },
  { write: ["%", "."], or: " か ", meaning: "前のコードをもう一度" },
  { write: ["="], meaning: "のばす" },
  { write: ["_"], meaning: "休符" },
  { write: ["C, G", "C-G"], meaning: "カンマ・ダッシュでも区切れる" },
  { write: ["[C]歌詞"], meaning: "歌詞の中のコードも読む" },
  { write: ["IIm7"], meaning: "キーを選ぶと度数でも書ける" },
  { write: ["Cmaj7{C3 G3 E4 B4 D5}"], meaning: "音を決める(C4 が真ん中のド)" },
  { write: ["#"], meaning: "行の頭に付けるとメモ" },
];

export function KeyCap({ children }: { readonly children: string }) {
  return <kbd className="lv-text-kbd">{children}</kbd>;
}

export function TextHelpKeyList({ rows }: { readonly rows: readonly TextHelpKeyRow[] }) {
  return (
    <div className="lv-text-help-keys">
      {rows.map((row) => (
        <div key={row.label} className="lv-text-help-key-row">
          <span className="lv-text-help-key-caps">{row.keys.map((key, index) => <KeyCap key={`${key}-${index}`}>{key}</KeyCap>)}</span>
          <span className="lv-text-help-key-label">{row.label}</span>
        </div>
      ))}
    </div>
  );
}

export function TextHelpWritingTable() {
  return (
    <table className="lv-text-help-table" data-testid="text-help-writing">
      <thead><tr><th scope="col">{"書く"}</th><th scope="col">{"意味"}</th></tr></thead>
      <tbody>
        {WRITING_ROWS.map((row) => (
          <tr key={row.meaning}>
            <td>{row.write.map((code, index) => <span key={code}>{index > 0 ? <span className="lv-text-help-or">{row.or ?? "・"}</span> : null}<code>{code}</code></span>)}</td>
            <td>{row.meaning}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
