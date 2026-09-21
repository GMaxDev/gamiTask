// What a character looks like. Pure: catalogue, validation, undo history. Rendering lives in avatar.ts.
import {PALETTE} from './identity.ts';
import type {Look} from '@shared/types';
export type {Look};// the server owns the shape now: it stores the look and broadcasts it
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
export const EYES:{id:string;label:string}[]=[{id:'round',label:'Ronds'},{id:'almond',label:'Amande'},{id:'wide',label:'Grands'},{id:'sleepy',label:'Endormis'},{id:'wink',label:'Clin d’œil'}];
export const BROWS:{id:string;label:string}[]=[{id:'straight',label:'Droits'},{id:'arched',label:'Arqués'},{id:'thick',label:'Épais'},{id:'thin',label:'Fins'}];
export const NOSES:{id:string;label:string}[]=[{id:'button',label:'Bouton'},{id:'straight',label:'Droit'},{id:'wide',label:'Large'},{id:'small',label:'Petit'}];
export const MOUTHS:{id:string;label:string}[]=[{id:'smile',label:'Sourire'},{id:'neutral',label:'Neutre'},{id:'grin',label:'Large sourire'},{id:'open',label:'Ouverte'},{id:'pout',label:'Moue'}];
export const BODIES:{id:Look['body'];label:string}[]=[{id:'slim',label:'Fin'},{id:'regular',label:'Régulier'},{id:'round',label:'Rond'}];
export const PATTERNS:{id:string;label:string}[]=[{id:'plain',label:'Uni'},{id:'stripes',label:'Rayures'},{id:'dots',label:'Pois'},{id:'collar',label:'Col'}];
export const SLEEVES:{id:Look['sleeves'];label:string}[]=[{id:'short',label:'Courtes'},{id:'long',label:'Longues'}];
export const BOTTOMS:{id:Look['bottom'];label:string}[]=[{id:'trousers',label:'Pantalon'},{id:'shorts',label:'Short'},{id:'skirt',label:'Jupe'}];
export const SHOES=[{id:'brown',label:'Brun',hex:'#905e3d'},{id:'black',label:'Noir',hex:'#2b2422'},{id:'white',label:'Blanc',hex:'#efe6d8'},{id:'terracotta',label:'Terracotta',hex:'#c9764f'}];
export const HAIR_SETS:{id:string;label:string;bangs:string;back:string;hairColor:string}[]=[
  {id:'carre-noir',label:'Carré noir',bangs:'straight',back:'bob',hairColor:'black'},
  {id:'nattes-rousses',label:'Nattes rousses',bangs:'side',back:'braids',hairColor:'ginger'},
  {id:'coupe-sauge',label:'Coupe sauge',bangs:'curtain',back:'short',hairColor:'sage'},
  {id:'queue-blonde',label:'Queue blonde',bangs:'straight',back:'ponytail',hairColor:'blond'},
  {id:'bouclee-chataine',label:'Bouclée châtaine',bangs:'curly',back:'bob',hairColor:'chestnut'},
  {id:'rideau-cendre',label:'Rideau cendré',bangs:'curtain',back:'ponytail',hairColor:'ash'},
  {id:'crane-rase',label:'Crâne rasé',bangs:'none',back:'none',hairColor:'black'},
  {id:'meche-blanche',label:'Mèche blanche',bangs:'side',back:'short',hairColor:'white'},
  {id:'nattes-brunes',label:'Nattes brunes',bangs:'none',back:'braids',hairColor:'brown'},
  {id:'bouclee-rousse',label:'Bouclée rousse',bangs:'curly',back:'braids',hairColor:'ginger'},
];
const pick=<T extends {id:string}>(list:T[],id:unknown,fallback:T):T=>list.find(e=>e.id===id)??fallback;
const slider=(v:unknown):number=>typeof v==='number'&&Number.isInteger(v)&&v>=-3&&v<=3?v:0;
export const skinHex=(id:string)=>pick(SKINS,id,SKINS[1]).hex;
export const hairHex=(id:string)=>pick(HAIR_COLORS,id,HAIR_COLORS[1]).hex;
export const trousersHex=(id:string)=>pick(TROUSERS,id,TROUSERS[0]).hex;
export const shoesHex=(id:string)=>pick(SHOES,id,SHOES[0]).hex;
export function defaultLook(shirt:number):Look{
  return {
    skin:'peach',head:'round',bangs:'straight',back:'short',hairColor:'brown',shirt,trousers:'cream',headphones:true,hat:null,
    eyes:'round',brows:'straight',nose:'button',mouth:'smile',
    eyesY:0,eyesGap:0,eyesSize:0,browsY:0,noseY:0,noseSize:0,mouthY:0,mouthSize:0,
    body:'regular',topPattern:'plain',sleeves:'short',bottom:'trousers',shoes:'brown',
  };
}
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
    eyes:pick(EYES,s.eyes,{id:d.eyes,label:''}).id,brows:pick(BROWS,s.brows,{id:d.brows,label:''}).id,
    nose:pick(NOSES,s.nose,{id:d.nose,label:''}).id,mouth:pick(MOUTHS,s.mouth,{id:d.mouth,label:''}).id,
    eyesY:slider(s.eyesY),eyesGap:slider(s.eyesGap),eyesSize:slider(s.eyesSize),browsY:slider(s.browsY),
    noseY:slider(s.noseY),noseSize:slider(s.noseSize),mouthY:slider(s.mouthY),mouthSize:slider(s.mouthSize),
    body:pick(BODIES,s.body,{id:d.body,label:''}).id,topPattern:pick(PATTERNS,s.topPattern,{id:d.topPattern,label:''}).id,
    sleeves:pick(SLEEVES,s.sleeves,{id:d.sleeves,label:''}).id,bottom:pick(BOTTOMS,s.bottom,{id:d.bottom,label:''}).id,
    shoes:pick(SHOES,s.shoes,{id:d.shoes,label:'',hex:''}).id,
  };
}
export function randomLook(shirtPalette:number[],rng:()=>number=Math.random):Look{
  const of=<T>(list:T[]):T=>list[Math.floor(rng()*list.length)%list.length];
  const sl=():number=>Math.floor(rng()*5)-2;// -2..2
  return {
    skin:of(SKINS).id,head:of(HEADS).id,bangs:of(BANGS).id,back:of(BACKS).id,hairColor:of(HAIR_COLORS).id,
    shirt:of(shirtPalette),trousers:of(TROUSERS).id,headphones:rng()<0.5,hat:null,
    eyes:of(EYES).id,brows:of(BROWS).id,nose:of(NOSES).id,mouth:of(MOUTHS).id,
    eyesY:sl(),eyesGap:sl(),eyesSize:sl(),browsY:sl(),noseY:sl(),noseSize:sl(),mouthY:sl(),mouthSize:sl(),
    body:of(BODIES).id,topPattern:of(PATTERNS).id,sleeves:of(SLEEVES).id,bottom:of(BOTTOMS).id,shoes:of(SHOES).id,
  };
}
export const withChange=(look:Look,patch:Partial<Look>):Look=>({...look,...patch});
export const equalLook=(a:Look,b:Look)=>(Object.keys(a) as (keyof Look)[]).every(k=>a[k]===b[k]);
export interface History<T=Look>{current():T;push(look:T):void;undo():T|null;canUndo():boolean;reset():T}
const LIMIT=50;
export function createHistory<T=Look>(initial:T):History<T>{
  let now=initial;const past:T[]=[];
  return {current:()=>now,push(look){past.push(now);if(past.length>LIMIT)past.shift();now=look;},undo(){const p=past.pop();if(!p)return null;now=p;return now;},canUndo:()=>past.length>0,reset(){past.length=0;now=initial;return now;}};
}
