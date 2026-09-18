// What a character looks like. Pure: catalogue, validation, undo history. Rendering lives in avatar.ts.
import {PALETTE} from './identity.ts';
export interface Look{skin:string;head:'round'|'oval'|'square';bangs:string;back:string;hairColor:string;shirt:number;trousers:string;headphones:boolean;hat:string|null}
export const SKINS=[
  {id:'porcelain',label:'Porcelaine',hex:'#f7dcc4'},{id:'peach',label:'Pêche',hex:'#edc39d'},{id:'honey',label:'Miel',hex:'#d9a982'},
  {id:'caramel',label:'Caramel',hex:'#b8845c'},{id:'cocoa',label:'Cacao',hex:'#8a5a3c'},{id:'ebony',label:'Ébène',hex:'#5a3a28'},
];
export const HEADS:{id:Look['head'];label:string}[]=[{id:'round',label:'Ronde'},{id:'oval',label:'Ovale'},{id:'square',label:'Carrée'}];
export const BANGS=[{id:'none',label:'Sans'},{id:'straight',label:'Droite'},{id:'curtain',label:'Rideau'},{id:'side',label:'Mèche'},{id:'curly',label:'Bouclée'}];
export const BACKS=[{id:'none',label:'Sans'},{id:'short',label:'Court'},{id:'bob',label:'Carré'},{id:'ponytail',label:'Queue'},{id:'braids',label:'Nattes'}];
export const HAIR_COLORS=[
  {id:'black',label:'Noir',hex:'#2b2422'},{id:'brown',label:'Brun',hex:'#634535'},{id:'chestnut',label:'Châtain',hex:'#8a6242'},{id:'ginger',label:'Roux',hex:'#b8552e'},
  {id:'blond',label:'Blond',hex:'#d9b56a'},{id:'ash',label:'Cendré',hex:'#9a948a'},{id:'white',label:'Blanc',hex:'#efe6d8'},{id:'sage',label:'Sauge',hex:'#819478'},
];
export const TROUSERS=[{id:'cream',label:'Crème',hex:'#f4e4c9'},{id:'sand',label:'Sable',hex:'#d8b27a'},{id:'olive',label:'Olive',hex:'#7a8e4a'},{id:'slate',label:'Ardoise',hex:'#5b6570'}];
const pick=<T extends {id:string}>(list:T[],id:unknown,fallback:T):T=>list.find(e=>e.id===id)??fallback;
export const skinHex=(id:string)=>pick(SKINS,id,SKINS[1]).hex;
export const hairHex=(id:string)=>pick(HAIR_COLORS,id,HAIR_COLORS[1]).hex;
export const trousersHex=(id:string)=>pick(TROUSERS,id,TROUSERS[0]).hex;
export function defaultLook(shirt:number):Look{return {skin:'peach',head:'round',bangs:'straight',back:'short',hairColor:'brown',shirt,trousers:'cream',headphones:true,hat:null};}
export function loadLook(saved:unknown,shirt:number,ownedHats:string[]):Look{
  const d=defaultLook(shirt),s=(saved&&typeof saved==='object'?saved:{}) as Record<string,unknown>;
  return {
    skin:pick(SKINS,s.skin,{id:d.skin,label:'',hex:''}).id,head:pick(HEADS,s.head,{id:d.head,label:''}).id,
    bangs:pick(BANGS,s.bangs,{id:d.bangs,label:''}).id,back:pick(BACKS,s.back,{id:d.back,label:''}).id,
    hairColor:pick(HAIR_COLORS,s.hairColor,{id:d.hairColor,label:'',hex:''}).id,
    shirt:PALETTE.some(p=>p.hex===s.shirt)?s.shirt as number:shirt,
    trousers:pick(TROUSERS,s.trousers,{id:d.trousers,label:'',hex:''}).id,
    headphones:typeof s.headphones==='boolean'?s.headphones:d.headphones,
    hat:typeof s.hat==='string'&&ownedHats.includes(s.hat)?s.hat:null,
  };
}
export const withChange=(look:Look,patch:Partial<Look>):Look=>({...look,...patch});
export const equalLook=(a:Look,b:Look)=>(Object.keys(a) as (keyof Look)[]).every(k=>a[k]===b[k]);
export interface History{current():Look;push(look:Look):void;undo():Look|null;canUndo():boolean;reset():Look}
const LIMIT=50;
export function createHistory(initial:Look):History{
  let now=initial;const past:Look[]=[];
  return {current:()=>now,push(look){past.push(now);if(past.length>LIMIT)past.shift();now=look;},undo(){const p=past.pop();if(!p)return null;now=p;return now;},canUndo:()=>past.length>0,reset(){past.length=0;now=initial;return now;}};
}
