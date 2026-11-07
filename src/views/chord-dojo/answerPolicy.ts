export interface AnswerPolicyInput {kind:'dojo'|'master';stage:string;active:boolean;compositionIntroduction?:boolean;hint?:boolean;feedback?:'wrong'|'success';tempoRunning?:boolean;}
/** All answer surfaces use this decision, including names that could disclose a progression. */
export function answerPolicy(input:AnswerPolicyInput){
 if(!input.active)return {answer:false,theme:false};
 const freelyShown=input.kind==='master'?input.stage==='learn':input.stage==='see'||input.stage==='memorize'||input.stage==='composition'&&Boolean(input.compositionIntroduction);
 const revealed=Boolean(input.hint)||Boolean(input.feedback)&&!input.tempoRunning;
 const answer=freelyShown||revealed;
 return {answer,theme:freelyShown};
}
