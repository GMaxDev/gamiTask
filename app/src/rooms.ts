// Pure decision for the « Chez moi » flow, fed by the server's rooms:list.
import type {RoomSummary} from '@shared/types';
export type HomeDecision='switch'|'create'|'wait';
export const myPrivateRoom=(rooms:RoomSummary[],userId:string):RoomSummary|null=>rooms.find(r=>r.isPrivate&&r.ownerId===userId)??null;
// asked: a room:create-private is already in flight. Never abandons here — the caller's timeout does.
export function homeDecision(rooms:RoomSummary[],userId:string,asked:boolean):HomeDecision{
  if(myPrivateRoom(rooms,userId))return 'switch';
  return asked?'wait':'create';
}
