// Pure shop model: catalogue, purchases, the hat you wear and the furniture placed in your own room.
export interface Cell { c: number; r: number }
export interface CatalogueItem { id: string; name: string; price: number; emoji: string; set?: string }
export interface SetDef { id: string; name: string; emoji: string; items: string[]; desc: string; xpPomo?: number; coinsPomo?: number; coinsTask?: number }
export interface ShopState { owned: string[]; hat: string|null; placed: Record<string, Cell> }
export interface Wallet { coins: number }
export const HATS: CatalogueItem[]=[
  {id:'hat-party',name:'Chapeau de fête',price:100,emoji:'🎉'},
  {id:'hat-halo',name:'Halo',price:150,emoji:'😇'},
  {id:'hat-crown',name:'Couronne',price:200,emoji:'👑'},
  {id:'hat-cowboy',name:'Cowboy',price:250,emoji:'🤠'},
  {id:'hat-wizard',name:'Sorcier',price:300,emoji:'🧙'},
];
export const FURNITURE: CatalogueItem[]=[
  {id:'plant',name:'Plante',price:80,emoji:'🪴',set:'jardin'},
  {id:'cactus',name:'Cactus',price:85,emoji:'🌵',set:'jardin'},
  {id:'lamp',name:'Lampe',price:120,emoji:'💡',set:'bureau'},
  {id:'bookshelf',name:'Étagère',price:150,emoji:'📚',set:'bureau'},
  {id:'coffee',name:'Coin café',price:100,emoji:'☕',set:'salon'},
  {id:'couch',name:'Fauteuil',price:200,emoji:'🛋️',set:'salon'},
];
export const SETS: SetDef[]=[
  {id:'bureau',name:'Bureau studieux',emoji:'📖',items:['lamp','bookshelf'],desc:'+20 XP par pomodoro',xpPomo:20},
  {id:'salon',name:'Salon cosy',emoji:'🫖',items:['coffee','couch'],desc:'+10 pièces par pomodoro',coinsPomo:10},
  {id:'jardin',name:'Jardin zen',emoji:'🌿',items:['plant','cactus'],desc:'+4 pièces par tâche',coinsTask:4},
];
export const GRID={cols:12,rows:10};// your room, one cell per floor tile
export const footprint=(id: string)=>({w:1,d:id==='bookshelf'?2:1});
export const cellsOf=(id: string,{c,r}: Cell): string[]=>{const f=footprint(id),cells: string[]=[];for(let i=0;i<f.w;i++)for(let j=0;j<f.d;j++)cells.push(`${c+i},${r+j}`);return cells;};
const validCell=(id: string, cell: Cell|null|undefined): boolean=>{const f=footprint(id);return Boolean(cell)&&Number.isInteger(cell!.c)&&Number.isInteger(cell!.r)&&cell!.c>=0&&cell!.r>=0&&cell!.c+f.w<=GRID.cols&&cell!.r+f.d<=GRID.rows;};
const CATALOGUE=[...HATS,...FURNITURE];
export const item=(id: unknown): CatalogueItem|null=>CATALOGUE.find(i=>i.id===id)??null;

export function createShop(saved: Partial<{owned: unknown[]; hat: unknown; placed: Record<string, Cell>}> = {}): ShopState {
  const owned=((Array.isArray(saved.owned)?saved.owned:[]) as string[]).filter(id=>item(id));
  const hat=owned.includes(saved.hat as string)&&HATS.some(h=>h.id===saved.hat)?saved.hat as string:null;
  const placed: Record<string, Cell>={};const used=new Set<string>();
  for(const [id,cell] of Object.entries(saved.placed??{})){
    if(!owned.includes(id)||!FURNITURE.some(f=>f.id===id)||!validCell(id,cell))continue;
    const cells=cellsOf(id,cell);if(cells.some(k=>used.has(k)))continue;
    placed[id]={c:cell.c,r:cell.r};cells.forEach(k=>used.add(k));
  }
  return {owned,hat,placed};
}
// Spends from `wallet.coins` (the progress object). Returns the item on success, null otherwise.
export function buy(shop: ShopState, wallet: Wallet, id: string): CatalogueItem|null{
  const it=item(id);if(!it||shop.owned.includes(id)||wallet.coins<it.price)return null;
  wallet.coins-=it.price;shop.owned.push(id);return it;
}
export function equipHat(shop: ShopState, id: string|null): boolean{if(id!==null&&!(shop.owned.includes(id)&&HATS.some(h=>h.id===id)))return false;shop.hat=id;return true;}
// Cells taken by every placed piece except `except` (the one being moved).
export function takenCells(shop: ShopState, except: string|null=null): Set<string>{const t=new Set<string>();for(const [id,cell] of Object.entries(shop.placed))if(id!==except)cellsOf(id,cell).forEach(k=>t.add(k));return t;}
export function place(shop: ShopState, id: string, cell: Cell): boolean{
  if(!shop.owned.includes(id)||!FURNITURE.some(f=>f.id===id)||!validCell(id,cell))return false;
  const taken=takenCells(shop,id);if(cellsOf(id,cell).some(k=>taken.has(k)))return false;
  shop.placed[id]={c:cell.c,r:cell.r};return true;
}
export function unplace(shop: ShopState, id: string): boolean{if(!(id in shop.placed))return false;delete shop.placed[id];return true;}
export const completeSets=(shop: ShopState): SetDef[]=>SETS.filter(s=>s.items.every(id=>shop.owned.includes(id)));
export function bonuses(shop: ShopState){const b={coinsTask:0,coinsPomo:0,xpPomo:0};for(const s of completeSets(shop)){b.coinsTask+=s.coinsTask??0;b.coinsPomo+=s.coinsPomo??0;b.xpPomo+=s.xpPomo??0;}return b;}
