// Pure mapping between Three.js world units (room centred on 0,0) and the server's integer grid.
export type RoomKind='cafe'|'garden'|'private';
export const DIMS:Record<RoomKind,{w:number;d:number}>={cafe:{w:24,d:20},garden:{w:24,d:20},private:{w:12,d:10}};
export interface Cell{col:number;row:number}
const clamp=(v:number,max:number)=>Math.min(max,Math.max(0,v));
export function toCell(x:number,z:number,room:RoomKind):Cell{
  const {w,d}=DIMS[room];
  return {col:clamp(Math.floor(x+w/2),w-1),row:clamp(Math.floor(z+d/2),d-1)};
}
export function toWorld(col:number,row:number,room:RoomKind):{x:number;z:number}{
  const {w,d}=DIMS[room];
  return {x:-w/2+col+.5,z:-d/2+row+.5};
}
