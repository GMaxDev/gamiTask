// Pure navigation module: shared by the renderer and the Node test suite.
export interface Obstacle { x: number; z: number; w: number; d: number }
export interface Point { x: number; z: number }
export function createNavigator(obstacles: Obstacle[], step = 0.25, bounds: Partial<{minX: number; maxX: number; minZ: number; maxZ: number}> = {}) {
  const {minX = -5.5, maxX = 5.5, minZ = -4.5, maxZ = 4.5} = bounds;// ponytail: linear open-set scan, fine up to a few thousand cells
  const cols = Math.round((maxX-minX)/step)+1, rows = Math.round((maxZ-minZ)/step)+1;
  const world = (id: number): Point => ({x: minX+(id%cols)*step, z: minZ+Math.floor(id/cols)*step});
  const blocked = new Set<number>();
  for(let id=0;id<cols*rows;id++) {
    const p=world(id);
    if(obstacles.some(o=>Math.abs(p.x-o.x)<o.w/2+0.26 && Math.abs(p.z-o.z)<o.d/2+0.26)) blocked.add(id);
  }
  function nearest(p: Point): number {
    let best=-1, dist=Infinity;
    for(let id=0;id<cols*rows;id++) if(!blocked.has(id)) {
      const q=world(id), d=(p.x-q.x)**2+(p.z-q.z)**2;
      if(d<dist){dist=d;best=id;}
    }
    return best;
  }
  function path(start: Point, end: Point): Point[] {
    const a=nearest(start), b=nearest(end);
    if(a<0||b<0)return [];
    const open=new Set<number>([a]), parent=new Map<number,number>(), scores=new Map<number,number>([[a,0]]);
    const h=(id: number)=>Math.hypot(world(id).x-world(b).x,world(id).z-world(b).z)/step;
    let found=false;
    while(open.size) {
      let current=-1, best=Infinity;
      for(const id of open){const f=(scores.get(id)??Infinity)+h(id);if(f<best){best=f;current=id;}}
      if(current===b){found=true;break;}
      open.delete(current);
      const x=current%cols,z=Math.floor(current/cols);
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
        const nx=x+dx,nz=z+dz;
        if(nx<0||nx>=cols||nz<0||nz>=rows)continue;
        const next=nz*cols+nx;
        if(blocked.has(next))continue;
        if(dx&&dz&&(blocked.has(z*cols+nx)||blocked.has(nz*cols+x)))continue;
        const score=(scores.get(current)??Infinity)+Math.hypot(dx,dz);
        if(score<(scores.get(next)??Infinity)){parent.set(next,current);scores.set(next,score);open.add(next);}
      }
    }
    if(!found)return [];
    const result=[world(b)];let c=b;
    while(c!==a){c=parent.get(c) as number;result.push(world(c));}
    return result.reverse();
  }
  return {path, isWalkable:(p: Point)=>!obstacles.some(o=>Math.abs(p.x-o.x)<o.w/2+0.25&&Math.abs(p.z-o.z)<o.d/2+0.25)};
}
