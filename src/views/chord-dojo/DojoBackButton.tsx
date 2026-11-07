/** P12.4-01: the one back button of Chord Dojo. Every screen below the top uses this, at the top left. */
export function DojoBackButton({label,onBack}:{label:string;onBack:()=>void}){
 return <button type="button" className="dojo-back" data-testid="dojo-back" aria-label={`${label}へ戻る`} onClick={onBack}><span aria-hidden="true">←</span> {label}</button>;
}
