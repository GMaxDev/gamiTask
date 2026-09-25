// Pure shop model: catalogue, purchases, the hat you wear and the furniture placed in your own room.
import type {CatalogItem} from '@shared/catalog';
import {SHOP_ITEMS,FURNITURE_ITEMS,FURNITURE_SETS,type ShopItem} from '@shared/types';
export interface CatalogueItem extends ShopItem { setId?: string; custom?: CatalogItem }
export const HATS: CatalogueItem[]=[...SHOP_ITEMS];
export const FURNITURE: CatalogueItem[]=[...FURNITURE_ITEMS];
export const SETS=FURNITURE_SETS;
// Editor-made items are spliced into the built-in lists, so every consumer sees one catalogue. An item under a
// built-in id (shop piece or room decor) is an override: the code's metadata stays, only its recipe is read.
const BUILT_IN={hats:HATS.length,furniture:FURNITURE.length},BUILT_IN_IDS=new Set([...HATS,...FURNITURE].map(i=>i.id));
let CATALOG=new Map<string,CatalogItem>(),originals=false;
export const isBuiltIn=(id: string)=>BUILT_IN_IDS.has(id);
export function setCatalog(items: CatalogItem[]): void{
  CATALOG=new Map(items.map(c=>[c.id,c]));HATS.length=BUILT_IN.hats;FURNITURE.length=BUILT_IN.furniture;
  for(const c of items)if(!isBuiltIn(c.id)&&c.kind!=='decor')(c.kind==='hat'?HATS:FURNITURE).push({id:c.id,name:c.name,price:c.price,emoji:c.emoji,custom:c});
}
export const custom=(id: string): CatalogItem|null=>originals?null:CATALOG.get(id)??null;
// Builds inside run with overrides switched off: how the workshop captures a coded piece as it was written.
export function withOriginals<T>(f: ()=>T): T{originals=true;try{return f();}finally{originals=false;}}
export const GRID={cols:12,rows:10};// your room, one cell per floor tile
export const footprint=(id: string)=>{const c=isBuiltIn(id)?null:custom(id);return c?{w:c.w,d:c.d}:{w:1,d:id==='bookshelf'?2:1};};
export interface Placed{c:number;r:number}
export type Cell=Placed;
export const cellsOf=(id: string,{c,r}: Placed): string[]=>{const f=footprint(id),cells: string[]=[];for(let i=0;i<f.w;i++)for(let j=0;j<f.d;j++)cells.push(`${c+i},${r+j}`);return cells;};
export const item=(id: unknown): CatalogueItem|null=>HATS.find(i=>i.id===id)??FURNITURE.find(i=>i.id===id)??null;
export interface ShopState{hats:string[];hat:string|null;furniture:string[];placed:Record<string,Placed>}
export const toServerCell=(cell:Placed)=>({col:cell.c,row:cell.r});
const isHat=(id:string)=>HATS.some(h=>h.id===id),isFurniture=(id:string)=>FURNITURE.some(f=>f.id===id);
const validCell=(id:string,cell:Placed)=>{const f=footprint(id);return Number.isInteger(cell.c)&&Number.isInteger(cell.r)&&cell.c>=0&&cell.r>=0&&cell.c+f.w<=GRID.cols&&cell.r+f.d<=GRID.rows;};
export function createShop():ShopState{return {hats:[],hat:null,furniture:[],placed:{}};}
export function setCosmetics(s:ShopState,u:{owned:string[];equippedHat:string|null}):void{
  s.hats=u.owned.filter(isHat);s.hat=u.equippedHat&&s.hats.includes(u.equippedHat)?u.equippedHat:null;
}
// The server's placed list may hold pieces with a default spot that does not fit this room; those stay stored until placed by hand.
export function setFurniture(s:ShopState,u:{owned:string[];placed:string[];positions:Record<string,{col:number;row:number}>}):void{
  s.furniture=u.owned.filter(isFurniture);s.placed={};const used=new Set<string>();
  for(const id of u.placed){
    const pos=u.positions[id];if(!s.furniture.includes(id)||!pos)continue;const cell={c:pos.col,r:pos.row};
    if(!validCell(id,cell))continue;const cells=cellsOf(id,cell);if(cells.some(k=>used.has(k)))continue;
    s.placed[id]=cell;cells.forEach(k=>used.add(k));
  }
}
export function takenCells(s:ShopState,except:string|null=null):Set<string>{const t=new Set<string>();for(const [id,cell] of Object.entries(s.placed))if(id!==except)cellsOf(id,cell).forEach(k=>t.add(k));return t;}
export function canPlace(s:ShopState,id:string,cell:Placed):boolean{
  if(!s.furniture.includes(id)||!isFurniture(id)||!validCell(id,cell))return false;
  const taken=takenCells(s,id);return !cellsOf(id,cell).some(k=>taken.has(k));
}
export const completeSets=(s:ShopState)=>SETS.filter(set=>set.items.every(id=>s.furniture.includes(id)));
