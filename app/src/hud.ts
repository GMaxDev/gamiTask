// Le HUD du café, en un seul gabarit : les zones, les chips, le minuteur, les dialogues. Pure fonction —
// il ne lit aucun état, tout ce qui bouge est posé ensuite par les modules qui possèdent chaque zone.
import {icon,hexOf} from './ui.ts';
import {PALETTE} from './identity.ts';
import {CATEGORIES,KIND_LABELS,DIFFICULTY_HINT,DAY_LABELS} from './tasks.ts';

export function hudMarkup(): string{return `
  <main class="workspace">
    <section class="world" aria-label="Ton café">
      <div class="scene" id="scene"><div class="loading">Le café ouvre ses portes…</div></div>
      <div class="hud-top">
        <div class="hud-zone hud-left">
          <a class="brand chip" href="/" aria-label="gamitask, accueil"><span class="brand-mark">${icon('coffee')}</span><span>gami<span class="brand-light">task</span></span></a>
          <button class="chip clock-chip" id="clock"><span id="clock-time">--:--</span><span id="clock-light" class="clock-light"></span></button>
          <div class="chip-group room-switch" role="group" aria-label="Changer de salle"><button class="chip" data-room="cafe" aria-pressed="true">${icon('coffee')}<span>Le café</span><span class="room-count" id="count-cafe" hidden>0</span></button><button class="chip" data-room="garden" aria-pressed="false">${icon('leaf')}<span>Le jardin</span><span class="room-count" id="count-garden" hidden>0</span></button><button class="chip" data-room="private" aria-pressed="false">${icon('home')}<span>Chez moi</span></button></div>
        </div>
        <div class="hud-zone hud-center"><div class="chip-group progress-group">
          <button id="progress-chip" class="chip progress" aria-label="Ma progression" title="Ma progression">
            <span class="coins">${icon('coins')}<strong id="coins">0</strong></span><span class="level-badge" id="level-badge">Niveau 0</span><span class="streak" id="streak" hidden>${icon('flame')}<span id="streak-count">0</span></span>
            <span class="xp-bar" role="progressbar" aria-label="Expérience" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="xp-fill"></span></span>
            <span class="energy-bar" role="progressbar" aria-label="Énergie" aria-valuemin="0" aria-valuemax="50" aria-valuenow="50" title="Énergie"><span id="energy-fill"></span></span>
          </button>
        </div></div>
        <div class="hud-zone hud-right">
          <details class="identity-menu" id="identity-menu"><summary id="identity-chip" class="chip" aria-label="Mon compte"><span class="swatch-dot" id="identity-dot"></span><span id="identity-name"></span><span id="role-badge" class="role-badge" hidden></span><span class="chev">${icon('chevron-down')}</span></summary>
            <div class="menu" role="menu"><button id="me-edit" role="menuitem">${icon('smile')}Mon personnage</button><button id="account-button" role="menuitem" hidden>${icon('user-cog')}Mon compte</button><button id="guests-button" role="menuitem" hidden>${icon('user-x')}Gérer ma pièce</button><button id="workshop-btn" role="menuitem" hidden>${icon('hammer')}Atelier</button><hr><button id="logout-button" role="menuitem" class="danger">${icon('log-out')}Se déconnecter</button></div></details>
          <div class="chip-group view-controls"><button id="follow" class="chip icon active" title="Activer ou désactiver le suivi du personnage" aria-label="Suivre le personnage" aria-pressed="true">${icon('locate-fixed')}</button><span class="divider"></span><button id="zoom-out" class="chip icon" aria-label="Dézoomer">${icon('minus')}</button><output id="zoom-value">100%</output><button id="zoom-in" class="chip icon" aria-label="Zoomer">${icon('plus')}</button><span class="divider"></span><button id="recenter" class="chip icon" title="Vue initiale" aria-label="Recentrer la vue">${icon('rotate-ccw')}</button></div>
        </div>
      </div>
      <div class="world-bottom"><div class="world-left"><div class="chip-group"><button id="rain-chip" class="chip" aria-pressed="false" title="Pluie douce">${icon('headphones')}<span>Pluie</span><span class="sound-bars"><b></b><b></b><b></b></span></button><span class="divider"></span><button id="open-panel" class="chip">${icon('settings-2')}<span>Paramètres</span></button></div></div></div>
      <div class="timer-dock">
        <div class="timer-tabs-top" role="tablist" aria-label="Minuteur"><button class="chip" role="tab" id="tab-solo" aria-selected="true" aria-controls="pane-solo">Solo</button><button class="chip" role="tab" id="tab-room" aria-selected="false" aria-controls="pane-room">Avec la salle<span class="tab-dot" id="room-dot" hidden></span><span class="tab-count" id="room-count" hidden>0</span></button></div>
        <section class="timer-hud timer-card" aria-label="Pomodoro">
          <div id="pane-solo" role="tabpanel" aria-labelledby="tab-solo">
            <div class="timer-tabs" role="group" aria-label="Type de session"><button data-mode="focus" aria-pressed="true">Focus</button><button data-mode="short" aria-pressed="false">Pause</button><button data-mode="long" aria-pressed="false">Longue</button></div>
            <div class="timer-main">
              <span class="dial-mini"><svg viewBox="0 0 220 220" aria-hidden="true"><circle class="dial-track" cx="110" cy="110" r="97"/><circle id="dial-progress" cx="110" cy="110" r="97"/></svg><button id="start" class="primary" aria-label="Lancer ou mettre en pause">${icon('play')}<span>C’est parti</span></button></span>
              <span class="timer-readout"><output id="timer-value" aria-label="Temps restant">25:00</output><span id="session-label">Session de concentration</span><span id="timer-kicker" hidden>ON Y VA DOUCEMENT</span></span>
            </div>
            <button id="reset" class="icon-button" aria-label="Réinitialiser le minuteur">${icon('rotate-ccw')}</button><button id="settings" class="icon-button" aria-label="Régler les durées">${icon('settings-2')}</button>
          </div>
          <div id="pane-room" role="tabpanel" aria-labelledby="tab-room" hidden>
            <div class="timer-tabs phase-tabs" aria-label="Phase de la salle"><span data-phase="focus">Focus</span><span data-phase="short-break">Pause</span><span data-phase="long-break">Longue</span></div>
            <div class="timer-main">
              <span class="dial-mini"><svg viewBox="0 0 220 220" aria-hidden="true"><circle class="dial-track" cx="110" cy="110" r="97"/><circle id="room-dial-progress" cx="110" cy="110" r="97"/></svg><span class="dial-core" aria-hidden="true">${icon('users')}</span></span>
              <span class="timer-readout"><output id="room-value" aria-label="Temps restant dans la salle">25:00</output><span id="room-subtitle">Personne pour l’instant. Lance la session ?</span><span id="room-kicker">25 / 5 / 15 · SESSION 1</span></span>
            </div>
            <button id="room-join" class="primary pill" aria-label="Rejoindre la session">${icon('users')}<span>Rejoindre</span></button>
          </div>
        </section>
      </div>
      <button id="open-tasks" class="chip active open-tasks" aria-label="Mes tâches" aria-expanded="false">${icon('list-checks')}<span id="tasks-count" class="tasks-count"></span></button>
      <div class="movement-hint">${icon('mouse-pointer-2')} Cliquer pour marcher ou s’asseoir <span>·</span> ${icon('move')} Glisser pour explorer <span>·</span> ${icon('coffee')} <span id="move-hint-room">Comptoir : passer commande</span></div>
      <div id="toast" class="toast" role="status"></div>
      <div id="recap" class="recap" role="status" hidden>${icon('coffee')}<div><strong id="recap-title"></strong><span id="recap-text"></span></div><button type="button" class="icon-button" id="recap-close" aria-label="Fermer">${icon('x')}</button></div>
      <div id="hint" class="hint" role="tooltip" hidden></div>
      <div id="place-bar" class="place-bar" hidden><span id="place-text"></span><button id="place-ok" class="primary" disabled>${icon('check')}<span>Poser ici</span></button><button id="place-cancel" class="icon-button" aria-label="Annuler">${icon('x')}</button></div>
      <div id="veil" class="veil" aria-hidden="true"><span class="veil-label"><span id="veil-icon">${icon('coffee')}</span><span id="veil-text"></span></span></div><div id="veil-edge" class="veil-edge" aria-hidden="true"></div>
    </section>
    <aside class="drawer" id="tasks-drawer" aria-label="Mes tâches" aria-hidden="true">
      <div class="drawer-head"><span class="eyebrow">AU COMPTOIR</span><h2 id="drawer-title">Mes petites<br>tâches.</h2><button class="icon-button drawer-close" aria-label="Fermer">${icon('x')}</button></div>
      <div class="drawer-tabs" role="tablist"><button data-tab="tasks" role="tab" aria-selected="true">${icon('list-checks')} Tâches</button><button data-tab="shop" role="tab" aria-selected="false">${icon('shopping-bag')} Boutique</button></div>
      <div id="tab-tasks" role="tabpanel">
      <section class="tasks-card">
        <div class="task-tabs" id="task-tabs" role="tablist" aria-label="Type de tâche">${(['habit','daily','todo'] as const).map(k=>`<button type="button" role="tab" data-kind="${k}" aria-selected="${k==='todo'}">${KIND_LABELS[k].many}<span class="tab-count" data-count="${k}"></span></button>`).join('')}</div>
        <p class="task-help" id="task-help"><span id="task-help-text"></span><button type="button" class="icon-button" id="task-help-close" aria-label="Masquer l’aide">${icon('x')}</button></p>
        <form id="task-form" class="task-form" autocomplete="off">
          <div class="task-row"><input id="task-text" maxlength="120" placeholder="Une chose à faire…" aria-label="Nouvelle tâche" /><button type="button" id="task-difficulty" class="diff-chip" aria-label="Difficulté" title="${DIFFICULTY_HINT}"></button><button type="button" id="task-more" class="icon-button" aria-expanded="false" aria-label="Options de la tâche" title="Catégorie, jours, sens, échéance">${icon('settings-2')}</button><button type="submit" class="icon-button add-task" aria-label="Ajouter la tâche">${icon('plus')}</button></div>
          <div class="task-options" id="task-options" hidden>
            <div class="opt"><span class="opt-label">Catégorie</span><div class="chips" id="task-cats" role="group" aria-label="Catégorie">${CATEGORIES.map(c=>`<button type="button" data-cat="${c.id}" style="--cat:${c.color}" aria-pressed="false">${c.label}</button>`).join('')}</div></div>
            <div class="opt" id="task-days-opt" hidden><span class="opt-label">Jours</span><div class="days" id="task-days" role="group" aria-label="Jours">${DAY_LABELS.map((d,i)=>`<button type="button" data-day="${i}" aria-pressed="true">${d}</button>`).join('')}</div></div>
            <div class="opt" id="task-dirs-opt" hidden><span class="opt-label">Sens</span><div class="chips" id="task-dirs" role="group" aria-label="Sens"><button type="button" data-dir="up" aria-pressed="true" title="On peut la cocher en +">${icon('plus')} Bonne</button><button type="button" data-dir="down" aria-pressed="false" title="On peut la cocher en −">${icon('minus')} Mauvaise</button></div></div>
            <div class="opt" id="task-due-opt" hidden><span class="opt-label">Échéance</span><label class="due-field" id="task-due-field">${icon('calendar')}<input type="date" id="task-due" aria-label="Date butoir" /></label></div>
          </div>
        </form>
        <ul id="task-list" class="task-list"></ul>
        <p id="tasks-empty" class="tasks-empty">Rien pour l’instant. Une seule chose suffit pour commencer.</p>
        <div class="task-foot"><button type="button" class="icon-button" id="task-help-toggle" aria-label="Comment ça marche ?" title="Comment ça marche ?">${icon('help-circle')}</button><div class="task-filter" id="task-filter"><button type="button" data-filter="remaining" aria-pressed="true">Restantes</button><button type="button" data-filter="all" aria-pressed="false">Toutes</button></div></div>
      </section>
      <p class="drawer-note">Chaque tâche devient une petite ardoise posée sur une table du café. Coche-la ici, ou clique dessus dans la salle pour la retrouver.</p>
      </div>
      <div id="tab-shop" role="tabpanel" hidden>
        <p class="shop-wallet">${icon('coins')}<strong id="shop-coins">0</strong> pièces à dépenser</p>
        <h3 class="shop-title">Chapeaux</h3><ul class="shop-list" id="shop-hats"></ul>
        <h3 class="shop-title">Mobilier <small id="shop-where"></small></h3><ul class="shop-list" id="shop-furniture"></ul>
        <h3 class="shop-title">Sets</h3><ul class="shop-list sets" id="shop-sets"></ul>
        <p class="drawer-note">Le mobilier ne s'installe que chez toi, dans ta propre pièce. Compléter un set donne un bonus permanent.</p>
      </div>
    </aside>
  </main>
  <dialog id="progress-dialog" class="card card-honey"><header class="card-head"><span class="card-icon">${icon('trophy')}</span><span class="card-eyebrow">MA PROGRESSION</span><h2>Petit à petit.</h2><button type="button" class="icon-button close-dialog" aria-label="Fermer">${icon('x')}</button></header><div class="card-body">
    <div class="progress-summary"><span class="coins">${icon('coins')}<strong id="coins-big">0</strong> pièces</span><span class="level-badge" id="level-big">Niveau 0</span></div>
    <div class="xp-bar" aria-hidden="true"><span id="xp-fill-big"></span></div><div class="xp-label" id="xp-label">0 / 50 XP</div>
    <div class="energy-row"><span class="energy-icon">${icon('coffee')}</span><span>Énergie</span><div class="energy-bar big" aria-hidden="true"><span id="energy-fill-big"></span></div><span class="energy-label" id="energy-label">50 / 50</span></div>
    <div class="day-stats"><div><strong id="sessions">0</strong><span>sessions aujourd’hui</span></div><span class="stat-divider"></span><div><strong><span id="minutes">0</span><small> min</small></strong><span>rien que pour toi</span></div></div>
    <div class="session-dots"><span class="filled"></span><span></span><span></span><span></span><small id="cycle-label">Un pas après l’autre</small></div>
    <section><h3>Aujourd’hui <span class="pill" id="journal-summary" hidden></span></h3><ul class="journal-list" id="journal-list"></ul><p class="tasks-empty" id="journal-empty">Rien encore. Un focus ou une tâche cochée, et ça commence.</p></section>
    <section><h3>Succès <span class="pill" id="achievements-count">0/7</span></h3><ul class="achievements-list" id="achievements-list"></ul></section>
  </div></dialog>
  <dialog id="settings-dialog" class="card card-terra"><form id="settings-form"><header class="card-head"><span class="card-icon">${icon('clock-3')}</span><span class="card-eyebrow">TON RYTHME</span><h2>À ton tempo.</h2><button type="button" class="icon-button close-dialog" aria-label="Fermer">${icon('x')}</button></header><div class="card-body"><p>Choisis la durée de tes sessions, en minutes, et la forme de ton cycle.</p><div class="field-rows"><label>Concentration<input name="focus" type="number" min="1" max="90" required /></label><label>Petite pause<input name="short" type="number" min="1" max="90" required /></label><label>Longue pause<input name="long" type="number" min="1" max="90" required /></label><label>Focus avant la longue pause<input name="perCycle" type="number" min="2" max="12" required /></label><label>Enchaîner les phases<input name="autoChain" type="checkbox" /></label><label>S’asseoir en focus, se lever en pause<input name="seatOnFocus" type="checkbox" /></label></div><p class="form-note" id="cycle-preview"></p><p class="form-note">Enregistrer remet le minuteur au début.</p><button type="submit" class="primary">Enregistrer mon rythme</button></div></form></dialog>
  <dialog id="identity-dialog" class="card card-sage"><form id="identity-form" method="dialog"><header class="card-head"><span class="card-icon">${icon('smile')}</span><span class="card-eyebrow">ON SE PRÉSENTE ?</span><h2>Un pseudo, une couleur.</h2></header><div class="card-body">
    <p>Un pseudo et une couleur, c’est tout ce qu’il faut pour entrer au café.</p>
    <label>Pseudo<input name="name" type="text" minlength="2" maxlength="20" required autocomplete="nickname" /></label>
    <div class="palette" role="radiogroup" aria-label="Couleur">${PALETTE.map((p,i)=>`<label class="swatch" style="--swatch:${hexOf(p.hex)}" title="${p.label}"><input type="radio" name="color" value="${p.hex}" ${i===0?'checked':''}/></label>`).join('')}</div>
    <button class="primary" type="submit">${icon('coffee')}<span>Entrer au café</span></button>
  </div></form></dialog>
  <dialog id="panel-dialog" class="card card-sky"><header class="card-head"><span class="card-icon">${icon('settings-2')}</span><span class="card-eyebrow">PARAMÈTRES</span><h2>Le café, à ta main.</h2><button type="button" class="icon-button close-dialog" aria-label="Fermer">${icon('x')}</button></header>
  <div class="task-tabs panel-tabs" role="tablist"><button role="tab" data-panel="ambiance" aria-selected="true">${icon('sun-moon')}Ambiance</button><button role="tab" data-panel="compte" aria-selected="false">${icon('user-cog')}Compte</button><button role="tab" data-panel="aide" aria-selected="false">${icon('help-circle')}Aide</button></div>
  <div class="card-body">
    <section class="panel-pane" data-pane="ambiance">
      <h3>Lumière</h3>
      <div class="segmented" id="light" role="radiogroup" aria-label="Lumière de la scène"><button data-light="auto">${icon('sun-moon')}<span>Auto</span></button><button data-light="day">${icon('sun')}<span>Plein jour</span></button><button data-light="evening">${icon('moon')}<span>Soirée</span></button></div>
      <p class="form-note" id="light-note"></p>
      <h3>Sons</h3>
      <div class="field-rows"><label>${icon('headphones')}<span>Pluie douce</span><span class="sound-bars"><b></b><b></b><b></b></span><input id="sound" type="checkbox" /></label><label>${icon('volume-2')}<span>Carillon du minuteur</span><input id="sfx" type="checkbox" /></label><label>${icon('bell')}<span>Notifications système</span><input id="notifs" type="checkbox" /></label></div>
      <h3>Écouter</h3>
      <ul class="sound-list">
    <li><div><strong>Début de session</strong><small>Deux notes montantes, quand tu lances un pomodoro ou rejoins la salle.</small></div><button data-play="start">${icon('play')}<span>Écouter</span></button></li>
    <li><div><strong>Fin de session</strong><small>Un carillon de trois notes, à la fin d’un focus ou d’une pause.</small></div><button data-play="end">${icon('play')}<span>Écouter</span></button></li>
    <li><div><strong>Récompense</strong><small>Trois notes brèves, à chaque pièce ou point d’expérience gagné.</small></div><button data-play="reward">${icon('play')}<span>Écouter</span></button></li>
    <li><div><strong>Notification système</strong><small>Le même message, hors de l’onglet. Ton navigateur doit l’autoriser.</small></div><button data-play="notify">${icon('bell')}<span>Tester</span></button></li>
  </ul>
    </section>
    <section class="panel-pane" data-pane="compte" hidden>
      <h3>Toi</h3>
      <div class="kv"><span class="kv-key">${icon('smile')}<span>Pseudo</span></span><span class="pill" id="account-name"></span></div>
      <div class="kv"><span class="kv-key">${icon('log-in')}<span>Connexion</span></span><span class="pill" id="account-mode"></span></div>
      <p>Ton pseudo et ta couleur se changent depuis « Mon personnage », dans le menu en haut à droite.</p>
      <section><h3>Twitch</h3><div class="kv"><span class="kv-key">${icon('twitch')}<span>Chaîne</span></span><span class="pill" id="account-twitch-status">Non lié</span></div>
    <p>Lie ta chaîne pour faire apparaître tes viewers dans ta salle, plus tard.</p>
    <button id="twitch-link" class="primary">${icon('link-2')}<span>Lier mon compte Twitch</span></button>
    <button id="twitch-unlink" class="secondary" hidden>${icon('unlink')}<span>Délier Twitch</span></button></section>
    </section>
    <section class="panel-pane" data-pane="aide" hidden>
      <h3>Se déplacer</h3>
      <p>Ce petit coin est à toi. Prends tes marques.</p>
      <ul class="help-list"><li>${icon('mouse-pointer-2')}<span><strong>Un clic au sol ou sur un siège</strong>Ton personnage s’y rend en contournant les meubles, et s’installe si c’est une chaise ou le canapé.</span></li><li>${icon('move')}<span><strong>Cliquer et glisser</strong>Explore le café en déplaçant la caméra.</span></li><li>${icon('plus')}<span><strong>Molette ou boutons + / −</strong>Rapproche-toi ou prends un peu de recul.</span></li><li>${icon('locate-fixed')}<span><strong>Suivi du personnage</strong>Réactive-le pour que la caméra t’accompagne.</span></li><li>${icon('list-checks')}<span><strong>Un clic sur le tableau de liège</strong>La caméra s’en approche pour lire tes tâches. Un clic ailleurs ou Échap, et tu reviens. Tant qu’une fenêtre est ouverte, ton personnage patiente.</span></li></ul>
      <p class="form-note">Au clavier : sélectionne la scène, puis utilise les flèches. L’orientation de la vue reste toujours fixe.</p>
      <h3>Énergie</h3>
      <ul class="help-list">
        <li>${icon('coffee')}<span><strong>50 au maximum</strong>Une quotidienne oubliée à minuit ou une habitude ratée en coûte un peu — d’autant plus que la tâche est difficile.</span></li>
        <li>${icon('flame')}<span><strong>Sous 25, le café te prévient</strong>Ton personnage ralentit et cherche un siège. C’est le moment de finir quelque chose de facile.</span></li>
        <li>${icon('coins')}<span><strong>À zéro, épuisement</strong>Tu perds 30 % de tes pièces et tu restes épuisé·e jusqu’au lendemain. L’énergie repart à 50, et un niveau gagné la recharge aussi.</span></li>
      </ul>
    </section>
  </div></dialog>
  <dialog id="guests-dialog" class="card card-sage"><header class="card-head"><span class="card-icon">${icon('home')}</span><span class="card-eyebrow">MA PIÈCE</span><h2>Ta pièce, tes invités.</h2><button type="button" class="icon-button close-dialog" aria-label="Fermer">${icon('x')}</button></header><div class="card-body">
    <section><h3>Inviter</h3><p>Envoie ce lien à quelqu’un pour l’inviter directement chez toi.</p>
    <button id="invite-copy" class="primary">${icon('link-2')}<span>Copier le lien d’invitation</span></button></section>
    <section><h3>Qui est là <span class="pill" id="guests-count">0</span></h3><p>Exclus quelqu’un de ta pièce, pour un moment ou pour de bon.</p>
    <ul class="guests-list" id="guests-list"></ul>
    <div class="empty" id="guests-empty" hidden>${icon('coffee')}<span>Personne d’autre ici pour l’instant.</span></div></section>
  </div></dialog>
  <div id="net-veil" class="net-veil" role="status"><span class="veil-label">${icon('coffee')}<span id="net-text">Connexion au café…</span></span></div>
  <div id="login-screen" class="login-screen" role="dialog" aria-modal="true" aria-label="Connexion" hidden>
    <div class="login-card card card-sage">
      <header class="card-head"><span class="card-icon">${icon('coffee')}</span><span class="card-eyebrow">BIENVENUE</span><h2>Le café ouvre ses portes.</h2></header><div class="card-body">
      <p>Connecte-toi avec Google pour retrouver ton personnage sur n’importe quel appareil, ou entre directement en invité.</p>
      <div id="google-btn" class="google-btn-slot"></div>
      <div class="login-sep"><span>ou</span></div>
      <button id="login-guest" class="secondary" type="button">Continuer en invité</button>
    </div></div>
  </div>
`;}
