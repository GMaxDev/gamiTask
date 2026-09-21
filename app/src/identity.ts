// Who you are in the café. Stored locally until real accounts arrive; the server keys everything on userId.
export interface Identity{userId:string;name:string;color:number;token:string|null}
export const PALETTE=[
  {hex:0x819478,label:'Sauge'},{hex:0xc9764f,label:'Terracotta'},{hex:0x8aa6b8,label:'Ciel'},{hex:0xd2a754,label:'Miel'},
  {hex:0xa04050,label:'Grenat'},{hex:0x7a8e4a,label:'Olive'},{hex:0xb85530,label:'Brique'},{hex:0x384d43,label:'Forêt'},
];
export function cleanName(raw:unknown):string|null{
  if(typeof raw!=='string')return null;
  const name=raw.replace(/\s+/g,' ').trim().slice(0,20);
  return name.length>=2?name:null;
}
export function loadIdentity(saved:unknown,uuid:()=>string):{identity:Identity;fresh:boolean}{
  const s=(saved&&typeof saved==='object'?saved:{}) as Record<string,unknown>;
  const userId=typeof s.userId==='string'&&s.userId?s.userId:uuid();
  const name=cleanName(s.name)??'';
  const color=PALETTE.some(p=>p.hex===s.color)?s.color as number:PALETTE[0].hex;
  const token=typeof s.token==='string'&&s.token?s.token:null;
  return {identity:{userId,name,color,token},fresh:!name};
}
