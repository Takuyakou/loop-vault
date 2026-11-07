/** P18-02: the ② 覚えて弾く stage of Jazz Progressions. What the stage decides lives here as plain functions, so that the
 * unit tests can pin it down. The judging (`HeldCardJudge`) and the shapes of the records are untouched: this only decides
 * what is shown and what a lap that is complete does. Original Practice passes no stage (§2.6): it keeps what it does. */

/** The staff while the answer is hidden (the same wording as ① of A and B). */
export const RECALL_WAITING='答えは、弾いた後かヒントの後に出ます';
/** The line above the cards while nothing else needs attention. */
export const RECALL_MESSAGE='ボイシングを思い出して弾いてください。止まると、そのカードだけ音が出ます';
/** The keys that stay held from the card before (no note names in ②). */
export const RECALL_CARRIED='前のカードから押さえたままの音は、離さなくて構いません';
/** After 通して聴く was pressed in ② (the whole progression can be heard, so the round cannot be a clean one). */
export const RECALL_LISTENED='通して聴いたので、この周はヒントありです';
/** After the folded この進行で学ぶこと was opened in ② (its text carries note names of the original key). */
export const RECALL_FOCUS_OPENED='学ぶことを開いたので、この周はヒントありです';
/** The folded この進行で学ぶこと of ②: the text carries note names of the original key, so the answer would be legible. */
export const RECALL_FOCUS_FOLDED='この進行で学ぶこと(開くと答えが分かります)';
/** The mark of a card whose answer was shown in ②. */
export const RECALL_HINT_MARK='ヒント';

/** What a lap that is complete does, decided by the stage of the screen, the hints of the round and 「この段階をくり返す」.
 * ① is counted whatever the round looked at; a ② round with a hint goes round again on the same key and is not counted
 * (the same rule that A and B keep for a hinted pass); the counted laps stop at the end when くり返す is off. */
export interface LapOutcome{/** 完奏 に数える: the record takes it and the random key moves on. */counted:boolean;
 /** The screen stops and asks (もう一度 ① / ② を弾く, R). */stop:boolean;}
export function jazzLapOutcome(stage:'see'|'recall',hinted:boolean,repeat:boolean):LapOutcome{
 const counted=stage==='see'||!hinted;
 return {counted,stop:counted&&!repeat};
}

/** Whether a card of ② shows its notes of the hands: the cards before the current one were played through, and the card
 * whose answer was shown keeps it until the current card moves. The degree and the name of the chord are always shown. */
export function recallAnswerVisible(i:number,index:number,revealed:number|undefined):boolean{
 return i<index||revealed===i;
}
