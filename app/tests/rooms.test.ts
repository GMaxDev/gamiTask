import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {RoomSummary} from '@shared/types';
import {homeDecision,kindOfRoomId,myPrivateRoom} from '../src/rooms.ts';

const room=(id:string,isPrivate:boolean,ownerId:string|null)=>({id,isPrivate,ownerId} as unknown as RoomSummary);
const ocean=room('ocean',false,null),forest=room('forest',false,null),mine=room('r1',true,'me'),hers=room('r2',true,'her');

test('my private room is found by owner, and only mine',()=>{
 assert.equal(myPrivateRoom([ocean,hers,mine],'me'),mine);
 assert.equal(myPrivateRoom([ocean,hers],'me'),null);
 assert.equal(myPrivateRoom([],'me'),null);
});
test('my room present: switch, whether or not a creation was asked',()=>{
 assert.equal(homeDecision([ocean,mine],'me',false),'switch');
 assert.equal(homeDecision([ocean,mine],'me',true),'switch');
});
test('no room of mine and nothing asked yet: create',()=>{
 assert.equal(homeDecision([ocean,hers],'me',false),'create');
});
test('creation in flight: wait — an unrelated rooms:list must not abandon',()=>{
 assert.equal(homeDecision([ocean,hers],'me',true),'wait');
});

test('room ids map to room kinds: any private room renders as private, owned or visited',()=>{
 const all=[ocean,forest,hers,mine];
 assert.equal(kindOfRoomId('ocean',all,'me'),'cafe');
 assert.equal(kindOfRoomId('forest',all,'me'),'garden');
 assert.equal(kindOfRoomId('r1',all,'me'),'private');
 assert.equal(kindOfRoomId('r2',all,'me'),'private');// someone else's room, visited via an invite link: still renders as a private room
 assert.equal(kindOfRoomId('sunset',all,'me'),'cafe');// an unknown room falls back to the café
});
