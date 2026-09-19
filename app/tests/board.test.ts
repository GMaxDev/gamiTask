import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rankOf,top,delta} from '../src/board.ts';
import type {Entry} from '../src/board.ts';

const e=(id: string,coins: number): Entry=>({id,name:id.toUpperCase(),color:0x647557,coins,state:'idle'});
const BOARD=[e('a',120),e('b',90),e('c',70),e('d',50),e('e',30),e('f',10),e('me',5)];

test('rankOf is 1-based and null for someone who left the room',()=>{
 assert.equal(rankOf(BOARD,'a'),1);
 assert.equal(rankOf(BOARD,'c'),3);
 assert.equal(rankOf(BOARD,'me'),7);
 assert.equal(rankOf(BOARD,'nobody'),null);
 assert.equal(rankOf([],'a'),null);
});

test('top keeps the head of the board when I am already in it',()=>{
 const rows=top(BOARD,5,'c');
 assert.deepEqual(rows.map(r=>r.id),['a','b','c','d','e']);
});

test('top swaps the last row for mine when I am out of it',()=>{
 const rows=top(BOARD,5,'me');
 assert.deepEqual(rows.map(r=>r.id),['a','b','c','d','me']);
});

test('top returns everyone when the room is smaller than n, unchanged',()=>{
 const small=BOARD.slice(0,3);
 assert.deepEqual(top(small,5,'c').map(r=>r.id),['a','b','c']);
 assert.deepEqual(top(small,5,'nobody').map(r=>r.id),['a','b','c']);// an unknown me never eats a row
 assert.deepEqual(top([],5,'me'),[]);
});

test('delta reports only a real move of my own rank',()=>{
 const before=[e('a',120),e('me',90)],after=[e('me',130),e('a',120)];
 assert.equal(delta(before,after,'me'),'up');
 assert.equal(delta(after,before,'me'),'down');
 assert.equal(delta(before,before,'me'),null);
 assert.equal(delta(null,after,'me'),null);// the first board is never a promotion
 assert.equal(delta(before,after,'ghost'),null);// unknown on both sides
 assert.equal(delta(before,[e('a',120)],'me'),null);// I just left: no rank to compare
});
