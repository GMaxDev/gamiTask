// La grille d'un tableau de liège : combien de cartes tiennent sur un panneau donné, et où.
// Pur et sans Three.js — c'est la seule arithmétique de la fonctionnalité, elle se teste seule.
export const ASPECT=.84/.58;// largeur / hauteur d'une carte, celle du ticket d'origine
export const GAP=.07;

export interface Layout{cols: number; rows: number; cardW: number; cardH: number; shown: number; hidden: number}

const fit=(span: number,count: number,gap: number)=>(span-gap*(count+1))/count;

// `minCard` est le plancher de lisibilité : en dessous, on arrête d'ajouter des cartes
// au lieu de les rétrécir encore, et le surplus est renvoyé dans `hidden`.
export function layout(n: number,boardW: number,boardH: number,minCard: number,gap=GAP): Layout{
  const empty={cols:0,rows:0,cardW:0,cardH:0,shown:0,hidden:Math.max(0,n)};
  if(n<=0)return {...empty,hidden:0};
  let best={cols:1,rows:n,cardW:0};
  for(let cols=1;cols<=n;cols++){
    const rows=Math.ceil(n/cols),w=Math.min(fit(boardW,cols,gap),fit(boardH,rows,gap)*ASPECT);
    if(w>best.cardW)best={cols,rows,cardW:w};
  }
  if(best.cardW>=minCard)return {cols:best.cols,rows:best.rows,cardW:best.cardW,cardH:best.cardW/ASPECT,shown:n,hidden:0};
  // Trop de cartes pour le plancher : on garde la taille minimale et on remplit ce que le panneau porte.
  const cardH=minCard/ASPECT;
  const cols=Math.floor((boardW-gap)/(minCard+gap)),rows=Math.floor((boardH-gap)/(cardH+gap));
  if(cols<1||rows<1)return empty;
  const shown=Math.min(n,cols*rows);
  return {cols,rows:Math.ceil(shown/cols),cardW:minCard,cardH,shown,hidden:n-shown};
}

// Le centre de la i-ème carte, dans le repère du panneau (0,0 = son centre).
export function slot(i: number,l: Layout,gap=GAP): {x: number; y: number}{
  const col=i%l.cols,row=Math.floor(i/l.cols);
  const gridW=l.cols*l.cardW+(l.cols-1)*gap,gridH=l.rows*l.cardH+(l.rows-1)*gap;
  return {x:-(gridW-l.cardW)/2+col*(l.cardW+gap),y:(gridH-l.cardH)/2-row*(l.cardH+gap)};
}
