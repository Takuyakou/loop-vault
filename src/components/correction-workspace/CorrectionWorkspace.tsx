import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { PreviewSound } from "../../audio/chordPreview";
import { samePlaybackSource, type PlaybackController, type PlayingSource } from "../../audio/playbackController";
import type { CorrectionCard, CorrectionModel, CorrectionNote } from "../../domain/correction/correctionModel";
import { noteLabel } from "../../domain/correction/correctionModel";
import { beatsPerBar as beatsPerBarFor } from "../../domain/midi/timing";
import type { ChordTimelineItem } from "../../domain/types";
import { createTimelineVoicingPlaybackPlan, resolveTimelineItemVoicing } from "../../domain/voicing";
import { usePlaybackState } from "../../hooks/usePlaybackState";
import { preferredScrollBehavior } from "../../ui/motion";
import { CorrectionInspector } from "./CorrectionInspector";

/**
 * P10.0-02 correction workspace, display only (spec v2.2 §4–6, §11, §14): file bar,
 * song overview, timeline (bars, segments, cards, piano roll) and the inspector.
 * Editing arrives in P10.0-03; saving still happens on the current screen.
 */

const ROW_PX = 6;
type Zoom = "all" | "16" | "4" | "custom";

export interface CorrectionWorkspaceProps {
  model: CorrectionModel;
  timeline: readonly ChordTimelineItem[];
  fileName: string;
  analysisTargetLabel?: string;
  previewSound: PreviewSound;
  controller: PlaybackController;
  /** The capture full-timeline source, shared with the current screen. */
  fullSource: PlayingSource;
  onPlaybackError: (error: unknown) => void;
  onUseCurrentScreen: () => void;
  onChooseAnotherMidi: () => void;
  onPartSettings?: () => void;
}

export function CorrectionWorkspace(props: CorrectionWorkspaceProps) {
  const { model, timeline, controller, previewSound, fullSource, onPlaybackError } = props;
  const meter = beatsPerBarFor(model.timeSignature);
  const totalBars = Math.round(model.totalBeats / meter);
  const reviewCards = useMemo(() => model.cards.filter((card) => card.reviewReasons.length > 0), [model.cards]);
  const [selectedId, setSelectedId] = useState(() => (reviewCards[0] ?? model.cards[0])?.id);
  const [zoom, setZoom] = useState<Zoom>(() => totalBars <= 16 ? "all" : "16");
  const [customPx, setCustomPx] = useState(24);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [follow, setFollow] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [suggestionClosed, setSuggestionClosed] = useState(false);
  const [segmentsOpen, setSegmentsOpen] = useState(() => typeof window === "undefined" || !window.matchMedia?.("(max-width: 959px)").matches);
  const [panelOpen, setPanelOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const playback = usePlaybackState(controller);
  const [, tick] = useState(0);

  const minPx = viewportWidth > 0 ? viewportWidth / Math.max(meter, model.totalBeats) : 8;
  const maxPx = viewportWidth > 0 ? viewportWidth / 8 : 60;
  const pxPerBeat = Math.min(maxPx, Math.max(minPx, zoom === "all" ? minPx
    : zoom === "16" ? viewportWidth / (16 * meter)
      : zoom === "4" ? viewportWidth / (4 * meter)
        : customPx)) || 8;
  const canvasWidth = Math.max(viewportWidth, model.totalBeats * pxPerBeat);
  const rollHeight = (model.pitchRange.high - model.pitchRange.low + 1) * ROW_PX;
  const selected = model.cards.find((card) => card.id === selectedId) ?? model.cards[0];
  const notesByCard = useMemo(() => {
    const map = new Map<string, CorrectionNote[]>();
    for (const note of model.notes) map.set(note.cardId, [...(map.get(note.cardId) ?? []), note]);
    return map;
  }, [model.notes]);
  const warnNoteIds = useMemo(() => new Set(model.cards.flatMap((card) => card.reviewReasons.flatMap((reason) => reason.noteIds))), [model.cards]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const update = () => setViewportWidth(element.clientWidth);
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fullPlan = useMemo(() => createTimelineVoicingPlaybackPlan(timeline, "capture-full"), [timeline]);
  const songPlaying = playback.status !== "idle" && samePlaybackSource(playback.source, fullSource);
  useEffect(() => {
    if (!songPlaying || playback.status !== "playing") return undefined;
    const interval = window.setInterval(() => tick((value) => value + 1), 100);
    return () => window.clearInterval(interval);
  }, [playback.status, songPlaying]);
  const firstBeat = model.cards[0]?.start ?? 0;
  const playheadBeat = songPlaying && playback.status === "playing" && playback.startedAt !== undefined
    ? firstBeat + Math.max(0, (performance.now() - playback.startedAt) / 1000) * (model.bpm ?? 96) / 60
    : undefined;

  const scrollToBeat = useCallback((beat: number, align: "center" | "left" = "center") => {
    const element = scrollRef.current;
    if (!element) return;
    const target = beat * pxPerBeat - (align === "center" ? element.clientWidth / 2 : element.clientWidth * 0.2);
    element.scrollTo?.({ left: Math.max(0, target), behavior: preferredScrollBehavior() });
    if (!element.scrollTo) element.scrollLeft = Math.max(0, target);
  }, [pxPerBeat]);

  useEffect(() => {
    if (!follow || playheadBeat === undefined) return;
    const element = scrollRef.current;
    if (!element) return;
    const x = playheadBeat * pxPerBeat - element.scrollLeft;
    if (x > element.clientWidth * 0.8 || x < 0) scrollToBeat(playheadBeat, "left");
  });

  const select = useCallback((card: CorrectionCard | undefined) => {
    if (!card) return;
    setSelectedId(card.id);
    const element = scrollRef.current;
    if (!element) return;
    const left = card.start * pxPerBeat;
    const right = (card.start + card.duration) * pxPerBeat;
    if (left < element.scrollLeft || right > element.scrollLeft + element.clientWidth) scrollToBeat(card.start + card.duration / 2);
  }, [pxPerBeat, scrollToBeat]);

  const selectedIndex = model.cards.findIndex((card) => card.id === selected?.id);
  const reviewIndex = reviewCards.findIndex((card) => card.id === selected?.id);
  const nextReview = useCallback((direction: 1 | -1) => {
    if (!reviewCards.length) return;
    const from = selected?.start ?? -1;
    const next = direction === 1
      ? reviewCards.find((card) => card.start > from) ?? reviewCards[0]
      : [...reviewCards].reverse().find((card) => card.start < from) ?? reviewCards[reviewCards.length - 1];
    select(next);
  }, [reviewCards, select, selected?.start]);

  const toggleSong = useCallback(() => {
    void controller.toggle(fullSource, {
      type: "timeline",
      timeline: fullPlan.timeline,
      bpm: model.bpm,
      sound: previewSound,
      beatsPerBar: meter,
      explicitMidiNotesByEventId: fullPlan.explicitMidiNotesByEventId,
    }).catch(onPlaybackError);
  }, [controller, fullPlan, fullSource, meter, model.bpm, onPlaybackError, previewSound]);

  const sourceId = (kind: "source" | "card", card: CorrectionCard): PlayingSource =>
    ({ kind: "capture", id: `${fullSource.id}:workspace-${kind}:${card.id}` });
  const playCard = (kind: "source" | "card") => {
    if (!selected) return;
    const notes = kind === "source"
      ? [...new Set((notesByCard.get(selected.id) ?? []).map((note) => note.pitch))].sort((a, b) => a - b)
      : resolveTimelineItemVoicing(timeline[selected.timelineIndex]!).midiNotes;
    void controller.toggle(sourceId(kind, selected), { type: "chord", chord: selected.name, sound: previewSound, explicitMidiNotes: notes })
      .catch(onPlaybackError);
  };
  const cardPlaying = selected && playback.status !== "idle"
    ? samePlaybackSource(playback.source, sourceId("source", selected)) ? "source"
      : samePlaybackSource(playback.source, sourceId("card", selected)) ? "card" : null
    : null;

  // Keys for this stage (spec 4.2 of P10.0-02); editing keys come later.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.altKey || event.metaKey || isEditable(event.target)) return;
      if (event.ctrlKey) return;
      const key = event.key;
      const handled = () => event.preventDefault();
      if (key === "ArrowRight") { handled(); select(model.cards[Math.min(model.cards.length - 1, selectedIndex + 1)]); }
      else if (key === "ArrowLeft") { handled(); select(model.cards[Math.max(0, selectedIndex - 1)]); }
      else if (key === "]") { handled(); nextReview(1); }
      else if (key === "[") { handled(); nextReview(-1); }
      else if (key === " ") { handled(); toggleSong(); }
      else if (key === "f" || key === "F") { handled(); setFollow((value) => !value); }
      else if (key === "Home") { handled(); select(model.cards[0]); }
      else if (key === "End") { handled(); select(model.cards[model.cards.length - 1]); }
      else if (key === "?") { handled(); setHelpOpen((value) => !value); }
      else if (key === "Escape" && helpOpen) { handled(); setHelpOpen(false); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [helpOpen, model.cards, nextReview, select, selectedIndex, toggleSong]);

  // Ctrl + wheel zooms around the pointer (a native listener, so preventDefault works).
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const box = element.getBoundingClientRect();
      const beat = (element.scrollLeft + event.clientX - box.left) / pxPerBeat;
      const next = Math.min(maxPx, Math.max(minPx, pxPerBeat * (event.deltaY < 0 ? 1.25 : 0.8)));
      setZoom("custom");
      setCustomPx(next);
      requestAnimationFrame(() => { element.scrollLeft = Math.max(0, beat * next - (event.clientX - box.left)); });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [maxPx, minPx, pxPerBeat]);

  const overviewRef = useRef<HTMLDivElement>(null);
  const moveFromOverview = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = overviewRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    scrollToBeat(((event.clientX - box.left) / box.width) * model.totalBeats);
  };

  const suggestion = suggestionClosed ? undefined : model.suggestions.find((entry) => entry.kind === "melody-voice");
  const barStep = pxPerBeat * meter < 18 ? 8 : pxPerBeat * meter < 36 ? 4 : 1;
  const viewStart = scrollLeft / pxPerBeat;
  const viewEnd = (scrollLeft + viewportWidth) / pxPerBeat;
  const cardAt = (beat: number) => model.cards.find((card) => beat >= card.start && beat < card.start + card.duration);
  const position = (() => {
    const beat = playheadBeat ?? selected?.start ?? 0;
    const card = cardAt(beat);
    return card ? `${card.bar}.${card.beat}` : `${Math.floor(beat / meter) + 1}.1`;
  })();

  return (
    <section className="lv-cw" data-testid="correction-workspace" aria-label="修正作業場（試作）">
      <div className="lv-cw-file">
        <span className="lv-cw-file-name">{props.fileName}</span>
        <span className="lv-cw-file-meta">
          {totalBars}小節・{model.bpm ? `${Math.round(model.bpm)}BPM` : "BPM なし"}・{model.timeSignature ?? "4/4"}
          {props.analysisTargetLabel ? `・${props.analysisTargetLabel}` : ""}
        </span>
        <span className="lv-cw-spacer" />
        <button type="button" className="lv-cw-stat" data-kind="warn" onClick={() => nextReview(1)} disabled={!reviewCards.length} data-testid="correction-review-count">
          要確認 <b>{reviewCards.length}</b>
        </button>
        <span className="lv-cw-stat">直した回数 <b>0</b></span>
        {props.onPartSettings ? <button type="button" className="lv-cw-btn" onClick={props.onPartSettings}>パートの設定</button> : null}
        <button type="button" className="lv-cw-btn" onClick={props.onChooseAnotherMidi}>別の MIDI</button>
        <button type="button" className="lv-cw-btn" data-kind="accent" onClick={props.onUseCurrentScreen} data-testid="correction-use-current-screen">今の画面で保存する</button>
      </div>

      {suggestion ? (
        <div className="lv-cw-suggestion" role="status" data-testid="correction-suggestion">
          <span>メロディの Voice（{suggestion.voiceLabel}）の音が {suggestion.cardCount} 枚のカードに入っています。まとめて選んで外すかどうかを決める操作は、次の段階で使えるようになります。</span>
          <button type="button" className="lv-cw-btn" onClick={() => setSuggestionClosed(true)}>閉じる</button>
        </div>
      ) : null}

      <div className="lv-cw-work">
        <div className="lv-cw-timeline">
          <div className="lv-cw-overview-row">
            <span className="lv-cw-label">曲全体</span>
            <div
              ref={overviewRef}
              className="lv-cw-overview"
              data-testid="correction-overview"
              onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); moveFromOverview(event); }}
              onPointerMove={(event) => { if (event.buttons === 1) moveFromOverview(event); }}
            >
              {model.segments.map((segment, index) => (
                <span key={segment.id} className="lv-cw-ov-seg" data-alt={index % 2 === 1 || undefined}
                  style={{ left: pct((segment.startBar - 1) * meter, model.totalBeats), width: pct((segment.endBar - segment.startBar + 1) * meter, model.totalBeats) }}>
                  <span className="lv-cw-ov-seg-name">{segment.label}</span>
                </span>
              ))}
              {model.cards.map((card) => (
                <span key={card.id} className="lv-cw-ov-card" style={{ left: pct(card.start, model.totalBeats), width: pct(card.duration, model.totalBeats) }} />
              ))}
              {reviewCards.map((card) => (
                <span key={card.id} className="lv-cw-ov-mark" style={{ left: pct(card.start + card.duration / 2, model.totalBeats) }} />
              ))}
              <span className="lv-cw-ov-view" style={{ left: pct(viewStart, model.totalBeats), width: pct(Math.min(model.totalBeats, viewEnd) - viewStart, model.totalBeats) }} />
              {playheadBeat !== undefined ? <span className="lv-cw-ov-ph" style={{ left: pct(playheadBeat, model.totalBeats) }} /> : null}
            </div>
          </div>

          <div className="lv-cw-tools">
            <span className="lv-cw-tools-label">表示</span>
            {([["all", "全体"], ["16", "16小節"], ["4", "4小節"]] as const).map(([value, label]) => (
              <button key={value} type="button" className="lv-cw-btn" aria-pressed={zoom === value} onClick={() => setZoom(value)}>{label}</button>
            ))}
            <span className="lv-cw-sep" />
            <button type="button" className="lv-cw-btn" onClick={() => nextReview(-1)} disabled={!reviewCards.length} aria-label="前の要確認">◀ 前の要確認</button>
            <span className="lv-cw-nav-count" data-testid="correction-review-position">{reviewIndex >= 0 ? reviewIndex + 1 : "–"} / {reviewCards.length}</span>
            <button type="button" className="lv-cw-btn" onClick={() => nextReview(1)} disabled={!reviewCards.length} aria-label="次の要確認">次の要確認 ▶</button>
          </div>

          <div className="lv-cw-body">
            <div className="lv-cw-left">
              <span className="lv-cw-label" style={{ height: 26 }}>小節</span>
              <button type="button" className="lv-cw-label lv-cw-seg-toggle" style={{ height: segmentsOpen ? 30 : 20 }} aria-expanded={segmentsOpen} onClick={() => setSegmentsOpen((value) => !value)}>区切り</button>
              <span className="lv-cw-label" style={{ height: 98 }}>コード</span>
              <div className="lv-cw-keys" style={{ height: rollHeight }} aria-hidden="true">
                {Array.from({ length: model.pitchRange.high - model.pitchRange.low + 1 }, (_, index) => {
                  const pitch = model.pitchRange.high - index;
                  const black = [1, 3, 6, 8, 10].includes(pitch % 12);
                  return (
                    <span key={pitch} className="lv-cw-key" data-black={black || undefined} style={{ top: index * ROW_PX, height: ROW_PX }}>
                      {pitch % 12 === 0 ? <span className="lv-cw-oct">{noteLabel(pitch)}</span> : null}
                    </span>
                  );
                })}
              </div>
            </div>
            <div ref={scrollRef} className="lv-cw-scroll" data-testid="correction-timeline-scroll" onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}>
              <div className="lv-cw-canvas" style={{ width: canvasWidth, "--lv-cw-beat": `${pxPerBeat}px`, "--lv-cw-bar": `${pxPerBeat * meter}px` } as CSSProperties}>
                <div className="lv-cw-ruler">
                  {Array.from({ length: totalBars }, (_, index) => index + 1).filter((bar) => (bar - 1) % barStep === 0).map((bar) => (
                    <span key={bar} className="lv-cw-bar-no" style={{ left: (bar - 1) * meter * pxPerBeat }}>{bar}</span>
                  ))}
                </div>
                <div className="lv-cw-segments" data-open={segmentsOpen || undefined}>
                  {segmentsOpen ? model.segments.map((segment) => (
                    <span key={segment.id} className="lv-cw-segment" data-testid="correction-segment"
                      style={{ left: (segment.startBar - 1) * meter * pxPerBeat + 1, width: (segment.endBar - segment.startBar + 1) * meter * pxPerBeat - 2 }}>
                      {segment.label}{segment.repeatCount ? ` · ${segment.repeatCount}回出てくる` : ""}
                    </span>
                  )) : null}
                </div>
                <div className="lv-cw-cards">
                  {model.cards.map((card) => {
                    const width = card.duration * pxPerBeat - 2;
                    const size = width < 18 ? "bare" : width < 40 ? "tiny" : width < 72 ? "narrow" : undefined;
                    const review = card.reviewReasons.length > 0;
                    return (
                      <button
                        key={card.id}
                        type="button"
                        className="lv-cw-card"
                        data-size={size}
                        data-review={review || undefined}
                        data-testid="correction-card"
                        aria-pressed={card.id === selected?.id}
                        aria-label={`${card.bar}小節${card.beat}拍 ${card.name.label}${review ? "（要確認）" : ""}`}
                        title={size === "bare" ? card.name.label : undefined}
                        style={{ left: card.start * pxPerBeat + 1, width: Math.max(2, width) }}
                        onClick={() => setSelectedId(card.id)}
                      >
                        <span className="lv-cw-card-name">{card.name.label}</span>
                        <span className="lv-cw-card-sub">
                          {review ? <span className="lv-cw-flag" aria-hidden="true" /> : null}
                          <span>{formatBeats(card.duration)}拍</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="lv-cw-roll" style={{ height: rollHeight }} data-testid="correction-piano-roll">
                  {selected ? <span className="lv-cw-window" style={{ left: selected.start * pxPerBeat, width: selected.duration * pxPerBeat }} /> : null}
                  {model.notes.map((note) => (
                    <span
                      key={note.id}
                      className="lv-cw-note"
                      data-kind={noteKind(note, warnNoteIds)}
                      title={`${noteLabel(note.pitch)} · ${formatBeats(note.duration)}拍 · ${note.used ? "使っている" : "使っていない"}`}
                      style={{ left: note.start * pxPerBeat, width: Math.max(4, note.duration * pxPerBeat - 1), top: (model.pitchRange.high - note.pitch) * ROW_PX, height: ROW_PX - 1 }}
                    />
                  ))}
                  {playheadBeat !== undefined ? <span className="lv-cw-playhead" style={{ left: playheadBeat * pxPerBeat }} /> : null}
                </div>
              </div>
            </div>
          </div>

          <div className="lv-cw-legend" aria-label="凡例">
            <span><i data-kind="harmony" />使っている和音の音</span>
            <span><i data-kind="bass" />使っているベース</span>
            <span><i data-kind="warn" />要確認の原因</span>
            <span><i data-kind="melody" />メロディとして使っていない音</span>
            <span><i data-kind="off" />使っていない音（破線）</span>
          </div>

          <div className="lv-cw-transport">
            <button type="button" className="lv-cw-btn" data-kind="accent" aria-pressed={songPlaying} onClick={toggleSong} data-testid="correction-play-song">
              {songPlaying ? "■ 停止" : "▶ 再生"}
            </button>
            <button type="button" className="lv-cw-btn" aria-pressed={follow} onClick={() => setFollow((value) => !value)}>追従</button>
            <span className="lv-cw-time">{position} / {totalBars}小節</span>
            <span className="lv-cw-history">操作 0</span>
          </div>
        </div>

        <aside className="lv-cw-insp" data-open={panelOpen || undefined} aria-label="選んだカード">
          <button type="button" className="lv-cw-panel-toggle" aria-expanded={panelOpen} onClick={() => setPanelOpen((value) => !value)}>
            {selected ? `${selected.name.label}${selected.reviewReasons.length ? "・要確認" : ""}` : "カード"}（{panelOpen ? "閉じる" : "開く"}）
          </button>
          {selected ? (
            <CorrectionInspector
              card={selected}
              notes={notesByCard.get(selected.id) ?? []}
              playing={cardPlaying}
              onPlaySource={() => playCard("source")}
              onPlayCard={() => playCard("card")}
            />
          ) : <p className="lv-cw-muted">カードがありません。</p>}
        </aside>
      </div>

      <div className="lv-cw-keys-help">
        <span><kbd>←</kbd><kbd>→</kbd> 前後のカード</span>
        <span><kbd>[</kbd><kbd>]</kbd> 前後の要確認</span>
        <span><kbd>Space</kbd> 再生・停止</span>
        <span><kbd>F</kbd> 追従</span>
        <span><kbd>Ctrl</kbd>＋ホイール 拡大縮小</span>
        <span><kbd>?</kbd> ショートカット一覧</span>
      </div>

      {helpOpen ? (
        <div className="lv-cw-cheat" role="dialog" aria-modal="true" aria-label="ショートカット一覧" onClick={() => setHelpOpen(false)}>
          <div className="lv-cw-cheat-box" onClick={(event) => event.stopPropagation()}>
            <h3>ショートカット（この段階で使えるもの）</h3>
            <dl>
              {[
                ["← →", "前後のカード"], ["[ ]", "前後の要確認"], ["Space", "曲全体の再生・停止"], ["F", "再生位置に追従する／しない"],
                ["Home End", "最初／最後のカード"], ["Ctrl＋ホイール", "マウスの位置を中心に拡大縮小"], ["?", "この一覧"], ["Esc", "この一覧を閉じる"],
              ].map(([key, text]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{text}</dd></div>)}
            </dl>
            <p className="lv-cw-muted">音やカードを直す操作は、次の段階から使えるようになります。</p>
            <button type="button" className="lv-cw-btn" onClick={() => setHelpOpen(false)}>閉じる</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function noteKind(note: CorrectionNote, warn: ReadonlySet<string>): string {
  if (note.used) return warn.has(note.id) ? "warn" : note.roleHint === "bass" ? "bass" : "harmony";
  return note.roleHint === "melody" ? "melody" : "off";
}

function pct(value: number, total: number): string {
  return `${(Math.max(0, value) / Math.max(1, total)) * 100}%`;
}

function formatBeats(beats: number): string {
  return Number.isInteger(beats) ? String(beats) : beats.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function isEditable(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName)));
}
