import { AlertTriangle } from "lucide-react";

export function AdvisorErrorState({ message }: { message: string }) {
  return <div role="alert" className="mt-4 flex items-start gap-3 border-l-2 border-red-400 bg-red-950/20 p-3 text-sm text-red-100"><AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={16} /><span>{message}</span></div>;
}
