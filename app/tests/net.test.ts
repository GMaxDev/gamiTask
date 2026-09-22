import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNet} from '../src/net.ts';

function fakeSocket(){
  const handlers=new Map<string,((...a:any[])=>void)[]>(),sent:[string,unknown][]=[];
  const s={connected:false,disconnected:0,sent,
    on(e:string,cb:(...a:any[])=>void){handlers.set(e,[...(handlers.get(e)??[]),cb]);return s;},
    emit(e:string,...a:unknown[]){sent.push([e,a[0]]);return s;},
    disconnect(){s.connected=false;s.disconnected++;return s;},
    fire(e:string,...a:unknown[]){if(e==='connect')s.connected=true;if(e==='disconnect')s.connected=false;for(const cb of handlers.get(e)??[])cb(...a);}};
  return s;
}
const me={userId:'u1',name:'Max',color:0x819478,token:null};

test('joins on connect and again on every reconnect, with the current room',()=>{
  const s=fakeSocket(),net=createNet(me,'ocean',s);const seen:string[]=[];net.onStatus(x=>seen.push(x));
  assert.equal(net.status(),'connecting');
  s.fire('connect');assert.deepEqual(s.sent[0],['join',{name:'Max',color:0x819478,col:0,row:0,userId:'u1',roomId:'ocean',tzOffsetMinutes:new Date().getTimezoneOffset()}]);assert.equal(net.status(),'online');
  s.fire('room:info',{roomId:'room-42'});assert.equal(net.roomId(),'room-42');
  s.fire('disconnect');assert.equal(net.status(),'offline');
  s.fire('connect');assert.deepEqual(s.sent[1][1],{...s.sent[0][1] as object,roomId:'room-42'});
  assert.deepEqual(seen,['online','offline','online']);
});
test('a replaced session disconnects for good',()=>{
  const s=fakeSocket(),net=createNet(me,'ocean',s);s.fire('connect');
  s.fire('session:replaced');assert.equal(net.status(),'replaced');assert.equal(s.disconnected,1);
  s.fire('connect');assert.equal(s.sent.length,1);assert.equal(net.status(),'replaced');
});
test('setRoom changes what the next join asks for',()=>{
  const s=fakeSocket(),net=createNet(me,'ocean',s);net.setRoom('forest');s.fire('connect');
  assert.equal((s.sent[0][1] as {roomId:string}).roomId,'forest');
});
test('a signed-in identity joins with its token',()=>{
  const s=fakeSocket(),net=createNet({...me,token:'jwt.here'},'ocean',s);s.fire('connect');
  assert.equal((s.sent[0][1] as {token?:string}).token,'jwt.here');
});
