// Pure model of the object workshop: the draft item and how it changes. Rendering and UI live in workshop.ts.
import type {CatalogItem,Part,PartKind} from '@shared/catalog';
import {HATS,FURNITURE} from './shop.ts';
import {C} from './primitives.ts';

const BASE={x:0,y:0,z:0,rx:0,ry:0,rz:0};
export function defaultPart(kind:PartKind):Part{
  if(kind==='box')return {...BASE,kind,y:.25,w:.5,h:.5,d:.5,r:.04,color:C.wood};
  if(kind==='cyl')return {...BASE,kind,y:.25,rt:.2,rb:.2,h:.5,n:16,color:C.terra};
  return {...BASE,kind,y:.25,r:.25,sx:1,sy:1,sz:1,color:C.sage};
}
export const newItem=():CatalogItem=>({id:'',kind:'furniture',name:'',emoji:'📦',price:50,w:1,d:1,parts:[defaultPart('box')],anchors:[]});
export const addPart=(it:CatalogItem,kind:PartKind):CatalogItem=>({...it,parts:[...it.parts,defaultPart(kind)]});
// Built-in ids are reserved: the server refuses them, so the slug steps past them like any taken id.
export function slugId(name:string,taken:string[]):string{
  const base=name.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,32)||'objet';
  const used=new Set([...taken,...HATS.map(h=>h.id),...FURNITURE.map(f=>f.id)]);
  let id=base;for(let n=2;used.has(id);n++)id=`${base}-${n}`;return id;
}
export const duplicate=(it:CatalogItem,taken:string[]):CatalogItem=>{const name=`${it.name} (copie)`;return {...structuredClone(it),id:slugId(name,taken),name};};
