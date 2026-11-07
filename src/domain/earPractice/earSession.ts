import { median } from "./earClock";
import { earJudge } from "./judge";
import type { EarQuestion, EarQuestionChord } from "./question";

export type EarPhase = "listen" | "play" | "result";

export interface EarAttempt {
  ok: boolean;
  /** Seconds from the start of measuring to the answer. */
  sec: number;
  message: string;
}

export interface EarCard {
  index: number;
  label: string;
  /** Wrong answers before the right one. */
  mistakes: number;
  /** 0: none, 1: the name was shown, 2: the answer was shown on the keyboard. */
  hint: 0 | 1 | 2;
  /** The name was visible from the start (the first chord, when the setting says so). */
  shownFromStart: boolean;
  done: boolean;
  /** Seconds from the start of measuring to the right answer. Not measured when the player judged it themselves. */
  sec?: number;
  /** Seconds to the first answer, right or wrong. */
  firstAnswerSec?: number;
  /** Judged by the player (no MIDI keyboard): no seconds, kept out of the figures. */
  self: boolean;
  attempts: EarAttempt[];
  /** Times the player listened again while on this card (L, K, R). */
  listens: number;
  /** The keys that were down when the chord was right (to see next to the sounded notes on the result screen; never recorded). */
  playedNotes?: number[];
  /** The degree and the function were on the card before it was answered (kept in the records). */
  degreeShown?: boolean;
}

export interface EarSessionOptions {
  question: EarQuestion;
  /** Show the name of the first chord from the start (the first chord is still played, but is kept out of the figures). */
  showFirstName: boolean;
}

export type EarMark = "ok" | "retry" | "name" | "key";

export interface EarSummary {
  /** Chords right at the first try with no hint, among those that are counted. */
  firstTry: number;
  /** Chords that are counted (not the one shown from the start, not self-judged). */
  counted: number;
  medianSec?: number;
  hints: number;
  listens: number;
}

/**
 * The state of one run through a question: which card, what each card went through, and the figures.
 * It knows nothing of the screen, the keys or the sound; times are given to it (one clock, milliseconds).
 */
export class EarSession {
  readonly question: EarQuestion;
  readonly showFirstName: boolean;
  phase: EarPhase = "listen";
  index = 0;
  readonly cards: EarCard[];
  /** Times L, K or R was used (the first lap is not counted). */
  listens = 0;
  private measureStartAt: number | undefined;

  constructor(options: EarSessionOptions) {
    this.question = options.question;
    this.showFirstName = options.showFirstName;
    this.cards = options.question.chords.map((chord, index) => ({
      index,
      label: chord.label,
      mistakes: 0,
      hint: 0,
      shownFromStart: index === 0 && options.showFirstName,
      done: false,
      self: false,
      attempts: [],
      listens: 0,
    }));
  }

  get current(): EarCard {
    return this.cards[Math.min(this.index, this.cards.length - 1)]!;
  }

  get currentChord(): EarQuestionChord {
    return this.question.chords[Math.min(this.index, this.cards.length - 1)]!;
  }

  /** The end of the first lap, or 「弾き始める」: from here on the keys are answers. */
  startPlaying(): void {
    if (this.phase === "listen") this.phase = "play";
  }

  /** Measuring starts (when the chord has finished sounding, or when the card came). It may be moved once the end of the sound is known. */
  setMeasureStart(at: number): void {
    this.measureStartAt = at;
  }

  /** Whether the name of a card may be seen. */
  nameVisible(index: number): boolean {
    const card = this.cards[index]!;
    return card.done || card.hint >= 1 || card.shownFromStart;
  }

  /** The keyboard shows the answer of the current card. */
  get answerOnKeyboard(): boolean {
    return this.phase === "play" && this.current.hint >= 2 && !this.current.done;
  }

  /** Space: one step further (the name, then the answer on the keyboard). */
  hint(): 0 | 1 | 2 {
    const card = this.current;
    if (this.phase !== "play" || card.done) return card.hint;
    card.hint = Math.min(2, card.hint + 1) as 0 | 1 | 2;
    return card.hint;
  }

  /** L, K, R: listening again costs nothing and leaves no mark. */
  countListen(): void {
    this.listens += 1;
    if (this.phase === "play") this.current.listens += 1;
  }

  /**
   * A card was pressed to hear it (it does not become the card being played). The card being played counts as 「今のコードを聴く」;
   * a card still to come keeps the listen on its own record; a card already answered is not counted.
   */
  countCardListen(index: number): void {
    if (this.phase !== "play") return;
    if (index === this.index) { this.countListen(); return; }
    const card = this.cards[index];
    if (!card || card.done || index < this.index) return;
    this.listens += 1;
    card.listens += 1;
  }

  /** The degrees and functions are on the cards that are still to be answered (they were seen before the answer). */
  markDegreesShown(): void {
    for (const card of this.cards) if (!card.done) card.degreeShown = true;
  }

  /** Seconds from the start of measuring (never below zero: an answer given while the chord still sounds). */
  secondsAt(at: number): number {
    return this.measureStartAt === undefined ? 0 : Math.max(0, (at - this.measureStartAt) / 1000);
  }

  /** An answer was taken: the notes that were down and the time the last key went down. */
  answer(notes: readonly number[], completedAt: number): { ok: boolean; message: string; finished: boolean } {
    const card = this.current;
    const chord = this.currentChord;
    if (this.phase !== "play" || card.done) return { ok: false, message: "", finished: false };
    const verdict = earJudge({ symbol: chord.symbol, judge: chord.judge, notes: chord.notes }, notes);
    const sec = this.secondsAt(completedAt);
    card.firstAnswerSec ??= sec;
    card.attempts.push({ ok: verdict.ok, sec, message: verdict.message });
    if (verdict.ok) {
      card.done = true;
      card.sec = sec;
      card.playedNotes = [...notes].sort((a, b) => a - b);
    } else {
      card.mistakes += 1;
    }
    return { ok: verdict.ok, message: verdict.message, finished: verdict.ok && this.index === this.cards.length - 1 };
  }

  /** Without a MIDI keyboard: the player says whether they played it (no seconds). */
  selfAnswer(ok: boolean): { finished: boolean } {
    const card = this.current;
    if (this.phase !== "play" || card.done) return { finished: false };
    card.self = true;
    card.attempts.push({ ok, sec: 0, message: ok ? "合いました(自分で判定)" : "答えを見て、もう一度(自分で判定)" });
    if (ok) card.done = true;
    else card.mistakes += 1;
    return { finished: ok && this.index === this.cards.length - 1 };
  }

  /** After a right answer: the next card, or the result after the last one. */
  next(): void {
    if (!this.current.done) return;
    if (this.index >= this.cards.length - 1) {
      this.phase = "result";
      return;
    }
    this.index += 1;
  }

  /** The marks of a card (✓ at the first try with no hint; △ after a mistake; 名 / 鍵 for the hints). */
  marks(card: EarCard): EarMark[] {
    const marks: EarMark[] = [];
    // The chord whose name was shown from the start says so instead of a mark.
    if (card.shownFromStart) return marks;
    if (card.mistakes === 0 && card.hint === 0 && card.done && !card.shownFromStart) marks.push("ok");
    if (card.mistakes > 0) marks.push("retry");
    if (card.hint >= 1 && !card.shownFromStart) marks.push("name");
    if (card.hint >= 2) marks.push("key");
    return marks;
  }

  summary(): EarSummary {
    const counted = this.cards.filter((card) => !card.shownFromStart && !card.self && card.done);
    const seconds = counted.map((card) => card.sec).filter((value): value is number => value !== undefined);
    return {
      firstTry: counted.filter((card) => card.mistakes === 0 && card.hint === 0).length,
      counted: counted.length,
      ...(seconds.length ? { medianSec: median(seconds) } : {}),
      hints: this.cards.reduce((sum, card) => sum + card.hint, 0),
      listens: this.listens,
    };
  }
}
