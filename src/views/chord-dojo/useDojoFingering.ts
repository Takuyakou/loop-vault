import {useMemo,useState} from 'react';
import {useFingeringRankerMode} from '../../voicingPractice/fingeringRankerMode';
import {p21ERankerCostModel} from '../../domain/p21SingleNoteFingering';
import {loadFingeringPreferences} from '../../voicingPractice/fingeringPreferences';
import {dojoFingerings,type FingeringChord} from './fingering';
export function useDojoFingering(chords:readonly FingeringChord[],bpm=80){const mode=useFingeringRankerMode(),[preferences]=useState(loadFingeringPreferences);const options=useMemo(()=>mode==='E1-T'?{costModel:p21ERankerCostModel()}:{},[mode]);return useMemo(()=>dojoFingerings(chords,options,preferences,bpm),[chords,options,preferences,bpm]);}

export function useLessonFingeringOptions(){const mode=useFingeringRankerMode(),[preferences]=useState(loadFingeringPreferences);const options=useMemo(()=>mode==='E1-T'?{costModel:p21ERankerCostModel()}:{},[mode]);return {options,preferences};}
