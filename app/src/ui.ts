// The small things every screen module shares: DOM lookup, local storage, icons, the toast queue and the banner.
// Pure helpers over the document — no state of the café lives here.
import {createIcons,Coffee,Sun,Moon,Plus,Minus,LocateFixed,Volume2,VolumeX,Settings2,RotateCcw,Play,Pause,Check,MousePointer2,Move,Leaf,Headphones,X,HelpCircle,Clock3,ArrowUpRight,ListChecks,Repeat,Coins,Trophy,Flame,Home,ShoppingBag,MessageCircle,ChevronDown,Send,Users,Smile,LogOut,UserCog,Twitch,Link2,Unlink,UserX,Calendar,Bell,BellOff,Music2,SunMoon,LogIn} from 'lucide';
import {EDITOR_ICONS} from './editor.ts';
import {WORKSHOP_ICONS} from './workshop.ts';

const icons={...EDITOR_ICONS,...WORKSHOP_ICONS,Coffee,Sun,Moon,Plus,Minus,LocateFixed,Volume2,VolumeX,Settings2,RotateCcw,Play,Pause,Check,MousePointer2,Move,Leaf,Headphones,X,HelpCircle,Clock3,ArrowUpRight,ListChecks,Repeat,Coins,Trophy,Flame,Home,ShoppingBag,MessageCircle,ChevronDown,Send,Users,Smile,LogOut,UserCog,Twitch,Link2,Unlink,UserX,Calendar,Bell,BellOff,Music2,SunMoon,LogIn};
export const icon=(name: string,cls=''): string=>`<i data-lucide="${name}" class="${cls}" aria-hidden="true"></i>`;
// ponytail: `any` here saves typing every dataset/onclick/style access on raw DOM elements throughout the UI modules.
export const $=(s: string): any=>document.querySelector(s);
export function drawIcons(){createIcons({icons,attrs:{'stroke-width':1.65}});}
export function load(key: string,fallback: any): any{try{return JSON.parse(localStorage.getItem(key) as string)??fallback;}catch{return fallback;}}
export function save(key: string,value: any){try{localStorage.setItem(key,JSON.stringify(value));}catch{/* The experience also works without persistent browser storage. */}}
export const today=()=>new Date().toLocaleDateString('sv-SE');
// Texte utilisateur dans du HTML : toujours par ici.
export const esc=(v: string)=>v.replace(/[&<>"']/g,(c: string)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as Record<string,string>)[c]);

// Une file : tâche faite, série et succès arrivent ensemble, chacun a son tour. Plus court quand d'autres attendent.
const toasts: string[]=[];let toastBusy=false;
export function toast(message: string){toasts.push(message);if(!toastBusy)nextToast();}
function nextToast(){
  const m=toasts.shift();if(m===undefined){toastBusy=false;return;}
  toastBusy=true;$('#toast').textContent=m;$('#toast').classList.add('visible');
  setTimeout(()=>{$('#toast').classList.remove('visible');setTimeout(nextToast,260);},toasts.length?3200:4500);
}
// Le bilan du matin est l'info du jour : il reste jusqu'à ce qu'on le ferme, au lieu de filer en quatre secondes.
export function showRecap(title: string,text: string){$('#recap-title').textContent=title;$('#recap-text').textContent=text;$('#recap').hidden=false;}
