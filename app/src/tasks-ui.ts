// Le tiroir des tâches : formulaire, liste, filtres, catégories, et le miroir de la liste dans la scène.
// Le balisage vit dans le HUD de main.ts ; ce module possède le comportement. Le serveur garde la liste.
import {$,icon,drawIcons,load,save,toast,esc} from './ui.ts';
import {decodeEntities} from './chat.ts';
import {createTasks,setTasks,taskAdded,taskUpdated,taskDeleted,pending,cleanText,CATEGORIES,KIND_LABELS,DIFFICULTY_HINT,TINT_LABELS,DAY_LABELS,DIFFICULTIES,visible,remaining,toggleDay,newTaskPayload,taskScored,cleanChecklistItem} from './tasks.ts';
import {tint,isDue} from '../../server/src/scoring.ts';

export interface TasksDeps{
  cafe(): any;// la scène courante, ou null avant le premier montage
  socket(): any;// la socket du café
}
export type TasksUi=ReturnType<typeof createTasksUi>;

export function createTasksUi(deps: TasksDeps){
  // Tasks: the server holds the list, the client mirrors it as little order slips in the café.
  const tasks=createTasks();
  let newCategory: string|null=null,newDifficulty=1,newDays=127,newUp=true,newDown=false,optionsOpen=false,helpHidden: boolean=load('gamitask.taskHelp',false);
  const catOf=(id: string|null)=>CATEGORIES.find(c=>c.id===id);
  const pips=(n: number)=>`<span class="pips" aria-hidden="true">${[1,2,3,4].map(i=>`<i class="${i<=n?'on':''}"></i>`).join('')}</span>`;
  const dueLabel=(ts: number)=>new Date(ts).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'});
  function syncScene(){deps.cafe()?.setTasks(pending(tasks));}
  function renderTaskForm(){
    const k=tasks.tab;($('#task-text') as HTMLInputElement).placeholder=KIND_LABELS[k].placeholder;
    $('#task-days-opt').hidden=k!=='daily';$('#task-dirs-opt').hidden=k!=='habit';$('#task-due-opt').hidden=k!=='todo';$('#task-filter').hidden=k==='habit';
    $('#task-help').hidden=helpHidden;$('#task-help-text').textContent=KIND_LABELS[k].help;$('#task-help-toggle').hidden=!helpHidden;
    $('#task-options').hidden=!optionsOpen;$('#task-more').setAttribute('aria-expanded',String(optionsOpen));
    const tweaked=newCategory!==null||(k==='daily'&&newDays!==127)||(k==='habit'&&(newDown||!newUp))||(k==='todo'&&!!($('#task-due') as HTMLInputElement).value);$('#task-more').classList.toggle('tweaked',tweaked);// a dot on the toggle says "something is set in there"
    document.querySelectorAll('#task-days button').forEach((b: any)=>b.setAttribute('aria-pressed',String(!!(newDays&(1<<Number(b.dataset.day))))));
    document.querySelectorAll('#task-dirs button').forEach((b: any)=>b.setAttribute('aria-pressed',String(b.dataset.dir==='up'?newUp:newDown)));
    const d=DIFFICULTIES[newDifficulty];$('#task-difficulty').innerHTML=`${pips(d.pips)}<span>${d.label}</span>`;
    document.querySelectorAll('#task-tabs [role=tab]').forEach((b: any)=>b.setAttribute('aria-selected',String(b.dataset.kind===k)));
    document.querySelectorAll('#task-filter button').forEach((b: any)=>b.setAttribute('aria-pressed',String(b.dataset.filter===tasks.filter)));
  }
  function renderTasks(){
    const list=$('#task-list'),today=new Date();
    const open=new Set([...list.querySelectorAll('li.open')].map((l: any)=>l.dataset.id));
    list.innerHTML='';
    for(const t of visible(tasks,today)){
      const li=document.createElement('li');li.dataset.id=t.id;const cat=catOf(t.category),d=DIFFICULTIES.find(x=>x.id===t.difficulty)!;
      const tn=tint(t.value);li.className=`kind-${t.kind} tint-${tn}${t.done?' done':''}${t.kind==='daily'&&!isDue(t,today)?' not-due':''}`;if(TINT_LABELS[tn])li.title=TINT_LABELS[tn];
      const dt=esc(decodeEntities(t.text));
      const text=`<span class="task-text" contenteditable="plaintext-only" spellcheck="false">${dt}</span>`;
      const common=`<button class="cat-dot${cat?'':' empty'}" style="--cat:${cat?cat.color:'#c9cdbd'}" title="Catégorie : ${cat?cat.label:'aucune'} — cliquer pour changer" aria-label="Changer la catégorie"></button><button class="pips diff" title="Difficulté : ${d.label} — cliquer pour changer. ${DIFFICULTY_HINT}" aria-label="Changer la difficulté">${pips(d.pips)}</button>`;
      if(t.kind==='habit')li.innerHTML=`${t.down?`<button class="score-button down" data-dir="down" title="J’ai craqué (−)" aria-label="Craquée : ${dt}">${icon('minus')}</button>`:'<span class="score-spacer"></span>'}${text}${common}<small class="counts" title="Aujourd’hui : fois tenue / fois craquée">${t.up?`<b class="up">+${t.countUp}</b>`:''}${t.down?`<b class="down">−${t.countDown}</b>`:''}</small>${t.up?`<button class="score-button up" data-dir="up" title="Je l’ai tenue (+)" aria-label="Tenue : ${dt}">${icon('plus')}</button>`:'<span class="score-spacer"></span>'}<button class="icon-button remove-task" aria-label="Supprimer">${icon('x')}</button>`;
      else if(t.kind==='daily')li.innerHTML=`<button class="check-button${t.done?' done':''}" data-dir="${t.done?'down':'up'}" aria-label="${t.done?'Reprendre':'Terminer'} : ${dt}" aria-pressed="${t.done}">${icon('check')}</button>${text}${common}${t.streak>1?`<small class="streak-count" title="Série">${icon('flame')}${t.streak}</small>`:''}<small class="days-mini" aria-label="Jours">${DAY_LABELS.map((l,i)=>`<b class="${t.days&(1<<i)?'on':''}">${l}</b>`).join('')}</small><button class="icon-button remove-task" aria-label="Supprimer">${icon('x')}</button>`;
      else{const n=t.checklist.length,k=t.checklist.filter(i=>i.done).length;
        li.innerHTML=`<button class="check-button${t.done?' done':''}" data-dir="${t.done?'down':'up'}" aria-label="${t.done?'Reprendre':'Terminer'} : ${dt}" aria-pressed="${t.done}">${icon('check')}</button>${text}${common}${t.dueAt?`<small class="due" title="Date butoir">${icon('calendar')}${dueLabel(t.dueAt)}</small>`:''}<button class="icon-button toggle-list" aria-expanded="false" aria-label="Étapes" title="Étapes">${icon('chevron-down')}${n?`<b>${k}/${n}</b>`:''}</button><button class="icon-button remove-task" aria-label="Supprimer">${icon('x')}</button>
        <ul class="checklist" hidden>${t.checklist.map((i,idx)=>`<li data-idx="${idx}"><button class="check-button mini${i.done?' done':''}" aria-pressed="${i.done}">${icon('check')}</button><span>${esc(decodeEntities(i.text))}</span><button class="icon-button remove-item" aria-label="Retirer">${icon('x')}</button></li>`).join('')}<li class="add-item"><input placeholder="Une étape…" maxlength="80" aria-label="Nouvelle étape" /></li></ul>`;}
      list.append(li);
    }
    for(const li of list.querySelectorAll('li[data-id]') as NodeListOf<HTMLElement>){
      if(!open.has(li.dataset.id))continue;
      li.classList.add('open');(li.querySelector('.checklist') as HTMLElement).hidden=false;li.querySelector('.toggle-list')!.setAttribute('aria-expanded','true');
    }
    $('#tasks-empty').hidden=visible(tasks,today).length>0;const left=remaining(tasks,today);$('#tasks-count').textContent=left?`${left} à faire`:tasks.list.length?'Tout est fait':'';
    for(const k of ['habit','daily','todo'] as const){const n=k==='habit'?tasks.list.filter(t=>t.kind==='habit').length:tasks.list.filter(t=>t.kind===k&&!t.done&&(k==='todo'||isDue(t,today))).length;($(`[data-count=${k}]`) as HTMLElement).textContent=n?String(n):'';}
    document.querySelectorAll('#task-cats button').forEach((b: any)=>b.setAttribute('aria-pressed',String(b.dataset.cat===newCategory)));
    renderTaskForm();drawIcons();
  }
  const emitUpdate=(id: string,patch: any)=>deps.socket().emit('task:update',{taskId:id,patch});
  $('#task-tabs').onclick=(e: any)=>{const b=e.target.closest('[data-kind]');if(!b)return;tasks.tab=b.dataset.kind;renderTasks();$('#task-text').focus();};
  $('#task-filter').onclick=(e: any)=>{const b=e.target.closest('[data-filter]');if(!b)return;tasks.filter=b.dataset.filter;renderTasks();};
  $('#task-cats').onclick=(e: any)=>{const b=e.target.closest('[data-cat]');if(!b)return;newCategory=newCategory===b.dataset.cat?null:b.dataset.cat;renderTasks();$('#task-text').focus();};
  $('#task-days').onclick=(e: any)=>{const b=e.target.closest('[data-day]');if(!b)return;newDays=toggleDay(newDays,Number(b.dataset.day));renderTaskForm();};
  $('#task-dirs').onclick=(e: any)=>{const b=e.target.closest('[data-dir]');if(!b)return;if(b.dataset.dir==='up')newUp=!newUp;else newDown=!newDown;if(!newUp&&!newDown)newUp=true;renderTaskForm();};
  $('#task-difficulty').onclick=()=>{newDifficulty=(newDifficulty+1)%DIFFICULTIES.length;renderTaskForm();};
  $('#task-more').onclick=()=>{optionsOpen=!optionsOpen;renderTaskForm();};
  $('#task-due').onchange=()=>renderTaskForm();
  $('#task-help-close').onclick=()=>{helpHidden=true;save('gamitask.taskHelp',true);renderTaskForm();};
  $('#task-help-toggle').onclick=()=>{helpHidden=false;save('gamitask.taskHelp',false);renderTaskForm();};
  $('#task-form').onsubmit=(e: any)=>{e.preventDefault();const text=cleanText(($('#task-text') as HTMLInputElement).value);if(!text)return;
    const due=($('#task-due') as HTMLInputElement).value;const dueAt=due?new Date(due+'T12:00:00').getTime():null;
    deps.socket().emit('task:add',{...newTaskPayload(tasks.tab,text,{difficulty:DIFFICULTIES[newDifficulty].id,category:newCategory,up:newUp,down:newDown,days:newDays,dueAt})});($('#task-text') as HTMLInputElement).value='';($('#task-due') as HTMLInputElement).value='';};
  $('#task-list').addEventListener('click',(e: Event)=>{
    const target=e.target as HTMLElement,li=target.closest('li[data-id]') as HTMLElement|null;if(!li)return;const id=li.dataset.id!;const t=tasks.list.find(t=>t.id===id);if(!t)return;
    const scoreBtn=target.closest('[data-dir]') as HTMLElement|null;
    if(scoreBtn&&!target.closest('.checklist')){scoreBtn.setAttribute('disabled','');deps.socket().emit('task:score',{taskId:id,direction:scoreBtn.dataset.dir as 'up'|'down'});}
    else if(target.closest('.cat-dot')){const i=CATEGORIES.findIndex(c=>c.id===t.category);emitUpdate(id,{category:i+1<CATEGORIES.length?CATEGORIES[i+1].id:null});}
    else if(target.closest('.diff')){const i=DIFFICULTIES.findIndex(d=>d.id===t.difficulty);emitUpdate(id,{difficulty:DIFFICULTIES[(i+1)%DIFFICULTIES.length].id});}
    else if(target.closest('.toggle-list')){const ul=li.querySelector('.checklist') as HTMLElement,b=li.querySelector('.toggle-list')!;ul.hidden=!ul.hidden;b.setAttribute('aria-expanded',String(!ul.hidden));li.classList.toggle('open',!ul.hidden);}
    else if(target.closest('.checklist .check-button')){const idx=Number((target.closest('[data-idx]') as HTMLElement).dataset.idx);emitUpdate(id,{checklist:t.checklist.map((i,j)=>j===idx?{...i,done:!i.done}:i)});}
    else if(target.closest('.remove-item')){const idx=Number((target.closest('[data-idx]') as HTMLElement).dataset.idx);emitUpdate(id,{checklist:t.checklist.filter((_,j)=>j!==idx)});}
    else if(target.closest('.remove-task'))deps.socket().emit('task:delete',{taskId:id});
  });
  $('#task-list').addEventListener('keydown',(e: any)=>{
    if(e.target.matches('.task-text')&&e.key==='Enter'){e.preventDefault();e.target.blur();}
    if(e.target.matches('.add-item input')&&e.key==='Enter'){e.preventDefault();const li=e.target.closest('li[data-id]'),t=tasks.list.find(t=>t.id===li.dataset.id);const text=cleanChecklistItem(e.target.value);if(!t||!text)return;emitUpdate(t.id,{checklist:[...t.checklist,{text,done:false}]});e.target.value='';}
  });
  $('#task-list').addEventListener('focusout',(e: Event)=>{const el=e.target as HTMLElement;if(!el.matches('.task-text'))return;const id=(el.closest('li[data-id]') as HTMLElement).dataset.id!;const t=tasks.list.find(t=>t.id===id);const text=cleanText(el.textContent);
    if(!t||!text){if(t)el.textContent=t.text;return;}if(text!==t.text)emitUpdate(id,{text});});
  renderTasks();


  // Ce que main.ts relaie du serveur, et ce que la scène demande.
  function setList(list: any[]){setTasks(tasks,list);}
  function added(t: any){taskAdded(tasks,t);}
  function scored(t: any){taskScored(tasks,t);}
  function updated(t: any){taskUpdated(tasks,t);}
  function deleted(id: string){taskDeleted(tasks,id);}
  // La liste ne montre qu'un genre à la fois : pour retrouver une tâche, on bascule d'abord sur le sien.
  function revealKind(id: string){const t=tasks.list.find(t=>t.id===id);if(t&&t.kind!==tasks.tab){tasks.tab=t.kind;renderTasks();}}

  return {render:renderTasks,sync:syncScene,setList,added,scored,updated,deleted,revealKind,catOf};
}
