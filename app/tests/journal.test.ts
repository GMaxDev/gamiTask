import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createJournal,record,summary,summaryLine,timeLabel,MAX_ENTRIES} from '../src/journal.ts';

const D='2026-09-23';

test('un journal repart vide si la date a changé ou si la sauvegarde est cassée',()=>{
 assert.deepEqual(createJournal(null,D),{date:D,entries:[]});
 assert.deepEqual(createJournal({date:'2026-09-22',entries:[{at:1,kind:'task',text:'x'}]},D),{date:D,entries:[]});
 assert.deepEqual(createJournal({date:D,entries:'oops'},D),{date:D,entries:[]});
 const j=createJournal({date:D,entries:[{at:1,kind:'task',text:'ok',coins:3},{kind:'nope'},{at:2,kind:'pomo',text:'f',coins:'x'}]},D);
 assert.equal(j.entries.length,1);assert.equal(j.entries[0]!.text,'ok');
});

test('record ajoute, horodate, et cumule dans le résumé',()=>{
 const j=createJournal(null,D);
 record(j,{kind:'task',text:'Relire le brief',coins:8,xp:20},D,1000);
 record(j,{kind:'pomo',text:'Focus terminé',coins:10},D,2000);
 record(j,{kind:'achievement',text:'Premier pomodoro'},D,3000);
 assert.equal(j.entries.length,3);assert.equal(j.entries[1]!.at,2000);
 assert.deepEqual(summary(j),{coins:18,xp:20,tasks:1,pomos:1,achievements:1});
 assert.equal(summaryLine(j),'+18 pièces · +20 XP · 1 tâche · 1 focus · 1 succès');
});

test('la ligne de résumé ne dit que ce qui est arrivé',()=>{
 const j=createJournal(null,D);
 assert.equal(summaryLine(j),'');
 record(j,{kind:'level',text:'Niveau 6'},D,1);
 assert.equal(summaryLine(j),'');
 record(j,{kind:'task',text:'t',coins:1},D,2);
 assert.equal(summaryLine(j),'+1 pièce · 1 tâche');
});

test('record sur une nouvelle date vide la journée précédente',()=>{
 const j=createJournal(null,D);
 record(j,{kind:'task',text:'hier',coins:5},D,1);
 record(j,{kind:'task',text:'aujourd’hui',coins:2},'2026-09-24',2);
 assert.equal(j.date,'2026-09-24');assert.equal(j.entries.length,1);assert.equal(summary(j).coins,2);
});

test('le journal est plafonné et garde les plus récents',()=>{
 const j=createJournal(null,D);
 for(let i=0;i<MAX_ENTRIES+25;i++)record(j,{kind:'task',text:'t'+i},D,i);
 assert.equal(j.entries.length,MAX_ENTRIES);assert.equal(j.entries[0]!.text,'t25');
 assert.equal(createJournal(JSON.parse(JSON.stringify(j)),D).entries.length,MAX_ENTRIES);
});

test('timeLabel donne HH:MM local',()=>{
 assert.equal(timeLabel(new Date(2026,0,1,9,5).getTime()),'09:05');
});
