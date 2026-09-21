// The landing page: what gamitask is, and a playable corner of it. The café itself lives at /app/.
import './style.css';
import './landing.css';
import {createIcons,Coffee,ArrowRight} from 'lucide';

const icon=(name:string):string=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
const root=document.getElementById('landing') as HTMLElement;
root.innerHTML=`
  <header class="lp-bar">
    <a class="brand chip" href="/" aria-label="gamitask, accueil"><span class="brand-mark">${icon('coffee')}</span><span>gami<span class="brand-light">task</span></span></a>
    <nav class="lp-nav" aria-label="Sections"><a href="#features">Fonctionnalités</a><a href="#streamers">Streamers</a><a href="#pricing">Tarifs</a><a href="#faq">FAQ</a></nav>
    <a class="chip active" href="/app/">Entrer au café ${icon('arrow-right')}</a>
  </header>
  <main class="lp">
    <section class="lp-hero">
      <p class="eyebrow">UN CAFÉ 3D POUR TES SESSIONS DE TRAVAIL</p>
      <h1>Le café des <em>petites victoires</em>.</h1>
      <p class="lp-lead">Un pomodoro, des tâches qui deviennent des tickets sur ta table, et un personnage qui s’installe avec toi. Gratuit, sans compte pour commencer.</p>
      <div class="lp-cta"><a class="primary" href="/app/">${icon('coffee')}<span>Entrer au café, c’est gratuit</span></a></div>
    </section>
  </main>`;
createIcons({icons:{Coffee,ArrowRight},attrs:{'stroke-width':1.65}});
