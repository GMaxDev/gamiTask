// Thin typed layer over socket.io-client: connection status and the join handshake, nothing else.
import {io,type Socket} from 'socket.io-client';
import type {ClientToServerEvents,ServerToClientEvents} from '@shared/types';
import type {Identity} from './identity.ts';

export type NetStatus='connecting'|'online'|'offline'|'replaced';
export interface NetSocket{connected:boolean;on(event:string,cb:(...args:any[])=>void):unknown;emit(event:string,...args:any[]):unknown;disconnect():unknown}
export interface Net{socket:Socket<ServerToClientEvents,ClientToServerEvents>;status():NetStatus;onStatus(cb:(s:NetStatus)=>void):void;setRoom(roomId:string):void;roomId():string}

export function createNet(identity:Identity,initialRoom:string,socket:NetSocket):Net{
  let status:NetStatus='connecting',room=initialRoom;const listeners:((s:NetStatus)=>void)[]=[];
  const set=(s:NetStatus)=>{status=s;listeners.forEach(cb=>cb(s));};
  socket.on('connect',()=>{
    if(status==='replaced')return;
    socket.emit('join',{name:identity.name,color:identity.color,col:0,row:0,userId:identity.userId,roomId:room});set('online');
  });
  socket.on('disconnect',()=>{if(status!=='replaced')set('offline');});
  socket.on('room:info',({roomId}:{roomId:string})=>{room=roomId;});
  socket.on('session:replaced',()=>{set('replaced');socket.disconnect();});
  return {socket:socket as unknown as Socket<ServerToClientEvents,ClientToServerEvents>,status:()=>status,onStatus(cb){listeners.push(cb);},setRoom(id){room=id;},roomId:()=>room};
}
export function connect(url:string,identity:Identity,roomId:string):Net{
  const socket:Socket<ServerToClientEvents,ClientToServerEvents>=io(url,{transports:['websocket'],reconnectionDelayMax:5000});
  return createNet(identity,roomId,socket as unknown as NetSocket);
}
