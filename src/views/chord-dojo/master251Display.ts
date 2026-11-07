import {TARGETS,KEY_NAMES,cellKey} from '../../domain/master251/model';
import {master251CanonicalFingerings} from '../../domain/master251/canonicalFingerings';
import {targetSnapshot} from '../../domain/chordDojo/targetSnapshot';
import {parseChordLabel} from '../../domain/chords';
/** One display envelope for all 144 fixed targets; this never changes notes, hands or fingers. */
import {targetForMasterRange} from '../../domain/master251/register';
const viewport=(targets:typeof TARGETS)=>targets.flatMap(target=>{const plans=master251CanonicalFingerings(target);return target.chords.map((chord,index)=>targetSnapshot(`master:${target.form}:${target.key}:${index}`,parseChordLabel(chord.symbol)!,chord.notes,plans[index],KEY_NAMES[target.key]));});

export const MASTER251_SCORE_VIEWPORT=viewport(TARGETS);
export const MASTER251_RANGE_VIEWPORTS={original:MASTER251_SCORE_VIEWPORT,'octave-down':viewport(TARGETS.map(t=>targetForMasterRange(cellKey(t.form,t.key),'octave-down')))};
