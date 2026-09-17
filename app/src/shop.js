// Pure shop model: catalogue, purchases, the hat you wear and the furniture placed in your own room.
export const HATS=[
  {id:'hat-party',name:'Chapeau de fête',price:100,emoji:'🎉'},
  {id:'hat-halo',name:'Halo',price:150,emoji:'😇'},
  {id:'hat-crown',name:'Couronne',price:200,emoji:'👑'},
  {id:'hat-cowboy',name:'Cowboy',price:250,emoji:'🤠'},
  {id:'hat-wizard',name:'Sorcier',price:300,emoji:'🧙'},
];
export const FURNITURE=[
  {id:'plant',name:'Plante',price:80,emoji:'🪴',set:'jardin'},
  {id:'cactus',name:'Cactus',price:85,emoji:'🌵',set:'jardin'},
  {id:'lamp',name:'Lampe',price:120,emoji:'💡',set:'bureau'},
  {id:'bookshelf',name:'Étagère',price:150,emoji:'📚',set:'bureau'},
  {id:'coffee',name:'Coin café',price:100,emoji:'☕',set:'salon'},
  {id:'couch',name:'Fauteuil',price:200,emoji:'🛋️',set:'salon'},
];
export const SETS=[
  {id:'bureau',name:'Bureau studieux',emoji:'📖',items:['lamp','bookshelf'],desc:'+20 XP par pomodoro',xpPomo:20},
  {id:'salon',name:'Salon cosy',emoji:'🫖',items:['coffee','couch'],desc:'+10 pièces par pomodoro',coinsPomo:10},
  {id:'jardin',name:'Jardin zen',emoji:'🌿',items:['plant','cactus'],desc:'+4 pièces par tâche',coinsTask:4},
];
export const GRID={cols:12,rows:10};// your room, one cell per floor tile
export const footprint=id=>({w:1,d:id==='bookshelf'?2:1});
export const cellsOf=(id,{c,r})=>{const f=footprint(id),cells=[];for(let i=0;i<f.w;i++)for(let j=0;j<f.d;j++)cells.push(`${c+i},${r+j}`);return cells;};
const validCell=(id,cell)=>{const f=footprint(id);return cell&&Number.isInteger(cell.c)&&Number.isInteger(cell.r)&&cell.c>=0&&cell.r>=0&&cell.c+f.w<=GRID.cols&&cell.r+f.d<=GRID.rows;};
const CATALOGUE=[...HATS,...FURNITURE];
export const item=id=>CATALOGUE.find(i=>i.id===id)??null;

export function createShop(saved={}){
  const owned=(Array.isArray(saved.owned)?saved.owned:[]).filter(id=>item(id));
  const hat=owned.includes(saved.hat)&&HATS.some(h=>h.id===saved.hat)?saved.hat:null;
  const placed={};const used=new Set();
  for(const [id,cell] of Object.entries(saved.placed??{})){
    if(!owned.includes(id)||!FURNITURE.some(f=>f.id===id)||!validCell(id,cell))continue;
    const cells=cellsOf(id,cell);if(cells.some(k=>used.has(k)))continue;
    placed[id]={c:cell.c,r:cell.r};cells.forEach(k=>used.add(k));
  }
  return {owned,hat,placed};
}
// Spends from `wallet.coins` (the progress object). Returns the item on success, null otherwise.
export function buy(shop,wallet,id){
  const it=item(id);if(!it||shop.owned.includes(id)||wallet.coins<it.price)return null;
  wallet.coins-=it.price;shop.owned.push(id);return it;
}
export function equipHat(shop,id){if(id!==null&&!(shop.owned.includes(id)&&HATS.some(h=>h.id===id)))return false;shop.hat=id;return true;}
// Cells taken by every placed piece except `except` (the one being moved).
export function takenCells(shop,except=null){const t=new Set();for(const [id,cell] of Object.entries(shop.placed))if(id!==except)cellsOf(id,cell).forEach(k=>t.add(k));return t;}
export function place(shop,id,cell){
  if(!shop.owned.includes(id)||!FURNITURE.some(f=>f.id===id)||!validCell(id,cell))return false;
  const taken=takenCells(shop,id);if(cellsOf(id,cell).some(k=>taken.has(k)))return false;
  shop.placed[id]={c:cell.c,r:cell.r};return true;
}
export function unplace(shop,id){if(!(id in shop.placed))return false;delete shop.placed[id];return true;}
export const completeSets=shop=>SETS.filter(s=>s.items.every(id=>shop.owned.includes(id)));
export function bonuses(shop){const b={coinsTask:0,coinsPomo:0,xpPomo:0};for(const s of completeSets(shop)){b.coinsTask+=s.coinsTask??0;b.coinsPomo+=s.coinsPomo??0;b.xpPomo+=s.xpPomo??0;}return b;}
