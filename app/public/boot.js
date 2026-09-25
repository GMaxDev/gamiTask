// Déjà connecté (compte ou invité) : direct au café, pas de passage par la landing.
// Fichier séparé plutôt qu'inline : la CSP n'autorise que les scripts servis par le site.
try{if(JSON.parse(localStorage.getItem('gamitask.token')||'null')||JSON.parse(localStorage.getItem('gamitask.guest')||'null'))location.replace('/app/');}catch(e){}
