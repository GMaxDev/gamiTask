// La courbe du jour, en heure locale : 0 = plein jour, 1 = nuit noire.
// Aube 6 h → 9 h, plein jour jusqu'à 17 h, crépuscule 17 h → 20 h, nuit ensuite.
// ponytail: heures fixes, pas de calcul solaire ni de géolocalisation — à revoir si l'écart hiver/été dérange.
export const DAWN=6,FULL=9,DUSK=17,NIGHT=20;
const smooth=(t: number)=>t*t*(3-2*t);// des transitions qui démarrent et s'achèvent en douceur

export function nightness(now: Date=new Date()): number{
  const h=now.getHours()+now.getMinutes()/60;
  if(h<=DAWN||h>=NIGHT)return 1;
  if(h<FULL)return 1-smooth((h-DAWN)/(FULL-DAWN));
  if(h<=DUSK)return 0;
  return smooth((h-DUSK)/(NIGHT-DUSK));
}

export const clockLabel=(now: Date=new Date()): string=>
  `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

export function momentLabel(now: Date=new Date()): string{
  const n=nightness(now);
  if(n===0)return 'plein jour';
  if(n===1)return 'nuit';
  return now.getHours()<FULL?'aube':'crépuscule';
}
