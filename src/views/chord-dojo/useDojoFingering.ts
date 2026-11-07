import {useMemo,useState} from 'react';
import {useFingeringRankerMode} from '../../voicingPractice/fingeringRankerMode';
import {eRankerCostModel} from '../../domain/eRankerFingering';
import {loadFingeringPreferences} from '../../voicingPractice/fingeringPreferences';
import {dojoFingerings,type FingeringChord} from './fingering';
export function useDojoFingering(chords:readonly FingeringChord[],bpm=80){const mode=useFingeringRankerMode(),[preferences]=useState(loadFingeringPreferences);const options=useMemo(()=>mode==='E1-T'?{costModel:eRankerCostModel()}:{},[mode]);return useMemo(()=>dojoFingerings(chords,options,preferences,bpm),[chords,options,preferences,bpm]);}

export function useLessonFingeringOptions(){const mode=useFingeringRankerMode(),[preferences]=useState(loadFingeringPreferences);const options=useMemo(()=>mode==='E1-T'?{costModel:eRankerCostModel()}:{},[mode]);return {options,preferences};}
