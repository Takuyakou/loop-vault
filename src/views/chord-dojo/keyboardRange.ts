import type {KeyboardRange} from '../../components/music-keyboard';
export const DOJO_BASE_RANGE:KeyboardRange={minMidiNote:36,maxMidiNote:84};
export function answerKeyboardRange(notes:readonly number[],answerVisible:boolean):KeyboardRange{
 if(!answerVisible||!notes.length)return DOJO_BASE_RANGE;
 return {minMidiNote:Math.max(0,Math.min(36,Math.floor(Math.min(...notes)/12)*12)),maxMidiNote:Math.min(127,Math.max(84,Math.ceil(Math.max(...notes)/12)*12))};
}
