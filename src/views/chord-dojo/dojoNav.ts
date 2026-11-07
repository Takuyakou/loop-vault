/**
 * P12.4-01: where each Chord Dojo screen sits, so that "back" is one rule: the place one level up.
 * The label of the back button is derived from here too (never written by hand on a screen).
 */
export type DojoChoice='shape'|'voicing'|'saved-progressions'|'builtin-progressions';
export const CHOICE_NAMES:Record<DojoChoice,string>={shape:'型の一覧',voicing:'登録した音','saved-progressions':'自分の進行','builtin-progressions':'定番の進行'};
/** The top of Chord Dojo. It has no back button: the app's sidebar is how you leave it. */
export const HOME_NAME='今日の練習';
export type DojoPlace=
 |{screen:'home'|'master251'|'endless'|'ear'|'original'}
 /** `from`: the list a practice was opened from (its result goes back to that list too). */
 |{screen:'finish';from?:DojoChoice}
 |{screen:'choose';choose:DojoChoice}
 /** `from` is the list the practice was opened from; without it the practice belongs to today's plan. */
 |{screen:'practice';from?:DojoChoice};
export interface DojoParent{place:DojoPlace;label:string}
const HOME:DojoParent={place:{screen:'home'},label:HOME_NAME};
export function parentOf(place:DojoPlace):DojoParent|undefined{
 switch(place.screen){
  case 'home':return undefined;
  case 'choose':case 'master251':case 'ear':return HOME;
  case 'finish':return place.from?{place:{screen:'choose',choose:place.from},label:CHOICE_NAMES[place.from]}:HOME;
  case 'endless':case 'original':return {place:{screen:'choose',choose:'builtin-progressions'},label:CHOICE_NAMES['builtin-progressions']};
  case 'practice':return place.from?{place:{screen:'choose',choose:place.from},label:CHOICE_NAMES[place.from]}:HOME;
 }
}
/** Stable id of a place, for remembering which control opened it. */
export const placeKey=(place:DojoPlace,endlessId?:string)=>place.screen==='choose'?`choose:${place.choose}`:place.screen==='endless'?`endless:${endlessId??''}`:place.screen==='original'?`original:${endlessId??''}`:place.screen;
