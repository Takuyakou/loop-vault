/** P18-01 Stage 2: whether a practice screen repeats its stage (lap after lap, without stopping: 入) or stops at the
 * end of a lap to ask (もう一度 ① を弾く: 切). The switch of 「この段階をくり返す」 on the row of the settings.
 * The first value is A (the standard progressions) off, C (Original Practice) and D (Jazz Progressions) on: what the
 * screens do today. One value per screen kind, kept for the next time the screen is opened.
 * It is kept in localStorage and not in a record: the Dojo document and the lap records are `.strict()` schemas whose
 * shape must not change (an older app could no longer read them). Without a storage, or with a broken one, the first
 * value comes back. */
export type RepeatScreen='a'|'c'|'d';
const FIRST_VALUE:{[k in RepeatScreen]:boolean}={a:false,c:true,d:true};
const storageKey=(k:RepeatScreen)=>`loop-vault:practice-repeat:${k}`;
export function readRepeatSetting(screen:RepeatScreen):boolean{
 try{
  const value=window.localStorage.getItem(storageKey(screen));
  if(value==='1')return true;
  if(value==='0')return false;
 }catch{/* no storage (or it refuses): the first value */}
 return FIRST_VALUE[screen];
}
export function writeRepeatSetting(screen:RepeatScreen,value:boolean):void{
 try{window.localStorage.setItem(storageKey(screen),value?'1':'0');}catch{/* ignore: the switch still works for this screen */}
}
