import {createKeyBag} from './endless';

/**
 * The random key of Jazz Progressions: the same order as the random key of the other standard progressions (`endless.ts`): the twelve
 * keys shuffled and played once each in a round, the first key of a round never the key just played. The keys are the tonics of the
 * ITEM (the main progression), whichever version is on the screen.
 */
export interface JazzKeyBag{
  seed:number;
  /** From 1. */
  round:number;
  /** The key being played is `bag[pos]`; -1 before the first key of the bag (the key on the screen was chosen by hand). */
  pos:number;
  bag:number[];
}

/** `current`: the key on the screen when the random key is turned on there (the first key of the bag is another one); none: the first key of the bag is the one to play. */
export function startJazzKeyBag(seed:number,current?:number):JazzKeyBag{
  return {seed,round:1,pos:current===undefined?0:-1,bag:createKeyBag(seed+1,current)};
}
/** The key to play now, once a bag has been started without a current key. */
export const jazzBagKey=(state:JazzKeyBag)=>state.bag[Math.max(0,state.pos)]!;
/** The next key, and the bag with it: the next in the bag, or the first of a new bag (not the key just played) when the round is over. */
export function nextJazzKey(state:JazzKeyBag,current:number):{state:JazzKeyBag;key:number}{
  let {round,pos,bag}=state;pos+=1;
  if(pos>=12){round+=1;pos=0;bag=createKeyBag(state.seed+round,current);}
  return {state:{...state,round,pos,bag},key:bag[pos]!};
}
