import { LoaderCircle, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildAdvisorRequest, advisorRequestFingerprint, type AdvisorReferenceContext, type AdvisorSuggestion } from "../../domain/progressionAdvisor";
import { progressionTaxonomy } from "../../domain/progressionClassification/taxonomy";
import type { AppLanguage, SavedProgressionBlock } from "../../domain/types";
import { cancelAdvisorRun, isCurrentAdvisorResponse, requestAdvisorSuggestions, type AdvisorRunResult, AdvisorServiceError } from "../../llm/advisorService";
import { loadLlmPreferences } from "../../llm/preferences";
import { AdvisorErrorState } from "./AdvisorErrorState";
import { AdvisorSuggestionCard } from "./AdvisorSuggestionCard";
import { ConfirmDialog } from "../ConfirmDialog";

interface Props {
  open: boolean;
  block: SavedProgressionBlock;
  title: string;
  keySignature?: string;
  bpm?: number;
  language: AppLanguage;
  onClose: () => void;
  onAppend: (suggestion: AdvisorSuggestion) => void;
  onSave: (suggestion: AdvisorSuggestion) => boolean;
  onApplyTags: (tagIds: string[]) => boolean;
  setToast: (message: string) => void;
  referenceContext?: readonly AdvisorReferenceContext[];
  derivedTagIds?: readonly string[];
}

export function ProgressionAdvisorDrawer({ open, block, title, keySignature, bpm, language, onClose, onAppend, onSave, onApplyTags, setToast, referenceContext = [], derivedTagIds = [] }: Props) {
  const ja = language === "ja";
  const [instruction, setInstruction] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AdvisorRunResult>();
  const [error, setError] = useState<string>();
  const [paidConfirmation, setPaidConfirmation] = useState(false);
  const activeRequestId = useRef<string>();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const request = useMemo(() => buildAdvisorRequest(block, { title, key: keySignature, bpm, instruction, tagIds: [...block.tags, ...selectedTagIds], derivedTagIds, context: referenceContext }), [block, bpm, derivedTagIds, instruction, keySignature, referenceContext, selectedTagIds, title]);
  const latestFingerprint = useRef(advisorRequestFingerprint(request));
  latestFingerprint.current = advisorRequestFingerprint(request);
  const selectableTags = progressionTaxonomy.filter((tag) => tag.category === "mood" || tag.category === "use");

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  function close() {
    const requestId = activeRequestId.current;
    if (requestId) void cancelAdvisorRun(requestId);
    activeRequestId.current = undefined;
    setRunning(false);
    onClose();
  }

  async function run(paidConfirmed = false) {
    if (running) return;
    const preferences = { ...loadLlmPreferences(), language };
    if (preferences.provider === "openai" && preferences.openai.confirmBeforePaidRequest && !paidConfirmed) {
      setPaidConfirmation(true);
      return;
    }
    const requestId = crypto.randomUUID();
    const fingerprint = advisorRequestFingerprint(request);
    activeRequestId.current = requestId;
    setRunning(true);
    setError(undefined);
    setResult(undefined);
    try {
      const next = await requestAdvisorSuggestions(requestId, request, preferences);
      if (!isCurrentAdvisorResponse(activeRequestId.current, requestId, latestFingerprint.current, fingerprint)) return;
      setResult(next);
    } catch (runError) {
      if (activeRequestId.current !== requestId) return;
      const code = runError instanceof AdvisorServiceError ? runError.code : "unknown";
      setError(errorMessage(code, language));
    } finally {
      if (activeRequestId.current === requestId) {
        activeRequestId.current = undefined;
        setRunning(false);
      }
    }
  }

  async function copySuggestion(suggestion: AdvisorSuggestion) {
    try {
      await navigator.clipboard.writeText(`| ${suggestion.events.map((event) => event.chord).join(" | ")} |`);
      setToast(ja ? "コード進行をコピーしました" : "Progression copied");
    } catch {
      setToast(ja ? "コピーできませんでした" : "Could not copy");
    }
  }

  return (
    <>
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/55" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <aside role="dialog" aria-modal="true" aria-labelledby="progression-advisor-title" className="h-full w-full max-w-2xl overflow-y-auto border-l border-[var(--lv-border-strong)] bg-[var(--lv-surface)] p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--lv-border)] pb-4">
          <div><p className="text-xs font-semibold uppercase text-[var(--lv-accent)]">Progression Advisor</p><h2 id="progression-advisor-title" className="mt-1 text-lg font-semibold">{ja ? "8小節の展開案" : "8-bar progression ideas"}</h2></div>
          <button ref={closeButtonRef} type="button" className="lv-button-ghost inline-flex h-9 w-9 items-center justify-center" aria-label={ja ? "閉じる" : "Close"} title={ja ? "閉じる" : "Close"} onClick={close}><X aria-hidden="true" size={20} /></button>
        </div>

        <div className="mt-5">
          <label className="text-sm font-semibold" htmlFor="advisor-instruction">{ja ? "意図・方向性" : "Intent"}</label>
          <textarea id="advisor-instruction" rows={3} maxLength={1000} className="mt-2 w-full resize-y rounded border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] p-3 text-sm outline-none focus:border-teal-400" value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder={ja ? "例: 浮遊感を保ち、後半だけ緊張感を足す" : "Keep the floating mood and add tension near the end"} />
        </div>

        <fieldset className="mt-4 border-t border-[var(--lv-border)] pt-4">
          <legend className="text-sm font-semibold">Mood / Use</legend>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {selectableTags.map((tag) => <label key={tag.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedTagIds.includes(tag.id)} onChange={(event) => setSelectedTagIds((current) => event.target.checked ? [...current, tag.id] : current.filter((id) => id !== tag.id))} />{tag.label[language]}</label>)}
          </div>
        </fieldset>

        <details className="mt-4 border-t border-[var(--lv-border)] pt-4 text-sm text-[var(--lv-text-secondary)]">
          <summary className="cursor-pointer font-semibold text-[var(--lv-text)]">{ja ? "AIへ送る内容" : "Data sent to AI"}</summary>
          <p className="mt-2 leading-6">{ja ? "現在のコード進行、任意指示、選択タグ、構造化した参照進行（最大3件）" : "Current chords, optional instruction, selected tags, and up to three structured references"}</p>
          <p className="mt-1 truncate font-mono text-xs">| {request.progression.events.map((event) => event.chord).join(" | ")} |</p>
        </details>

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--lv-border)] pt-4">
          <button type="button" disabled={running} className="lv-button-primary inline-flex min-h-10 items-center gap-2 px-4 text-sm font-semibold disabled:opacity-50" onClick={() => void run()}>{running ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : <Sparkles aria-hidden="true" size={16} />}{running ? (ja ? "生成中…" : "Generating…") : (ja ? "3つの案を生成" : "Generate 3 ideas")}</button>
          {running ? <button type="button" className="lv-button-secondary px-3 py-2 text-sm" onClick={() => { const id = activeRequestId.current; if (id) void cancelAdvisorRun(id); }}>{ja ? "キャンセル" : "Cancel"}</button> : null}
          <span className="text-xs text-[var(--lv-text-muted)]">{loadLlmPreferences().provider === "local" ? (ja ? "ローカルLLM" : "Local LLM") : "OpenAI API"}</span>
          <span className="text-xs text-[var(--lv-text-muted)]">{ja ? `参照 ${referenceContext.length}件` : `${referenceContext.length} references`}</span>
        </div>

        {error ? <AdvisorErrorState message={error} /> : null}
        {result ? (
          <div className="mt-6">
            <p className="text-sm leading-6 text-[var(--lv-text-secondary)]">{result.response.analysis}</p>
            <p className="mt-2 text-xs text-[var(--lv-text-muted)]">{result.model} · {result.latencyMs} ms{result.retryCount ? ` · retry ${result.retryCount}` : ""}</p>
            <div className="mt-4 space-y-4">
              {result.response.suggestions.map((suggestion) => <AdvisorSuggestionCard key={suggestion.id} suggestion={suggestion} language={language} onAppend={() => { onAppend(suggestion); setToast(ja ? "下書きへ追加しました。保存するまでVaultは変わりません" : "Added to draft. Vault is unchanged until you save"); }} onSave={() => { if (onSave(suggestion)) setToast(ja ? "新しい進行として保存しました" : "Saved as a new progression"); }} onCopy={() => void copySuggestion(suggestion)} onApplyTags={() => { if (onApplyTags([...new Set([...result.response.suggestedTagIds, ...suggestion.suggestedTagIds])])) setToast(ja ? "タグを適用しました" : "Tags applied"); }} />)}
            </div>
          </div>
        ) : null}
      </aside>
    </div>
    <ConfirmDialog
      open={paidConfirmation}
      title={ja ? "OpenAI APIを実行" : "Run OpenAI API"}
      description={ja ? "OpenAI APIは従量課金です。利用料金はOpenAIアカウントへ請求されます。" : "OpenAI API usage is billed to your OpenAI account."}
      confirmLabel={ja ? "料金を確認して実行" : "Confirm and run"}
      cancelLabel={ja ? "キャンセル" : "Cancel"}
      onCancel={() => setPaidConfirmation(false)}
      onConfirm={() => { setPaidConfirmation(false); void run(true); }}
    />
    </>
  );
}

function errorMessage(code: string, language: AppLanguage): string {
  const ja = language === "ja";
  const messages: Record<string, [string, string]> = {
    desktop_only: ["デスクトップ版で利用できます。", "Available in the desktop app."],
    local_server_unavailable: ["ローカルLLMへ接続できません。設定とサーバーを確認してください。", "Could not reach the local LLM. Check settings and the server."],
    model_unavailable: ["選択したモデルが見つかりません。", "The selected model is unavailable."],
    timeout: ["生成がタイムアウトしました。", "Generation timed out."],
    cancelled: ["生成をキャンセルしました。", "Generation was cancelled."],
    domain_validation_failed: ["生成結果が音楽・構造の検証を通りませんでした。", "The generated result failed progression validation."],
    provider_not_configured: ["AIプロバイダーの設定を完了してください。", "Complete the AI provider settings."],
  };
  return messages[code]?.[ja ? 0 : 1] ?? (ja ? `生成できませんでした (${code})` : `Could not generate (${code})`);
}
