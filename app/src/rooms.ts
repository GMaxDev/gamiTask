// Pure decision for the « Chez moi » flow, fed by the server's rooms:list.
import type {RoomSummary} from '@shared/types';
import type {RoomKind} from './coords.ts';
export type HomeDecision='switch'|'create'|'wait';
export const myPrivateRoom=(rooms:RoomSummary[],userId:string):RoomSummary|null=>rooms.find(r=>r.isPrivate&&r.ownerId===userId)??null;
// asked: a room:create-private is already in flight. Never abandons here — the caller's timeout does.
export function homeDecision(rooms:RoomSummary[],userId:string,asked:boolean):HomeDecision{
  if(myPrivateRoom(rooms,userId))return 'switch';
  return asked?'wait':'create';
}
// The two public rooms the server knows. Anything else is a private room: mine, or someone's I do not belong in.
export const PUBLIC_IDS={cafe:'ocean',garden:'forest'} as const;
export function kindOfRoomId(id:string,rooms:RoomSummary[],userId:string):RoomKind{
  if(id===PUBLIC_IDS.garden)return 'garden';
  if(id===PUBLIC_IDS.cafe)return 'cafe';
  return myPrivateRoom(rooms,userId)?.id===id?'private':'cafe';
}
