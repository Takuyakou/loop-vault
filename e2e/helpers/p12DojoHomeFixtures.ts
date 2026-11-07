import {p12ThemeIdeas} from '../../src/testing/p12ThemeFixture';
import {emptyStore} from '../../src/domain/chordDojo/store';
import {collectVault,syncVault} from '../../src/domain/chordDojo/collect';
import {planToday} from '../../src/domain/chordDojo/planner';
import {QUALITIES,symbol} from '../../src/domain/chordDojo/recipes';
import {freezeLessonDisplay} from '../../src/views/chord-dojo/lessonFingering';
export function homeFixture(state:'theme'|'many'|'resume'|'finished'|'empty'){
 const now=new Date(),ideas=p12ThemeIdeas();let store=emptyStore(now);
 if(state==='many'){
  ideas[0].title='合成の長いテーマ名・出典と範囲を詳細で確認するためのレッスン'.repeat(6);
  const block=ideas[0].progressionBlocks![0],first=block.chords[0];block.endBar=8;block.summaryText='合成の14種類・8小節';
  block.chords=QUALITIES.map((quality,i)=>({...first,eventId:`home-synthetic-${i}`,bar:Math.floor(i/2)+1,beat:i%2?3:1,durationBeats:2,chord:symbol(i%12,quality)}));
  store.settings.lessonPolicy={budgetSeconds:9000,reviewLimit:6};
 }
 if(state==='empty')store.settings.lessonPolicy={budgetSeconds:0,reviewLimit:6};
 const collection=collectVault(ideas,now.toISOString());store=syncVault(store,collection,now.toISOString());store.today=planToday(store,collection.progressions,now);
 if(store.today.lesson)store.today.lesson=freezeLessonDisplay(store.today.lesson,now.toISOString());
 if(state==='resume'){store.today.startedAt=now.toISOString();store.today.cursor.stage='see';}
 if(state==='finished'){store.today.startedAt=now.toISOString();store.today.finished=true;store.today.cursor.taskIndex=store.today.tasks.length;}
 return store;
}
