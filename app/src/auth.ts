// Google sign-in: ties identity.userId to a stable account instead of a per-browser uuid, so the look/tasks/coins follow the person across devices.
export interface AuthUser{userId:string;token:string;name:string;color:number;isAdmin:boolean;isGoogleUser:boolean}

async function post(apiUrl:string,path:string,body:unknown):Promise<AuthUser|null>{
  try{
    const res=await fetch(`${apiUrl}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return res.ok?await res.json():null;
  }catch{return null;}
}
export const verifyToken=(apiUrl:string,token:string)=>post(apiUrl,'/auth/token',{token});
export const loginWithGoogle=(apiUrl:string,credential:string)=>post(apiUrl,'/auth/google',{credential});

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
