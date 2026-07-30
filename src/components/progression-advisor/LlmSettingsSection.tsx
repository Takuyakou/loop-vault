import { CircleAlert, CircleCheck, KeyRound, LoaderCircle, PlugZap, RefreshCw, Trash2 } from "lucide-react";
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
    refresh: "モデルを更新", test: "接続を確認", checking: "接続を確認しています…", connected: "接続できました", desktopOnly: "デスクトップ版で設定できます", noModels: "利用できるモデルがありません",
    paid: "OpenAI APIは従量課金です。料金はOpenAIアカウントへ請求されます。", confirm: "実行前に毎回確認する", key: "APIキー", register: "キーを登録", registered: "登録済み", missing: "未登録", remove: "キーを削除", saved: "設定を保存しました", failed: "操作に失敗しました",
  },
  en: {
    title: "AI provider", local: "Local LLM", openai: "OpenAI API", baseUrl: "Endpoint", model: "Model", timeout: "Timeout (seconds)",
    refresh: "Refresh models", test: "Test connection", checking: "Checking connection…", connected: "Connection successful", desktopOnly: "Configure this in the desktop app", noModels: "No models are available",
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
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({ kind: "idle", message: "" });

  useEffect(() => {
    if (!isLlmDesktopAvailable()) return;
    void getOpenAiApiKeyStatus().then((status) => setKeyRegistered(status.registered)).catch(() => undefined);
  }, []);

  function update(next: LlmPreferences) {
    const synced = { ...next, language };
    setPreferences(synced);
    setConnectionStatus({ kind: "idle", message: "" });
    try {
      saveLlmPreferences(synced);
    } catch {
      // Keep an in-progress value editable and persist it once it becomes valid.
    }
  }

  async function checkConnection(action: () => Promise<void>) {
    if (!isLlmDesktopAvailable()) {
      setConnectionStatus({ kind: "error", message: ui.desktopOnly });
      setToast(ui.desktopOnly);
      return;
    }
    setBusy(true);
    setConnectionStatus({ kind: "checking", message: ui.checking });
    try {
      await action();
      setConnectionStatus({ kind: "success", message: ui.connected });
      setToast(ui.connected);
    } catch (error) {
      const code = llmErrorCode(error);
      const message = connectionErrorMessage(code, language);
      setConnectionStatus({ kind: "error", message });
      setToast(message);
    } finally {
      setBusy(false);
    }
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
          <label className="text-sm">{ui.baseUrl}<input name="local-llm-base-url" autoComplete="off" spellCheck={false} className={`${inputClass} mt-2`} value={preferences.local.baseUrl} onChange={(event) => update({ ...preferences, local: { ...preferences.local, baseUrl: event.target.value } })} /></label>
          <label className="text-sm">{ui.timeout}<input name="local-llm-timeout" autoComplete="off" inputMode="numeric" className={`${inputClass} mt-2`} min={5} max={120} type="number" value={preferences.local.timeoutSeconds} onChange={(event) => update({ ...preferences, local: { ...preferences.local, timeoutSeconds: Number(event.target.value) } })} /></label>
          <label className="text-sm md:col-span-2">{ui.model}<input name="local-llm-model" autoComplete="off" spellCheck={false} className={`${inputClass} mt-2`} list="local-llm-models" value={preferences.local.model} onChange={(event) => update({ ...preferences, local: { ...preferences.local, model: event.target.value } })} /><datalist id="local-llm-models">{models.map((model) => <option key={model.name} value={model.name} />)}</datalist></label>
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button type="button" disabled={busy} className="inline-flex items-center gap-2 rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm" onClick={refreshModels}><RefreshCw aria-hidden="true" size={16} />{ui.refresh}</button>
            <button type="button" disabled={busy} className="inline-flex items-center gap-2 rounded bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-stone-950 disabled:opacity-50" onClick={() => void checkConnection(() => testLocalLlmConnection(preferences.local).then(() => undefined))}>{connectionStatus.kind === "checking" ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : <PlugZap aria-hidden="true" size={16} />}{connectionStatus.kind === "checking" ? ui.checking : ui.test}</button>
          </div>
          <ConnectionStatusMessage status={connectionStatus} />
        </div>
      ) : (
        <div className="mt-4">
          <p className="border-l-2 border-amber-300 pl-3 text-sm text-amber-100">{ui.paid}</p>
          <label className="mt-4 block text-sm">{ui.model}<input name="openai-model" autoComplete="off" spellCheck={false} className={`${inputClass} mt-2`} value={preferences.openai.model} onChange={(event) => update({ ...preferences, openai: { ...preferences.openai, model: event.target.value } })} /></label>
          <label className="mt-4 flex items-center gap-3 text-sm"><input type="checkbox" checked={preferences.openai.confirmBeforePaidRequest} onChange={(event) => update({ ...preferences, openai: { ...preferences.openai, confirmBeforePaidRequest: event.target.checked } })} />{ui.confirm}</label>
          <div className="mt-4 border-t border-[var(--lv-border)] pt-4">
            <div className="flex items-center justify-between gap-3"><label className="text-sm" htmlFor="openai-key">{ui.key}</label><span className="text-xs text-[var(--lv-text-muted)]">{keyRegistered ? ui.registered : ui.missing}</span></div>
            <input id="openai-key" name="openai-api-key" className={`${inputClass} mt-2`} type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy || !apiKey} className="inline-flex items-center gap-2 rounded bg-[var(--lv-accent)] px-3 py-2 text-sm font-semibold text-stone-950 disabled:opacity-50" onClick={() => void run(async () => { const status = await setOpenAiApiKey(apiKey); setKeyRegistered(status.registered); setApiKey(""); setToast(ui.saved); })}><KeyRound aria-hidden="true" size={16} />{ui.register}</button>
              <button type="button" disabled={busy || !keyRegistered} className="inline-flex items-center gap-2 rounded border border-red-400/50 px-3 py-2 text-sm text-red-100 disabled:opacity-50" onClick={() => void run(async () => { const status = await deleteOpenAiApiKey(); setKeyRegistered(status.registered); setToast(ui.saved); })}><Trash2 aria-hidden="true" size={16} />{ui.remove}</button>
              <button type="button" disabled={busy || !keyRegistered || !preferences.openai.model} className="inline-flex items-center gap-2 rounded border border-[var(--lv-border-strong)] px-3 py-2 text-sm disabled:opacity-50" onClick={() => void checkConnection(() => testOpenAiLlmConnection(preferences.openai.model).then(() => undefined))}>{connectionStatus.kind === "checking" ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : <PlugZap aria-hidden="true" size={16} />}{connectionStatus.kind === "checking" ? ui.checking : ui.test}</button>
            </div>
            <ConnectionStatusMessage status={connectionStatus} />
          </div>
        </div>
      )}
    </section>
  );
}

type ConnectionStatus = { kind: "idle" | "checking" | "success" | "error"; message: string };

function ConnectionStatusMessage({ status }: { status: ConnectionStatus }) {
  if (status.kind === "idle") return null;
  const color = status.kind === "error" ? "text-red-200" : status.kind === "success" ? "text-emerald-200" : "text-[var(--lv-text-secondary)]";
  return (
    <p role="status" aria-live="polite" className={`mt-3 flex items-center gap-2 text-sm md:col-span-2 ${color}`}>
      {status.kind === "checking" ? <LoaderCircle aria-hidden="true" className="animate-spin" size={16} /> : status.kind === "success" ? <CircleCheck aria-hidden="true" size={16} /> : <CircleAlert aria-hidden="true" size={16} />}
      {status.message}
    </p>
  );
}

function connectionErrorMessage(code: string, language: AppLanguage): string {
  const messages: Record<string, [string, string]> = {
    local_server_unavailable: ["接続できませんでした。ローカルLLMが起動しているか、接続先を確認してください。", "Connection failed. Check that the local LLM is running and the endpoint is correct."],
    model_unavailable: ["接続先に指定したモデルがありません。", "The selected model is not available at the endpoint."],
    timeout: ["接続確認がタイムアウトしました。", "The connection test timed out."],
    api_key_missing: ["OpenAI APIキーが登録されていません。", "No OpenAI API key is registered."],
    authentication_failed: ["OpenAI APIキーを確認してください。", "Check the OpenAI API key."],
  };
  return messages[code]?.[language === "ja" ? 0 : 1] ?? (language === "ja" ? `接続できませんでした (${code})` : `Connection failed (${code})`);
}
