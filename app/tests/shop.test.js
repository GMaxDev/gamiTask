import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createShop,buy,equipHat,place,unplace,takenCells,bonuses,GRID} from '../src/shop.js';
import {createProgress,completeTask,completePomodoro} from '../src/progress.js';

test('buying needs coins and cannot repeat',()=>{
 const shop=createShop(),wallet={coins:120};
 assert.equal(buy(shop,wallet,'hat-halo'),null);assert.equal(buy(shop,wallet,'plant').id,'plant');assert.equal(wallet.coins,40);
 assert.equal(buy(shop,wallet,'plant'),null);assert.equal(buy(shop,wallet,'nope'),null);
});
test('only an owned hat can be worn',()=>{
 const shop=createShop({owned:['hat-party','plant']});
 assert.equal(equipHat(shop,'plant'),false);assert.equal(equipHat(shop,'hat-crown'),false);assert.equal(equipHat(shop,'hat-party'),true);assert.equal(equipHat(shop,null),true);assert.equal(shop.hat,null);
});
test('furniture goes on free cells of your own room and can be moved',()=>{
 const shop=createShop({owned:['plant','lamp','bookshelf']});
 assert.equal(place(shop,'plant',{c:2,r:3}),true);assert.equal(place(shop,'lamp',{c:2,r:3}),false);assert.equal(place(shop,'lamp',{c:GRID.cols,r:0}),false);assert.equal(place(shop,'lamp',{c:5,r:5}),true);
 assert.equal(place(shop,'bookshelf',{c:0,r:GRID.rows-1}),false);assert.equal(place(shop,'bookshelf',{c:2,r:4}),true);assert.deepEqual([...takenCells(shop,'plant')].sort(),['2,4','2,5','5,5']);
 assert.equal(place(shop,'plant',{c:2,r:4}),false);assert.equal(place(shop,'plant',{c:0,r:0}),true);assert.deepEqual(shop.placed.plant,{c:0,r:0});
 assert.equal(unplace(shop,'plant'),true);assert.equal(unplace(shop,'plant'),false);
});
test('a complete set pays bonuses through progress',()=>{
 const shop=createShop({owned:['plant','cactus','lamp']});const b=bonuses(shop);
 assert.deepEqual(b,{coinsTask:4,coinsPomo:0,xpPomo:0});
 const p=createProgress();completeTask(p,b);assert.equal(p.coins,14);
 const r=completePomodoro(p,1000,{coinsTask:0,coinsPomo:10,xpPomo:20});assert.equal(r.coins,35);assert.equal(r.xp,70);
});
test('saved data is sanitised',()=>{
 const shop=createShop({owned:['plant','ghost','hat-halo','cactus'],hat:'hat-crown',placed:{plant:{c:1,r:1},lamp:{c:2,r:2},cactus:{c:1,r:1},couch:1}});
 assert.deepEqual(shop,{owned:['plant','hat-halo','cactus'],hat:null,placed:{plant:{c:1,r:1}}});
});
