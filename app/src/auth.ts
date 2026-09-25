// Google sign-in: ties identity.userId to a stable account instead of a per-browser uuid, so the look/tasks/coins follow the person across devices.
export interface AuthUser{userId:string;token:string;name:string;color:number;isAdmin:boolean;isGoogleUser:boolean;twitchLogin:string|null;twitchDisplayName:string|null}

async function post(apiUrl:string,path:string,body:unknown):Promise<AuthUser|null>{
  try{
    const res=await fetch(`${apiUrl}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return res.ok?await res.json():null;
  }catch{return null;}
}
export const verifyToken=(apiUrl:string,token:string)=>post(apiUrl,'/auth/token',{token});
export const loginWithGoogle=(apiUrl:string,credential:string)=>post(apiUrl,'/auth/google',{credential});

// Twitch account link: a full-page redirect (Twitch requires a real navigation, not a fetch), so the server
// only hands back the authorize URL here — the caller does `location.href = url` to leave the SPA.
// Resolves to the authorize URL, or to the HTTP status that refused it (0 when the server was unreachable), so the caller can say why.
export async function startTwitchLink(apiUrl:string,token:string):Promise<{url:string}|{status:number}>{
  try{
    const res=await fetch(`${apiUrl}/auth/twitch/start`,{headers:{Authorization:`Bearer ${token}`},credentials:'include'});// the server sets a cookie the callback must see
    if(!res.ok)return {status:res.status};
    return {url:(await res.json()).url as string};
  }catch{return {status:0};}
}
export async function unlinkTwitch(apiUrl:string,token:string):Promise<boolean>{
  try{
    const res=await fetch(`${apiUrl}/auth/twitch/unlink`,{method:'POST',headers:{Authorization:`Bearer ${token}`}});
    return res.ok;
  }catch{return false;}
}

export interface Chatter{id:string;login:string;name:string}
// Real chat roster of the caller's own linked channel — Twitch refuses this for any channel that isn't yours.
export async function getMyChatters(apiUrl:string,token:string):Promise<Chatter[]|null>{
  try{
    const res=await fetch(`${apiUrl}/twitch/chatters`,{headers:{Authorization:`Bearer ${token}`}});
    if(!res.ok)return null;
    return (await res.json()).chatters as Chatter[];
  }catch{return null;}
}

let gsi: Promise<void>|null=null;
function loadGsi():Promise<void>{
  return gsi??=new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;
    s.onload=()=>resolve();s.onerror=()=>reject(new Error('gsi'));
    document.head.appendChild(s);
  });
}
export async function renderGoogleButton(clientId:string,container:HTMLElement,onCredential:(credential:string)=>void):Promise<void>{
  await loadGsi();
  const google=(window as any).google;
  google.accounts.id.initialize({client_id:clientId,callback:(r:{credential:string})=>onCredential(r.credential)});
  google.accounts.id.renderButton(container,{theme:'outline',size:'large',shape:'pill',width:280,text:'continue_with',locale:'fr'});
}
