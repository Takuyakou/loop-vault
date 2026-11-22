import { ChevronLeft } from "lucide-react";
/** P12.4-01 / P22-01 §4B: the one back button, now a bordered button with the destination name. */
export function DojoBackButton({label,onBack}:{label:string;onBack:()=>void}){
 return <button type="button" className="dojo-back" data-testid="dojo-back" aria-label={`${label}へ戻る`} title="Esc でも戻れます" onClick={onBack}><ChevronLeft size={16} aria-hidden="true"/><span className="dojo-back-label">{label}</span></button>;
}
