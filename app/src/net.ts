// Thin typed layer over socket.io-client: connection status and the join handshake, nothing else.
import {io,type Socket} from 'socket.io-client';
import type {ClientToServerEvents,ServerToClientEvents} from '@shared/types';
import type {Identity} from './identity.ts';

export type NetStatus='connecting'|'online'|'offline'|'replaced';
export type NetSocket=Socket<ServerToClientEvents,ClientToServerEvents>;
export interface Net{socket:NetSocket;status():NetStatus;onStatus(cb:(s:NetStatus)=>void):void;roomId():string}

export function createNet(identity:Identity,initialRoom:string,socket:NetSocket):Net{
  let status:NetStatus='connecting',room=initialRoom;const listeners:((s:NetStatus)=>void)[]=[];
  const set=(s:NetStatus)=>{status=s;listeners.forEach(cb=>cb(s));};
  socket.on('connect',()=>{
    if(status==='replaced')return;
    socket.emit('join',{name:identity.name,color:identity.color,userId:identity.userId,roomId:room,tzOffsetMinutes:new Date().getTimezoneOffset(),...(identity.token?{token:identity.token}:{})});set('online');
  });
  socket.on('disconnect',()=>{if(status!=='replaced')set('offline');});
  socket.on('room:info',({roomId}:{roomId:string})=>{room=roomId;});
  socket.on('session:replaced',()=>{set('replaced');socket.disconnect();});
  return {socket,status:()=>status,onStatus(cb){listeners.push(cb);},roomId:()=>room};
}
export function connect(url:string,identity:Identity,roomId:string):Net{
  return createNet(identity,roomId,io(url,{transports:['websocket'],reconnectionDelayMax:5000}));
}
