import test from 'node:test';
import assert from 'node:assert/strict';
import {exerciseProgress} from '../public/exercise-progress.js';
test('exercise navigation follows assigned order and reports current revision progress for only this child',()=>{
 const activities=[{id:'demo'},{id:'a',cloud:true,title:'Primero',revision:2},{id:'b',cloud:true,title:'Segundo',revision:1},{id:'c',cloud:true,title:'Tercero',revision:1}];
 const attempts=[{childId:'child',activityId:'a',activityRevision:1,score:10},{childId:'other',activityId:'a',activityRevision:2,score:10},{childId:'child',activityId:'b',activityRevision:1,score:0},{childId:'child',activityId:'c',activityRevision:1,score:10}];
 const state=exerciseProgress(activities,attempts,'child','b');
 assert.deepEqual(state.exercises.map(a=>a.status),['pending','practiced','achieved']);
 assert.equal(state.previousId,'a');assert.equal(state.nextId,'c');assert.equal(state.index,1);assert.equal(state.achieved,1);assert.equal(state.practiced,2);
 assert.equal(exerciseProgress(activities,attempts,'child','a').previousId,null);
 assert.equal(exerciseProgress(activities,attempts,'child','c').nextId,null);
 assert.equal(exerciseProgress([],attempts,'child','missing').exercises.length,0);
});
