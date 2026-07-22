import { Sparkles } from "lucide-react";
import type { AppLanguage } from "../../domain/types";

export function ProgressionAdvisorButton({ language, onClick }: { language: AppLanguage; onClick: () => void }) {
  const label = language === "ja" ? "AIで展開案" : "AI progressions";
  return <button type="button" className="lv-button-ghost inline-flex min-h-9 items-center gap-2 px-3 text-sm" onClick={onClick}><Sparkles aria-hidden="true" size={16} />{label}</button>;
}
