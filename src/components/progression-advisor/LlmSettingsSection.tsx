import { KeyRound, PlugZap, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppLanguage } from "../../domain/types";
import {
  deleteOpenAiApiKey,
  getOpenAiApiKeyStatus,
  isLlmDesktopAvailable,
  listLocalLlmModels,
  llmErrorCode,
  setOpenAiApiKey,
  testLocalLlmConnection,
  testOpenAiLlmConnection,
  type LocalLlmModel,
} from "../../llm/bridge";
import { loadLlmPreferences, saveLlmPreferences, type LlmPreferences } from "../../llm/preferences";

const inputClass = "w-full rounded border border-[var(--lv-border-strong)] bg-[var(--lv-bg)] px-3 py-2 text-sm text-[var(--lv-text)] outline-none focus:border-teal-400";

const labels = {
  ja: {
    title: "AIプロバイダー", local: "ローカルLLM", openai: "OpenAI API", baseUrl: "接続先", model: "モデル", timeout: "タイムアウト（秒）",
    refresh: "モデルを更新", test: "接続を確認", connected: "接続できました", desktopOnly: "デスクトップ版で設定できます", noModels: "利用できるモデルがありません",
    paid: "OpenAI APIは従量課金です。料金はOpenAIアカウントへ請求されます。", confirm: "実行前に毎回確認する", key: "APIキー", register: "キーを登録", registered: "登録済み", missing: "未登録", remove: "キーを削除", saved: "設定を保存しました", failed: "操作に失敗しました",
  },
  en: {
    title: "AI provider", local: "Local LLM", openai: "OpenAI API", baseUrl: "Endpoint", model: "Model", timeout: "Timeout (seconds)",
    refresh: "Refresh models", test: "Test connection", connected: "Connection successful", desktopOnly: "Configure this in the desktop app", noModels: "No models are available",
    paid: "OpenAI API usage is billed to your OpenAI account.", confirm: "Confirm before every paid request", key: "API key", register: "Register key", registered: "Registered", missing: "Not registered", remove: "Delete key", saved: "Settings saved", failed: "The operation failed",
  },
} as const;

interface Props {
  language: AppLanguage;
  setToast: (message: string) => void;
}

export function LlmSettingsSection({ language, setToast }: Props) {
  const ui = labels[language];
  const [preferences, setPreferences] = useState<LlmPreferences>(() => ({ ...loadLlmPreferences(), language }));
  const [models, setModels] = useState<LocalLlmModel[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [keyRegistered, setKeyRegistered] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isLlmDesktopAvailable()) return;
    void getOpenAiApiKeyStatus().then((status) => setKeyRegistered(status.registered)).catch(() => undefined);
  }, []);

  function update(next: LlmPreferences) {
    const synced = { ...next, language };
    setPreferences(synced);
    saveLlmPreferences(synced);
  }

  async function run(action: () => Promise<void>) {
    if (!isLlmDesktopAvailable()) {
      setToast(ui.desktopOnly);
      return;
    }
    setBusy(true);
    try {
      await action();
    } catch (error) {
      const code = llmErrorCode(error);
      setToast(code === "unknown" ? ui.failed : `${ui.failed} (${code})`);
    } finally {
      setBusy(false);
    }
  }

  function refreshModels() {
    void run(async () => {
      const nextModels = await listLocalLlmModels(preferences.local.baseUrl, preferences.local.timeoutSeconds);
      setModels(nextModels);
      if (!preferences.local.model && nextModels[0]) update({ ...preferences, local: { ...preferences.local, model: nextModels[0].name } });
      setToast(nextModels.length ? `${nextModels.length} model(s)` : ui.noModels);
    });
  }

  return (
    <section aria-labelledby="settings-llm-title" className="mt-5 border border-[var(--lv-border)] bg-[var(--lv-bg)] p-4">
      <h3 id="settings-llm-title" className="text-sm font-semibold text-[var(--lv-accent)]">{ui.title}</h3>
      <div className="mt-4 inline-flex border border-[var(--lv-border-strong)] p-1" role="radiogroup" aria-label={ui.title}>
        {(["local", "openai"] as const).map((provider) => (
          <button key={provider} type="button" role="radio" aria-checked={preferences.provider === provider} className={`px-3 py-2 text-sm ${preferences.provider === provider ? "bg-[var(--lv-surface-raised)] text-[var(--lv-text)]" : "text-[var(--lv-text-muted)]"}`} onClick={() => update({ ...preferences, provider })}>
            {provider === "local" ? ui.local : ui.openai}
          </button>
        ))}
      </div>

      {preferences.provider === "local" ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm">{ui.baseUrl}<input className={`${inputClass} mt-2`} value={preferences.local.baseUrl} onChange={(event) => update({ ...preferences, local: { ...preferences.local, baseUrl: event.target.value } })} /></label>
          <label className="text-sm">{ui.timeout}<input className={`${inputClass} mt-2`} min={5} max={120} type="number" value={preferences.local.timeoutSeconds} onChange={(event) => update({ ...preferences, local: { ...preferences.local, timeoutSeconds: Number(event.target.value) } })} /></label>
          <label className="text-sm md:col-span-2">{ui.model}<input className={`${inputClass} mt-2`} list="local-llm-models" value={preferences.local.model} onChange={(event) => update({ ...preferences, local: { ...preferences.local, model: event.target.value } })} /><datalist id="local-llm-models">{models.map((model) => <option key={model.name} value={model.name} />)}</datalist></label>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button type="button" disabled={busy} className="inline-flex items-center gap-2 rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm" onClick={refreshModels}><RefreshCw aria-hidden="true" size={16} />{ui.refresh}</button>
            <button type="button" disabled={busy || !preferences.local.model} className="inline-flex items-center gap-2 rounded bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-stone-950 disabled:opacity-50" onClick={() => void run(async () => { await testLocalLlmConnection(preferences.local); setToast(ui.connected); })}><PlugZap aria-hidden="true" size={16} />{ui.test}</button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <p className="border-l-2 border-amber-300 pl-3 text-sm text-amber-100">{ui.paid}</p>
          <label className="mt-4 block text-sm">{ui.model}<input className={`${inputClass} mt-2`} value={preferences.openai.model} onChange={(event) => update({ ...preferences, openai: { ...preferences.openai, model: event.target.value } })} /></label>
          <label className="mt-4 flex items-center gap-3 text-sm"><input type="checkbox" checked={preferences.openai.confirmBeforePaidRequest} onChange={(event) => update({ ...preferences, openai: { ...preferences.openai, confirmBeforePaidRequest: event.target.checked } })} />{ui.confirm}</label>
          <div className="mt-4 border-t border-[var(--lv-border)] pt-4">
            <div className="flex items-center justify-between gap-3"><label className="text-sm" htmlFor="openai-key">{ui.key}</label><span className="text-xs text-[var(--lv-text-muted)]">{keyRegistered ? ui.registered : ui.missing}</span></div>
            <input id="openai-key" className={`${inputClass} mt-2`} type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy || !apiKey} className="inline-flex items-center gap-2 rounded bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-stone-950 disabled:opacity-50" onClick={() => void run(async () => { const status = await setOpenAiApiKey(apiKey); setKeyRegistered(status.registered); setApiKey(""); setToast(ui.saved); })}><KeyRound aria-hidden="true" size={16} />{ui.register}</button>
              <button type="button" disabled={busy || !keyRegistered} className="inline-flex items-center gap-2 rounded border border-red-400/50 px-3 py-2 text-sm text-red-100 disabled:opacity-50" onClick={() => void run(async () => { const status = await deleteOpenAiApiKey(); setKeyRegistered(status.registered); setToast(ui.saved); })}><Trash2 aria-hidden="true" size={16} />{ui.remove}</button>
              <button type="button" disabled={busy || !keyRegistered || !preferences.openai.model} className="inline-flex items-center gap-2 rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm disabled:opacity-50" onClick={() => void run(async () => { await testOpenAiLlmConnection(preferences.openai.model); setToast(ui.connected); })}><PlugZap aria-hidden="true" size={16} />{ui.test}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
