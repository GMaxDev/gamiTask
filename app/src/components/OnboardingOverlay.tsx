import { useState } from "react";

const STEPS = [
  {
    icon: "👋",
    title: "Bienvenue dans GamiTask !",
    body: "GamiTask transforme ta productivité en jeu. Tu partages une salle virtuelle avec d'autres joueurs — ensemble ou chacun de son côté.",
  },
  {
    icon: "🗺️",
    title: "Explore la salle",
    body: "Clique sur une case pour déplacer ton avatar. Les autres joueurs te voient en temps réel. Chaque avatar reflète ton état de travail.",
  },
  {
    icon: "📋",
    title: "Gère tes tâches",
    body: "Clique sur 📋 en haut pour ajouter tes tâches du jour. Complète-les pour gagner des 🪙 pièces. Les tâches quotidiennes (dailies) se remettent à zéro chaque matin.",
  },
  {
    icon: "🍅",
    title: "Le Pomodoro",
    body: "Lance un focus de 25 min → pause de 5 min. Chaque pomodoro terminé rapporte 25 🪙. Enchaîne pour construire un streak 🔥 et gagner des bonus !",
  },
  {
    icon: "🏪",
    title: "La boutique",
    body: "Dépense tes pièces pour acheter des chapeaux 🎉 et du mobilier 🪴. Le mobilier Feng Shui donne des bonus permanents (XP, pièces, réduction de coût).",
  },
  {
    icon: "🏠",
    title: "Entretiens ta salle",
    body: "Si tu oublies tes dailies, ta salle se dégrade. Nettoie-la avec des pièces. Pas d'inquiétude avant le niveau 5 — tu es immunisé !",
  },
  {
    icon: "🎉",
    title: "C'est parti !",
    body: "Monte de niveau, débloque des succès, et collabore avec les autres. Bonne productivité !",
  },
];

interface Props {
  onDone: () => void;
}

export function OnboardingOverlay({ onDone }: Props) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <div id="onboarding-overlay">
      <div id="onboarding-card">
        <button id="onboarding-skip" onClick={onDone} aria-label="Passer">Passer</button>

        <div id="onboarding-icon">{current.icon}</div>
        <div id="onboarding-title">{current.title}</div>
        <div id="onboarding-body">{current.body}</div>

        {/* Indicateurs de progression */}
        <div id="onboarding-dots">
          {STEPS.map((_, i) => (
            <button
              key={i}
              className={`onboarding-dot${i === step ? " active" : ""}`}
              onClick={() => setStep(i)}
              aria-label={`Étape ${i + 1}`}
            />
          ))}
        </div>

        <div id="onboarding-actions">
          {step > 0 && (
            <button className="onboarding-btn secondary" onClick={() => setStep((s) => s - 1)}>
              ← Précédent
            </button>
          )}
          <button
            className="onboarding-btn primary"
            onClick={() => (isLast ? onDone() : setStep((s) => s + 1))}
          >
            {isLast ? "🚀 C'est parti !" : "Suivant →"}
          </button>
        </div>
      </div>
    </div>
  );
}
