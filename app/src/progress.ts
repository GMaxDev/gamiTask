// Progression state fed by the server: coins, XP, streak and achievements. Rules live server-side.
import {ACHIEVEMENTS} from '@shared/types';
import {levelOf,xpForLevel} from '@shared/scoring';
export interface Progress{coins:number;xp:number;level:number;xpToNext:number;streak:number;achievements:string[];energy:number;exhausted:boolean}
const KEYS=new Set(ACHIEVEMENTS.map(a=>a.key));
export function createProgress():Progress{return {coins:0,xp:0,level:0,xpToNext:50,streak:0,achievements:[],energy:50,exhausted:false};}
export function setEnergy(p:Progress,energy:number):void{p.energy=Math.max(0,Math.min(50,Math.round(energy)));}
export function setExhausted(p:Progress,flag:boolean):void{p.exhausted=flag;}
export function setCoins(p:Progress,coins:number):void{p.coins=Math.max(0,Math.floor(coins));}
export function setXp(p:Progress,u:{xp:number;level:number;xpToNext:number}):void{p.xp=u.xp;p.level=u.level;p.xpToNext=u.xpToNext;}
export function setStreak(p:Progress,streak:number):void{p.streak=Math.max(0,streak);}
export function unlock(p:Progress,key:string):boolean{if(!KEYS.has(key)||p.achievements.includes(key))return false;p.achievements.push(key);return true;}
export function setAchievements(p:Progress,keys:string[]):void{p.achievements=keys.filter(k=>KEYS.has(k));}
export function levelInfo(p:{xp:number}){const level=levelOf(p.xp),floor=xpForLevel(level),next=xpForLevel(level+1);return {level,into:p.xp-floor,span:next-floor,next};}
